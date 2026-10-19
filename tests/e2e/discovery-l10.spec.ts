import { test, expect } from "@playwright/test";

test.describe("L10 E2E · Resource Discovery & Approval Queue (Screen S06)", () => {
  const goalId = "goal-l10-e2e-1";

  const mockResources = [
    {
      id: "res-btree-1",
      goal_id: goalId,
      skill_id: "sk-btree",
      url: "https://www.postgresql.org/docs/current/indexes-btree.html",
      title: "B-Tree Indexes - PostgreSQL Documentation",
      domain: "postgresql.org",
      type: "docs",
      estimated_minutes: 25,
      relevance: 0.95,
      found_by_query: "PostgreSQL indexing best practices beginner",
      search_provider: "mock-search",
      approval: "pending",
      status: "ok",
      found_at: "2026-10-19T18:00:00Z",
      skill: {
        id: "sk-btree",
        name: "B-Tree Indexing",
        level: "intermediate",
      },
    },
    {
      id: "res-wal-1",
      goal_id: goalId,
      skill_id: "sk-wal",
      url: "https://www.postgresql.org/docs/current/wal-intro.html",
      title: "Write-Ahead Logging (WAL) - PostgreSQL Manual",
      domain: "postgresql.org",
      type: "article",
      estimated_minutes: 20,
      relevance: 0.9,
      found_by_query: "PostgreSQL WAL internals tutorial",
      search_provider: "mock-search",
      approval: "pending",
      status: "ok",
      found_at: "2026-10-19T18:05:00Z",
      skill: {
        id: "sk-wal",
        name: "Write-Ahead Logging",
        level: "advanced",
      },
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

  test("Screen S06: renders approval queue, provenance, live link, approve, reject/not useful, and planner re-run dialog", async ({
    page,
  }) => {
    // 1. Mock API routes
    await page.route(`**/api/v1/goals/${goalId}/resources`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            resources: mockResources,
            skills: [
              { id: "sk-btree", name: "B-Tree Indexing", difficulty: 3 },
              { id: "sk-wal", name: "Write-Ahead Logging", difficulty: 5 },
            ],
            exclusionsCount: 0,
            activeJob: null,
          },
        }),
      });
    });

    await page.route(`**/api/v1/resources/res-btree-1/approve`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            resource: { ...mockResources[0], approval: "approved" },
            attachedPlanItemIds: ["plan-item-01"],
          },
        }),
      });
    });

    await page.route(`**/api/v1/resources/res-wal-1/reject`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            resource: { ...mockResources[1], approval: "rejected" },
            exclusionCreated: true,
          },
        }),
      });
    });

    await page.route(`**/api/v1/goals/${goalId}/plan`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: { success: true },
        }),
      });
    });

    // 2. Navigate to screen S06
    await page.goto(`/goals/${goalId}/resources`);

    // 3. Verify page header
    await expect(page.getByText("Resource Approval Queue")).toBeVisible();
    await expect(page.getByText("Strictly search-grounded candidates")).toBeVisible();

    // 4. Verify candidate card 1
    const card1 = page.locator(`[data-testid="resource-card-res-btree-1"]`);
    await expect(card1).toBeVisible();
    await expect(card1.getByText("B-Tree Indexes - PostgreSQL Documentation")).toBeVisible();
    await expect(card1.getByText("25 min")).toBeVisible();
    await expect(card1.getByText("95% match")).toBeVisible();
    await expect(card1.getByText("Query: “PostgreSQL indexing best practices beginner”")).toBeVisible();
    await expect(card1.getByText("via mock-search")).toBeVisible();

    // 5. Verify live external link attributes
    const externalLink = page.locator(`[data-testid="resource-external-link-res-btree-1"]`);
    await expect(externalLink).toHaveAttribute("target", "_blank");
    await expect(externalLink).toHaveAttribute("rel", "noopener noreferrer");
    await expect(externalLink).toHaveAttribute(
      "href",
      "https://www.postgresql.org/docs/current/indexes-btree.html"
    );

    // 6. Approve candidate 1
    const approveBtn = page.locator(`[data-testid="approve-resource-res-btree-1"]`);
    await approveBtn.click();

    // Verify Re-run Planner banner appeared
    const rerunBannerBtn = page.locator(`[data-testid="re-run-planner-btn"]`);
    await expect(rerunBannerBtn).toBeVisible();

    // Switch to "Approved" tab and verify card 1 displays approved badge
    const filterApprovedBtn = page.locator(`[data-testid="filter-approved-btn"]`);
    await filterApprovedBtn.click();
    await expect(card1.getByText("Approved")).toBeVisible();

    // Switch back to "Pending" tab to interact with candidate 2
    const filterPendingBtn = page.locator(`[data-testid="filter-pending-btn"]`);
    await filterPendingBtn.click();

    // 7. Reject candidate 2 with "Not useful"
    const card2 = page.locator(`[data-testid="resource-card-res-wal-1"]`);
    await expect(card2).toBeVisible();
    const notUsefulBtn = page.locator(`[data-testid="not-useful-res-wal-1"]`);
    await notUsefulBtn.click();

    // Switch to "All" tab to verify candidate 2 is rejected
    await page.locator(`[data-testid="filter-all-btn"]`).click();
    await expect(card2.getByText("Rejected")).toBeVisible();

    // 8. Open Re-run planner confirmation dialog
    await rerunBannerBtn.click();
    await expect(page.getByText("Re-run Planner with Approved Resources?")).toBeVisible();
    await expect(
      page.getByText("You have approved 1 new resource(s) that are attached to your skills.")
    ).toBeVisible();

    // Confirm re-run planner
    const confirmBtn = page.locator(`[data-testid="confirm-rerun-planner-btn"]`);
    await confirmBtn.click();
  });

  test("Screen S06: displays paused cap banner when daily search quota is reached", async ({
    page,
  }) => {
    await page.route(`**/api/v1/goals/${goalId}/resources`, (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            resources: [],
            skills: [],
            exclusionsCount: 2,
            activeJob: {
              id: "job-cap-1",
              status: "paused_cap",
              last_error: "Daily search API call cap of 50 reached. Discovery paused.",
            },
          },
        }),
      });
    });

    await page.goto(`/goals/${goalId}/resources`);

    // Verify visible cap banner
    const capBanner = page.locator(`[data-testid="cap-reached-banner"]`);
    await expect(capBanner).toBeVisible();
    await expect(page.getByText("Quota Reached · Discovery Paused Cleanly")).toBeVisible();
    await expect(
      page.getByText("Daily search API call cap of 50 reached. Discovery paused.")
    ).toBeVisible();
  });
});
