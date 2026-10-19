/**
 * @vitest-environment node
 */

import "fake-indexeddb/auto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getTodayRoute } from "@/app/api/v1/today/route";
import { POST as checkInRoute } from "@/app/api/v1/check-ins/route";
import { POST as generatePlanRoute } from "@/app/api/v1/goals/[id]/plan/generate/route";
import * as serverAuth from "@/lib/supabase/server";
import * as serviceAuth from "@/lib/supabase/service-role";
import { createPgliteSupabaseAdapter } from "../db/pglite-adapter";
import { createTestDatabase } from "../db/test-db";
import { db } from "@/lib/offline/db";
import { queueOfflineAction } from "@/lib/offline/outbox";
import { syncOutbox } from "@/lib/offline/sync";

const USER_MAZ = "11111111-1111-1111-1111-111111111111";
const TODAY_DATE = "2026-10-19";

describe("L6 Integration Suite · Today, Check-ins, and Offline Sync (PRD 10, Epic C3, D1, D2)", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let supabaseAdapter: ReturnType<typeof createPgliteSupabaseAdapter>;
  let activeGoalId: string;
  let primaryPlanItemId: string;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    supabaseAdapter = createPgliteSupabaseAdapter(testDb.db);

    // Mock service role and server auth
    vi.spyOn(serviceAuth, "createServiceRoleClient").mockReturnValue(
      supabaseAdapter as unknown as ReturnType<typeof serviceAuth.createServiceRoleClient>
    );

    vi.spyOn(serverAuth, "createClient").mockImplementation(async () => {
      return {
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: USER_MAZ,
                email: "maz@learnitt.com",
                app_metadata: {},
                user_metadata: {},
                aud: "authenticated",
                created_at: new Date().toISOString(),
              },
            },
            error: null,
          }),
        },
        from: (table: string) => (supabaseAdapter as any).from(table),
        rpc: (fn: string, args: Record<string, unknown>) => (supabaseAdapter as any).rpc(fn, args),
      } as unknown as ReturnType<typeof serverAuth.createClient>;
    });

    // Clear Dexie tables
    await db.goals.clear();
    await db.skills.clear();
    await db.plan_items.clear();
    await db.today_payload.clear();
    await db.check_ins.clear();
    await db.outbox.clear();

    // Data Engineering Goal seeded in seed.sql:
    activeGoalId = "a1111111-1111-1111-1111-111111111111";

    // Generate plan for Maz starting today
    const genReq = new NextRequest(
      `http://localhost:3000/api/v1/goals/${activeGoalId}/plan/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: TODAY_DATE }),
      }
    );
    await generatePlanRoute(genReq, { params: Promise.resolve({ id: activeGoalId }) });

    // Retrieve today's first plan item
    const todayRows = await testDb.db.query<{ id: string }>(`
      select id from public.plan_items
      where goal_id = '${activeGoalId}' and owner_id = '${USER_MAZ}'
        and scheduled_date = '${TODAY_DATE}'
      order by position asc limit 1;
    `);

    expect(todayRows.rows.length).toBeGreaterThan(0);
    primaryPlanItemId = todayRows.rows[0].id;
  });

  it("1. GET /api/v1/today returns primary session, MVD version, and completion flags", async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/today?date=${TODAY_DATE}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const res = await getTodayRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.has_goal).toBe(true);
    expect(data.has_plan).toBe(true);
    expect(data.date).toBe(TODAY_DATE);
    expect(data.primary_item).toBeDefined();
    expect(data.primary_item.id).toBe(primaryPlanItemId);
    expect(data.primary_item.planned_minutes).toBeGreaterThan(0);
    expect(data.primary_item.mvd_minutes).toBeGreaterThan(0);
    expect(data.primary_item.mvd_task).toBeDefined();
    expect(data.is_mvd_complete).toBe(false);
    expect(data.is_planned_complete).toBe(false);
    expect(data.upcoming_items?.length).toBeGreaterThan(0);
  });

  it("2. POST /api/v1/check-ins records MVD completion separately from planned complete", async () => {
    const clientId = "55555555-5555-5555-5555-555555555501";

    const checkInReq = new NextRequest("http://localhost:3000/api/v1/check-ins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        plan_item_id: primaryPlanItemId,
        outcome: "mvd_only",
        minutes_actual: 15,
        reason: "no_time",
        note: "Busy day, squeezed in MVD",
      }),
    });

    const checkInRes = await checkInRoute(checkInReq);
    expect(checkInRes.status).toBe(200);
    const body = await checkInRes.json();
    expect(body.success).toBe(true);
    expect(body.is_duplicate).toBe(false);
    expect(body.check_in.outcome).toBe("mvd_only");

    // Check GET /today reflects MVD complete = true, planned complete = false
    const todayReq = new NextRequest(`http://localhost:3000/api/v1/today?date=${TODAY_DATE}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const todayRes = await getTodayRoute(todayReq);
    const todayData = await todayRes.json();

    expect(todayData.is_mvd_complete).toBe(true);
    expect(todayData.is_planned_complete).toBe(false);
    expect(todayData.primary_item.status).toBe("mvd_only");
  });

  it("3. POST /api/v1/check-ins is strictly idempotent by client_id (same client_id makes exactly one row)", async () => {
    const clientId = "66666666-6666-6666-6666-666666666601";

    // 1st request
    const firstReq = new NextRequest("http://localhost:3000/api/v1/check-ins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        plan_item_id: primaryPlanItemId,
        outcome: "done",
        minutes_actual: 45,
      }),
    });
    const firstRes = await checkInRoute(firstReq);
    expect(firstRes.status).toBe(200);
    const firstBody = await firstRes.json();
    expect(firstBody.success).toBe(true);
    expect(firstBody.is_duplicate).toBe(false);

    // 2nd request with EXACT same client_id (e.g. offline sync retried or duplicate submit)
    const secondReq = new NextRequest("http://localhost:3000/api/v1/check-ins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        plan_item_id: primaryPlanItemId,
        outcome: "done",
        minutes_actual: 45,
      }),
    });
    const secondRes = await checkInRoute(secondReq);
    expect(secondRes.status).toBe(200);
    const secondBody = await secondRes.json();
    expect(secondBody.success).toBe(true);
    expect(secondBody.is_duplicate).toBe(true);

    // Verify database row count: exactly 1 row
    const dbCount = await testDb.db.query<{ count: string }>(`
      select count(*) as count from public.check_ins
      where client_id = '${clientId}' and owner_id = '${USER_MAZ}';
    `);
    expect(Number(dbCount.rows[0].count)).toBe(1);

    // Verify GET /today reflects planned complete = true
    const todayReq = new NextRequest(`http://localhost:3000/api/v1/today?date=${TODAY_DATE}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const todayRes = await getTodayRoute(todayReq);
    const todayData = await todayRes.json();
    expect(todayData.is_planned_complete).toBe(true);
    expect(todayData.is_mvd_complete).toBe(true);
  });

  it("4. simulates offline check-in and reconnect sync without duplicates", async () => {
    const offlineClientId = "77777777-7777-7777-7777-777777777701";

    // 1. Client is offline in airplane mode. User checks in.
    await queueOfflineAction({
      client_id: offlineClientId,
      operation: "check_in",
      payload: {
        plan_item_id: primaryPlanItemId,
        outcome: "done",
        minutes_actual: 60,
        reason: null,
        note: "Offline completed in flight",
      },
    });

    // Outbox has 1 pending item
    const pendingBefore = await db.outbox.count();
    expect(pendingBefore).toBe(1);

    // 2. Network reconnects: sync loop triggers
    // Mock global fetch to dispatch to checkInRoute
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/v1/check-ins")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const req = new NextRequest("http://localhost:3000/api/v1/check-ins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const res = await checkInRoute(req);
        const data = await res.json();
        return {
          ok: res.status === 200,
          status: res.status,
          json: async () => data,
        } as Response;
      }
      return new Response(null, { status: 404 });
    });

    const syncResult = await syncOutbox();
    expect(syncResult.synced).toBe(1);
    expect(syncResult.failed).toBe(0);
    expect(syncResult.remaining).toBe(0);

    // Verify outbox is now empty
    const pendingAfter = await db.outbox.count();
    expect(pendingAfter).toBe(0);

    // Reconnecting again (duplicate online event):
    const secondSync = await syncOutbox();
    expect(secondSync.synced).toBe(0);
    expect(secondSync.remaining).toBe(0);

    // Verify database row count: exactly 1 row
    const dbCount = await testDb.db.query<{ count: string }>(`
      select count(*) as count from public.check_ins
      where client_id = '${offlineClientId}';
    `);
    expect(Number(dbCount.rows[0].count)).toBe(1);

    fetchSpy.mockRestore();
  });
});
