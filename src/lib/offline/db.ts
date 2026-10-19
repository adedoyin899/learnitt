import Dexie, { type EntityTable } from "dexie";

export interface DexieGoal {
  id: string;
  title: string;
  domain?: string | null;
  target_date: string;
  weekly_hours: number;
  study_days: number[];
  status: string;
  updated_at?: string;
}

export interface DexieSkill {
  id: string;
  goal_id: string;
  name: string;
  priority: number;
  difficulty: number;
  estimated_min_minutes: number;
  estimated_max_minutes: number;
  mvd_minutes: number;
  mvd_task?: string | null;
  status: string;
  position: number;
  updated_at?: string;
}

export interface DexiePlanItem {
  id: string;
  goal_id: string;
  skill_id: string | null;
  skill_name?: string;
  scheduled_date: string;
  kind: "learn" | "practise" | "apply" | "review" | "quiz";
  planned_minutes: number;
  mvd_minutes: number;
  mvd_task: string;
  status: "planned" | "rescheduled" | "unscheduled" | "done" | "partial" | "missed" | "mvd_only";
  position: number;
  plan_version: number;
  material_id?: string | null;
  resource_id?: string | null;
}

export interface DexieCheckIn {
  client_id: string; // offline idempotency key
  plan_item_id: string;
  outcome: "done" | "partial" | "missed" | "mvd_only";
  minutes_actual?: number | null;
  reason?: "no_time" | "unwell" | "client_work" | "too_hard" | "too_easy" | "other" | null;
  note?: string | null;
  created_at: string;
  synced: boolean;
}

export interface DexieAttempt {
  client_id: string;
  question_id: string;
  answer_text?: string | null;
  answer_file_path?: string | null;
  created_at: string;
  synced: boolean;
}

export interface DexieJournalEntry {
  client_id: string;
  title?: string | null;
  content: string;
  created_at: string;
  synced: boolean;
}

export interface DexieTodayPayload {
  id: string; // 'current'
  date: string; // YYYY-MM-DD
  payload: Record<string, unknown>;
  updated_at: string;
}

export interface DexieReviewDue {
  id: string;
  skill_id: string;
  due_date: string;
  minutes: number;
}

export interface DexieMaterialChunk {
  id: string;
  material_id: string;
  goal_id?: string | null;
  content: string;
  chunk_index: number;
}

export interface DexieOutboxItem {
  client_id: string; // primary key
  operation: "check_in" | "attempt" | "journal" | "skill_edit";
  payload: Record<string, unknown>;
  created_at: string;
  status: "pending" | "syncing" | "failed";
  retry_count: number;
  last_error?: string | null;
}

/**
 * LearnittDexie Database (PRD Section 10 & Epic C3, D1, D2)
 * Mirrors: goals (active), skills, plan items (next 14 days), pending check-ins,
 * pending attempts, pending journal entries, today payload, due reviews, cached chunks, and outbox.
 */
export class LearnittDatabase extends Dexie {
  goals!: EntityTable<DexieGoal, "id">;
  skills!: EntityTable<DexieSkill, "id">;
  plan_items!: EntityTable<DexiePlanItem, "id">;
  today_payload!: EntityTable<DexieTodayPayload, "id">;
  check_ins!: EntityTable<DexieCheckIn, "client_id">;
  attempts!: EntityTable<DexieAttempt, "client_id">;
  journal_entries!: EntityTable<DexieJournalEntry, "client_id">;
  skill_reviews!: EntityTable<DexieReviewDue, "id">;
  material_chunks!: EntityTable<DexieMaterialChunk, "id">;
  outbox!: EntityTable<DexieOutboxItem, "client_id">;

  constructor() {
    super("learnitt_offline_db");
    this.version(1).stores({
      goals: "id, status, target_date, updated_at",
      skills: "id, goal_id, position, status, updated_at",
      plan_items: "id, goal_id, scheduled_date, status, position",
      today_payload: "id, date, updated_at",
      check_ins: "client_id, plan_item_id, outcome, created_at, synced",
      attempts: "client_id, question_id, created_at, synced",
      journal_entries: "client_id, created_at, synced",
      skill_reviews: "id, skill_id, due_date",
      material_chunks: "id, material_id, goal_id",
      outbox: "client_id, operation, created_at, status",
    });
  }
}

export const db = new LearnittDatabase();

if (typeof window !== "undefined") {
  (window as unknown as { __learnitt_db: LearnittDatabase }).__learnitt_db = db;
}
