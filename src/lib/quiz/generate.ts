import { SupabaseClient } from "@supabase/supabase-js";
import { executeAITaskWithRetry } from "@/lib/ai/core";
import { MAKE_QUIZ_PROMPT_VERSION } from "@/lib/ai/prompts";
import { AIProvider } from "@/lib/ai/types";
import { AI_CONFIG } from "@/lib/config/ai";
import { getAIProvider } from "@/lib/providers/registry";
import { Database } from "@/types/database";

export interface QuizQuestionOutput {
  id?: string;
  type: "recall_mc" | "recall_tf" | "applied" | "artifact";
  prompt: string;
  options?: string[] | null;
  answer_key?: string | number | null;
  rubric?: Array<{ criterion: string; weight: number; description: string }> | null;
  source_chunk_ids?: string[];
  skill_id?: string;
}

export interface MakeQuizAIOutput {
  questions: QuizQuestionOutput[];
}

export interface GenerateQuizResult {
  quiz: Database["public"]["Tables"]["quizzes"]["Row"];
  questions: Database["public"]["Tables"]["quiz_questions"]["Row"][];
}

/**
 * Validates a quiz according to L7 rules:
 * - Questions must cite source_chunk_ids that exist in retrieved set (others removed).
 * - Recall questions need an answer key.
 * - Applied and artifact questions need a rubric of 3 to 5 criteria, weights summing to 100.
 */
export function validateAndCleanQuizQuestions(
  rawQuestions: QuizQuestionOutput[],
  validChunkIds: Set<string>,
  hasMaterials: boolean
): { isValid: boolean; errorReason?: string; cleanedQuestions: QuizQuestionOutput[] } {
  if (!rawQuestions || rawQuestions.length === 0) {
    return { isValid: false, errorReason: "No questions generated", cleanedQuestions: [] };
  }

  const cleanedQuestions: QuizQuestionOutput[] = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const q = { ...rawQuestions[i] };

    // 1. Filter source_chunk_ids to only valid chunk IDs
    const rawChunkIds = q.source_chunk_ids || [];
    const validCitations = rawChunkIds.filter((cid) => validChunkIds.has(cid));
    q.source_chunk_ids = validCitations;

    // If materials exist, question should cite at least one confirmed chunk if retrieved set not empty
    if (hasMaterials && validChunkIds.size > 0 && validCitations.length === 0) {
      // If none of the cited IDs were valid, reject so we can retry
      return {
        isValid: false,
        errorReason: `Question ${i + 1} cited unknown chunk IDs not in confirmed materials`,
        cleanedQuestions: [],
      };
    }

    // 2. Recall questions need an answer key
    if (q.type === "recall_mc" || q.type === "recall_tf") {
      if (q.answer_key === undefined || q.answer_key === null || q.answer_key === "") {
        return {
          isValid: false,
          errorReason: `Recall question ${i + 1} is missing an answer key`,
          cleanedQuestions: [],
        };
      }
    }

    // 3. Applied and artifact questions need a rubric of 3 to 5 criteria, weights summing to 100
    if (q.type === "applied" || q.type === "artifact") {
      if (!q.rubric || q.rubric.length < 3 || q.rubric.length > 5) {
        return {
          isValid: false,
          errorReason: `Question ${i + 1} rubric must have 3 to 5 criteria (got ${q.rubric ? q.rubric.length : 0})`,
          cleanedQuestions: [],
        };
      }
      const sumWeights = q.rubric.reduce((acc, c) => acc + (c.weight || 0), 0);
      if (sumWeights !== 100) {
        return {
          isValid: false,
          errorReason: `Question ${i + 1} rubric weights must sum to 100 (got ${sumWeights})`,
          cleanedQuestions: [],
        };
      }
    }

    cleanedQuestions.push(q);
  }

  return { isValid: true, cleanedQuestions };
}

/**
 * Retrieves confirmed chunks for a skill, calls AI to make a quiz,
 * filters citations to confirmed set, validates against L7 rules,
 * retries once if rules are broken, and persists to DB.
 */
