import { db, DexieOutboxItem } from "./db";

export interface QueueActionParams {
  client_id: string;
  operation: "check_in" | "attempt" | "journal" | "skill_edit";
  payload: Record<string, unknown>;
}

/**
 * Enqueues a mutation into the offline outbox and applies it optimistically
 * to the local IndexedDB mirror.
 * PRD Section 10 & Prompt Requirement 6.
 */
export async function queueOfflineAction(params: QueueActionParams): Promise<DexieOutboxItem> {
  const { client_id, operation, payload } = params;
  const now = new Date().toISOString();

  const outboxItem: DexieOutboxItem = {
    client_id,
    operation,
    payload,
    created_at: now,
    status: "pending",
    retry_count: 0,
  };

  // 1. Write to outbox table
  await db.outbox.put(outboxItem);

  // 2. Optimistic local updates according to operation
  if (operation === "check_in") {
    const { plan_item_id, outcome, minutes_actual, reason, note } = payload as {
      plan_item_id: string;
      outcome: "done" | "partial" | "missed" | "mvd_only";
      minutes_actual?: number;
      reason?: "no_time" | "unwell" | "client_work" | "too_hard" | "too_easy" | "other";
      note?: string;
    };

    // Store in local check_ins
    await db.check_ins.put({
      client_id,
      plan_item_id,
      outcome,
      minutes_actual: minutes_actual ?? null,
      reason: reason ?? null,
      note: note ?? null,
      created_at: now,
      synced: false,
    });

    // Update plan_items status in local store
    if (plan_item_id) {
      await db.plan_items.update(plan_item_id, { status: outcome });
    }
  } else if (operation === "journal") {
    const { body, content } = payload as { body?: string; content?: string };
    await db.journal_entries.put({
      client_id,
      content: (body || content || "").trim(),
      created_at: now,
      synced: false,
    });
  }

  return outboxItem;
}

/**
 * Reads all pending outbox items ordered strictly by created_at asc.
 */
export async function getPendingOutboxItems(): Promise<DexieOutboxItem[]> {
  return db.outbox.orderBy("created_at").toArray();
}

/**
 * Removes successfully synced item from outbox and marks local record synced.
 */
export async function markOutboxItemSuccess(client_id: string, operation?: string): Promise<void> {
  await db.outbox.delete(client_id);

  if (operation === "check_in") {
    await db.check_ins.update(client_id, { synced: true });
  } else if (operation === "attempt") {
    await db.attempts.update(client_id, { synced: true });
  } else if (operation === "journal") {
    await db.journal_entries.update(client_id, { synced: true });
  }
}

/**
 * Updates an item that failed to sync with an error message and increments retry_count.
 */
export async function markOutboxItemFailed(
  client_id: string,
  errorMsg: string
): Promise<void> {
  const item = await db.outbox.get(client_id);
  if (item) {
    await db.outbox.update(client_id, {
      status: "failed",
      retry_count: item.retry_count + 1,
      last_error: errorMsg,
    });
  }
}

/**
 * Returns count of remaining items in outbox.
 */
export async function getPendingOutboxCount(): Promise<number> {
  return db.outbox.count();
}
