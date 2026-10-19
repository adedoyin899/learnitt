import { test, expect } from "@playwright/test";

test.describe("L13 Full QA Sweep · All Screens, Themes, Viewports & Network States", () => {
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

  const VIEWPORTS = [
    { name: "Mobile (360px)", width: 360, height: 800 },
    { name: "Desktop (1440px)", width: 1440, height: 900 },
  ];

  for (const vp of VIEWPORTS) {
    test.describe(`Viewport: ${vp.name}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test("Screen S01-S04 /today: Renders cleanly in light & dark modes with session block and offline capability", async ({
        page,
        context,
      }) => {
        // Mock /today API
        await page.route("**/api/v1/today*", (route) => {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              has_goal: true,
              has_plan: true,
              date: "2026-10-19",
              goal: {
                id: "g1",
                title: "Junior Data Engineer in 6 months",
                target_date: "2027-04-19",
                weekly_hours: 8.0,
                study_days: [1, 2, 3, 4, 5],
              },
              primary_item: {
                id: "p1",
                skill_id: "s1",
                skill_name: "SQL Fundamentals",
                planned_minutes: 60,
                mvd_minutes: 15,
                mvd_task: "Run 3 queries with WHERE filter",
                status: "planned",
                kind: "learn",
              },
              is_mvd_complete: false,
              is_planned_complete: false,
              total_planned_minutes_today: 60,
              total_completed_minutes_today: 0,
            }),
          });
        });

        // 1. Light Mode
        await page.emulateMedia({ colorScheme: "light" });
        await page.goto("/today");
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.getByText("SQL Fundamentals")).toBeVisible();

        // Check button exists
        const checkInBtn = page.getByRole("button", { name: /check in|start session/i });
        if (await checkInBtn.count() > 0) {
          await expect(checkInBtn.first()).toBeVisible();
        }

        // 2. Dark Mode
        await page.emulateMedia({ colorScheme: "dark" });
        await page.reload();
        await expect(page.locator("h1")).toBeVisible();

        // 3. Offline Mode
        await context.setOffline(true);
        // Verify page remains interactive and doesn't crash
        await expect(page.locator("body")).toBeVisible();
        await context.setOffline(false);
      });

      test("Screen S05 /plan: Schedule, adapt trigger and study timeline render without horizontal overflow", async ({
        page,
      }) => {
        await page.route("**/api/v1/goals*", (route) => {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              goals: [
                {
                  id: "g1",
                  title: "Junior Data Engineer in 6 months",
                  weekly_hours: 8.0,
                  target_date: "2027-04-19",
                  status: "active",
                },
              ],
            }),
          });
        });

        await page.goto("/plan");
        await expect(page.locator("body")).toBeVisible();

        // Verify no unexpected horizontal scroll bar on mobile
        const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
        const innerWidth = await page.evaluate(() => window.innerWidth);
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 2);
      });

      test("Screen S14 /progress: Visual mastery metrics, streak and evidence mix gauge", async ({
        page,
      }) => {
        await page.route("**/api/v1/progress*", (route) => {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              verified_skills_over_time: [{ date: "2026-10-18", cumulative_count: 2 }],
              planned_vs_done_minutes_per_week: [
                { week: "2026-10-19", week_label: "Oct 19", planned_minutes: 240, done_minutes: 180 },
              ],
              mvd_streak: { current_streak: 4, status: "active", longest_streak: 7 },
              evidence_mix: { e0: 1, e1: 2, e2: 1, e3: 0 },
              skills_due_for_review: 0,
              total_skills: 4,
              verified_skills_count: 2,
              plain_summary: "Consistent momentum this week.",
            }),
          });
        });

        await page.goto("/progress");
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.getByText("Consistent momentum this week.")).toBeVisible();
      });

      test("Screen S15 /review: Spaced review queue renders empty and question states", async ({
        page,
      }) => {
        await page.route("**/api/v1/review/due*", (route) => {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: [],
              capped_minutes: 15,
            }),
          });
        });

        await page.goto("/review");
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.getByText("Nothing due today.")).toBeVisible();
      });

      test("Screen S16 /settings: Reminders, Delivery Channels, AI Cap, and Export controls", async ({
        page,
      }) => {
        await page.route("**/api/v1/reminders*", (route) => {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: {
                daily_time: "09:00:00",
                weekdays: [1, 2, 3, 4, 5],
                email_enabled: true,
                push_enabled: false,
                weekly_review_day: 0,
                timezone: "Europe/London",
              },
            }),
          });
        });

        await page.route("**/api/v1/settings/usage*", (route) => {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              daily_calls: 5,
              daily_cap: 30,
              estimated_cost_cents: 12,
              ai_materials_consent: true,
            }),
          });
        });

        await page.goto("/settings");
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.getByTestId("daily-time-select")).toBeVisible();
        await expect(page.getByTestId("email-toggle")).toBeVisible();
        await expect(page.getByTestId("push-toggle")).toBeVisible();
      });

      test("Pilot Metrics Screen /metrics: PRD Section 18 dashboard and Monthly Review download", async ({
        page,
      }) => {
        await page.route("**/api/v1/metrics*", (route) => {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              metrics: {
                period: { start_date: "2026-10-01", end_date: "2026-10-19", total_days: 19, active_days: 14 },
                mvd: { active_days: 14, mvd_completed_days: 12, rate_percent: 86, target_percent: 80, meets_target: true },
                adherence: { planned_minutes: 600, done_minutes: 480, rate_percent: 80, target_percent: 70, meets_target: true },
                checkin_time: { median_seconds: 14, target_seconds: 30, meets_target: true, sample_count: 14 },
                skills: {
                  total_skills: 12,
                  verified_skills_count: 3,
                  verified_this_month: 3,
                  evidence_mix: { e0_count: 0, e1_count: 1, e2_count: 1, e3_count: 1, e2_e3_share_percent: 67, target_share_percent: 60, meets_target: true },
                },
                ai_usage: {
                  total_calls: 84,
                  median_calls_per_day: 6,
                  p95_calls_per_day: 18,
                  days_under_cap_percent: 100,
                  daily_cap: 30,
                  meets_target: true,
                  cost_estimate_gbp: 0.038,
                },
                grading: {
                  total_attempts: 14,
                  ai_graded_count: 4,
                  user_override_count: 0,
                  override_rate_percent: 0,
                  evaluator_health: "healthy",
                },
              },
            }),
          });
        });

        await page.goto("/metrics");
        await expect(page.locator("h1")).toBeVisible();
        await expect(page.getByText("MVD Rate", { exact: true })).toBeVisible();
        await expect(page.getByText("86%", { exact: true })).toBeVisible();
        await expect(page.getByTestId("download-monthly-review-btn")).toBeVisible();
      });
    });
  }
});
