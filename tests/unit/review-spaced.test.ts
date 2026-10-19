import { describe, expect, it } from "vitest";
import {
  getNextInterval,
  computeNextReview,
  checkNeedsReview,
  selectReviewBatch,
  ReviewItem,
} from "@/lib/review";

describe("Spaced Review Pure Logic (src/lib/review)", () => {
  describe("1. Interval table for pass and fail paths", () => {
    it("advances interval on pass: 1 -> 3 -> 7 -> 14 -> 30 -> 30", () => {
      expect(getNextInterval(1, "pass")).toBe(3);
      expect(getNextInterval(3, "pass")).toBe(7);
      expect(getNextInterval(7, "pass")).toBe(14);
      expect(getNextInterval(14, "pass")).toBe(30);
      expect(getNextInterval(30, "pass")).toBe(30);
      expect(getNextInterval(45, "pass")).toBe(30);
    });

    it("resets interval to 1 on fail regardless of previous interval", () => {
      expect(getNextInterval(1, "fail")).toBe(1);
      expect(getNextInterval(3, "fail")).toBe(1);
      expect(getNextInterval(7, "fail")).toBe(1);
      expect(getNextInterval(14, "fail")).toBe(1);
      expect(getNextInterval(30, "fail")).toBe(1);
    });

    it("computes next review date accurately", () => {
      const fixedNow = new Date("2026-10-19T12:00:00Z");

      // Pass path from interval 1 (should become 3 days later: 2026-10-22)
      const passResult = computeNextReview({ interval_days: 1 }, "pass", fixedNow);
      expect(passResult.interval_days).toBe(3);
      expect(passResult.due_on).toBe("2026-10-22");
      expect(passResult.last_result).toBe("pass");

      // Fail path from interval 14 (should become 1 day later: 2026-10-20)
      const failResult = computeNextReview({ interval_days: 14 }, "fail", fixedNow);
      expect(failResult.interval_days).toBe(1);
      expect(failResult.due_on).toBe("2026-10-20");
      expect(failResult.last_result).toBe("fail");
    });
  });

  describe("2. needs_review transitions", () => {
    it("flags needs_review when a scheduled review was missed (due_on < today)", () => {
      const fixedNow = new Date("2026-10-19T12:00:00Z");
      const skill = { status: "verified" as const, verified_at: "2026-10-15T00:00:00Z" };
      const missedReview = { due_on: "2026-10-18" }; // Yesterday

      expect(checkNeedsReview(skill, missedReview, fixedNow)).toBe(true);
    });

    it("does not flag needs_review when review is due today or in the future", () => {
      const fixedNow = new Date("2026-10-19T12:00:00Z");
      const skill = { status: "verified" as const, verified_at: "2026-10-15T00:00:00Z" };
      const todayReview = { due_on: "2026-10-19" };
      const futureReview = { due_on: "2026-10-25" };

      expect(checkNeedsReview(skill, todayReview, fixedNow)).toBe(false);
      expect(checkNeedsReview(skill, futureReview, fixedNow)).toBe(false);
    });

    it("flags needs_review when last evidence is older than 30 days", () => {
      const fixedNow = new Date("2026-10-19T12:00:00Z");
      // 35 days ago: 2026-09-14
      const skill = { status: "verified" as const, verified_at: "2026-09-14T00:00:00Z" };
      const review = { due_on: "2026-10-20" };

      expect(checkNeedsReview(skill, review, fixedNow)).toBe(true);
    });

    it("keeps skill verified when evidence is fresh (< 30 days) and review is not missed", () => {
      const fixedNow = new Date("2026-10-19T12:00:00Z");
      // 10 days ago: 2026-10-09
      const skill = { status: "verified" as const, verified_at: "2026-10-09T00:00:00Z" };
      const review = { due_on: "2026-10-22" };

      expect(checkNeedsReview(skill, review, fixedNow)).toBe(false);
    });
  });

  describe("3. Review block 15-minute cap", () => {
    it("never exceeds 15 minutes even with many candidates", () => {
      const items: ReviewItem[] = [
        {
          id: "q1",
          type: "recall_question",
          skill_id: "s1",
          skill_name: "SQL",
          prompt: "What is an index?",
          estimated_minutes: 2,
          evidence_level: 1,
        },
        {
          id: "q2",
          type: "recall_question",
          skill_id: "s1",
          skill_name: "SQL",
          prompt: "What is VACUUM?",
          estimated_minutes: 2,
          evidence_level: 1,
        },
        {
          id: "q3",
          type: "recall_question",
          skill_id: "s2",
          skill_name: "WAL",
          prompt: "What is WAL?",
          estimated_minutes: 3,
          evidence_level: 1,
        },
        {
          id: "q4",
          type: "recall_question",
          skill_id: "s2",
          skill_name: "WAL",
          prompt: "What is checkpointing?",
          estimated_minutes: 3,
          evidence_level: 1,
        },
        {
          id: "c1",
          type: "saved_card",
          skill_id: "s3",
          skill_name: "PostgreSQL",
          prompt: "Card 1",
          estimated_minutes: 1,
          evidence_level: 0,
        },
        {
          id: "c2",
          type: "saved_card",
          skill_id: "s3",
          skill_name: "PostgreSQL",
          prompt: "Card 2",
          estimated_minutes: 1,
          evidence_level: 0,
        },
        {
          id: "c3",
          type: "saved_card",
          skill_id: "s3",
          skill_name: "PostgreSQL",
          prompt: "Card 3",
          estimated_minutes: 1,
          evidence_level: 0,
        },
        {
          id: "c4",
          type: "saved_card",
          skill_id: "s3",
          skill_name: "PostgreSQL",
          prompt: "Card 4",
          estimated_minutes: 1,
          evidence_level: 0,
        },
        {
          id: "q5",
          type: "recall_question",
          skill_id: "s3",
          skill_name: "PostgreSQL",
          prompt: "Extra question",
          estimated_minutes: 3, // Would push past 15
          evidence_level: 1,
        },
      ];

      const batch = selectReviewBatch(items, 15);
      expect(batch.totalMinutes).toBeLessThanOrEqual(15);
      expect(batch.items.length).toBeGreaterThan(0);
      expect(batch.items.length).toBeLessThan(items.length);
    });
  });
});
