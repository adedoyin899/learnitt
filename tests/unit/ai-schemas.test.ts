import { describe, expect, it } from "vitest";
import {
  classifyResourceSchema,
  gradeAppliedSchema,
  makeQuizSchema,
  searchQueriesSchema,
  skillGraphSchema,
} from "@/lib/ai/schemas";

describe("AI Task Output Zod Schemas", () => {
  describe("skill_graph schema (PRD 7.3)", () => {
    const valid12Skills = Array.from({ length: 12 }, (_, i) => ({
      id: `sk_${i + 1}`,
      name: `Skill ${i + 1}`,
      description: `Description for skill ${i + 1}`,
      prereq_ids: i === 0 ? [] : [`sk_${i}`],
      estimated_minutes: { min: 60, max: 120 },
      difficulty: 2,
      verification_type: "applied" as const,
      mvd_minutes: 15,
      mvd_task: `Do task for skill ${i + 1}`,
    }));

    it("accepts a valid 12-skill DAG", () => {
      const res = skillGraphSchema.safeParse({ skills: valid12Skills });
      expect(res.success).toBe(true);
    });

    it("rejects fewer than 12 skills", () => {
      const res = skillGraphSchema.safeParse({ skills: valid12Skills.slice(0, 11) });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toMatch(/at least 12 skills/i);
      }
    });

    it("rejects more than 20 skills", () => {
      const tooManySkills = Array.from({ length: 21 }, (_, i) => ({
        id: `sk_${i + 1}`,
        name: `Skill ${i + 1}`,
        description: `Description for skill ${i + 1}`,
        prereq_ids: [],
        estimated_minutes: { min: 30, max: 60 },
        difficulty: 1,
        verification_type: "recall" as const,
        mvd_minutes: 15,
        mvd_task: "Task",
      }));
      const res = skillGraphSchema.safeParse({ skills: tooManySkills });
      expect(res.success).toBe(false);
    });

    it("rejects duplicate skill IDs", () => {
      const duplicates = [...valid12Skills];
      duplicates[1] = { ...duplicates[1], id: duplicates[0].id };
      const res = skillGraphSchema.safeParse({ skills: duplicates });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message.includes("Duplicate skill id"))).toBe(true);
      }
    });

    it("rejects when estimated_minutes.min > max", () => {
      const invalidMinutes = [...valid12Skills];
      invalidMinutes[0] = {
        ...invalidMinutes[0],
        estimated_minutes: { min: 120, max: 60 },
      };
      const res = skillGraphSchema.safeParse({ skills: invalidMinutes });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message.includes("must be <= max"))).toBe(true);
      }
    });

    it("rejects non-existent prerequisite IDs", () => {
      const invalidPrereq = [...valid12Skills];
      invalidPrereq[0] = {
        ...invalidPrereq[0],
        prereq_ids: ["non_existent_id"],
      };
      const res = skillGraphSchema.safeParse({ skills: invalidPrereq });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message.includes("does not exist in graph"))).toBe(true);
      }
    });

    it("rejects cycles in the prerequisite graph (DAG cycle detection)", () => {
      const cyclic = valid12Skills.map((s) => ({ ...s, prereq_ids: [...s.prereq_ids] }));
      // Introduce cycle between sk_1 and sk_2
      cyclic[0].prereq_ids = ["sk_2"];
      cyclic[1].prereq_ids = ["sk_1"];

      const res = skillGraphSchema.safeParse({ skills: cyclic });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message.includes("cycle"))).toBe(true);
      }
    });
  });

  describe("make_quiz schema (PRD 7.4)", () => {
    it("accepts valid recall and applied questions with weights summing to 100", () => {
      const validQuiz = {
        questions: [
          {
            id: "q1",
            type: "recall_mc",
            prompt: "What is SQL?",
            options: ["Language", "Database", "OS"],
            answer_key: 0,
            source_chunk_ids: ["chk_1"],
            skill_id: "sk_1",
          },
          {
            id: "q2",
            type: "applied",
            prompt: "Design a schema.",
            rubric: [
              { criterion: "Keys", weight: 40, description: "Primary keys defined" },
              { criterion: "Types", weight: 30, description: "Data types appropriate" },
              { criterion: "Indexes", weight: 30, description: "Indexes appropriate" },
            ],
            source_chunk_ids: ["chk_1"],
            skill_id: "sk_1",
          },
        ],
      };
      const res = makeQuizSchema.safeParse(validQuiz);
      expect(res.success).toBe(true);
    });

    it("rejects recall question without answer_key", () => {
      const invalidRecall = {
        questions: [
          {
            id: "q1",
            type: "recall_mc",
            prompt: "What is SQL?",
            options: ["A", "B"],
            answer_key: null,
            skill_id: "sk_1",
          },
        ],
      };
      const res = makeQuizSchema.safeParse(invalidRecall);
      expect(res.success).toBe(false);
    });

    it("rejects applied question with fewer than 3 rubric criteria", () => {
      const invalidFewerCriteria = {
        questions: [
          {
            id: "q2",
            type: "applied",
            prompt: "Explain joins.",
            rubric: [
              { criterion: "Accuracy", weight: 50, description: "Correct" },
              { criterion: "Clarity", weight: 50, description: "Clear" },
            ],
            skill_id: "sk_1",
          },
        ],
      };
      const res = makeQuizSchema.safeParse(invalidFewerCriteria);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message.includes("3 to 5 criteria"))).toBe(true);
      }
    });

    it("rejects applied question when rubric weights do not sum to 100", () => {
      const invalidRubric = {
        questions: [
          {
            id: "q2",
            type: "applied",
            prompt: "Explain joins.",
            rubric: [
              { criterion: "Accuracy", weight: 50, description: "Correct" },
              { criterion: "Clarity", weight: 20, description: "Clear" },
              { criterion: "Examples", weight: 20, description: "Examples" }, // Sums to 90, not 100
            ],
            skill_id: "sk_1",
          },
        ],
      };
      const res = makeQuizSchema.safeParse(invalidRubric);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message.includes("weights must sum to 100"))).toBe(true);
      }
    });
  });

  describe("search_queries schema", () => {
    it("accepts 1 to 3 queries and rejects > 3", () => {
      expect(searchQueriesSchema.safeParse({ queries: ["query 1", "query 2"] }).success).toBe(true);
      expect(
        searchQueriesSchema.safeParse({ queries: ["q1", "q2", "q3", "q4"] }).success
      ).toBe(false);
    });
  });

  describe("classify_resource schema", () => {
    it("validates types, estimated minutes, and relevance between 0 and 1", () => {
      expect(
        classifyResourceSchema.safeParse({
          type: "article",
          estimated_minutes: 25,
          relevance: 0.95,
        }).success
      ).toBe(true);

      expect(
        classifyResourceSchema.safeParse({
          type: "unsupported_type",
          estimated_minutes: 25,
          relevance: 0.95,
        }).success
      ).toBe(false);

      expect(
        classifyResourceSchema.safeParse({
          type: "article",
          estimated_minutes: 25,
          relevance: 1.5, // > 1
        }).success
      ).toBe(false);
    });
  });

  describe("grade_applied schema", () => {
    it("validates criterion scores (0 to 2), verdict, feedback, and confidence", () => {
      const validGrade = {
        criterion_scores: [
          { criterion: "Accuracy", score: 2, max_score: 2, feedback: "Clear code" },
          { criterion: "Clarity", score: 1, max_score: 2, feedback: "Needs minor polish" },
        ],
        total: 80,
        verdict: "pass",
        feedback: {
          summary: "Good work",
          strengths: ["Clear code"],
          improvements: ["Add comments"],
        },
        confidence: 0.9,
      };
      expect(gradeAppliedSchema.safeParse(validGrade).success).toBe(true);

      // Rejects score > 2
      const invalidScore = {
        ...validGrade,
        criterion_scores: [{ criterion: "Accuracy", score: 3, max_score: 2 }],
      };
      expect(gradeAppliedSchema.safeParse(invalidScore).success).toBe(false);
    });
  });
});
