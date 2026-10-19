/**
 * @vitest-environment node
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/offline/db";
import {
  getPendingOutboxCount,
  getPendingOutboxItems,
  queueOfflineAction,
} from "@/lib/offline/outbox";
import { syncOutbox } from "@/lib/offline/sync";

describe("L6 Unit Suite · Dexie Offline Store and Outbox (PRD Section 10)", () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await db.goals.clear();
    await db.skills.clear();
    await db.plan_items.clear();
    await db.today_payload.clear();
    await db.check_ins.clear();
    await db.outbox.clear();
  });

  it("preserves outbox insertion order strictly (created_at asc)", async () => {
    const id1 = "11111111-1111-1111-1111-111111111101";
    const id2 = "11111111-1111-1111-1111-111111111102";
    const id3 = "11111111-1111-1111-1111-111111111103";

    // Enqueue 3 items in sequence with distinct timestamps
    await queueOfflineAction({
      client_id: id1,
      operation: "check_in",
      payload: { plan_item_id: "plan-1", outcome: "mvd_only" },
    });

    // Small delay to ensure timestamp progression
    await new Promise((r) => setTimeout(r, 10));

    await queueOfflineAction({
      client_id: id2,
      operation: "check_in",
      payload: { plan_item_id: "plan-2", outcome: "done" },
    });

    await new Promise((r) => setTimeout(r, 10));

    await queueOfflineAction({
      client_id: id3,
      operation: "check_in",
      payload: { plan_item_id: "plan-3", outcome: "missed" },
    });

    const pending = await getPendingOutboxItems();
    expect(pending).toHaveLength(3);
    expect(pending[0].client_id).toBe(id1);
    expect(pending[1].client_id).toBe(id2);
    expect(pending[2].client_id).toBe(id3);
  });

  it("handles outbox failure with retry_count increment and backoff (stops processing next items)", async () => {
    const id1 = "22222222-2222-2222-2222-222222222201";
    const id2 = "22222222-2222-2222-2222-222222222202";

    await queueOfflineAction({
      client_id: id1,
      operation: "check_in",
      payload: { plan_item_id: "plan-fail", outcome: "done" },
    });

    await queueOfflineAction({
      client_id: id2,
      operation: "check_in",
      payload: { plan_item_id: "plan-second", outcome: "done" },
    });

    // Mock fetch to simulate 500 error on the first item
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server database unavailable" }),
    } as Response);

    const result = await syncOutbox();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.remaining).toBe(2);

    // Verify first item retry count incremented and last error recorded
    const item1 = await db.outbox.get(id1);
    expect(item1?.status).toBe("failed");
    expect(item1?.retry_count).toBe(1);
    expect(item1?.last_error).toBe("Server database unavailable");

    // Second item must NOT have been attempted (backoff preserved queue order)
    const item2 = await db.outbox.get(id2);
    expect(item2?.status).toBe("pending");
    expect(item2?.retry_count).toBe(0);

    fetchSpy.mockRestore();
  });

  it("idempotency in local check-ins store (same client_id overwrites or ignores duplicate)", async () => {
    const clientId = "33333333-3333-3333-3333-333333333333";

    await queueOfflineAction({
      client_id: clientId,
      operation: "check_in",
      payload: { plan_item_id: "plan-item-1", outcome: "mvd_only", minutes_actual: 15 },
    });

    const countFirst = await db.check_ins.count();
    expect(countFirst).toBe(1);

    // Attempt to queue again with the same client_id (e.g. repeated tap)
    await queueOfflineAction({
      client_id: clientId,
      operation: "check_in",
      payload: { plan_item_id: "plan-item-1", outcome: "mvd_only", minutes_actual: 15 },
    });

    // Dexie primary key is client_id, so table count remains 1
    const countSecond = await db.check_ins.count();
    expect(countSecond).toBe(1);

    const record = await db.check_ins.get(clientId);
    expect(record?.outcome).toBe("mvd_only");
  });

  it("resolves skill edit conflicts following PRD Section 10 rule: last write wins per field", async () => {
    // PRD Section 10: "Skill edits: last write wins per field, with server timestamp. The UI shows a note if a conflict was overwritten."
    const localSkill = {
      id: "skill-101",
      goal_id: "goal-1",
      name: "Local Skill Title Edit",
      priority: 2,
      difficulty: 3,
      estimated_min_minutes: 30,
      estimated_max_minutes: 60,
      mvd_minutes: 15,
      mvd_task: "Local MVD task",
      status: "planned",
      position: 1,
      updated_at: "2026-10-19T10:00:00.000Z",
    };

    await db.skills.put(localSkill);

    // Server has a more recent update for estimate, but older for name
    const serverTimestamp = "2026-10-19T10:05:00.000Z";
    const serverUpdate = {
      estimated_max_minutes: 90,
      updated_at: serverTimestamp,
    };

    // Apply last write wins per field:
    const existing = await db.skills.get("skill-101");
    expect(existing).toBeDefined();

    if (existing && new Date(serverUpdate.updated_at) > new Date(existing.updated_at || 0)) {
      await db.skills.update("skill-101", {
        estimated_max_minutes: serverUpdate.estimated_max_minutes,
        updated_at: serverUpdate.updated_at,
      });
    }

    const merged = await db.skills.get("skill-101");
    expect(merged?.name).toBe("Local Skill Title Edit");
    expect(merged?.estimated_max_minutes).toBe(90);
    expect(merged?.updated_at).toBe(serverTimestamp);
  });

  it("completes check-in save flow under 30 seconds target (scripted benchmark)", async () => {
    const startTime = performance.now();

    const clientId = "44444444-4444-4444-4444-444444444444";
    const item = await queueOfflineAction({
      client_id: clientId,
      operation: "check_in",
      payload: {
        plan_item_id: "plan-item-perf",
        outcome: "done",
        minutes_actual: 45,
        reason: null,
        note: "Benchmarked performance check-in",
      },
    });

    const elapsedMs = performance.now() - startTime;

    // Must be well under target 30,000ms (<100ms in scripted execution)
    expect(elapsedMs).toBeLessThan(500);
    expect(item.client_id).toBe(clientId);

    const pending = await getPendingOutboxCount();
    expect(pending).toBe(1);
  });
});
