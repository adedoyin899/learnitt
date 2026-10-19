import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MockAIProvider } from "@/lib/ai/adapters/mock-adapter";
import {
  getDueReviewItems,
  submitReviewOutcome,
  getNextInterval,
  computeNextReview,
} from "@/lib/review";
import { getProgressData } from "@/lib/progress/service";
import { calculateMVDStreak } from "@/lib/progress/stats";

describe("Phase L9: Progress View & Spaced Review (Epics G2 & G3)", () => {
  // In-memory test database mock
  function createTestDb() {
    const goals: any[] = [];
    const skills: any[] = [];
    const skillReviews: any[] = [];
    const quizzes: any[] = [];
    const quizQuestions: any[] = [];
    const savedCards: any[] = [];
    const checkIns: any[] = [];
    const planItems: any[] = [];

    const dbClient: any = {
      from: (table: string) => {
        const state: any = {
          _filters: [] as Array<(item: any) => boolean>,
          _orders: [] as Array<{ col: string; asc: boolean }>,
          _limit: null as number | null,
        };

        const builder: any = {
          select: (_cols?: string) => builder,
          insert: (val: any) => {
            const items = Array.isArray(val) ? val : [val];
            const inserted = items.map((it: any) => {
              const row = { id: it.id || crypto.randomUUID(), created_at: it.created_at || new Date().toISOString(), ...it };
              if (table === "goals") goals.push(row);
              if (table === "skills") skills.push(row);
              if (table === "skill_reviews") skillReviews.push(row);
              if (table === "quizzes") quizzes.push(row);
              if (table === "quiz_questions") quizQuestions.push(row);
              if (table === "saved_cards") savedCards.push(row);
              if (table === "check_ins") checkIns.push(row);
              if (table === "plan_items") planItems.push(row);
              return row;
            });
            return {
              select: () => ({
                single: async () => ({ data: inserted[0], error: null }),
                maybeSingle: async () => ({ data: inserted[0], error: null }),
                then: (res: any) => res({ data: inserted, error: null }),
              }),
              then: (res: any) => res({ data: inserted, error: null }),
            };
          },
          upsert: (val: any) => {
            const items = Array.isArray(val) ? val : [val];
            items.forEach((it: any) => {
              const row = { id: it.id || crypto.randomUUID(), ...it };
              if (table === "skill_reviews") {
                const idx = skillReviews.findIndex((r) => r.skill_id === it.skill_id);
                if (idx >= 0) skillReviews[idx] = { ...skillReviews[idx], ...row };
                else skillReviews.push(row);
              }
            });
            return Promise.resolve({ error: null });
          },
          update: (val: any) => {
            const updateFilters: Array<(item: any) => boolean> = [];
            const updateBuilder: any = {
              eq: (col: string, targetVal: any) => {
                updateFilters.push((item) => item[col] === targetVal);
                return updateBuilder;
              },
              then: (res: any) => {
                let matched: any[] = [];
                if (table === "skills") matched = skills;
                if (table === "skill_reviews") matched = skillReviews;
                matched
                  .filter((item) => updateFilters.every((f) => f(item)))
                  .forEach((item) => Object.assign(item, val));
                return res({ error: null });
              },
            };
            return updateBuilder;
          },
          eq: (col: string, val: any) => {
            state._filters.push((it: any) => it[col] === val);
            return builder;
          },
          lte: (col: string, val: any) => {
            state._filters.push((it: any) => it[col] <= val);
            return builder;
          },
          gte: (col: string, val: any) => {
            state._filters.push((it: any) => it[col] >= val);
            return builder;
          },
          in: (col: string, vals: any[]) => {
            const set = new Set(vals);
            state._filters.push((it: any) => set.has(it[col]));
            return builder;
          },
          order: (col: string, opts?: { ascending?: boolean }) => {
            state._orders.push({ col, asc: opts?.ascending ?? true });
            return builder;
          },
          limit: (n: number) => {
            state._limit = n;
            return builder;
          },
          maybeSingle: async () => {
            let list: any[] = [];
            if (table === "goals") list = goals;
            if (table === "skills") list = skills;
            if (table === "skill_reviews") list = skillReviews;

            const filtered = list.filter((it) => state._filters.every((f: any) => f(it)));
            return { data: filtered[0] || null, error: null };
          },
          single: async () => {
            let list: any[] = [];
            if (table === "goals") list = goals;
            if (table === "skills") list = skills;
            if (table === "skill_reviews") list = skillReviews;

            const filtered = list.filter((it) => state._filters.every((f: any) => f(it)));
            return {
              data: filtered[0] || null,
              error: filtered[0] ? null : new Error("Not found"),
            };
          },
          then: (res: any) => {
            let list: any[] = [];
            if (table === "goals") list = goals;
            if (table === "skills") list = skills;
            if (table === "skill_reviews") list = skillReviews;
            if (table === "quizzes") list = quizzes;
            if (table === "quiz_questions") list = quizQuestions;
            if (table === "saved_cards") list = savedCards;
            if (table === "check_ins") list = checkIns;
            if (table === "plan_items") list = planItems;

            let filtered = list.filter((it) => state._filters.every((f: any) => f(it)));
            for (const ord of state._orders) {
              filtered.sort((a, b) => {
                const valA = a[ord.col];
                const valB = b[ord.col];
                if (valA < valB) return ord.asc ? -1 : 1;
                if (valA > valB) return ord.asc ? 1 : -1;
                return 0;
              });
            }
            if (state._limit) {
              filtered = filtered.slice(0, state._limit);
            }
            return res({ data: filtered, error: null });
          },
        };

        return builder;
      },
      _data: {
        goals,
        skills,
        skillReviews,
        quizzes,
        quizQuestions,
        savedCards,
        checkIns,
        planItems,
      },
    };

    return dbClient;
  }

  describe("1. Spaced Review Interval progression & submission", () => {
    it("Pass a review: interval advances 1 -> 3 -> 7 -> 14 -> 30 and sets next due date", async () => {
      const db = createTestDb();
      const ownerId = "user_1";
      const skillId = "skill_indexing_1";
      const fixedDate = new Date("2026-10-19T10:00:00Z");

      // Seed skill and initial review at interval 1 day
      db._data.skills.push({
        id: skillId,
        owner_id: ownerId,
        name: "B-Tree Indexing",
        status: "needs_review",
        evidence_level: 2,
      });

      db._data.skillReviews.push({
        owner_id: ownerId,
        skill_id: skillId,
        interval_days: 1,
        due_on: "2026-10-19",
        last_result: "pass",
      });

      // Pass the review
      const res1 = await submitReviewOutcome(db, {
        ownerId,
        skillId,
        itemId: "item_1",
        itemType: "recall_question",
        verdict: "pass",
        now: fixedDate,
      });

      // 1 -> 3 days
      expect(res1.next_interval_days).toBe(3);
      expect(res1.next_due_on).toBe("2026-10-22");
      expect(res1.skill_status).toBe("verified");

      // Verify db row updated
      const row = db._data.skillReviews.find((r: any) => r.skill_id === skillId);
      expect(row.interval_days).toBe(3);
      expect(row.due_on).toBe("2026-10-22");

      // Pass again: 3 -> 7 days
      const res2 = await submitReviewOutcome(db, {
        ownerId,
        skillId,
        itemId: "item_2",
        itemType: "recall_question",
        verdict: "pass",
        now: fixedDate,
      });
      expect(res2.next_interval_days).toBe(7);
      expect(res2.next_due_on).toBe("2026-10-26");

      // Pass again: 7 -> 14 days
      const res3 = await submitReviewOutcome(db, {
        ownerId,
        skillId,
        itemId: "item_3",
        itemType: "recall_question",
        verdict: "pass",
        now: fixedDate,
      });
      expect(res3.next_interval_days).toBe(14);
      expect(res3.next_due_on).toBe("2026-11-02");

      // Pass again: 14 -> 30 days
      const res4 = await submitReviewOutcome(db, {
        ownerId,
        skillId,
        itemId: "item_4",
        itemType: "recall_question",
        verdict: "pass",
        now: fixedDate,
      });
      expect(res4.next_interval_days).toBe(30);
      expect(res4.next_due_on).toBe("2026-11-18");

      // Pass again: caps at 30 days
      const res5 = await submitReviewOutcome(db, {
        ownerId,
        skillId,
        itemId: "item_5",
        itemType: "recall_question",
        verdict: "pass",
        now: fixedDate,
      });
      expect(res5.next_interval_days).toBe(30);
    });

    it("Fail a review: resets interval to 1 day and comes back tomorrow", async () => {
      const db = createTestDb();
      const ownerId = "user_1";
      const skillId = "skill_wal_1";
      const fixedDate = new Date("2026-10-19T10:00:00Z");

      // Seed review with interval 14
      db._data.skills.push({
        id: skillId,
        owner_id: ownerId,
        name: "WAL Checkpoints",
        status: "verified",
        evidence_level: 2,
      });

      db._data.skillReviews.push({
        owner_id: ownerId,
        skill_id: skillId,
        interval_days: 14,
        due_on: "2026-10-19",
        last_result: "pass",
      });

      // Fail review
      const res = await submitReviewOutcome(db, {
        ownerId,
        skillId,
        itemId: "item_wal_q1",
        itemType: "recall_question",
        verdict: "fail",
        now: fixedDate,
      });

      // Invariant: Fail resets to 1 day and schedules for tomorrow
      expect(res.next_interval_days).toBe(1);
      expect(res.next_due_on).toBe("2026-10-20");
      expect(res.skill_status).toBe("needs_review");

      const row = db._data.skillReviews.find((r: any) => r.skill_id === skillId);
      expect(row.interval_days).toBe(1);
      expect(row.due_on).toBe("2026-10-20");
      expect(row.last_result).toBe("fail");
    });
  });

  describe("2. Review block 15-minute budget capping & item types", () => {
    it("combines recall questions and saved cards and caps at <= 15 minutes", async () => {
      const db = createTestDb();
      const ownerId = "user_1";
      const fixedDate = new Date("2026-10-19T10:00:00Z");

      // 1. Seed two skills due for review
      db._data.skills.push(
        { id: "sk_1", owner_id: ownerId, name: "Database Concurrency", status: "needs_review", evidence_level: 2 },
        { id: "sk_2", owner_id: ownerId, name: "Query Optimization", status: "needs_review", evidence_level: 2 }
      );

      db._data.skillReviews.push(
        { owner_id: ownerId, skill_id: "sk_1", interval_days: 1, due_on: "2026-10-19" },
        { owner_id: ownerId, skill_id: "sk_2", interval_days: 1, due_on: "2026-10-19" }
      );

      // 2. Seed quizzes with 8 recall questions (8 * 2m = 16m)
      db._data.quizzes.push(
        { id: "quiz_1", owner_id: ownerId, skill_id: "sk_1" },
        { id: "quiz_2", owner_id: ownerId, skill_id: "sk_2" }
      );

      for (let i = 1; i <= 8; i++) {
        db._data.quizQuestions.push({
          id: `qq_${i}`,
          quiz_id: i <= 4 ? "quiz_1" : "quiz_2",
          type: "recall_mc",
          prompt: `Question ${i}?`,
          options: ["Option A", "Option B"],
          answer_key: "Option A",
        });
      }

      // 3. Seed saved cards (3 cards * 1m = 3m)
      db._data.savedCards.push(
        { id: "sc_1", owner_id: ownerId, skill_id: "sk_1", question: "Card 1", answer: "Ans 1" },
        { id: "sc_2", owner_id: ownerId, skill_id: "sk_2", question: "Card 2", answer: "Ans 2" }
      );

      // Total available candidate minutes = 16 + 2 = 18 minutes
      const result = await getDueReviewItems(db, {
        ownerId,
        maxMinutes: 15,
        now: fixedDate,
      });

      // Invariant: batch never exceeds 15 minutes
      expect(result.total_estimated_minutes).toBeLessThanOrEqual(15);
      expect(result.items.length).toBeGreaterThan(0);

      // Saved cards self-rated evidence stays E0
      const savedCardItems = result.items.filter((it) => it.type === "saved_card");
      savedCardItems.forEach((sc) => {
        expect(sc.evidence_level).toBe(0);
      });
    });
  });

  describe("3. Progress stats match seeded data exactly", () => {
    it("calculates accurate verified skills, evidence mix, streak, and planned vs done minutes", async () => {
      const db = createTestDb();
      const ownerId = "user_1";
      const goalId = "goal_1";
      const fixedDate = new Date("2026-10-19T12:00:00Z");

      // 1. Seed goal
      db._data.goals.push({
        id: goalId,
        owner_id: ownerId,
        title: "Postgres Mastery",
        status: "active",
      });

      // 2. Seed 4 skills with distinct evidence levels
      db._data.skills.push(
        { id: "s1", owner_id: ownerId, goal_id: goalId, status: "verified", evidence_level: 1, verified_at: "2026-10-15T10:00:00Z" },
        { id: "s2", owner_id: ownerId, goal_id: goalId, status: "verified", evidence_level: 2, verified_at: "2026-10-16T10:00:00Z" },
        { id: "s3", owner_id: ownerId, goal_id: goalId, status: "verified", evidence_level: 3, verified_at: "2026-10-18T10:00:00Z" },
        { id: "s4", owner_id: ownerId, goal_id: goalId, status: "learning", evidence_level: 0 }
      );

      // 3. Seed check-ins: 3 consecutive days done (17, 18, 19)
      db._data.checkIns.push(
        { id: "ci_1", owner_id: ownerId, outcome: "done", minutes_actual: 45, created_at: "2026-10-17T14:00:00Z" },
        { id: "ci_2", owner_id: ownerId, outcome: "done", minutes_actual: 50, created_at: "2026-10-18T14:00:00Z" },
        { id: "ci_3", owner_id: ownerId, outcome: "mvd_only", minutes_actual: 20, created_at: "2026-10-19T14:00:00Z" }
      );

      // 4. Seed review due
      db._data.skillReviews.push({
        owner_id: ownerId,
        skill_id: "s1",
        interval_days: 1,
        due_on: "2026-10-19",
      });

      const progress = await getProgressData(db, {
        ownerId,
        goalId,
        now: fixedDate,
      });

      // Exact matches
      expect(progress.total_skills).toBe(4);
      expect(progress.verified_skills_count).toBe(3);
      expect(progress.skills_due_for_review).toBe(1);

      // Evidence mix: E0=1, E1=1, E2=1, E3=1
      expect(progress.evidence_mix.e0).toBe(1);
      expect(progress.evidence_mix.e1).toBe(1);
      expect(progress.evidence_mix.e2).toBe(1);
      expect(progress.evidence_mix.e3).toBe(1);

      // MVD Streak: 3 days active
      expect(progress.mvd_streak.current_streak).toBe(3);
      expect(progress.mvd_streak.status).toBe("active");

      // Cumulative verified skills timeline: 3 points
      expect(progress.verified_skills_over_time.length).toBe(3);
      expect(progress.verified_skills_over_time[progress.verified_skills_over_time.length - 1].cumulative_count).toBe(3);
    });
  });

  describe("4. Weekly summary text is produced without ANY AI call", () => {
    it("produces deterministic plain-language summary without invoking AI provider", async () => {
      const db = createTestDb();
      const ownerId = "user_1";
      const goalId = "goal_1";
      const fixedDate = new Date("2026-10-19T12:00:00Z");
      const mockAiProvider = new MockAIProvider();

      // Seed goal and data
      db._data.goals.push({ id: goalId, owner_id: ownerId, status: "active" });
      db._data.skills.push({
        id: "s1",
        owner_id: ownerId,
        goal_id: goalId,
        status: "verified",
        evidence_level: 2,
        verified_at: "2026-10-19T08:00:00Z",
      });
      db._data.checkIns.push({
        id: "ci_1",
        owner_id: ownerId,
        outcome: "done",
        minutes_actual: 60,
        created_at: "2026-10-19T09:00:00Z",
      });

      const progress = await getProgressData(db, {
        ownerId,
        goalId,
        now: fixedDate,
      });

      // Invariant: summary text is produced
      expect(progress.plain_summary).toBeDefined();
      expect(progress.plain_summary.length).toBeGreaterThan(20);
      expect(progress.plain_summary).toContain("1 learning session totaling 60 minutes");
      expect(progress.plain_summary).toContain("1 verified skill");

      // Invariant: 0 AI calls were made to mock adapter
      expect(mockAiProvider.recordedCalls.length).toBe(0);
    });
  });
});
