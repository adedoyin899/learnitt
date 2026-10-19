import { z } from "zod";
import { AITask } from "../types";

// ==============================================================================
// 1. Skill Graph Schema (PRD 7.3)
// ==============================================================================

const singleSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(255),
  prereq_ids: z.array(z.string()).default([]),
  estimated_minutes: z.object({
    min: z.number().int().min(5),
    max: z.number().int().min(5),
  }),
  difficulty: z.number().int().min(1).max(5),
  verification_type: z.enum(["recall", "applied", "artifact", "self"]),
  mvd_minutes: z.number().int().min(10).max(30),
  mvd_task: z.string().min(1).max(140),
});

function detectCycle(skills: Array<{ id: string; prereq_ids: string[] }>): boolean {
  const adj = new Map<string, string[]>();
  for (const s of skills) {
    adj.set(s.id, s.prereq_ids || []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string): boolean {
    visited.add(node);
    inStack.add(node);
    const neighbors = adj.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (inStack.has(neighbor)) {
        return true;
      }
    }
    inStack.delete(node);
    return false;
  }

  for (const s of skills) {
    if (!visited.has(s.id)) {
      if (dfs(s.id)) return true;
    }
  }
  return false;
}

export const skillGraphSchema = z
  .object({
    skills: z.array(singleSkillSchema).min(12, "Must contain at least 12 skills").max(20, "Cannot contain more than 20 skills"),
  })
  .superRefine((val, ctx) => {
    const ids = new Set<string>();
    for (let i = 0; i < val.skills.length; i++) {
      const s = val.skills[i];
      // Unique IDs
      if (ids.has(s.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate skill id: ${s.id}`,
          path: ["skills", i, "id"],
        });
      }
      ids.add(s.id);

      // min <= max minutes
      if (s.estimated_minutes.min > s.estimated_minutes.max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `estimated_minutes.min (${s.estimated_minutes.min}) must be <= max (${s.estimated_minutes.max})`,
          path: ["skills", i, "estimated_minutes"],
        });
      }
    }

    // Prerequisites exist and no self-dependency
    for (let i = 0; i < val.skills.length; i++) {
      const s = val.skills[i];
      for (const p of s.prereq_ids) {
        if (p === s.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Skill ${s.id} cannot list itself as a prerequisite`,
            path: ["skills", i, "prereq_ids"],
          });
        } else if (!ids.has(p)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Prerequisite skill id '${p}' does not exist in graph`,
            path: ["skills", i, "prereq_ids"],
          });
        }
      }
    }

    // Cycle detection
    if (detectCycle(val.skills)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Skill prerequisites graph contains a cycle (DAG violation)",
        path: ["skills"],
      });
    }
  });

// ==============================================================================
// 2. Link Materials Schema (PRD 7.2)
// ==============================================================================

export const linkMaterialsSchema = z.object({
  links: z.array(
    z.object({
      skill_id: z.string().min(1),
      material_id: z.string().min(1),
      confidence: z.number().min(0).max(1),
      reason: z.string().optional(),
    })
  ),
});

// ==============================================================================
// 3. Search Queries Schema (PRD 7.2)
// ==============================================================================

export const searchQueriesSchema = z.object({
  queries: z.array(z.string().min(1).max(120)).min(1).max(3),
});

// ==============================================================================
// 4. Classify Resource Schema (PRD 7.2)
// ==============================================================================

export const classifyResourceSchema = z.object({
  type: z.enum(["course", "article", "video", "book", "exercise", "docs", "other"]),
  estimated_minutes: z.number().int().min(1).max(720),
  relevance: z.number().min(0).max(1),
});

// ==============================================================================
// 5. Make Quiz Schema (PRD 7.4)
// ==============================================================================

const rubricItemSchema = z.object({
  criterion: z.string().min(1),
  weight: z.number().int().min(1).max(100),
  description: z.string().min(1),
});

const quizQuestionSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["recall_mc", "recall_tf", "applied", "artifact"]),
    prompt: z.string().min(1),
    options: z.array(z.string()).nullable().optional(),
    answer_key: z.union([z.string(), z.number()]).nullable().optional(),
    rubric: z.array(rubricItemSchema).nullable().optional(),
    source_chunk_ids: z.array(z.string()).default([]),
    skill_id: z.string().min(1),
  })
  .superRefine((q, ctx) => {
    // Recall questions must have an answer_key
    if (q.type === "recall_mc" || q.type === "recall_tf") {
      if (q.answer_key === undefined || q.answer_key === null || q.answer_key === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recall questions must have an answer_key",
          path: ["answer_key"],
        });
      }
      if (q.type === "recall_mc" && (!q.options || q.options.length < 2)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "recall_mc questions must have at least 2 options",
          path: ["options"],
        });
      }
    }

    // Applied and artifact questions must have a rubric summing to 100
    if (q.type === "applied" || q.type === "artifact") {
      if (!q.rubric || q.rubric.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Applied or artifact questions must have a rubric",
          path: ["rubric"],
        });
      } else {
        const sumWeights = q.rubric.reduce((acc, curr) => acc + curr.weight, 0);
        if (sumWeights !== 100) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Rubric weights must sum to 100 (got ${sumWeights})`,
            path: ["rubric"],
          });
        }
      }
    }
  });

export const makeQuizSchema = z.object({
  questions: z.array(quizQuestionSchema).min(1),
});

// ==============================================================================
// 6. Grade Applied Schema (PRD 7.2)
// ==============================================================================

export const gradeAppliedSchema = z.object({
  criterion_scores: z.array(
    z.object({
      criterion: z.string().min(1),
      score: z.number().min(0),
      max_score: z.number().min(1),
    })
  ),
  total: z.number().int().min(0).max(100),
  verdict: z.enum(["pass", "fail"]),
  feedback: z.object({
    summary: z.string().min(1),
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
  }),
  confidence: z.number().min(0).max(1),
});

// ==============================================================================
// 7. Answer Question Schema (PRD 7.2 & 7.5)
// ==============================================================================

export const answerQuestionSchema = z.object({
  answer: z.string().min(1),
  cited_chunk_ids: z.array(z.string()).default([]),
  general_knowledge: z.boolean().default(false),
});

// ==============================================================================
// 8. Explain Level Schema (PRD 7.2)
// ==============================================================================

export const explainLevelSchema = z.object({
  explanation: z.string().min(1),
});

// ==============================================================================
// 9. Weekly Summary Schema (PRD 7.2)
// ==============================================================================

export const weeklySummarySchema = z.object({
  summary: z.string().min(1),
});

// ==============================================================================
// Task Schema Resolver
// ==============================================================================

export function getTaskSchema(task: AITask): z.ZodTypeAny {
  switch (task) {
    case "skill_graph":
      return skillGraphSchema;
    case "link_materials":
      return linkMaterialsSchema;
    case "search_queries":
      return searchQueriesSchema;
    case "classify_resource":
      return classifyResourceSchema;
    case "make_quiz":
      return makeQuizSchema;
    case "grade_applied":
      return gradeAppliedSchema;
    case "answer_question":
      return answerQuestionSchema;
    case "explain_level":
      return explainLevelSchema;
    case "weekly_summary":
      return weeklySummarySchema;
    default: {
      const _exhaustiveCheck: never = task;
      throw new Error(`Unsupported AI task: ${_exhaustiveCheck}`);
    }
  }
}
