import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  ReviewItem,
  ReviewVerdict,
  selectReviewBatch,
  computeNextReview,
} from "./scheduler";

export interface GetDueReviewItemsOptions {
  ownerId: string;
  maxMinutes?: number;
  now?: Date;
}

export interface SubmitReviewOutcomeParams {
  ownerId: string;
  skillId: string;
  itemId: string;
  itemType: "recall_question" | "saved_card";
  verdict: ReviewVerdict;
  now?: Date;
}

/**
 * Retrieves due spaced review items capped at max 15 minutes.
 * Combines short recall questions from existing quizzes and saved cards.
 */
export async function getDueReviewItems(
  supabase: SupabaseClient<Database>,
  options: GetDueReviewItemsOptions
): Promise<{
  due_skills_count: number;
  total_estimated_minutes: number;
  items: ReviewItem[];
}> {
  const { ownerId, maxMinutes = 15, now = new Date() } = options;
  const todayStr = now.toISOString().split("T")[0];

  // 1. Find skill reviews that are due on or before today
  const { data: dueReviews } = await supabase
    .from("skill_reviews")
    .select("skill_id, interval_days, due_on, last_result")
    .eq("owner_id", ownerId)
    .lte("due_on", todayStr);

  // 2. Also find skills explicitly in 'needs_review' status
  const { data: needsReviewSkills } = await supabase
    .from("skills")
    .select("id, name, status, evidence_level")
    .eq("owner_id", ownerId)
    .eq("status", "needs_review");

  const dueSkillIdsSet = new Set<string>();
  (dueReviews || []).forEach((r) => dueSkillIdsSet.add(r.skill_id));
  (needsReviewSkills || []).forEach((s) => dueSkillIdsSet.add(s.id));

  const dueSkillIds = Array.from(dueSkillIdsSet);

  if (dueSkillIds.length === 0) {
    // Also check if any saved cards exist for the user that could be reviewed
    const { data: generalSavedCards } = await supabase
      .from("saved_cards")
      .select("id, skill_id, question, answer, skills (name)")
      .eq("owner_id", ownerId)
      .limit(5);

    if (!generalSavedCards || generalSavedCards.length === 0) {
      return {
        due_skills_count: 0,
        total_estimated_minutes: 0,
        items: [],
      };
    }
  }

  // Fetch skill names for due skill IDs
  const { data: skillsData } = dueSkillIds.length > 0
    ? await supabase
        .from("skills")
        .select("id, name, evidence_level")
        .in("id", dueSkillIds)
    : { data: [] };

  const skillNameMap = new Map((skillsData || []).map((s) => [s.id, s.name]));

  const candidateItems: ReviewItem[] = [];

  // 3. For due skills, fetch quizzes and short recall questions
  if (dueSkillIds.length > 0) {
    const { data: quizzes } = await supabase
      .from("quizzes")
      .select("id, skill_id")
      .in("skill_id", dueSkillIds);

    const quizIds = (quizzes || []).map((q) => q.id);
    const quizToSkillMap = new Map((quizzes || []).map((q) => [q.id, q.skill_id]));

    if (quizIds.length > 0) {
      const { data: questions } = await supabase
        .from("quiz_questions")
        .select("id, quiz_id, type, prompt, options, answer_key")
        .in("quiz_id", quizIds)
        .in("type", ["recall_mc", "recall_tf"]);

      for (const q of questions || []) {
        const skillId = quizToSkillMap.get(q.quiz_id) || "";
        candidateItems.push({
          id: q.id,
          type: "recall_question",
          skill_id: skillId,
          skill_name: skillNameMap.get(skillId) || "Skill Review",
          prompt: q.prompt,
          options: (q.options as string[] | null) || null,
          answer_key: typeof q.answer_key === "string" ? q.answer_key : JSON.stringify(q.answer_key),
          estimated_minutes: 2,
          evidence_level: 1,
        });
      }
    }

    // 4. Also fetch saved cards for these due skills
    const { data: savedCards } = await supabase
      .from("saved_cards")
      .select("id, skill_id, question, answer")
      .in("skill_id", dueSkillIds);

    for (const sc of savedCards || []) {
      const skillId = sc.skill_id || "";
      candidateItems.push({
        id: sc.id,
        type: "saved_card",
        skill_id: skillId,
        skill_name: skillNameMap.get(skillId) || "Saved Flashcard",
        prompt: sc.question,
        answer: sc.answer,
        estimated_minutes: 1,
        evidence_level: 0, // Invariant: Saved cards self-rated evidence stays E0
      });
    }
  }

  // 5. Select batch strictly capped at maxMinutes (default 15 minutes)
  const batch = selectReviewBatch(candidateItems, maxMinutes);

  return {
    due_skills_count: dueSkillIds.length,
    total_estimated_minutes: batch.totalMinutes,
    items: batch.items,
  };
}

/**
 * Submits the outcome of a spaced review item and updates schedule / status.
 */
export async function submitReviewOutcome(
  supabase: SupabaseClient<Database>,
  params: SubmitReviewOutcomeParams
): Promise<{
  next_interval_days: number;
  next_due_on: string;
  verdict: ReviewVerdict;
  skill_id: string;
  skill_status: string;
}> {
  const { ownerId, skillId, verdict, now = new Date() } = params;

  // 1. Fetch current review state for this skill
  const { data: currentReview } = await supabase
    .from("skill_reviews")
    .select("interval_days, due_on")
    .eq("owner_id", ownerId)
    .eq("skill_id", skillId)
    .maybeSingle();

  const currentInterval = currentReview?.interval_days || 1;

  // 2. Compute next interval & due date (pass: 1->3->7->14->30, fail: 1)
  const next = computeNextReview({ interval_days: currentInterval }, verdict, now);

  // 3. Upsert into skill_reviews
  await supabase.from("skill_reviews").upsert(
    {
      owner_id: ownerId,
      skill_id: skillId,
      interval_days: next.interval_days,
      due_on: next.due_on,
      last_result: verdict,
    },
    { onConflict: "skill_id" }
  );

  // 4. Status update
  let newSkillStatus = "needs_review";
  if (verdict === "pass") {
    newSkillStatus = "verified";
    await supabase
      .from("skills")
      .update({
        status: "verified",
        verified_at: now.toISOString(),
      })
      .eq("id", skillId)
      .eq("owner_id", ownerId);
  } else {
    newSkillStatus = "needs_review";
    await supabase
      .from("skills")
      .update({
        status: "needs_review",
      })
      .eq("id", skillId)
      .eq("owner_id", ownerId);
  }

  return {
    next_interval_days: next.interval_days,
    next_due_on: next.due_on,
    verdict,
    skill_id: skillId,
    skill_status: newSkillStatus,
  };
}
