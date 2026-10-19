import * as React from "react";
import {
  getPendingOutboxCount,
  getPendingOutboxItems,
  markOutboxItemFailed,
  markOutboxItemSuccess,
} from "./outbox";

let isSyncing = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export interface SyncResult {
  synced: number;
  failed: number;
  remaining: number;
}

/**
 * Pushes pending outbox mutations to the server in strict chronological order.
 * PRD Section 10 & Prompt Requirement 6:
 * "A sync loop runs on reconnect and on focus, pushes in order, removes on success,
 *  backs off on failure and shows a banner. Conflict rules exactly as PRD section 10."
 */
export async function syncOutbox(): Promise<SyncResult> {
  if (isSyncing) {
    return { synced: 0, failed: 0, remaining: await getPendingOutboxCount() };
  }

  // If in browser and navigator.onLine is explicitly false, skip network push
  if (typeof window !== "undefined" && typeof navigator !== "undefined" && navigator.onLine === false) {
    return { synced: 0, failed: 0, remaining: await getPendingOutboxCount() };
  }

  isSyncing = true;
  notifyListeners();

  let synced = 0;
  let failed = 0;

  try {
    const items = await getPendingOutboxItems();

    for (const item of items) {
      try {
        if (item.operation === "check_in") {
          const res = await fetch("/api/v1/check-ins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...item.payload,
              client_id: item.client_id,
            }),
          });

          if (res.ok) {
            await markOutboxItemSuccess(item.client_id, "check_in");
            synced++;
          } else {
            const errData = await res.json().catch(() => ({}));
            await markOutboxItemFailed(item.client_id, errData.error || `HTTP ${res.status}`);
            failed++;
            break; // Stop and back off on failure
          }
        } else if (item.operation === "skill_edit") {
          // PRD Section 10: "last write wins per field, with server timestamp."
          const { goal_id, skill_id, updates } = item.payload as {
            goal_id: string;
            skill_id: string;
            updates: Record<string, unknown>;
          };
          const res = await fetch(`/api/v1/goals/${goal_id}/skills/${skill_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });

          if (res.ok) {
            await markOutboxItemSuccess(item.client_id, "skill_edit");
            synced++;
          } else {
            failed++;
            break;
          }
        } else if (item.operation === "journal") {
          const res = await fetch("/api/v1/journal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...item.payload,
              client_id: item.client_id,
            }),
          });

          if (res.ok) {
            await markOutboxItemSuccess(item.client_id, "journal");
            synced++;
          } else {
            const errData = await res.json().catch(() => ({}));
            await markOutboxItemFailed(item.client_id, errData.error || `HTTP ${res.status}`);
            failed++;
            break;
          }
        }
      } catch (err: unknown) {
        // Network failure / disconnected
        const msg = err instanceof Error ? err.message : "Network error";
        await markOutboxItemFailed(item.client_id, msg);
        failed++;
        break; // Stop processing further items until network returns
      }
    }
  } finally {
    isSyncing = false;
    notifyListeners();
  }

  return {
    synced,
    failed,
    remaining: await getPendingOutboxCount(),
  };
}

/**
 * Initializes automatic background sync on reconnect ('online') and on focus/visibility.
 */
export function initOfflineSyncListeners(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => {
    syncOutbox();
  };

  const handleFocus = () => {
    syncOutbox();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      syncOutbox();
    }
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("focus", handleFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  // Initial trigger if online
  if (navigator.onLine) {
    syncOutbox();
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("focus", handleFocus);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}

/**
 * React hook to observe offline status, pending outbox count, and sync status text.
 * PRD 10 & Prompt Requirement 7:
 * "Show a status line: 'No signal. 2 changes will sync when you are back online.'
 *  Actions that need the network are disabled with a reason, not hidden."
 */
export function useOfflineSync() {
  const [isOnline, setIsOnline] = React.useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = React.useState<number>(0);
  const [isSyncingState, setIsSyncingState] = React.useState<boolean>(false);

  const refreshStatus = React.useCallback(async () => {
    if (typeof navigator !== "undefined") {
      setIsOnline(navigator.onLine);
    }
    const count = await getPendingOutboxCount();
    setPendingCount(count);
    setIsSyncingState(isSyncing);
  }, []);

  React.useEffect(() => {
    refreshStatus();

    const updateOnline = () => setIsOnline(true);
    const updateOffline = () => setIsOnline(false);

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOffline);

    const onSyncChange = () => {
      refreshStatus();
    };

    listeners.add(onSyncChange);
    const cleanupSync = initOfflineSyncListeners();

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOffline);
      listeners.delete(onSyncChange);
      cleanupSync();
    };
  }, [refreshStatus]);

  let statusText = "";
  if (!isOnline) {
    statusText =
      pendingCount > 0
        ? `No signal. ${pendingCount} change${pendingCount > 1 ? "s" : ""} will sync when you are back online.`
        : "No signal. You are currently offline.";
  } else if (isSyncingState) {
    statusText = `Syncing ${pendingCount} change${pendingCount > 1 ? "s" : ""}...`;
  }

  return {
    isOnline,
    pendingCount,
    isSyncing: isSyncingState,
    statusText,
    syncNow: syncOutbox,
    refreshStatus,
  };
}
