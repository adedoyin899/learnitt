/**
 * Planner Engine Types (PRD Section 5 & Epic C)
 */

export type PlanItemKind = "learn" | "practise" | "apply" | "review" | "quiz";

export type PlanItemStatus =
  | "planned"
  | "rescheduled"
  | "unscheduled"
  | "done"
  | "partial"
  | "missed"
  | "mvd_only";

export interface PlannerGoal {
  id: string;
  title?: string;
  target_date: string | Date;
  weekly_hours: number;
  study_days: number[]; // ISO weekdays 1=Mon ... 7=Sun
  timezone?: string;
}

export interface PlannerSkill {
  id: string;
  name: string;
  priority: number; // 1 (highest), 2 (normal), 3 (lowest)
  difficulty: number; // 1 to 5
  estimated_min_minutes: number;
  estimated_max_minutes: number;
  mvd_minutes?: number; // 15 to 20
  mvd_task?: string | null;
  verification_type?: "recall" | "applied" | "artifact" | "self";
  status?: string;
  material_id?: string | null;
  resource_id?: string | null;
}

export interface PlannerPrereq {
  skill_id: string;
  prereq_id: string;
}

export interface PlannerReview {
  skill_id: string;
  skill_name?: string;
  due_date: string; // YYYY-MM-DD
  minutes: number;
}

export interface PlannerProgress {
  [skill_id: string]: {
    completed_minutes?: number;
    verified?: boolean;
  };
}

export interface PlannedItem {
  id?: string;
  skill_id: string | null;
  skill_name?: string;
  scheduled_date: string; // YYYY-MM-DD
  kind: PlanItemKind;
  planned_minutes: number;
  mvd_minutes: number;
  mvd_task: string;
  status: PlanItemStatus;
  position: number;
  plan_version: number;
  material_id?: string | null;
  resource_id?: string | null;
  rescheduled_from?: string | null;
}

export interface PlannerOutput {
  plan_version: number;
  scheduled_items: PlannedItem[];
  unscheduled_items: PlannedItem[];
  total_planned_minutes: number;
  total_capacity_minutes: number;
  days_count: number;
  all_items: PlannedItem[];
}

export type AdaptOptionType = "compress" | "extend" | "add_time" | "reduce_scope";

export interface AdaptProposal {
  type: AdaptOptionType;
  title: string;
  description: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  requiresConfirmation?: boolean;
}

export interface AdaptCheckResult {
  triggered: boolean;
  reason?: string;
  missedSessionsInWeek: number;
  completionRate: number;
  proposals?: AdaptProposal[];
}
