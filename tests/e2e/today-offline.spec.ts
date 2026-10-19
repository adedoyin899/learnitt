import { test, expect } from "@playwright/test";

test.describe("L6 E2E · Today Screen & Offline Mode (PRD Section 10)", () => {
  const mockTodayPayload = {
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
  };

  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: "sb-mock-auth",
        value: "test-auth-session",
        domain: "localhost",
        path: "/",
      },
    ]);
  });

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

  test("Today screen renders from Dexie cache when offline", async ({ page }) => {
    // 1. Intercept /api/v1/today to return cached payload
    await page.route("**/api/v1/today*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockTodayPayload),
      })
    );

    await page.goto("/today");
    await expect(page.locator("text=WAL Logging & Checkpoints")).toBeVisible();

    // 2. Abort all subsequent network API requests to simulate loss of signal
    await page.route("**/api/v1/**", (route) => route.abort("failed"));

    // 3. Trigger offline event in browser
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
    });

    // 4. Verify offline status banner is visible
    await expect(page.locator("text=No signal")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=WAL Logging & Checkpoints")).toBeVisible();

    // 5. Verify network-dependent actions are disabled with reason badge
    await expect(page.locator("text=Full Study Plan (offline)")).toBeVisible();
  });

  test("Check-in flow completes in under 30 seconds in scripted run", async ({ page }) => {
    // 1. Mock API responses
    await page.route("**/api/v1/today*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockTodayPayload),
      })
    );

    await page.route("**/api/v1/check-ins*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, is_duplicate: false }),
      })
    );

    const startTime = Date.now();

    await page.goto("/today");
    await expect(page.locator("text=WAL Logging & Checkpoints")).toBeVisible();

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
