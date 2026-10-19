import { test, expect } from "@playwright/test";

test.describe("L7 E2E · Quizzes & Grade Review (Screens S10 & S11)", () => {
  const mockQuiz = {
    quiz: {
      id: "quiz-e2e-1",
      skill_id: "sk-e2e-1",
      created_at: new Date().toISOString(),
      skill: {
        id: "sk-e2e-1",
        name: "PostgreSQL Internals",
        verification_type: "applied",
        evidence_level: 0,
      },
    },
    questions: [
      {
        id: "q-recall-1",
        quiz_id: "quiz-e2e-1",
        type: "recall_mc",
        prompt: "Which PostgreSQL process writes dirty shared buffers to disk periodically?",
        options: ["WAL Writer", "Background Writer", "AutoVacuum", "Postmaster"],
        // Invariant: answer_key is never sent over GET /api/v1/quizzes/:id
        rubric: null,
        expected_output: null,
      },
      {
        id: "q-applied-1",
        quiz_id: "quiz-e2e-1",
        type: "applied",
        prompt: "Design a relational schema for multi-tenant course subscriptions with row-level security.",
        options: null,
        rubric: [
          { criterion: "Isolation & Keys", weight: 35, description: "Tenant foreign key and composite indices" },
          { criterion: "RLS Policies", weight: 35, description: "Policies enforcing current_setting('app.tenant_id')" },
          { criterion: "Data Integrity", weight: 30, description: "Constraints and cascade configurations" },
        ],
        expected_output: null,
      },
      {
        id: "q-artifact-1",
        quiz_id: "quiz-e2e-1",
        type: "artifact",
        prompt: "Implement a SQL migration script creating the accounts table with an audit trigger.",
        options: null,
        rubric: [
          { criterion: "Table Definition", weight: 40, description: "UUID primary key and valid timestamps" },
          { criterion: "Trigger Implementation", weight: 35, description: "Audit table insert on modification" },
          { criterion: "Syntax Correctness", weight: 25, description: "Valid PostgreSQL DDL syntax" },
        ],
        expected_output: "CREATE TABLE accounts (...);",
      },
    ],
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

  test("Screen S10 (Quiz) renders questions, hides recall answer key, shows rubric for applied", async ({ page }) => {
    await page.route("**/api/v1/quizzes/quiz-e2e-1", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockQuiz),
      })
    );

    await page.goto("/quizzes/quiz-e2e-1");

    // 1. Progress and Header
    await expect(page.locator("h1")).toContainText("PostgreSQL Internals Assessment");
    await expect(page.getByText("Question 1 of 3")).toBeVisible();

    // 2. Question 1: Recall question
    await expect(page.getByText("Which PostgreSQL process writes dirty shared buffers")).toBeVisible();
    await expect(page.getByText("Background Writer")).toBeVisible();

    // 3. Navigate to Question 2 (Applied)
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Question 2 of 3")).toBeVisible();
    await expect(page.getByText("Applied · Practical Task")).toBeVisible();

    // Invariant: Rubric is shown before the user answers an applied question
    await expect(page.getByText("Evaluation Rubric")).toBeVisible();
    await expect(page.getByText("Isolation & Keys")).toBeVisible();
    await expect(page.getByText("RLS Policies")).toBeVisible();

    // 4. Navigate to Question 3 (Artifact)
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Question 3 of 3")).toBeVisible();
    await expect(page.getByText("Artifact · Code / Project Capstone")).toBeVisible();
    // Artifact confirmation tick
    await expect(page.getByLabel("Confirm you ran it and it matched")).toBeVisible();
  });

  test("Screen S11 (Grade Review) displays scores, feedback, model version, and allows overrides", async ({ page }) => {
    await page.route("**/api/v1/quizzes/quiz-e2e-1", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockQuiz),
      })
    );

    let overridePosted = false;

    await page.route("**/api/v1/questions/q-applied-1/attempts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          attempt: {
            id: "att-mock-1",
            question_id: "q-applied-1",
            owner_id: "test-user",
            answer_text: "CREATE TABLE tenants (id uuid PRIMARY KEY);",
            status: "graded",
            client_id: "client-test-1",
          },
          grade: {
            id: "grd-mock-1",
            attempt_id: "att-mock-1",
            criterion_scores: [
              { criterion: "Isolation & Keys", score: 2, weight: 35, description: "Tenant foreign key and composite indices" },
              { criterion: "RLS Policies", score: 1, weight: 35, description: "Policies enforcing current_setting('app.tenant_id')" },
              { criterion: "Data Integrity", score: 1, weight: 30, description: "Constraints and cascade configurations" },
            ],
            total: 75,
            verdict: "pass",
            confidence: 0.95,
            feedback: {
              summary: "Solid schema design with row-level security.",
              strengths: ["Well structured keys."],
              improvements: ["Consider tenant context variable."],
            },
            model_version: "mock-v1",
            source: "ai",
            is_current: true,
          },
          evidence: {
            level: 2,
            label: "Applied, graded",
            status: "verified",
          },
        }),
      })
    );

    await page.route("**/api/v1/attempts/att-mock-1/override", async (route) => {
      overridePosted = true;
      const req = await route.request().postDataJSON();
      expect(req.override_reason).toBe("Demonstrated deep understanding of RLS security contexts");
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          grade: {
            id: "grd-override-1",
            attempt_id: "att-mock-1",
            criterion_scores: [
              { criterion: "Isolation & Keys", score: 2, weight: 35, description: "Tenant foreign key and composite indices" },
              { criterion: "RLS Policies", score: 2, weight: 35, description: "Policies enforcing current_setting('app.tenant_id')" },
              { criterion: "Data Integrity", score: 1, weight: 30, description: "Constraints and cascade configurations" },
            ],
            total: 90,
            verdict: "pass",
            confidence: 1.0,
            model_version: "mock-v1",
            source: "user_override",
            override_reason: req.override_reason,
            is_current: true,
          },
        }),
      });
    });

    await page.goto("/quizzes/quiz-e2e-1");

    // Navigate to Question 2 (Applied)
    await page.getByRole("button", { name: "Next", exact: true }).click();

    // Type applied answer
    const answerInput = page.getByPlaceholder("Write your explanation or code application here...");
    await answerInput.fill("CREATE TABLE tenants (id uuid PRIMARY KEY);");

    // Submit for grading
    await page.getByRole("button", { name: "Submit Answer", exact: true }).click();

    // S11 Grade Review components displayed
    await expect(page.getByText("Pass (Score: 75/100)")).toBeVisible();
    await expect(page.getByText("Model: mock-v1")).toBeVisible();
    await expect(page.getByText("Confidence: 95%")).toBeVisible();
    await expect(page.getByText("Source: ai")).toBeVisible();

    // Click Override Grade button
    await page.getByRole("button", { name: "Override Grade" }).click();

    // Dialog opens: override reason is required
    const reasonInput = page.getByPlaceholder("Explain why this grade is being adjusted...");
    await reasonInput.fill("Demonstrated deep understanding of RLS security contexts");

    await page.getByRole("button", { name: "Save Override" }).click();

    expect(overridePosted).toBe(true);
    await expect(page.getByText("Source: user override")).toBeVisible();
    await expect(page.getByText("Pass (Score: 90/100)")).toBeVisible();
  });
});
