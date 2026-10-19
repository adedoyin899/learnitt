/**
 * AI Provider Seam and Core Types (PRD Section 7 & Section 9)
 */

export const AI_TASKS = [
  "skill_graph",
  "link_materials",
  "search_queries",
  "classify_resource",
  "make_quiz",
  "grade_applied",
  "answer_question",
  "explain_level",
  "weekly_summary",
] as const;

export type AITask = (typeof AI_TASKS)[number];

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIStructuredArgs {
  task: AITask;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  temperature: number;
}

export interface AIStructuredResponse<T> {
  data: T;
  usage: AIUsage;
  modelVersion: string;
}

/**
 * Core AIProvider interface exactly as defined in PRD Section 7.1.
 */
export interface AIProvider {
  readonly id: string;
  generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>>;
}

export type AIJobStatus = "queued" | "running" | "succeeded" | "failed" | "paused_cap";

export interface AIJobRecord {
  id: string;
  owner_id: string;
  task: AITask;
  payload: Record<string, unknown>;
  status: AIJobStatus;
  attempts: number;
  result_ref: Record<string, unknown> | null;
  last_error: string | null;
  run_after: string;
  locked_until: string | null;
  created_at: string;
}

export interface EnqueueJobParams {
  ownerId: string;
  task: AITask;
  payload: Record<string, unknown>;
  runAfter?: Date;
}
