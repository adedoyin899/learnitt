import { SupabaseClient } from "@supabase/supabase-js";
import { AICapReachedError, executeAITaskWithRetry } from "@/lib/ai/core";
import { AIProvider } from "@/lib/ai/types";
import { AI_CONFIG } from "@/lib/config/ai";
import { recalculateSkillEvidence } from "@/lib/evidence/service";
import { getAIProvider } from "@/lib/providers/registry";
import { Database } from "@/types/database";

export interface DeterministicRecallResult {
  isCorrect: boolean;
  score: number; // 100 or 0
  verdict: "pass" | "fail";
  feedback: { summary: string };
}

/**
 * Evaluates a recall question deterministically on the server without any AI call.
 */
export function markRecallAnswerDeterministically(
  userAnswer: string | number,
  answerKey: any,
  options?: string[] | null
): DeterministicRecallResult {
  let isCorrect = false;

  if (typeof answerKey === "number") {
    // If answer key is an index
    if (typeof userAnswer === "number") {
      isCorrect = userAnswer === answerKey;
    } else {
      // Check if user answer is string of the number or matches the option text
      const parsedNum = parseInt(String(userAnswer), 10);
      if (!isNaN(parsedNum) && parsedNum === answerKey) {
        isCorrect = true;
      } else if (options && options[answerKey]) {
        isCorrect =
          String(userAnswer).trim().toLowerCase() ===
          String(options[answerKey]).trim().toLowerCase();
      }
    }
  } else if (typeof answerKey === "string") {
    const normKey = answerKey.trim().toLowerCase();
    const normUser = String(userAnswer).trim().toLowerCase();
    isCorrect = normUser === normKey;

    // Check boolean equivalents for true/false
    if (!isCorrect) {
      if (
        (normKey === "true" || normKey === "t") &&
        (normUser === "true" || normUser === "t" || normUser === "1")
      ) {
        isCorrect = true;
      } else if (
        (normKey === "false" || normKey === "f") &&
        (normUser === "false" || normUser === "f" || normUser === "0")
      ) {
        isCorrect = true;
      }
    }
  }

  const score = isCorrect ? 100 : 0;
  const verdict = isCorrect ? "pass" : "fail";
  const feedback = {
    summary: isCorrect ? "Correct answer." : "Incorrect answer.",
  };

  return { isCorrect, score, verdict, feedback };
}

export interface AppliedGradeAIOutput {
  criterion_scores: Array<{
    criterion: string;
    score: number; // 0 to 2
    max_score?: number;
    feedback?: string;
  }>;
  total: number;
  verdict: "pass" | "fail";
  feedback: {
    summary?: string;
    per_criterion?: Record<string, string>;
    strengths?: string[];
    improvements?: string[];
  } | string;
  confidence: number;
}

/**
 * Grades an applied or artifact attempt using the AI layer.
 * If confidence < 0.6, status is set to needs_your_review and awards nothing until user confirms.
 * If AI is paused or cap is hit, status is set to pending_grade.
 */
