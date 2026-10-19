import { AIProvider, AIStructuredArgs, AIStructuredResponse, AITask } from "../types";

export class MockAIProvider implements AIProvider {
  readonly id = "mock-ai";

  async generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
    const fixtureData = this.getDeterministicFixture(args.task, args.user);
    return {
      data: fixtureData as unknown as T,
      usage: {
        inputTokens: Math.max(args.user.length / 4, 10),
        outputTokens: 120,
      },
      modelVersion: "mock-ai-v1-deterministic",
    };
  }

  private getDeterministicFixture(task: AITask, _prompt: string): unknown {
    switch (task) {
      case "skill_graph":
        return {
          skills: [
            {
              id: "sk_sql_basics",
              name: "SQL Fundamentals",
              description: "Core querying with SELECT, WHERE, and aggregations.",
              prereq_ids: [],
              estimated_minutes: { min: 60, max: 120 },
              difficulty: 1,
              verification_type: "recall",
              mvd_minutes: 15,
              mvd_task: "Write and execute 3 basic SELECT queries with WHERE filters.",
            },
            {
              id: "sk_sql_joins",
              name: "SQL Joins and Sets",
              description: "Relational data joining (INNER, LEFT, FULL, UNION).",
              prereq_ids: ["sk_sql_basics"],
              estimated_minutes: { min: 90, max: 150 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Build a single multi-table join and explain row duplication.",
            },
          ],
        };

      case "link_materials":
        return {
          links: [
            {
              skill_id: "sk_sql_basics",
              chunk_id: "mock_chunk_1",
              confidence: 0.92,
              reason: "Covers SQL syntax and filtering.",
            },
          ],
        };

      case "search_queries":
        return {
          queries: [
            "SQL fundamentals tutorial beginner",
            "PostgreSQL select where group by examples",
          ],
        };

      case "classify_resource":
        return {
          type: "article",
          estimated_minutes: 25,
          relevance: 0.88,
        };

      case "make_quiz":
        return {
          questions: [
            {
              id: "q_sql_1",
              type: "recall_mc",
              prompt: "Which clause filters rows before aggregation in SQL?",
              options: ["WHERE", "HAVING", "ORDER BY", "GROUP BY"],
              answer_key: 0,
              rubric: null,
              source_chunk_ids: ["mock_chunk_1"],
              skill_id: "sk_sql_basics",
            },
            {
              id: "q_sql_applied_1",
              type: "applied",
              prompt: "Explain when to use an INNER JOIN versus a LEFT JOIN.",
              options: null,
              answer_key: null,
              rubric: [
                {
                  criterion: "Explains INNER JOIN behavior",
                  weight: 50,
                  description: "Notes that only matching rows from both tables are retained.",
                },
                {
                  criterion: "Explains LEFT JOIN behavior",
                  weight: 50,
                  description: "Notes all left-table rows are preserved with NULLs for unmatched right.",
                },
              ],
              source_chunk_ids: ["mock_chunk_1"],
              skill_id: "sk_sql_joins",
            },
          ],
        };

      case "grade_applied":
        return {
          criterion_scores: [
            { criterion: "Accuracy", score: 2, max_score: 2 },
            { criterion: "Clarity", score: 2, max_score: 2 },
          ],
          total: 85,
          verdict: "pass",
          feedback: {
            summary: "Clear explanation that covers the core distinction accurately.",
            strengths: ["Properly identified NULL handling in outer joins."],
            improvements: ["Could mention performance implications with large outer tables."],
          },
          confidence: 0.95,
        };

      case "answer_question":
        return {
          answer:
            "In SQL, the WHERE clause filters rows before grouping occurs, whereas HAVING filters groups after aggregation.",
          cited_chunk_ids: ["mock_chunk_1"],
          general_knowledge: false,
        };

      case "explain_level":
        return {
          explanation:
            "Think of WHERE as a bouncer at the door checking individual tickets, and HAVING as judging the final groups inside.",
        };

      case "weekly_summary":
        return {
          summary:
            "You completed 4 out of 5 planned sessions this week, totaling 6.4 hours. Both SQL fundamentals and joins quizzes were passed.",
        };

      default:
        return { result: "ok" };
    }
  }
}
