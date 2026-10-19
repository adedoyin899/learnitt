import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { evaluateEvidence } from "./engine";
import { AttemptRecord, EvidenceEvaluationResult, GradeRecord, SkillEvidenceInput } from "./types";

/**
 * Re-evaluates evidence for a given skill and updates `skills` and `skill_reviews` accordingly.
 */
export async function recalculateSkillEvidence(
  client: SupabaseClient<Database>,
  skillId: string,
  ownerId: string,
  options?: { now?: Date }
): Promise<EvidenceEvaluationResult | null> {
  // 1. Fetch skill
  const { data: skill, error: skillErr } = await client
    .from("skills")
    .select("id, verification_type, status, evidence_level, verified_at")
    .eq("id", skillId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (skillErr || !skill) {
    return null;
  }

  // 2. Fetch all quizzes for this skill
  const { data: quizzes } = await client
    .from("quizzes")
    .select("id")
    .eq("skill_id", skillId)
    .eq("owner_id", ownerId);

  const quizList = Array.isArray(quizzes) ? quizzes : quizzes ? [quizzes] : [];
  const quizIds = quizList.map((q: any) => q.id);

  let attemptsData: any[] = [];
  if (quizIds.length > 0) {
    // 3. Fetch all questions for these quizzes
    const { data: questions } = await client
      .from("quiz_questions")
      .select("id, type")
      .in("quiz_id", quizIds)
      .eq("owner_id", ownerId);

    const questionList = Array.isArray(questions) ? questions : questions ? [questions] : [];
    const questionMap = new Map<string, "recall_mc" | "recall_tf" | "applied" | "artifact">();
    const questionIds = questionList.map((q: any) => {
      questionMap.set(q.id, q.type as any);
      return q.id;
    });

    if (questionIds.length > 0) {
      // 4. Fetch attempts
      const { data: rawAttempts } = await client
        .from("attempts")
        .select(`
          id,
          question_id,
          answer_text,
          answer_file_path,
          status,
          created_at,
          grades (*)
        `)
        .in("question_id", questionIds)
        .eq("owner_id", ownerId);

      const attemptsList = Array.isArray(rawAttempts)
        ? rawAttempts
        : rawAttempts
          ? [rawAttempts]
          : [];

      attemptsData = attemptsList.map((att: any) => {
          const currentGrade = (att.grades || []).find((g: any) => g.is_current);

          // Check if user confirmed running artifact
          let userConfirmedRun = false;
          if (att.answer_text) {
            try {
              const parsed = JSON.parse(att.answer_text);
              if (parsed.user_confirmed_run === true || parsed.confirmed === true) {
                userConfirmedRun = true;
              }
            } catch {
              // Plain text answer
            }
          }

          const record: AttemptRecord = {
            id: att.id,
            question_id: att.question_id,
            question_type: questionMap.get(att.question_id) || "applied",
            answer_text: att.answer_text,
            answer_file_path: att.answer_file_path,
            user_confirmed_run: userConfirmedRun,
            status: att.status,
            current_grade: currentGrade
              ? ({
                  id: currentGrade.id,
                  attempt_id: currentGrade.attempt_id,
                  source: currentGrade.source,
                  criterion_scores: currentGrade.criterion_scores,
                  total: currentGrade.total,
                  verdict: currentGrade.verdict,
                  feedback: currentGrade.feedback,
                  confidence: currentGrade.confidence,
                  model_version: currentGrade.model_version,
                  override_reason: currentGrade.override_reason,
                  is_current: currentGrade.is_current,
                  created_at: currentGrade.created_at,
                } as GradeRecord)
              : null,
            created_at: att.created_at,
          };
          return record;
        });
    }
  }

  // 5. Check existing review
  const { data: existingReview } = await client
    .from("skill_reviews")
    .select("skill_id, due_on")
    .eq("skill_id", skillId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  const now = options?.now || new Date();
  const todayStr = now.toISOString().split("T")[0];
  const reviewDueAndMissed =
    existingReview && existingReview.due_on ? existingReview.due_on < todayStr : false;

  const skillInput: SkillEvidenceInput = {
    id: skill.id,
    verification_type: skill.verification_type as any,
    status: skill.status as any,
    evidence_level: skill.evidence_level as any,
    verified_at: skill.verified_at,
  };

  const evalResult = evaluateEvidence(skillInput, attemptsData, {
    now,
    reviewDueAndMissed,
    hasExistingReview: !!existingReview,
  });

  // 6. Update skill row
  await client
    .from("skills")
    .update({
      evidence_level: evalResult.evidenceLevel,
      status: evalResult.status,
      verified_at: evalResult.verifiedAt,
    })
    .eq("id", skillId)
    .eq("owner_id", ownerId);

  // 7. If verified and review should be created:
  if (evalResult.shouldCreateReview) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    await client.from("skill_reviews").upsert(
      {
        owner_id: ownerId,
        skill_id: skillId,
        interval_days: 1,
        due_on: tomorrowStr,
        last_result: "pass",
      },
      { onConflict: "skill_id" }
    );
  }

  return evalResult;
}
