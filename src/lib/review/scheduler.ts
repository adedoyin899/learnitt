import { SkillStatus } from "@/types/database";

export const REVIEW_INTERVALS = [1, 3, 7, 14, 30] as const;

export type ReviewVerdict = "pass" | "fail";

export interface ReviewState {
  interval_days: number;
  due_on: string;
  last_result?: ReviewVerdict | null;
}

export interface ReviewItem {
  id: string;
  type: "recall_question" | "saved_card";
  skill_id: string;
  skill_name: string;
  prompt: string;
  options?: string[] | null;
  answer_key?: string | null;
  explanation?: string | null;
  answer?: string;
  estimated_minutes: number;
  evidence_level: number;
}

/**
 * Pure function: Calculates next interval after pass or fail.
 * Prompt Requirement 1:
 * "after a pass, intervals go 1, 3, 7, 14, 30 days. A fail resets to 1 day."
 */
export function getNextInterval(currentInterval: number, verdict: ReviewVerdict): number {
  if (verdict === "fail") {
    return 1;
  }

  // Pass path: 1 -> 3 -> 7 -> 14 -> 30 (caps at 30)
  if (currentInterval <= 0) return 1;
  if (currentInterval < 3) return 3;
  if (currentInterval < 7) return 7;
  if (currentInterval < 14) return 14;
  return 30;
}

/**
 * Pure function: Computes the next review date and interval state.
 */
export function computeNextReview(
  current: { interval_days: number; due_on?: string },
  verdict: ReviewVerdict,
  fromDate?: Date
): { interval_days: number; due_on: string; last_result: ReviewVerdict } {
  const baseDate = fromDate ? new Date(fromDate) : new Date();
  const nextInterval = getNextInterval(current.interval_days, verdict);

  const nextDue = new Date(baseDate.getTime() + nextInterval * 24 * 60 * 60 * 1000);
  const due_on = nextDue.toISOString().split("T")[0];

  return {
    interval_days: nextInterval,
    due_on,
    last_result: verdict,
  };
}

/**
 * Pure function: Determines if a skill should transition to `needs_review`.
 * Prompt Requirement 1:
 * "set skills.status to needs_review when a review is missed or the last evidence is older than 30 days."
 */
export function checkNeedsReview(
  skill: {
    status: SkillStatus;
    verified_at?: string | null;
    evidence_level?: number;
  },
  review: {
    due_on?: string | null;
  } | null,
  now?: Date
): boolean {
  const currentDate = now ? new Date(now) : new Date();
  const todayStr = currentDate.toISOString().split("T")[0];

  // 1. If review is scheduled and due_on is before today -> review was missed
  if (review?.due_on && review.due_on < todayStr) {
    return true;
  }

  // 2. If verified_at exists and is older than 30 days -> evidence expired
  if (skill.verified_at) {
    const verifiedDate = new Date(skill.verified_at);
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (currentDate.getTime() - verifiedDate.getTime() > thirtyDaysMs) {
      return true;
    }
  }

  return false;
}

/**
 * Pure function: Selects review items capped at max 15 minutes.
 * Prompt Requirement 2:
 * "The Today review block is capped at 15 minutes. Review uses short recall questions
 *  from existing quizzes, plus saved cards (self-rated)."
 */
export function selectReviewBatch(
  candidates: ReviewItem[],
  maxMinutes: number = 15
): { items: ReviewItem[]; totalMinutes: number } {
  const selected: ReviewItem[] = [];
  let totalMinutes = 0;

  for (const item of candidates) {
    const minutes = Math.max(1, item.estimated_minutes || 1);
    if (totalMinutes + minutes <= maxMinutes) {
      selected.push(item);
      totalMinutes += minutes;
    }
  }

  return {
    items: selected,
    totalMinutes,
  };
}
