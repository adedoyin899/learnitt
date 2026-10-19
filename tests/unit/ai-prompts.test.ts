import { describe, expect, it } from "vitest";
import {
  buildAnswerQuestionPrompt,
  buildClassifyResourcePrompt,
  buildExplainLevelPrompt,
  buildGradeAppliedPrompt,
  buildLinkMaterialsPrompt,
  buildMakeQuizPrompt,
  buildSearchQueriesPrompt,
  buildSkillGraphPrompt,
  buildWeeklySummaryPrompt,
} from "@/lib/ai/prompts";

describe("AI Prompts Specifications (PRD Section 7)", () => {
  const promptBuilders = [
    {
      name: "skill_graph",
      build: () =>
        buildSkillGraphPrompt({
          title: "Data Engineering",
          starting_level: "beginner",
          target_date: "2026-12-31",
          weekly_hours: 8,
        }),
      expectedTemp: 0.2,
    },
    {
      name: "link_materials",
      build: () =>
        buildLinkMaterialsPrompt({
          skills: [{ id: "sk_1", name: "SQL" }],
          chunks: [{ id: "chk_1", summary: "SQL intro" }],
        }),
      expectedTemp: 0.1,
    },
    {
      name: "search_queries",
      build: () =>
        buildSearchQueriesPrompt({
          skillName: "Airflow",
          level: "intermediate",
        }),
      expectedTemp: 0.3,
    },
    {
      name: "classify_resource",
      build: () =>
        buildClassifyResourcePrompt({
          title: "Pandas Guide",
          domain: "pandas.pydata.org",
          snippet: "Official documentation",
        }),
      expectedTemp: 0.1,
    },
    {
      name: "make_quiz",
      build: () =>
        buildMakeQuizPrompt({
          skill: { id: "sk_1", name: "SQL Joins" },
        }),
      expectedTemp: 0.4,
    },
    {
      name: "grade_applied",
      build: () =>
        buildGradeAppliedPrompt({
          question: "Explain joins",
          rubric: [{ criterion: "Accuracy", weight: 100, description: "Correct" }],
          answer: "Inner join matches rows",
        }),
      expectedTemp: 0.1,
    },
    {
      name: "answer_question",
      build: () =>
        buildAnswerQuestionPrompt({
          question: "How does GROUP BY work?",
          chunks: [{ id: "chk_1", content: "GROUP BY groups rows" }],
        }),
      expectedTemp: 0.3,
    },
    {
      name: "explain_level",
      build: () =>
        buildExplainLevelPrompt({
          priorAnswer: "Complex explanation",
          targetStyle: "eli5",
        }),
      expectedTemp: 0.4,
    },
    {
      name: "weekly_summary",
      build: () =>
        buildWeeklySummaryPrompt({
          stats: { completed_sessions: 4, target_sessions: 5 },
        }),
      expectedTemp: 0.3,
    },
  ];

  it("every system prompt states: do not invent URLs, citations, or facts about the user", () => {
    for (const item of promptBuilders) {
      const prompt = item.build();
      expect(prompt.system).toMatch(/do not invent urls, citations, or facts about the user/i);
    }
  });

  it("every prompt has an audit-tracked PROMPT_VERSION string", () => {
    for (const item of promptBuilders) {
      const prompt = item.build();
      expect(prompt.promptVersion).toBeDefined();
      expect(typeof prompt.promptVersion).toBe("string");
      expect(prompt.promptVersion.length).toBeGreaterThan(0);
    }
  });

  it("applies task-specific temperature constraints matching PRD 7.2", () => {
    for (const item of promptBuilders) {
      const prompt = item.build();
      expect(prompt.temperature).toBe(item.expectedTemp);
    }
  });
});
