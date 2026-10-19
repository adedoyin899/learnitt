import { test, expect } from "@playwright/test";

test.describe("L9 E2E · Progress Screen & Spaced Review Queue (Screens S14 & S15)", () => {
  const mockProgressPayload = {
    verified_skills_over_time: [
      { date: "2026-10-10", cumulative_count: 1 },
      { date: "2026-10-14", cumulative_count: 2 },
      { date: "2026-10-18", cumulative_count: 3 },
    ],
    planned_vs_done_minutes_per_week: [
      { week: "2026-10-05", week_label: "Oct 5", planned_minutes: 240, done_minutes: 210 },
      { week: "2026-10-12", week_label: "Oct 12", planned_minutes: 300, done_minutes: 320 },
      { week: "2026-10-19", week_label: "Oct 19", planned_minutes: 240, done_minutes: 180 },
    ],
    mvd_streak: {
      current_streak: 4,
      status: "paused",
      longest_streak: 7,
      last_completed_date: "2026-10-17",
      message: "Streak paused at 4 days. Pick up right where you left off!",
    },
    evidence_mix: {
      e0: 1,
      e1: 2,
      e2: 2,
      e3: 1,
    },
    skills_due_for_review: 2,
    total_skills: 6,
    verified_skills_count: 3,
    plain_summary:
      "This week you completed 3 learning sessions totaling 180 minutes of your 240 planned minutes. Your MVD streak is currently paused at 4 days—ready to resume anytime without penalty. You have 3 verified skills (3 backed by hands-on applied/artifact evidence). 2 skills are ready for spaced review today.",
  };

  const mockReviewItems = [
    {
      id: "rev-q1",
      type: "recall_question",
      skill_id: "sk-sql-1",
      skill_name: "PostgreSQL B-Tree Indexing",
      prompt: "What is the primary benefit of right-links in Lehman & Yao B-Trees?",
      options: [
        "Concurrent readers without read locks",
        "Faster disk writes by disabling WAL",
        "Automatic foreign key cascading",
        "In-memory column cache",
      ],
      answer_key: "Concurrent readers without read locks",
      estimated_minutes: 2,
      evidence_level: 1,
    },
    {
      id: "rev-c1",
      type: "saved_card",
      skill_id: "sk-wal-1",
      skill_name: "WAL & Checkpoints",
      prompt: "When does PostgreSQL trigger an automatic checkpoint?",
      answer: "When max_wal_size is reached or checkpoint_timeout expires, whichever comes first.",
      estimated_minutes: 1,
      evidence_level: 0,
    },
  ];

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

  test("Screen S14 (Progress): stats, MVD streak paused state (zero guilt), plain summary (no AI), and lazy charts", async ({
    page,
  }) => {
    await page.route("**/api/v1/progress*", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockProgressPayload),
      });
    });

    await page.goto("/progress");

    // 1. Header & Page Title
    await expect(page.getByText("Progress & Competency Mastery")).toBeVisible();

    // 2. Plain language weekly summary (by code, NO AI)
    await expect(page.getByText("Generated from your study data")).toBeVisible();
    await expect(
      page.getByText(/totaling 180 minutes of your 240 planned minutes/i)
    ).toBeVisible();

    // 3. Stat Cards
    // Verified skills
    await expect(page.getByText("Verified Skills", { exact: true })).toBeVisible();
    await expect(page.getByText("3 / 6")).toBeVisible();

    // MVD Streak - Invariant: Missed day shows "Streak paused", count kept (4), zero guilt copy
    await expect(page.getByText("Streak paused", { exact: true })).toBeVisible();
    await expect(page.getByText("Streak paused at 4 days. Pick up right where you left off!")).toBeVisible();
    const resumeBtn = page.getByRole("button", { name: /Resume streak/i });
    await expect(resumeBtn).toBeVisible();
    await resumeBtn.click();
    await expect(page.getByText("Active")).toBeVisible();

    // 4. Evidence Mix Gauge with plain labels
    await expect(page.getByText("Evidence Strength Mix")).toBeVisible();
    await expect(page.getByText("E3 · Artifact checked")).toBeVisible();
    await expect(page.getByText("E2 · Applied, graded")).toBeVisible();
    await expect(page.getByText("E1 · Quiz passed")).toBeVisible();
    await expect(page.getByText("E0 · Self-rated")).toBeVisible();

    // 5. Time Series Chart (lazy loaded)
    await expect(page.getByText("Learning Trends Over Time")).toBeVisible();
    const timeTab = page.getByRole("button", { name: "Study Time (Weekly)" });
    await expect(timeTab).toBeVisible();
    await timeTab.click();
    await expect(page.getByText("Planned Minutes", { exact: true })).toBeVisible();
    await expect(page.getByText("Completed Minutes", { exact: true })).toBeVisible();
  });

  test("Screen S15 (Review Queue): displays recall question & saved card, evaluates outcomes, and shows empty state", async ({
    page,
  }) => {
    let submitCallCount = 0;

    await page.route("**/api/v1/review/due*", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          due_skills_count: 2,
          total_estimated_minutes: 3,
          items: mockReviewItems,
        }),
      });
    });

    await page.route("**/api/v1/review/submit*", (route) => {
      submitCallCount += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          next_interval_days: 3,
          next_due_on: "2026-10-22",
          verdict: "pass",
          skill_id: "sk-sql-1",
          skill_status: "verified",
        }),
      });
    });

    await page.goto("/review");

    // 1. First Item: Recall Question
    await expect(page.getByText("PostgreSQL B-Tree Indexing")).toBeVisible();
    await expect(page.getByText("Recall Review")).toBeVisible();
    await expect(page.getByText("What is the primary benefit of right-links in Lehman & Yao B-Trees?")).toBeVisible();

    // Select correct option
    const correctOption = page.getByRole("button", {
      name: "Concurrent readers without read locks",
    });
    await expect(correctOption).toBeVisible();
    await correctOption.click();

    // 2. Second Item: Saved Card
    await expect(page.getByText("WAL & Checkpoints")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Saved Flashcard")).toBeVisible();
    // Invariant: Self-rated · Evidence stays E0
    await expect(page.getByText("Self-rated · Evidence stays E0")).toBeVisible();

    // Click "Show Answer"
    const showAnswerBtn = page.getByRole("button", { name: "Show Answer" });
    await expect(showAnswerBtn).toBeVisible();
    await showAnswerBtn.click();

    // Answer revealed
    await expect(
      page.getByText("When max_wal_size is reached or checkpoint_timeout expires")
    ).toBeVisible();

    // Click self-rate button: "Knew it (Pass)"
    const passBtn = page.getByRole("button", { name: "Knew it (Pass)" });
    await expect(passBtn).toBeVisible();
    await passBtn.click();

    // Review session complete screen
    await expect(page.getByText("Spaced Review Complete!")).toBeVisible();
    expect(submitCallCount).toBeGreaterThanOrEqual(1);
  });

  test("Screen S15 (Review Queue Empty State): displays 'Nothing due today.'", async ({ page }) => {
    await page.route("**/api/v1/review/due*", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          due_skills_count: 0,
          total_estimated_minutes: 0,
          items: [],
        }),
      });
    });

    await page.goto("/review");

    // Invariant: Empty state title is "Nothing due today."
    await expect(page.getByText("Nothing due today.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Return to Today" })).toBeVisible();
    await expect(page.getByRole("button", { name: "View Progress" })).toBeVisible();
  });
});