export async function gradeAppliedAttempt(
  dbClient: SupabaseClient<Database>,
  attemptId: string,
  ownerId: string,
  provider?: AIProvider
): Promise<{
  attemptStatus: "graded" | "needs_your_review" | "pending_grade";
  grade?: Database["public"]["Tables"]["grades"]["Row"];
  isPending: boolean;
  message?: string;
}> {
  // 1. Fetch attempt and question
  const { data: attempt, error: attErr } = await dbClient
    .from("attempts")
    .select("id, question_id, answer_text, client_id, status")
    .eq("id", attemptId)
    .eq("owner_id", ownerId)
    .single();

  if (attErr || !attempt) {
    throw new Error(`Attempt ${attemptId} not found`);
  }

  const { data: question, error: qErr } = await dbClient
    .from("quiz_questions")
    .select("id, prompt, rubric, quiz_id, type")
    .eq("id", attempt.question_id)
    .single();

  if (qErr || !question) {
    throw new Error(`Question ${attempt.question_id} not found`);
  }

  const { data: quiz } = await dbClient
    .from("quizzes")
    .select("skill_id")
    .eq("id", question.quiz_id)
    .single();

  const skillId = quiz?.skill_id;
  const aiProvider = provider || getAIProvider();

  try {
    const execution = await executeAITaskWithRetry<AppliedGradeAIOutput>({
      ownerId,
      task: "grade_applied",
      payload: {
        question: question.prompt,
        rubric: question.rubric || [],
        answer: attempt.answer_text || "",
      },
      provider: aiProvider,
      dbClient,
    });

    const aiData = execution.data;
    const confidence = typeof aiData.confidence === "number" ? aiData.confidence : 1.0;
    const isLowConfidence = confidence < 0.6;
    const targetStatus = isLowConfidence ? "needs_your_review" : "graded";

    // Verdict must be pass at 70 or above
    const verdict = aiData.total >= 70 ? "pass" : "fail";

    // Set any existing grades to is_current = false
    await dbClient
      .from("grades")
      .update({ is_current: false })
      .eq("attempt_id", attemptId)
      .eq("owner_id", ownerId);

    // Insert new AI grade
    const { data: gradeRow, error: gradeErr } = await dbClient
      .from("grades")
      .insert({
        owner_id: ownerId,
        attempt_id: attemptId,
        source: "ai",
        criterion_scores: aiData.criterion_scores as any,
        total: aiData.total,
        verdict,
        feedback: aiData.feedback as any,
        confidence,
        model_version: execution.modelVersion || AI_CONFIG.DEFAULT_MODEL,
        is_current: true,
      })
      .select()
      .single();

    if (gradeErr || !gradeRow) {
      throw new Error(`Failed to save grade: ${gradeErr?.message}`);
    }

    // Update attempt status
    await dbClient
      .from("attempts")
      .update({ status: targetStatus })
      .eq("id", attemptId)
      .eq("owner_id", ownerId);

    // If confidence >= 0.6 and skillId is present, evaluate evidence!
    if (!isLowConfidence && skillId) {
      await recalculateSkillEvidence(dbClient, skillId, ownerId);
    }

    return {
      attemptStatus: targetStatus,
      grade: gradeRow,
      isPending: false,
    };
  } catch (err: any) {
    if (err instanceof AICapReachedError || err?.isCapReached) {
      // Set attempt status to pending_grade
      await dbClient
        .from("attempts")
        .update({ status: "pending_grade" })
        .eq("id", attemptId)
        .eq("owner_id", ownerId);

      return {
        attemptStatus: "pending_grade",
        isPending: true,
        message: "AI is paused until tomorrow. Your answer is saved and will be graded then.",
      };
    }
    throw err;
  }
}

/**
 * Handles a user override on a grade row.
 * Sets previous grade is_current to false, creates new grade with source 'user_override',
 * keeps original AI grade for audit, logs an audit_events row, and updates evidence.
 */
export async function overrideGrade(
  dbClient: SupabaseClient<Database>,
  options: {
    attemptId: string;
    ownerId: string;
    overrideReason: string;
    criterionScores?: Array<{ criterion: string; score: number; max_score?: number; feedback?: string }>;
    total?: number;
    verdict?: "pass" | "fail";
    feedback?: any;
  }
): Promise<Database["public"]["Tables"]["grades"]["Row"]> {
  const { attemptId, ownerId, overrideReason } = options;

  if (!overrideReason || overrideReason.trim().length === 0) {
    throw new Error("Override reason is required");
  }

  // 1. Fetch current grade
  const { data: currentGrade, error: _currErr } = await dbClient
    .from("grades")
    .select("*")
    .eq("attempt_id", attemptId)
    .eq("owner_id", ownerId)
    .eq("is_current", true)
    .maybeSingle();

  // Determine scores and verdict
  const criterionScores = options.criterionScores || currentGrade?.criterion_scores || [];
  let total = options.total !== undefined ? options.total : currentGrade?.total || 0;

  // If total not supplied but criterion scores are present, calculate total if weights exist
  let verdict: "pass" | "fail" =
    options.verdict || (total >= 70 ? "pass" : currentGrade?.verdict || "fail");

  if (options.verdict) {
    verdict = options.verdict;
    if (verdict === "pass" && total < 70) {
      total = 70; // Pass threshold
    }
  }

  // 2. Mark existing grade as is_current = false
  await dbClient
    .from("grades")
    .update({ is_current: false })
    .eq("attempt_id", attemptId)
    .eq("owner_id", ownerId);

  // 3. Insert new grade with source 'user_override'
  const { data: newGrade, error: newGradeErr } = await dbClient
    .from("grades")
    .insert({
      owner_id: ownerId,
      attempt_id: attemptId,
      source: "user_override",
      criterion_scores: criterionScores as any,
      total,
      verdict,
      feedback: options.feedback || currentGrade?.feedback || null,
      confidence: 1.0,
      model_version: currentGrade?.model_version || null,
      override_reason: overrideReason.trim(),
      is_current: true,
    })
    .select()
    .single();

  if (newGradeErr || !newGrade) {
    throw new Error(`Failed to save override grade: ${newGradeErr?.message}`);
  }

  // 4. Update attempt status to 'graded'
  await dbClient
    .from("attempts")
    .update({ status: "graded" })
    .eq("id", attemptId)
    .eq("owner_id", ownerId);

  // 5. Write audit_events row
  await dbClient.from("audit_events").insert({
    owner_id: ownerId,
    event: "grade_override",
    detail: {
      attempt_id: attemptId,
      previous_grade_id: currentGrade?.id || null,
      new_grade_id: newGrade.id,
      previous_verdict: currentGrade?.verdict || null,
      new_verdict: verdict,
      override_reason: overrideReason.trim(),
    },
  });

  // 6. Recalculate skill evidence
  const { data: att } = await dbClient
    .from("attempts")
    .select("question_id")
    .eq("id", attemptId)
    .single();

  if (att) {
    const { data: q } = await dbClient
      .from("quiz_questions")
      .select("quiz_id")
      .eq("id", att.question_id)
      .single();

    if (q) {
      const { data: quiz } = await dbClient
        .from("quizzes")
        .select("skill_id")
        .eq("id", q.quiz_id)
        .single();

      if (quiz?.skill_id) {
        await recalculateSkillEvidence(dbClient, quiz.skill_id, ownerId);
      }
    }
  }

  return newGrade;
}

