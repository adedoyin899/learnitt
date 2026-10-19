import { AITask } from "../types";

export interface PromptDefinition {
  system: string;
  user: string;
  promptVersion: string;
  temperature: number;
  maxOutputTokens: number;
}

const COMMON_SAFETY_CLAUSE =
  "Strict constraints: Do not invent URLs, citations, or facts about the user. Ground all statements strictly in the provided context or general subject domain principles.";

// ==============================================================================
// 1. Skill Graph Prompt (PROMPT_VERSION = "1.0.0")
// ==============================================================================
export const SKILL_GRAPH_PROMPT_VERSION = "1.0.0";

export function buildSkillGraphPrompt(input: {
  title: string;
  domain?: string;
  starting_level: string;
  target_date: string;
  weekly_hours: number;
  materials_outline?: string;
}): PromptDefinition {
  return {
    promptVersion: SKILL_GRAPH_PROMPT_VERSION,
    temperature: 0.2,
    maxOutputTokens: 3000,
    system: `You are Learnitt's expert curriculum architect. Your role is to build a comprehensive, domain-agnostic skill dependency graph for the learner's goal.
${COMMON_SAFETY_CLAUSE}
Rules:
- Generate between 12 and 20 distinct skills structured as a Directed Acyclic Graph (DAG).
- Every skill ID must be unique (e.g. sk_1, sk_2).
- Every prerequisite ID in prereq_ids must exist in the returned skills list.
- There must be NO cycles in prerequisites.
- For each skill:
  - estimated_minutes: { min, max } with min <= max.
  - difficulty: 1 to 5.
  - verification_type: recall | applied | artifact | self.
  - mvd_minutes: Minimum Viable Day time between 10 and 30 minutes.
  - mvd_task: Concrete action the user can complete on a busy day (max 140 chars).
Return valid JSON only matching the schema.`,
    user: `Learner Goal:
Title: ${input.title}
Domain: ${input.domain || "General"}
Starting Level: ${input.starting_level}
Target Date: ${input.target_date}
Available Weekly Hours: ${input.weekly_hours}
${input.materials_outline ? `Materials Outline: ${input.materials_outline}` : ""}`,
  };
}

// ==============================================================================
// 2. Link Materials Prompt (PROMPT_VERSION = "1.0.0")
// ==============================================================================
export const LINK_MATERIALS_PROMPT_VERSION = "1.0.0";

export function buildLinkMaterialsPrompt(input: {
  skills: Array<{ id: string; name: string }>;
  chunks: Array<{ id: string; summary: string }>;
}): PromptDefinition {
  return {
    promptVersion: LINK_MATERIALS_PROMPT_VERSION,
    temperature: 0.1,
    maxOutputTokens: 2000,
    system: `You are Learnitt's semantic content alignment engine.
${COMMON_SAFETY_CLAUSE}
Rules:
- Map skills to relevant material chunks with confidence (0.0 to 1.0).
- Only link chunks that genuinely cover the knowledge or practical steps of the skill.
Return valid JSON only matching the schema.`,
    user: `Skills:
${JSON.stringify(input.skills, null, 2)}

Material Chunks:
${JSON.stringify(input.chunks, null, 2)}`,
  };
}

// ==============================================================================
// 3. Search Queries Prompt (PROMPT_VERSION = "1.0.0")
// ==============================================================================
export const SEARCH_QUERIES_PROMPT_VERSION = "1.0.0";

export function buildSearchQueriesPrompt(input: {
  skillName: string;
  level: string;
}): PromptDefinition {
  return {
    promptVersion: SEARCH_QUERIES_PROMPT_VERSION,
    temperature: 0.3,
    maxOutputTokens: 500,
    system: `You are Learnitt's curated discovery assistant.
${COMMON_SAFETY_CLAUSE}
Generate 1 to 3 focused, high-signal web search queries to locate beginner/intermediate/advanced tutorials, official documentation, or practical exercises.
Return valid JSON only matching the schema.`,
    user: `Skill: ${input.skillName}
Level: ${input.level}`,
  };
}

// ==============================================================================
// 4. Classify Resource Prompt (PROMPT_VERSION = "1.0.0")
// ==============================================================================
export const CLASSIFY_RESOURCE_PROMPT_VERSION = "1.0.0";

