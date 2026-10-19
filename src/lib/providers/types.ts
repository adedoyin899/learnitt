export type AITask =
  | "skill_graph"
  | "link_materials"
  | "search_queries"
  | "classify_resource"
  | "make_quiz"
  | "grade_applied"
  | "answer_question"
  | "explain_level"
  | "weekly_summary";

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIStructuredArgs {
  task: AITask;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AIStructuredResponse<T> {
  data: T;
  usage: AIUsage;
  modelVersion: string;
}

export interface AIProvider {
  id: string;
  generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>>;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
}

export interface SearchProvider {
  id: string;
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailProvider {
  id: string;
  send(payload: EmailPayload): Promise<{ id: string; success: boolean }>;
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushProvider {
  id: string;
  send(
    subscription: PushSubscriptionData,
    payload: PushPayload
  ): Promise<{ success: boolean; error?: string }>;
}