/**
 * Handles user self-grading (e.g. while AI is paused).
 * Source is 'self', which never counts as E2.
 */
export async function selfGradeAttempt(
  dbClient: SupabaseClient<Database>,
  options: {
    attemptId: string;
    ownerId: string;
    total: number;
    verdict: "pass" | "fail";
    criterionScores?: any;
    feedback?: any;
  }
): Promise<Database["public"]["Tables"]["grades"]["Row"]> {
  const { attemptId, ownerId, total, verdict, criterionScores, feedback } = options;

  await dbClient
    .from("grades")
    .update({ is_current: false })
    .eq("attempt_id", attemptId)
    .eq("owner_id", ownerId);

  const { data: gradeRow, error: gradeErr } = await dbClient
    .from("grades")
    .insert({
      owner_id: ownerId,
      attempt_id: attemptId,
      source: "self",
      criterion_scores: criterionScores || null,
      total,
      verdict,
      feedback: feedback || { summary: "Self-graded" },
      confidence: 1.0,
      is_current: true,
    })
    .select()
    .single();

  if (gradeErr || !gradeRow) {
    throw new Error(`Failed to save self-grade: ${gradeErr?.message}`);
  }

  // Update attempt status to 'graded'
  await dbClient
    .from("attempts")
    .update({ status: "graded" })
    .eq("id", attemptId)
    .eq("owner_id", ownerId);

  // Recalculate skill evidence (self-grade stays E0 per PRD 6.3)
  const { data: att } = await dbClient
    .from("attempts")
    .select("question_id")
    .eq("id", attemptId)
    .single();

  if (att) {
    const { data: q } = await dbClient
      .from("quiz_questions")
      .select("quiz_id")
      .eq("id", att.question_id)
      .single();

    if (q) {
      const { data: quiz } = await dbClient
        .from("quizzes")
        .select("skill_id")
        .eq("id", q.quiz_id)
        .single();

      if (quiz?.skill_id) {
        await recalculateSkillEvidence(dbClient, quiz.skill_id, ownerId);
      }
    }
  }

  return gradeRow;
}

/**
 * Confirms an attempt that was in 'needs_your_review' status.
 * Updates attempt status to 'graded' and recalculates skill evidence.
 */
export async function confirmNeedsYourReviewAttempt(
  dbClient: SupabaseClient<Database>,
  attemptId: string,
  ownerId: string
): Promise<void> {
  await dbClient
    .from("attempts")
    .update({ status: "graded" })
    .eq("id", attemptId)
    .eq("owner_id", ownerId);

  // Recalculate skill evidence
  const { data: att } = await dbClient
    .from("attempts")
    .select("question_id")
    .eq("id", attemptId)
    .single();

  if (att) {
    const { data: q } = await dbClient
      .from("quiz_questions")
      .select("quiz_id")
      .eq("id", att.question_id)
      .single();

    if (q) {
      const { data: quiz } = await dbClient
        .from("quizzes")
        .select("skill_id")
        .eq("id", q.quiz_id)
        .single();

      if (quiz?.skill_id) {
        await recalculateSkillEvidence(dbClient, quiz.skill_id, ownerId);
      }
    }
  }
}