export function buildClassifyResourcePrompt(input: {
  title: string;
  snippet: string;
  domain: string;
}): PromptDefinition {
  return {
    promptVersion: CLASSIFY_RESOURCE_PROMPT_VERSION,
    temperature: 0.1,
    maxOutputTokens: 500,
    system: `You are Learnitt's resource classification analyzer.
${COMMON_SAFETY_CLAUSE}
Categorize the resource type (course, article, video, book, exercise, docs, other), estimate completion time in minutes (1 to 720), and score educational relevance between 0.0 and 1.0.
Return valid JSON only matching the schema.`,
    user: `Title: ${input.title}
Domain: ${input.domain}
Snippet: ${input.snippet}`,
  };
}

// ==============================================================================
// 5. Make Quiz Prompt (PROMPT_VERSION = "1.0.0")
// ==============================================================================
export const MAKE_QUIZ_PROMPT_VERSION = "1.0.0";

export function buildMakeQuizPrompt(input: {
  skill: { id: string; name: string };
  chunks?: Array<{ id: string; content: string }>;
  mix?: string;
}): PromptDefinition {
  return {
    promptVersion: MAKE_QUIZ_PROMPT_VERSION,
    temperature: 0.4,
    maxOutputTokens: 2500,
    system: `You are Learnitt's rigorous mastery assessment generator.
${COMMON_SAFETY_CLAUSE}
Rules:
- Generate questions matching the specified mix (recall multiple choice, recall true/false, applied, artifact).
- For recall questions: provide options and exact answer_key.
- For applied/artifact questions: provide a rubric of 3 to 5 criteria with weights summing exactly to 100.
- If chunks are provided, cite source_chunk_ids ONLY from the provided chunks.
Return valid JSON only matching the schema.`,
    user: `Skill: ${input.skill.name} (id: ${input.skill.id})
Question Mix: ${input.mix || "1 recall, 1 applied"}
${input.chunks ? `Context Chunks: ${JSON.stringify(input.chunks)}` : "No specific material chunks."}`,
  };
}

// ==============================================================================
// 6. Grade Applied Prompt (PROMPT_VERSION = "1.0.0")
// ==============================================================================
export const GRADE_APPLIED_PROMPT_VERSION = "1.0.0";

export function buildGradeAppliedPrompt(input: {
  question: string;
  rubric: Array<{ criterion: string; weight: number; description: string }>;
  answer: string;
}): PromptDefinition {
  return {
    promptVersion: GRADE_APPLIED_PROMPT_VERSION,
    temperature: 0.1,
    maxOutputTokens: 1200,
    system: `You are Learnitt's objective grading evaluator.
${COMMON_SAFETY_CLAUSE}
Rules:
- Evaluate the learner's answer strictly against each criterion in the rubric.
- Assign a score per criterion (0, 1, or 2, where 0 = not demonstrated, 1 = partially demonstrated, 2 = fully mastered), and specific feedback per criterion.
- Assign an overall total score (0 to 100).
- Verdict is 'pass' if total >= 70, else 'fail'.
- Provide a confidence score between 0.0 and 1.0 based on how clearly the answer maps to the rubric.
- Provide constructive, supportive feedback with specific strengths and areas for improvement.
Return valid JSON only matching the schema.`,
    user: `Question: ${input.question}
Rubric:
${JSON.stringify(input.rubric, null, 2)}

Learner Answer:
${input.answer}`,
  };
}

// ==============================================================================
// 7. Answer Question Prompt (PROMPT_VERSION = "1.0.0")
// ==============================================================================
export const ANSWER_QUESTION_PROMPT_VERSION = "1.0.0";

