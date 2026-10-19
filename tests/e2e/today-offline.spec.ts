import { test, expect } from "@playwright/test";

test.describe("L6 E2E · Today Screen & Offline Mode (PRD Section 10)", () => {
  test("manifest.webmanifest has valid PWA installable criteria", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();

    expect(manifest.name).toBe("Learnitt");
    expect(manifest.short_name).toBe("Learnitt");
    expect(manifest.start_url).toBe("/today");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(1);
  });

  test("Today screen renders from Dexie cache when offline", async ({ page, context }) => {
    // 1. Navigate to /today and inject cached data into Dexie
    await page.goto("/today");

    await page.evaluate(async () => {
      // Direct Dexie interaction to seed offline state
      const request = indexedDB.open("learnitt_offline_db", 1);
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const idb = request.result;
          const tx = idb.transaction(["today_payload", "goals"], "readwrite");
          const payloadStore = tx.objectStore("today_payload");
          payloadStore.put({
            id: "current",
            date: "2026-10-19",
            payload: {
              has_goal: true,
              has_plan: true,
              date: "2026-10-19",
              goal: {
                id: "test-offline-goal",
                title: "Cloud Data Engineering",
                target_date: "2026-12-31",
                weekly_hours: 8,
                study_days: [1, 2, 3, 4, 5],
              },
              primary_item: {
                id: "plan-offline-1",
                skill_id: "skill-offline-1",
                skill_name: "Kafka Streaming Basics",
                kind: "learn",
                planned_minutes: 45,
                mvd_minutes: 15,
                mvd_task: "Summarize 3 consumer group offsets",
                status: "planned",
              },
              is_mvd_complete: false,
              is_planned_complete: false,
              total_planned_minutes_today: 45,
              total_completed_minutes_today: 0,
            },
            updated_at: new Date().toISOString(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    });

    // 2. Enable airplane mode / block network completely
    await context.setOffline(true);

    // 3. Reload the page while offline
    await page.reload();

    // 4. Verify Today renders from cache with offline status banner
    await expect(page.locator("text=No signal")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=Kafka Streaming Basics")).toBeVisible();
    await expect(page.locator("text=Start Today's Session")).toBeVisible();

    // 5. Verify network-dependent actions are disabled with reason badge
    await expect(page.locator("text=Full Study Plan (offline)")).toBeVisible();

    // Restore online state
    await context.setOffline(false);
  });

  test("Check-in flow completes in under 30 seconds in scripted run", async ({ page }) => {
    await page.goto("/today");

    const startTime = Date.now();

    // 1. Seed active task in Dexie if not present
    await page.evaluate(async () => {
      const request = indexedDB.open("learnitt_offline_db", 1);
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const idb = request.result;
          const tx = idb.transaction(["today_payload"], "readwrite");
          tx.objectStore("today_payload").put({
            id: "current",
            date: "2026-10-19",
            payload: {
              has_goal: true,
              has_plan: true,
              date: "2026-10-19",
              goal: {
                id: "bench-goal",
                title: "PostgreSQL Internals",
                target_date: "2026-12-31",
                weekly_hours: 8,
                study_days: [1, 2, 3, 4, 5],
              },
              primary_item: {
                id: "bench-item-1",
                skill_id: "bench-skill-1",
                skill_name: "WAL Logging & Checkpoints",
                kind: "learn",
                planned_minutes: 40,
                mvd_minutes: 15,
                mvd_task: "Draw WAL write flow diagram",
                status: "planned",
              },
              is_mvd_complete: false,
              is_planned_complete: false,
              total_planned_minutes_today: 40,
              total_completed_minutes_today: 0,
            },
            updated_at: new Date().toISOString(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    });

    await page.reload();

    // 2. Click "Check In" button
    const checkInBtn = page.getByRole("button", { name: "Check In" }).first();
    await checkInBtn.click();

    // 3. Drawer opens: select "MVD only" radio option
    const mvdRadio = page.locator("#outcome-mvd");
    await mvdRadio.click();

    // 4. Click reason chip: "No time"
    const reasonChip = page.getByRole("button", { name: "No time" });
    await reasonChip.click();

    // 5. Submit check-in
    const saveBtn = page.getByRole("button", { name: /Save Check-in/i });
    await saveBtn.click();

    // 6. Optimistic UI: badge updates to "MVD complete"
    await expect(page.locator("text=MVD complete").first()).toBeVisible({ timeout: 3000 });

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    expect(elapsedSeconds).toBeLessThan(30);
  });
});
