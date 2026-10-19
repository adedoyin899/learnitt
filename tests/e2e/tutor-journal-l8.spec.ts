import { test, expect } from "@playwright/test";

test.describe("L8 E2E · Tutor Q&A and Journal (Screens S12 & S13)", () => {
  const mockConversation = {
    id: "conv-e2e-1",
    owner_id: "user-e2e-1",
    goal_id: "goal-health-1",
    skill_id: "skill-postgres-1",
    is_health_goal: true,
    skill_name: "PostgreSQL B-Tree Indexing",
    goal_title: "Clinical Database Architect",
    created_at: "2026-10-19T10:00:00Z",
    updated_at: "2026-10-19T10:00:00Z",
  };

  const mockMessages = [
    {
      id: "msg-user-1",
      conversation_id: "conv-e2e-1",
      sender: "user",
      content: "How does a B-Tree index work in PostgreSQL?",
      cited_chunk_ids: [],
      general_knowledge: false,
      created_at: "2026-10-19T10:01:00Z",
    },
    {
      id: "msg-asst-1",
      conversation_id: "conv-e2e-1",
      sender: "assistant",
      content:
        "PostgreSQL uses Lehman & Yao B-Tree algorithm for concurrent page access. Pages are connected via right-links.",
      cited_chunk_ids: ["chunk-1"],
      general_knowledge: false,
      created_at: "2026-10-19T10:01:05Z",
    },
    {
      id: "msg-user-2",
      conversation_id: "conv-e2e-1",
      sender: "user",
      content: "What is the capital of France?",
      cited_chunk_ids: [],
      general_knowledge: false,
      created_at: "2026-10-19T10:02:00Z",
    },
    {
      id: "msg-asst-2",
      conversation_id: "conv-e2e-1",
      sender: "assistant",
      content: "The capital of France is Paris.",
      cited_chunk_ids: [],
      general_knowledge: true,
      created_at: "2026-10-19T10:02:05Z",
    },
  ];

  const mockCitationMap = {
    "chunk-1": {
      id: "chunk-1",
      material_id: "mat-1",
      material_title: "Postgres Internals Deep Dive.pdf",
      content:
        "Section 4.2: Lehman and Yao B-Trees allow concurrent readers without read locks and concurrent page splits using high keys.",
      ordinal: 4,
    },
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

  test("Screen S12 (Ask / Tutor): shows citations, general knowledge fallback, health warning, explain styles, flashcards", async ({
    page,
  }) => {
    // 1. Mock API endpoints for Ask
    await page.route("**/api/v1/conversations*", (route) => {
      const url = route.request().url();
      if (route.request().method() === "GET") {
        if (url.includes("/conv-e2e-1")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              conversation: mockConversation,
              messages: mockMessages,
              citations: mockCitationMap,
            }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            conversations: [mockConversation],
          }),
        });
      }
      return route.fulfill({ status: 200, body: JSON.stringify({}) });
    });

    await page.route("**/api/v1/messages/*/explain*", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          explanation: "In simpler terms: Think of a B-Tree like a sorted phone directory with fast page pointers.",
          style: "simpler",
          remainingCalls: 95,
        }),
      });
    });

    await page.route("**/api/v1/saved-cards*", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          card: {
            id: "card-1",
            question: "How does a B-Tree index work in PostgreSQL?",
            answer: "PostgreSQL uses Lehman & Yao B-Tree algorithm...",
          },
        }),
      });
    });

    // 2. Navigate to Ask screen
    await page.goto("/ask?conversation_id=conv-e2e-1");

    // Invariant 7: Health-flagged goals show standing note: "This is for learning. It is not medical advice."
    await expect(page.getByText("This is for learning. It is not medical advice.")).toBeVisible();

    // Invariant 1: First answer has citations
    const citationBtn = page.getByRole("button", { name: /Passage 4/i });
    await expect(citationBtn).toBeVisible();

    // Click citation: opens citation modal showing passage and source material title
    await citationBtn.click();
    await expect(page.getByText("Postgres Internals Deep Dive.pdf")).toBeVisible();
    await expect(page.getByText("Lehman and Yao B-Trees allow concurrent readers")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    // Invariant 1 & Verify item 2: Unsupported answer is labeled as general knowledge
    await expect(page.getByText("General knowledge, not from your materials")).toBeVisible();

    // Invariant 3: Explain styles ("Simpler", "More technical", "With example")
    const simplerBtn = page.getByRole("button", { name: "Simpler" }).first();
    await expect(simplerBtn).toBeVisible();
    await simplerBtn.click();
    await expect(page.getByText("In simpler terms: Think of a B-Tree like a sorted phone directory")).toBeVisible();

    // Invariant 4: "Make this a flashcard"
    const flashcardBtn = page.getByRole("button", { name: "Make this a flashcard" }).first();
    await expect(flashcardBtn).toBeVisible();
    await flashcardBtn.click();
    await expect(page.getByText("Saved to Cards")).toBeVisible();
  });

  test("Screen S13 (Journal): rich text editor, mood 1-5, version history, weekly summary with privacy invariant", async ({
    page,
  }) => {
    let capturedWeeklySummaryPayload: any = null;

    const mockJournalEntries = [
      {
        id: "entry-row-2",
        entry_id: "entry-group-1",
        version: 2,
        owner_id: "user-e2e-1",
        body: "Updated journal entry: mastered Lehman & Yao tree locking mechanisms.",
        mood: 5,
        created_at: "2026-10-19T11:00:00Z",
        versions_count: 2,
        history: [
          {
            id: "entry-row-1",
            entry_id: "entry-group-1",
            version: 1,
            owner_id: "user-e2e-1",
            body: "Initial journal draft: studying B-Trees today.",
            mood: 3,
            created_at: "2026-10-19T09:00:00Z",
          },
        ],
      },
    ];

    // Mock journal API endpoints
    await page.route("**/api/v1/journal*", (route) => {
      const url = route.request().url();
      if (url.includes("/weekly-summary")) {
        capturedWeeklySummaryPayload = JSON.parse(route.request().postData() || "{}");
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            summary: "Great progress this week! Completed 5 study sessions.",
            stats: { completed_sessions: 5, weekly_hours: 8 },
            includedJournal: capturedWeeklySummaryPayload.include_journal === true,
            modelVersion: "mock-v1",
          }),
        });
      }

      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            entries: mockJournalEntries,
          }),
        });
      }

      if (route.request().method() === "POST") {
        const postData = JSON.parse(route.request().postData() || "{}");
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            entry: {
              id: "entry-row-3",
              entry_id: "entry-group-2",
              version: 1,
              body: postData.body,
              mood: postData.mood,
              created_at: new Date().toISOString(),
            },
          }),
        });
      }

      return route.fulfill({ status: 200, body: JSON.stringify({}) });
    });

    await page.route("**/api/v1/goals*", (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ goals: [] }),
      });
    });

    // Navigate to Journal screen S13
    await page.goto("/journal");

    // 1. Verify rich text editor and mood selector
    await expect(page.getByText("Reflections & Progress Journal")).toBeVisible();
    await expect(page.getByPlaceholder("What did you learn today? What clicked, what was difficult?")).toBeVisible();

    // Verify Mood rating 1-5 buttons
    for (let m = 1; m <= 5; m++) {
      await expect(page.getByRole("button", { name: new RegExp(`Mood ${m}`) })).toBeVisible();
    }

    // 2. Select mood 4
    await page.getByRole("button", { name: "Mood 4" }).click();

    // 3. Verify Version History
    await expect(page.getByText("Version 2")).toBeVisible();
    await expect(page.getByText("Updated journal entry: mastered Lehman & Yao tree locking mechanisms.")).toBeVisible();
    await expect(page.getByText("Version 1 (Initial)")).toBeVisible();

    // 4. Invariant 5 & Verify item 3: Weekly summary runs ONLY when user taps "Summarise my week"
    // and ONLY on structured stats unless user also ticks "Include my journal"
    const includeJournalCheckbox = page.getByRole("checkbox", { name: /Include my journal reflections/i });
    await expect(includeJournalCheckbox).toBeVisible();

    // Invariant: unchecked by default
    await expect(includeJournalCheckbox).not.toBeChecked();

    // Tap "Summarise my week"
    const summariseBtn = page.getByRole("button", { name: /Summarise my week/i });
    await summariseBtn.click();

    // Wait for summary to render
    await expect(page.getByText("Great progress this week! Completed 5 study sessions.")).toBeVisible();
    await expect(page.getByText("Privacy notice: Only structured stats were used.")).toBeVisible();

    // Verify request payload strictly sent include_journal: false
    expect(capturedWeeklySummaryPayload).not.toBeNull();
    expect(capturedWeeklySummaryPayload.include_journal).toBe(false);

    // Now test with checkbox ticked
    await includeJournalCheckbox.check();
    await expect(includeJournalCheckbox).toBeChecked();

    await summariseBtn.click();
    await expect(page.getByText("Journal reflections included.")).toBeVisible();
    expect(capturedWeeklySummaryPayload.include_journal).toBe(true);
  });
});
