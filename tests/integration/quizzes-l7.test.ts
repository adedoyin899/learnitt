import { describe, expect, it, vi } from "vitest";
import { evaluateEvidence } from "@/lib/evidence/engine";
import { validateAndCleanQuizQuestions } from "@/lib/quiz/generate";
import {
  markRecallAnswerDeterministically,
  overrideGrade,
  selfGradeAttempt,
} from "@/lib/quiz/grading";

describe("Phase L7: Quizzes, AI Grading, Overrides and Evidence", () => {
  describe("1. Schema Rejection, Chunk Citations & Retry Rules", () => {
    it("filters out unknown chunk IDs that do not exist in the confirmed set", () => {
      const validChunks = new Set(["chunk_1", "chunk_2"]);
      const questions = [
        {
          id: "q1",
          type: "recall_mc" as const,
          prompt: "What is SQL?",
          options: ["A", "B"],
          answer_key: 0,
          source_chunk_ids: ["chunk_1", "chunk_unknown_999"],
          skill_id: "sk_1",
        },
      ];

      const result = validateAndCleanQuizQuestions(questions, validChunks, true);
      expect(result.isValid).toBe(true);
      expect(result.cleanedQuestions[0].source_chunk_ids).toEqual(["chunk_1"]);
    });

    it("rejects when recall question is missing an answer key", () => {
      const validChunks = new Set(["chunk_1"]);
      const questions = [
        {
          id: "q1",
          type: "recall_mc" as const,
          prompt: "What is SQL?",
          options: ["A", "B"],
          answer_key: null,
          source_chunk_ids: ["chunk_1"],
          skill_id: "sk_1",
        },
      ];

      const result = validateAndCleanQuizQuestions(questions, validChunks, true);
      expect(result.isValid).toBe(false);
      expect(result.errorReason).toContain("missing an answer key");
    });

    it("rejects when applied question rubric has fewer than 3 criteria", () => {
      const validChunks = new Set(["chunk_1"]);
      const questions = [
        {
          id: "q2",
          type: "applied" as const,
          prompt: "Explain joins.",
          rubric: [
            { criterion: "A", weight: 50, description: "Crit A" },
            { criterion: "B", weight: 50, description: "Crit B" },
          ],
          source_chunk_ids: ["chunk_1"],
          skill_id: "sk_1",
        },
      ];

      const result = validateAndCleanQuizQuestions(questions, validChunks, true);
      expect(result.isValid).toBe(false);
      expect(result.errorReason).toContain("3 to 5 criteria");
    });

    it("rejects when rubric weights do not sum to 100", () => {
      const validChunks = new Set(["chunk_1"]);
      const questions = [
        {
          id: "q2",
          type: "applied" as const,
          prompt: "Explain joins.",
          rubric: [
            { criterion: "A", weight: 40, description: "Crit A" },
            { criterion: "B", weight: 40, description: "Crit B" },
            { criterion: "C", weight: 10, description: "Crit C" }, // Sums to 90
          ],
          source_chunk_ids: ["chunk_1"],
          skill_id: "sk_1",
        },
      ];

      const result = validateAndCleanQuizQuestions(questions, validChunks, true);
      expect(result.isValid).toBe(false);
      expect(result.errorReason).toContain("must sum to 100");
    });

    it("rejects when materials exist and questions cite only unknown chunk ids", () => {
      const validChunks = new Set(["chunk_1"]);
      const questions = [
        {
          id: "q1",
          type: "recall_mc" as const,
          prompt: "What is SQL?",
          options: ["A", "B"],
          answer_key: 0,
          source_chunk_ids: ["fake_chunk_123"],
          skill_id: "sk_1",
        },
      ];

      const result = validateAndCleanQuizQuestions(questions, validChunks, true);
      expect(result.isValid).toBe(false);
      expect(result.errorReason).toContain("unknown chunk IDs");
    });
  });

  describe("2. Deterministic Recall Marking (Zero AI Calls)", () => {
    it("marks multiple choice questions deterministically with 100 on correct and 0 on incorrect", () => {
      const options = ["WHERE", "HAVING", "GROUP BY", "ORDER BY"];
      // Answer key is index 0 ("WHERE")
      const correct = markRecallAnswerDeterministically(0, 0, options);
      expect(correct.isCorrect).toBe(true);
      expect(correct.score).toBe(100);
      expect(correct.verdict).toBe("pass");

      // By text match
      const correctText = markRecallAnswerDeterministically("WHERE", 0, options);
      expect(correctText.isCorrect).toBe(true);
      expect(correctText.score).toBe(100);

      // Incorrect
      const incorrect = markRecallAnswerDeterministically(1, 0, options);
      expect(incorrect.isCorrect).toBe(false);
      expect(incorrect.score).toBe(0);
      expect(incorrect.verdict).toBe("fail");
    });

    it("marks true/false questions deterministically", () => {
      const passTf = markRecallAnswerDeterministically("true", "true");
      expect(passTf.isCorrect).toBe(true);
      expect(passTf.verdict).toBe("pass");

      const failTf = markRecallAnswerDeterministically("false", "true");
      expect(failTf.isCorrect).toBe(false);
      expect(failTf.verdict).toBe("fail");
    });
  });

  describe("3. Confidence Routing: Low Confidence (< 0.6) Sets needs_your_review", () => {
    it("routes attempt to needs_your_review when confidence < 0.6 and awards NO evidence", () => {
      const skill = {
        id: "sk_app",
        verification_type: "applied" as const,
        status: "not_started" as const,
        evidence_level: 0 as const,
      };

      // An attempt with status 'needs_your_review'
      const attempts = [
        {
          id: "att_low",
          question_id: "q_app",
          question_type: "applied" as const,
          status: "needs_your_review" as const,
          current_grade: {
            id: "gr_low",
            attempt_id: "att_low",
            source: "ai" as const,
            total: 88,
            verdict: "pass" as const,
            confidence: 0.52, // < 0.6
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(false);
      expect(result.evidenceLevel).toBe(0);
      expect(result.status).toBe("practising");
    });

    it("awards evidence once attempt is confirmed to 'graded'", () => {
      const skill = {
        id: "sk_app",
        verification_type: "applied" as const,
        status: "practising" as const,
        evidence_level: 0 as const,
      };

      const attempts = [
        {
          id: "att_confirmed",
          question_id: "q_app",
          question_type: "applied" as const,
          status: "graded" as const, // Confirmed by user
          current_grade: {
            id: "gr_low",
            attempt_id: "att_confirmed",
            source: "ai" as const,
            total: 88,
            verdict: "pass" as const,
            confidence: 0.52,
            is_current: true,
          },
        },
      ];

      const result = evaluateEvidence(skill, attempts);
      expect(result.isVerified).toBe(true);
      expect(result.evidenceLevel).toBe(2);
      expect(result.status).toBe("verified");
    });
  });

  describe("4. Grade Overrides, History, and Audit Events", () => {
    it("requires a short reason for grade overrides", async () => {
      const mockClient: any = {
        from: vi.fn(),
      };

      await expect(
        overrideGrade(mockClient, {
          attemptId: "att_1",
          ownerId: "user_1",
          overrideReason: "   ", // Blank reason
        })
      ).rejects.toThrow("Override reason is required");
    });

    it("stores override as new row with source 'user_override', sets is_current, and keeps original for audit", async () => {
      const mockUpdatedRows: any[] = [];
      const mockInsertedGrades: any[] = [];
      const mockAuditEvents: any[] = [];

      function createMockBuilder(defaultData: any = null) {
        const builder: any = {
          select: vi.fn(() => builder),
          insert: vi.fn((vals: any) => {
            if (Array.isArray(vals)) {
              mockInsertedGrades.push(...vals);
            } else {
              mockInsertedGrades.push(vals);
            }
            return builder;
          }),
          update: vi.fn((vals: any) => {
            mockUpdatedRows.push(vals);
            return builder;
          }),
          delete: vi.fn(() => builder),
          upsert: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          in: vi.fn(() => builder),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({ data: defaultData, error: null })),
          single: vi.fn(async () => ({ data: defaultData, error: null })),
          then: (resolve: any) => resolve({ data: defaultData, error: null }),
        };
        return builder;
      }

      const mockDb: any = {
        from: (table: string) => {
          if (table === "grades") {
            const b = createMockBuilder({
              id: "gr_orig_ai",
              attempt_id: "att_1",
              source: "ai",
              total: 50,
              verdict: "fail",
              model_version: "gemini-flash-lite",
              is_current: true,
            });
            b.insert = vi.fn((vals: any) => {
              const row = { id: "gr_new_override", ...vals };
              mockInsertedGrades.push(row);
              const insertB = createMockBuilder(row);
              return insertB;
            });
            return b;
          }
          if (table === "attempts") {
            return createMockBuilder({ id: "att_1", question_id: "q_1" });
          }
          if (table === "audit_events") {
            const b = createMockBuilder();
            b.insert = vi.fn(async (vals: any) => {
              mockAuditEvents.push(vals);
              return { error: null };
            });
            return b;
          }
          if (table === "quiz_questions") {
            return createMockBuilder({ id: "q_1", quiz_id: "qz_1" });
          }
          if (table === "quizzes") {
            return createMockBuilder({ id: "qz_1", skill_id: "sk_1" });
          }
          if (table === "skills") {
            return createMockBuilder({
              id: "sk_1",
              verification_type: "applied",
              status: "practising",
              evidence_level: 0,
            });
          }
          if (table === "skill_reviews") {
            return createMockBuilder(null);
          }
          return createMockBuilder(null);
        },
      };

      const result = await overrideGrade(mockDb, {
        attemptId: "att_1",
        ownerId: "user_1",
        overrideReason: "The learner used an alternative valid SQL syntax.",
        verdict: "pass",
        total: 80,
      });

      // 1. Previous grade marked is_current: false
      expect(mockUpdatedRows.some((r) => r.is_current === false)).toBe(true);

      // 2. New grade created with source 'user_override' and is_current: true
      expect(result.source).toBe("user_override");
      expect(result.is_current).toBe(true);
      expect(result.verdict).toBe("pass");
      expect(result.override_reason).toBe("The learner used an alternative valid SQL syntax.");

      // 3. Audit events row written
      expect(mockAuditEvents.length).toBe(1);
      expect(mockAuditEvents[0].event).toBe("grade_override");
      expect(mockAuditEvents[0].detail.previous_verdict).toBe("fail");
      expect(mockAuditEvents[0].detail.new_verdict).toBe("pass");
    });
  });

  describe("5. Pending Grades & Cap Reset", () => {
    it("handles self-grading during paused cap and NEVER counts source 'self' as E2", async () => {
      function createMockBuilder(defaultData: any = null) {
        const builder: any = {
          select: vi.fn(() => builder),
          insert: vi.fn((_vals: any) => builder),
          update: vi.fn((_vals: any) => builder),
          delete: vi.fn(() => builder),
          upsert: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          in: vi.fn(() => builder),
          order: vi.fn(() => builder),
          limit: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({ data: defaultData, error: null })),
          single: vi.fn(async () => ({ data: defaultData, error: null })),
          then: (resolve: any) => resolve({ data: defaultData, error: null }),
        };
        return builder;
      }

      const mockDb: any = {
        from: (table: string) => {
          if (table === "grades") {
            const b = createMockBuilder();
            b.insert = vi.fn((vals: any) => {
              const row = { id: "gr_self", ...vals };
              return createMockBuilder(row);
            });
            return b;
          }
          if (table === "attempts") {
            return createMockBuilder({ id: "att_pending", question_id: "q_1" });
          }
          if (table === "quiz_questions") {
            return createMockBuilder({ id: "q_1", quiz_id: "qz_1" });
          }
          if (table === "quizzes") {
            return createMockBuilder({ id: "qz_1", skill_id: "sk_1" });
          }
          if (table === "skills") {
            return createMockBuilder({
              id: "sk_1",
              verification_type: "applied",
              status: "practising",
              evidence_level: 0,
            });
          }
          if (table === "skill_reviews") {
            return createMockBuilder(null);
          }
          return createMockBuilder(null);
        },
      };

      const selfGrade = await selfGradeAttempt(mockDb, {
        attemptId: "att_pending",
        ownerId: "user_1",
        total: 95,
        verdict: "pass",
      });

      expect(selfGrade.source).toBe("self");

      // Verify evidence engine evaluation with source 'self'
      const skill = {
        id: "sk_1",
        verification_type: "applied" as const,
        status: "practising" as const,
        evidence_level: 0 as const,
      };

      const evalRes = evaluateEvidence(skill, [
        {
          id: "att_pending",
          question_id: "q_1",
          question_type: "applied",
          status: "graded",
          current_grade: selfGrade as any,
        },
      ]);

      expect(evalRes.isVerified).toBe(false);
      expect(evalRes.evidenceLevel).toBe(0);
      expect(evalRes.evidenceLabel).toBe("Self-rated");
    });
  });

  describe("6. Artifact Answers: Only User Confirm Tick Grants E3", () => {
    const artifactSkill = {
      id: "sk_art",
      verification_type: "artifact" as const,
      status: "not_started" as const,
      evidence_level: 0 as const,
    };

    it("awards E3 ONLY after the user confirms they ran it and output matched", () => {
      const confirmedAttempt = [
        {
          id: "att_art_tick",
          question_id: "q_art",
          question_type: "artifact" as const,
          status: "graded" as const,
          user_confirmed_run: true, // "Confirm you ran it and it matched" tick
          current_grade: {
            id: "gr_art_pass",
            attempt_id: "att_art_tick",
            source: "ai" as const,
            total: 90,
            verdict: "pass" as const,
            confidence: 0.95,
            is_current: true,
          },
        },
      ];

      const res = evaluateEvidence(artifactSkill, confirmedAttempt);
      expect(res.isVerified).toBe(true);
      expect(res.evidenceLevel).toBe(3);
      expect(res.evidenceLabel).toBe("Artifact checked");
    });

    it("awards E2 (NOT E3) when artifact is passed without the confirm tick", () => {
      const untickedAttempt = [
        {
          id: "att_art_no_tick",
          question_id: "q_art",
          question_type: "artifact" as const,
          status: "graded" as const,
          user_confirmed_run: false, // NOT ticked
          current_grade: {
            id: "gr_art_pass",
            attempt_id: "att_art_no_tick",
            source: "ai" as const,
            total: 90,
            verdict: "pass" as const,
            confidence: 0.95,
            is_current: true,
          },
        },
      ];

      const res = evaluateEvidence(artifactSkill, untickedAttempt);
      expect(res.isVerified).toBe(true);
      expect(res.evidenceLevel).toBe(2);
      expect(res.evidenceLabel).toBe("Applied, graded");
    });
  });
});