export async function generateQuizForSkill(
  dbClient: SupabaseClient<Database>,
  skillId: string,
  ownerId: string,
  provider?: AIProvider
): Promise<GenerateQuizResult> {
  const aiProvider = provider || getAIProvider();

  // 1. Fetch skill
  const { data: skill, error: skillErr } = await dbClient
    .from("skills")
    .select("id, name, verification_type, goal_id")
    .eq("id", skillId)
    .eq("owner_id", ownerId)
    .single();

  if (skillErr || !skill) {
    throw new Error(`Skill ${skillId} not found`);
  }

  // 2. Retrieve confirmed material IDs for this skill
  const { data: links } = await dbClient
    .from("skill_material_links")
    .select("material_id")
    .eq("skill_id", skillId)
    .eq("owner_id", ownerId)
    .eq("confirmed", true);

  const confirmedMaterialIds = (links || []).map((l) => l.material_id);

  // 3. Retrieve chunks for confirmed materials ONLY
  let chunks: Array<{ id: string; content: string; material_id: string }> = [];
  if (confirmedMaterialIds.length > 0) {
    const { data: chunkRows } = await dbClient
      .from("material_chunks")
      .select("id, content, material_id, ordinal")
      .in("material_id", confirmedMaterialIds)
      .eq("owner_id", ownerId)
      .order("ordinal", { ascending: true })
      .limit(20);

    if (chunkRows) {
      chunks = chunkRows.map((c) => ({
        id: c.id,
        content: c.content,
        material_id: c.material_id,
      }));
    }
  }

  const validChunkIds = new Set(chunks.map((c) => c.id));
  const hasMaterials = chunks.length > 0;

  const mix =
    skill.verification_type === "recall"
      ? "2 recall (1 multiple choice, 1 true/false)"
      : skill.verification_type === "artifact"
        ? "1 recall, 1 artifact"
        : "1 recall, 1 applied";

  // 4. Execute AI task with retry if rules broken
  let executionResult: { data: MakeQuizAIOutput; modelVersion?: string } | null = null;
  let validationResult: {
    isValid: boolean;
    errorReason?: string;
    cleanedQuestions: QuizQuestionOutput[];
  } | null = null;

  let attempts = 0;
  const maxAttempts = 2; // Rule: reject and retry once (total 2 attempts)

  while (attempts < maxAttempts) {
    attempts++;

    const execution = await executeAITaskWithRetry<MakeQuizAIOutput>({
      ownerId,
      task: "make_quiz",
      payload: {
        skill: { id: skill.id, name: skill.name },
        mix,
        chunks: chunks.map((c) => ({ id: c.id, content: c.content })),
        attempt_number: attempts,
      },
      provider: aiProvider,
      dbClient,
    });

    validationResult = validateAndCleanQuizQuestions(
      execution.data?.questions || [],
      validChunkIds,
      hasMaterials
    );

    if (validationResult.isValid) {
      executionResult = execution;
      break;
    }

    if (attempts >= maxAttempts) {
      throw new Error(
        `Quiz generation rejected after retry: ${validationResult.errorReason || "Schema rules broken"}`
      );
    }
  }

  if (!executionResult || !validationResult || !validationResult.isValid) {
    throw new Error("Failed to generate a valid quiz");
  }

  // 5. Persist quiz to DB
  const { data: quiz, error: quizInsertErr } = await dbClient
    .from("quizzes")
    .insert({
      owner_id: ownerId,
      skill_id: skillId,
      prompt_version: MAKE_QUIZ_PROMPT_VERSION,
      model_version: executionResult.modelVersion || AI_CONFIG.DEFAULT_MODEL,
    })
    .select()
    .single();

  if (quizInsertErr || !quiz) {
    throw new Error(`Failed to create quiz: ${quizInsertErr?.message}`);
  }

  // 6. Persist quiz questions
  const questionsToInsert = validationResult.cleanedQuestions.map((q, idx) => ({
    owner_id: ownerId,
    quiz_id: quiz.id,
    position: idx,
    type: q.type,
    prompt: q.prompt,
    options: q.options ? (q.options as any) : null,
    answer_key:
      q.answer_key !== undefined && q.answer_key !== null ? (q.answer_key as any) : null,
    rubric: q.rubric ? (q.rubric as any) : null,
    source_chunk_ids: q.source_chunk_ids || [],
  }));

  const { data: insertedQuestions, error: questionsInsertErr } = await dbClient
    .from("quiz_questions")
    .insert(questionsToInsert)
    .select();

  if (questionsInsertErr || !insertedQuestions) {
    throw new Error(`Failed to insert quiz questions: ${questionsInsertErr?.message}`);
  }

  return {
    quiz,
    questions: insertedQuestions,
  };
}
