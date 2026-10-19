export type EvidenceLevel = 0 | 1 | 2 | 3;

export type SkillStatus =
  | "not_started"
  | "learning"
  | "practising"
  | "verified"
  | "needs_review";

export type VerificationType = "recall" | "applied" | "artifact" | "self";

export type GradeSource = "ai" | "user_override" | "self" | "mc_auto";

export type GradeVerdict = "pass" | "fail";

export interface CriterionScore {
  criterion: string;
  score: number; // 0, 1, or 2
  max_score?: number;
  feedback?: string;
}

export interface GradeRecord {
  id: string;
  attempt_id: string;
  source: GradeSource;
  criterion_scores?: CriterionScore[] | null;
  total: number; // 0 to 100
  verdict: GradeVerdict;
  feedback?: any;
  confidence?: number | null;
  model_version?: string | null;
  override_reason?: string | null;
  is_current: boolean;
  created_at?: string;
}

export interface AttemptRecord {
  id: string;
  question_id: string;
  question_type: "recall_mc" | "recall_tf" | "applied" | "artifact";
  answer_text?: string | null;
  answer_file_path?: string | null;
  user_confirmed_run?: boolean | null; // For artifact questions: "Confirm you ran it and it matched" tick
  status: "submitted" | "pending_grade" | "graded" | "needs_your_review";
  current_grade?: GradeRecord | null;
  created_at?: string;
}

export interface SkillEvidenceInput {
  id: string;
  verification_type: VerificationType;
  status: SkillStatus;
  evidence_level: EvidenceLevel;
  verified_at?: string | null;
  has_started_learning?: boolean;
}

export interface EvidenceEvaluationResult {
  evidenceLevel: EvidenceLevel;
  status: SkillStatus;
  verifiedAt: string | null;
  isVerified: boolean;
  evidenceLabel: string;
  shouldCreateReview: boolean;
}
