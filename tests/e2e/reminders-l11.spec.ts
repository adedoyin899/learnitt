import { test, expect } from "@playwright/test";

test.describe("L11 E2E · Screen S16 Settings, Reminders, Push & Weekly Check-In (Epic H & PRD 11)", () => {
  const mockReminderSettings = {
    owner_id: "11111111-1111-1111-1111-111111111111",
    daily_time: "09:00:00",
    weekdays: [1, 2, 3, 4, 5],
    email_enabled: true,
    push_enabled: false,
    weekly_review_day: 0,
    timezone: "Europe/London",
  };

  const mockWeeklyStats = {
    plannedMinutes: 300,
    doneMinutes: 180,
    plannedHours: 5.0,
    doneHours: 3.0,
    completionRate: 0.6,
    missedCount: 2,
    adaptTriggered: true,
    adaptReason:
      "You missed 2 sessions in the rolling week. Learnitt can gently adapt your schedule.",
    startDate: "2026-10-13",
    endDate: "2026-10-19",
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

  test("Screen S16 Settings: Reminders, Selects, Weekday Chips, Switches & Honest iOS Note", async ({
    page,
  }) => {
    // Mock GET and PUT reminders
    await page.route("**/api/v1/reminders*", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: mockReminderSettings }),
        });
      }
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { ...mockReminderSettings, daily_time: "08:30:00", push_enabled: true },
            message: "Reminder settings updated successfully.",
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/settings");

    // 1. Verify PageHeader
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Preferences & Controls")).toBeVisible();

    // 2. Verify Screen S16 Form Elements
    const form = page.getByTestId("reminder-settings-form");
    await expect(form).toBeVisible();

    // Daily time select & Timezone select
    const timeSelect = page.getByTestId("daily-time-select");
    await expect(timeSelect).toBeVisible();
    await expect(timeSelect).toHaveValue("09:00");

    const tzSelect = page.getByTestId("timezone-select");
    await expect(tzSelect).toBeVisible();
    await expect(tzSelect).toHaveValue("Europe/London");

    // Weekday toggle chips (Mon-Fri active by default)
    await expect(page.getByTestId("weekday-btn-1")).toBeVisible(); // Mon
    await expect(page.getByTestId("weekday-btn-5")).toBeVisible(); // Fri
    await expect(page.getByTestId("weekday-btn-6")).toBeVisible(); // Sat

    // Toggle Sat to active
    await page.getByTestId("weekday-btn-6").click();

    // Delivery channels: email switch & push switch
    const emailToggle = page.getByTestId("email-toggle");
    await expect(emailToggle).toBeVisible();
    await expect(emailToggle).toHaveAttribute("aria-checked", "true");

    const pushToggle = page.getByTestId("push-toggle");
    await expect(pushToggle).toBeVisible();
    await expect(pushToggle).toHaveAttribute("aria-checked", "false");

    // Honest iOS Note (Prompt requirement 3 & PRD Section 11)
    const iosNote = page.getByTestId("ios-note");
    await expect(iosNote).toBeVisible();
    await expect(iosNote).toContainText(
      "Push works on iPhone only when Learnitt is added to your home screen. Email is the backup."
    );

    // Weekly review day selector
    const reviewDaySelect = page.getByTestId("weekly-review-day-select");
    await expect(reviewDaySelect).toBeVisible();
    await expect(reviewDaySelect).toHaveValue("0"); // Sunday

    // Change reminder time to 08:30 and save
    await timeSelect.selectOption("08:30");
    await page.getByTestId("save-reminders-btn").click();

    // Verify toast
    await expect(page.getByText("Reminder settings saved")).toBeVisible();
  });

  test("Screen S16 Weekly Check-in Tab (Epic H2): Planned vs Done, Reflection Question & Adapt Prompt", async ({
    page,
  }) => {
    await page.route("**/api/v1/reminders*", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockReminderSettings }),
      });
    });

    await page.route("**/api/v1/check-ins/weekly*", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: mockWeeklyStats }),
        });
      }
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { recorded_date: "2026-10-19" },
            message: "Weekly check-in reflection saved.",
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/settings?tab=review");

    // 1. Verify Weekly Overview Card: Planned vs Completed hours
    await expect(page.getByTestId("weekly-checkin-view")).toBeVisible();
    await expect(page.getByTestId("planned-hours-stat")).toContainText("5");
    await expect(page.getByTestId("done-hours-stat")).toContainText("3");

    // 2. Verify Adapt Prompt alert triggered
    const adaptAlert = page.getByTestId("adapt-prompt-alert");
    await expect(adaptAlert).toBeVisible();
    await expect(adaptAlert).toContainText("Adapt Prompt Triggered");
    await expect(page.getByTestId("adapt-schedule-btn")).toBeVisible();

    // 3. Question: "What got in the way this week?"
    await expect(
      page.getByText("One question: What got in the way this week?")
    ).toBeVisible();

    // Select reason: "Unexpected work or life commitments"
    const reasonOpt = page.getByTestId("reason-opt-work_commitments");
    await expect(reasonOpt).toBeVisible();
    await reasonOpt.click();

    // Enter personal reflection note
    const noteInput = page.getByTestId("reflection-note-input");
    await noteInput.fill("Busy client sprint this week; planning to catch up over the weekend.");

    // Click submit
    await page.getByTestId("submit-weekly-checkin-btn").click();

    // Verify submission toast
    await expect(page.getByText("Weekly reflection saved. Keep going!")).toBeVisible();
  });
});
