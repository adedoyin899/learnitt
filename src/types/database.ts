export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type GoalStatus = "draft" | "active" | "paused" | "archived" | "completed";
export type StartingLevel = "beginner" | "intermediate" | "advanced";
export type SkillStatus = "not_started" | "learning" | "practising" | "verified" | "needs_review";
export type VerificationType = "recall" | "applied" | "artifact" | "self";
export type MaterialKind = "pdf" | "text" | "markdown" | "docx" | "url" | "plan_import";
export type MaterialStatus = "pending" | "ready" | "needs_attention";
export type ResourceType = "course" | "article" | "video" | "book" | "exercise" | "docs" | "other";
export type ResourceApproval = "pending" | "approved" | "rejected";
export type ResourceStatus = "ok" | "dead" | "duplicate";
export type PlanItemKind = "learn" | "practise" | "apply" | "review" | "quiz";
export type PlanItemStatus = "planned" | "rescheduled" | "unscheduled" | "done" | "partial" | "missed" | "mvd_only";
export type CheckInOutcome = "done" | "partial" | "missed" | "mvd_only";
export type CheckInReason = "no_time" | "unwell" | "client_work" | "too_hard" | "too_easy" | "other";
export type QuestionType = "recall_mc" | "recall_tf" | "applied" | "artifact";
export type AttemptStatus = "submitted" | "pending_grade" | "graded" | "needs_your_review";
export type GradeSource = "ai" | "user_override" | "self" | "mc_auto";
export type GradeVerdict = "pass" | "fail";
export type MessageRole = "user" | "assistant";
export type GoalChangeType = "compress" | "extend" | "add_time" | "reduce_scope" | "graph_edit" | "import";
export type AIJobStatus = "queued" | "running" | "succeeded" | "failed" | "paused_cap";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          timezone: string;
          ai_materials_consent: boolean;
          ai_consent_asked_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          timezone?: string;
          ai_materials_consent?: boolean;
          ai_consent_asked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          timezone?: string;
          ai_materials_consent?: boolean;
          ai_consent_asked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          domain: string | null;
          starting_level: StartingLevel;
          target_date: string;
          weekly_hours: number;
          study_days: number[];
          status: GoalStatus;
          health_flag: boolean;
          graph_version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          domain?: string | null;
          starting_level: StartingLevel;
          target_date: string;
          weekly_hours: number;
          study_days?: number[];
          status?: GoalStatus;
          health_flag?: boolean;
          graph_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          domain?: string | null;
          starting_level?: StartingLevel;
          target_date?: string;
          weekly_hours?: number;
          study_days?: number[];
          status?: GoalStatus;
          health_flag?: boolean;
          graph_version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      skills: {
        Row: {
          id: string;
          owner_id: string;
          goal_id: string;
          name: string;
          description: string | null;
          estimated_min_minutes: number;
          estimated_max_minutes: number;
          difficulty: number;
          priority: number;
          verification_type: VerificationType;
          mvd_minutes: number;
          mvd_task: string | null;
          status: SkillStatus;
          evidence_level: number;
          verified_at: string | null;
          position: number;
          source: "ai" | "user" | "import";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          goal_id: string;
          name: string;
          description?: string | null;
          estimated_min_minutes: number;
          estimated_max_minutes: number;
          difficulty: number;
          priority?: number;
          verification_type: VerificationType;
          mvd_minutes?: number;
          mvd_task?: string | null;
          status?: SkillStatus;
          evidence_level?: number;
          verified_at?: string | null;
          position?: number;
          source?: "ai" | "user" | "import";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          goal_id?: string;
          name?: string;
          description?: string | null;
          estimated_min_minutes?: number;
          estimated_max_minutes?: number;
          difficulty?: number;
          priority?: number;
          verification_type?: VerificationType;
          mvd_minutes?: number;
          mvd_task?: string | null;
          status?: SkillStatus;
          evidence_level?: number;
          verified_at?: string | null;
          position?: number;
          source?: "ai" | "user" | "import";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      skill_prereqs: {
        Row: {
          owner_id: string;
          skill_id: string;
          prereq_id: string;
        };
        Insert: {
          owner_id: string;
          skill_id: string;
          prereq_id: string;
        };
        Update: {
          owner_id?: string;
          skill_id?: string;
          prereq_id?: string;
        };
        Relationships: [];
      };
      materials: {
        Row: {
          id: string;
          owner_id: string;
          goal_id: string | null;
          kind: MaterialKind;
          title: string;
          storage_path: string | null;
          source_url: string | null;
          byte_size: number | null;
          content_hash: string | null;
          status: MaterialStatus;
          status_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          goal_id?: string | null;
          kind: MaterialKind;
          title: string;
          storage_path?: string | null;
          source_url?: string | null;
          byte_size?: number | null;
          content_hash?: string | null;
          status?: MaterialStatus;
          status_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          goal_id?: string | null;
          kind?: MaterialKind;
          title?: string;
          storage_path?: string | null;
          source_url?: string | null;
          byte_size?: number | null;
          content_hash?: string | null;
          status?: MaterialStatus;
          status_reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      material_chunks: {
        Row: {
          id: string;
          owner_id: string;
          material_id: string;
          ordinal: number;
          content: string;
          tokens: number;
          fts: unknown;
        };
        Insert: {
          id?: string;
          owner_id: string;
          material_id: string;
          ordinal: number;
          content: string;
          tokens: number;
        };
        Update: {
          id?: string;
          owner_id?: string;
          material_id?: string;
          ordinal?: number;
          content?: string;
          tokens?: number;
        };
        Relationships: [];
      };
      skill_material_links: {
        Row: {
          owner_id: string;
          skill_id: string;
          material_id: string;
          confidence: number;
          confirmed: boolean;
        };
        Insert: {
          owner_id: string;
          skill_id: string;
          material_id: string;
          confidence: number;
          confirmed?: boolean;
        };
        Update: {
          owner_id?: string;
          skill_id?: string;
          material_id?: string;
          confidence?: number;
          confirmed?: boolean;
        };
        Relationships: [];
      };
      resources: {
        Row: {
          id: string;
          owner_id: string;
          goal_id: string;
          skill_id: string | null;
          url: string;
          title: string | null;
          domain: string | null;
          type: ResourceType | null;
          estimated_minutes: number | null;
          relevance: number | null;
          found_by_query: string | null;
          search_provider: string | null;
          approval: ResourceApproval;
          status: ResourceStatus;
          found_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          goal_id: string;
          skill_id?: string | null;
          url: string;
          title?: string | null;
          domain?: string | null;
          type?: ResourceType | null;
          estimated_minutes?: number | null;
          relevance?: number | null;
          found_by_query?: string | null;
          search_provider?: string | null;
          approval?: ResourceApproval;
          status?: ResourceStatus;
          found_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          goal_id?: string;
          skill_id?: string | null;
          url?: string;
          title?: string | null;
          domain?: string | null;
          type?: ResourceType | null;
          estimated_minutes?: number | null;
          relevance?: number | null;
          found_by_query?: string | null;
          search_provider?: string | null;
          approval?: ResourceApproval;
          status?: ResourceStatus;
          found_at?: string;
        };
        Relationships: [];
      };
      plan_items: {
        Row: {
          id: string;
          owner_id: string;
          goal_id: string;
          skill_id: string | null;
          scheduled_date: string;
          kind: PlanItemKind;
          planned_minutes: number;
          material_id: string | null;
          resource_id: string | null;
          mvd_minutes: number;
          status: PlanItemStatus;
          plan_version: number;
          rescheduled_from: string | null;
          position: number;
        };
        Insert: {
          id?: string;
          owner_id: string;
          goal_id: string;
          skill_id?: string | null;
          scheduled_date: string;
          kind: PlanItemKind;
          planned_minutes: number;
          material_id?: string | null;
          resource_id?: string | null;
          mvd_minutes: number;
          status?: PlanItemStatus;
          plan_version?: number;
          rescheduled_from?: string | null;
          position?: number;
        };
        Update: {
          id?: string;
          owner_id?: string;
          goal_id?: string;
          skill_id?: string | null;
          scheduled_date?: string;
          kind?: PlanItemKind;
          planned_minutes?: number;
          material_id?: string | null;
          resource_id?: string | null;
          mvd_minutes?: number;
          status?: PlanItemStatus;
          plan_version?: number;
          rescheduled_from?: string | null;
          position?: number;
        };
        Relationships: [];
      };
      check_ins: {
        Row: {
          id: string;
          owner_id: string;
          plan_item_id: string;
          outcome: CheckInOutcome;
          minutes_actual: number | null;
          reason: CheckInReason | null;
          note: string | null;
          client_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          plan_item_id: string;
          outcome: CheckInOutcome;
          minutes_actual?: number | null;
          reason?: CheckInReason | null;
          note?: string | null;
          client_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          plan_item_id?: string;
          outcome?: CheckInOutcome;
          minutes_actual?: number | null;
          reason?: CheckInReason | null;
          note?: string | null;
          client_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      quizzes: {
        Row: {
          id: string;
          owner_id: string;
          skill_id: string;
          prompt_version: string;
          model_version: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          skill_id: string;
          prompt_version: string;
          model_version?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          skill_id?: string;
          prompt_version?: string;
          model_version?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      quiz_questions: {
        Row: {
          id: string;
          owner_id: string;
          quiz_id: string;
          position: number;
          type: QuestionType;
          prompt: string;
          options: Json | null;
          answer_key: Json | null;
          rubric: Json | null;
          source_chunk_ids: string[];
        };
        Insert: {
          id?: string;
          owner_id: string;
          quiz_id: string;
          position: number;
          type: QuestionType;
          prompt: string;
          options?: Json | null;
          answer_key?: Json | null;
          rubric?: Json | null;
          source_chunk_ids?: string[];
        };
        Update: {
          id?: string;
          owner_id?: string;
          quiz_id?: string;
          position?: number;
          type?: QuestionType;
          prompt?: string;
          options?: Json | null;
          answer_key?: Json | null;
          rubric?: Json | null;
          source_chunk_ids?: string[];
        };
        Relationships: [];
      };
      attempts: {
        Row: {
          id: string;
          owner_id: string;
          question_id: string;
          answer_text: string | null;
          answer_file_path: string | null;
          status: AttemptStatus;
          client_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          question_id: string;
          answer_text?: string | null;
          answer_file_path?: string | null;
          status?: AttemptStatus;
          client_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          question_id?: string;
          answer_text?: string | null;
          answer_file_path?: string | null;
          status?: AttemptStatus;
          client_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      grades: {
        Row: {
          id: string;
          owner_id: string;
          attempt_id: string;
          source: GradeSource;
          criterion_scores: Json | null;
          total: number | null;
          verdict: GradeVerdict | null;
          feedback: Json | null;
          confidence: number | null;
          model_version: string | null;
          override_reason: string | null;
          is_current: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          attempt_id: string;
          source: GradeSource;
          criterion_scores?: Json | null;
          total?: number | null;
          verdict?: GradeVerdict | null;
          feedback?: Json | null;
          confidence?: number | null;
          model_version?: string | null;
          override_reason?: string | null;
          is_current?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          attempt_id?: string;
          source?: GradeSource;
          criterion_scores?: Json | null;
          total?: number | null;
          verdict?: GradeVerdict | null;
          feedback?: Json | null;
          confidence?: number | null;
          model_version?: string | null;
          override_reason?: string | null;
          is_current?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          owner_id: string;
          goal_id: string | null;
          skill_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          goal_id?: string | null;
          skill_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          goal_id?: string | null;
          skill_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          owner_id: string;
          conversation_id: string;
          role: MessageRole;
          content: string;
          cited_chunk_ids: string[];
          general_knowledge: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          conversation_id: string;
          role: MessageRole;
          content: string;
          cited_chunk_ids?: string[];
          general_knowledge?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          conversation_id?: string;
          role?: MessageRole;
          content?: string;
          cited_chunk_ids?: string[];
          general_knowledge?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          entry_id: string;
          version: number;
          client_id: string | null;
          owner_id: string;
          body: string;
          mood: number | null;
          linked_check_in_id: string | null;
          linked_skill_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id?: string;
          version?: number;
          client_id?: string | null;
          owner_id: string;
          body: string;
          mood?: number | null;
          linked_check_in_id?: string | null;
          linked_skill_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entry_id?: string;
          version?: number;
          client_id?: string | null;
          owner_id?: string;
          body?: string;
          mood?: number | null;
          linked_check_in_id?: string | null;
          linked_skill_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      skill_reviews: {
        Row: {
          owner_id: string;
          skill_id: string;
          interval_days: number;
          due_on: string;
          last_result: GradeVerdict | null;
        };
        Insert: {
          owner_id: string;
          skill_id: string;
          interval_days?: number;
          due_on: string;
          last_result?: GradeVerdict | null;
        };
        Update: {
          owner_id?: string;
          skill_id?: string;
          interval_days?: number;
          due_on?: string;
          last_result?: GradeVerdict | null;
        };
        Relationships: [];
      };
      goal_changes: {
        Row: {
          id: string;
          owner_id: string;
          goal_id: string;
          change_type: GoalChangeType;
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          goal_id: string;
          change_type: GoalChangeType;
          detail: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          goal_id?: string;
          change_type?: GoalChangeType;
          detail?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_jobs: {
        Row: {
          id: string;
          owner_id: string;
          task: string;
          payload: Json;
          status: AIJobStatus;
          attempts: number;
          result_ref: Json | null;
          last_error: string | null;
          run_after: string;
          locked_until: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          task: string;
          payload: Json;
          status?: AIJobStatus;
          attempts?: number;
          result_ref?: Json | null;
          last_error?: string | null;
          run_after?: string;
          locked_until?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          task?: string;
          payload?: Json;
          status?: AIJobStatus;
          attempts?: number;
          result_ref?: Json | null;
          last_error?: string | null;
          run_after?: string;
          locked_until?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ai_cache: {
        Row: {
          cache_key: string;
          task: string;
          provider: string;
          prompt_version: string;
          result: Json;
          created_at: string;
        };
        Insert: {
          cache_key: string;
          task: string;
          provider: string;
          prompt_version: string;
          result: Json;
          created_at?: string;
        };
        Update: {
          cache_key?: string;
          task?: string;
          provider?: string;
          prompt_version?: string;
          result?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      usage_counters: {
        Row: {
          owner_id: string;
          day: string;
          calls: number;
          tokens_in: number;
          tokens_out: number;
        };
        Insert: {
          owner_id: string;
          day: string;
          calls?: number;
          tokens_in?: number;
          tokens_out?: number;
        };
        Update: {
          owner_id?: string;
          day?: string;
          calls?: number;
          tokens_in?: number;
          tokens_out?: number;
        };
        Relationships: [];
      };
      reminder_settings: {
        Row: {
          owner_id: string;
          daily_time: string | null;
          weekdays: number[];
          email_enabled: boolean;
          push_enabled: boolean;
          weekly_review_day: number | null;
        };
        Insert: {
          owner_id: string;
          daily_time?: string | null;
          weekdays?: number[];
          email_enabled?: boolean;
          push_enabled?: boolean;
          weekly_review_day?: number | null;
        };
        Update: {
          owner_id?: string;
          daily_time?: string | null;
          weekdays?: number[];
          email_enabled?: boolean;
          push_enabled?: boolean;
          weekly_review_day?: number | null;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          owner_id: string;
          endpoint: string;
          keys: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          endpoint: string;
          keys: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          endpoint?: string;
          keys?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          owner_id: string | null;
          event: string;
          detail: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          event: string;
          detail?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string | null;
          event?: string;
          detail?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      reminder_log: {
        Row: {
          owner_id: string;
          kind: string;
          day: string;
          created_at: string;
        };
        Insert: {
          owner_id: string;
          kind: string;
          day: string;
          created_at?: string;
        };
        Update: {
          owner_id?: string;
          kind?: string;
          day?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      saved_cards: {
        Row: {
          id: string;
          owner_id: string;
          skill_id: string | null;
          question: string;
          answer: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          skill_id?: string | null;
          question: string;
          answer: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          skill_id?: string | null;
          question?: string;
          answer?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      resource_exclusions: {
        Row: {
          id: string;
          owner_id: string;
          goal_id: string;
          url: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          goal_id: string;
          url: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          goal_id?: string;
          url?: string;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      my_usage_counters: {
        Row: {
          day: string;
          calls: number;
          tokens_in: number;
          tokens_out: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_my_usage_today: {
        Args: Record<PropertyKey, never>;
        Returns: {
          day: string;
          calls: number;
          tokens_in: number;
          tokens_out: number;
        }[];
      };
    };
  };
}