export function buildAnswerQuestionPrompt(input: {
  question: string;
  skillName?: string;
  chunks: Array<{ id: string; content: string }>;
}): PromptDefinition {
  return {
    promptVersion: ANSWER_QUESTION_PROMPT_VERSION,
    temperature: 0.3,
    maxOutputTokens: 1500,
    system: `You are Learnitt's grounded personal tutor.
${COMMON_SAFETY_CLAUSE}
Rules:
- Answer the learner's question clearly and concisely.
- Cite specific chunk IDs from the provided material chunks in cited_chunk_ids.
- If the answer is not contained in the provided chunks, use general principles, set general_knowledge to true, and state that this is from general knowledge rather than uploaded materials.
Return valid JSON only matching the schema.`,
    user: `Learner Question: ${input.question}
Skill Context: ${input.skillName || "General"}
Retrieved Chunks:
${JSON.stringify(input.chunks, null, 2)}`,
  };
}

// ==============================================================================
// 8. Explain Level Prompt (PROMPT_VERSION = "1.0.0")
// ==============================================================================
export const EXPLAIN_LEVEL_PROMPT_VERSION = "1.0.0";

export function buildExplainLevelPrompt(input: {
  priorAnswer: string;
  targetStyle: string; // e.g. "eli5", "analogy", "technical", "first_principles"
}): PromptDefinition {
  return {
    promptVersion: EXPLAIN_LEVEL_PROMPT_VERSION,
    temperature: 0.4,
    maxOutputTokens: 1200,
    system: `You are Learnitt's adaptive explanation tutor.
${COMMON_SAFETY_CLAUSE}
Rewrite the prior explanation according to the learner's requested cognitive style (e.g., simpler analogies, five-year-old style, or rigorous first principles) without compromising factual accuracy.
Return valid JSON only matching the schema.`,
    user: `Prior Explanation:
${input.priorAnswer}

Requested Style:
${input.targetStyle}`,
  };
}

// ==============================================================================
// 9. Weekly Summary Prompt (PROMPT_VERSION = "1.0.0")
// ==============================================================================
export const WEEKLY_SUMMARY_PROMPT_VERSION = "1.0.0";

export function buildWeeklySummaryPrompt(input: {
  stats: Record<string, unknown>;
}): PromptDefinition {
  return {
    promptVersion: WEEKLY_SUMMARY_PROMPT_VERSION,
    temperature: 0.3,
    maxOutputTokens: 1000,
    system: `You are Learnitt's supportive, non-guilt weekly progress summarizer.
${COMMON_SAFETY_CLAUSE}
Rules:
- Summarize the learner's week using the provided structured stats.
- Never use shame, guilt, or scolding for missed sessions or partial days.
- Highlight momentum, consistency, and next steps forward.
Return valid JSON only matching the schema.`,
    user: `Weekly Structured Stats:
${JSON.stringify(input.stats, null, 2)}`,
  };
}

// ==============================================================================
// General Prompt Dispatcher
// ==============================================================================

export function resolvePrompt(task: AITask, payload: Record<string, unknown>): PromptDefinition {
  switch (task) {
    case "skill_graph":
      return buildSkillGraphPrompt(payload as unknown as Parameters<typeof buildSkillGraphPrompt>[0]);
    case "link_materials":
      return buildLinkMaterialsPrompt(payload as unknown as Parameters<typeof buildLinkMaterialsPrompt>[0]);
    case "search_queries":
      return buildSearchQueriesPrompt(payload as unknown as Parameters<typeof buildSearchQueriesPrompt>[0]);
    case "classify_resource":
      return buildClassifyResourcePrompt(payload as unknown as Parameters<typeof buildClassifyResourcePrompt>[0]);
    case "make_quiz":
      return buildMakeQuizPrompt(payload as unknown as Parameters<typeof buildMakeQuizPrompt>[0]);
    case "grade_applied":
      return buildGradeAppliedPrompt(payload as unknown as Parameters<typeof buildGradeAppliedPrompt>[0]);
    case "answer_question":
      return buildAnswerQuestionPrompt(payload as unknown as Parameters<typeof buildAnswerQuestionPrompt>[0]);
    case "explain_level":
      return buildExplainLevelPrompt(payload as unknown as Parameters<typeof buildExplainLevelPrompt>[0]);
    case "weekly_summary":
      return buildWeeklySummaryPrompt(payload as unknown as Parameters<typeof buildWeeklySummaryPrompt>[0]);
    default: {
      const _exhaustiveCheck: never = task;
      throw new Error(`Unsupported AI task: ${_exhaustiveCheck}`);
    }
  }
}
