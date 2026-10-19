import { AIProvider, AIStructuredArgs, AIStructuredResponse, AITask } from "../types";

export class MockAIProvider implements AIProvider {
  readonly id: string;
  private readonly modelName: string;

  constructor(options?: { id?: string; model?: string }) {
    this.id = options?.id || "mock-ai";
    this.modelName = options?.model ? `mock-ai-${options.model}` : "mock-ai-v1-deterministic";
  }

  async generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
    const fixtureData = this.getDeterministicFixture(args.task, args.user);
    return {
      data: fixtureData as unknown as T,
      usage: {
        inputTokens: Math.max(Math.floor(args.user.length / 4), 10),
        outputTokens: 150,
      },
      modelVersion: this.modelName,
    };
  }

  private getDeterministicFixture(task: AITask, _prompt: string): unknown {
    switch (task) {
      case "skill_graph":
        return {
          skills: [
            {
              id: "sk_sql_basics",
              name: "SQL & Relational Modeling Fundamentals",
              description: "Core syntax, data structures, and relational queries.",
              prereq_ids: [],
              estimated_minutes: { min: 60, max: 120 },
              difficulty: 1,
              verification_type: "recall",
              mvd_minutes: 15,
              mvd_task: "Write a function processing a CSV dictionary into key-value pairs.",
            },
            {
              id: "sk_02",
              name: "SQL & Relational Modeling",
              description: "Relational schemas, constraints, joins, and indexing strategies.",
              prereq_ids: [],
              estimated_minutes: { min: 90, max: 180 },
              difficulty: 1,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Write a SQL query using CTE and window function on sample orders.",
            },
            {
              id: "sk_03",
              name: "Data Warehousing & Star Schemas",
              description: "Fact and dimension modeling, SCD Type 2, and grain definition.",
              prereq_ids: ["sk_02"],
              estimated_minutes: { min: 90, max: 180 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Sketch a star schema with dim_customer and fact_orders on paper.",
            },
            {
              id: "sk_04",
              name: "Data Ingestion & APIs",
              description: "Consuming REST APIs, pagination, rate-limiting, and error handling.",
              prereq_ids: ["sk_sql_basics"],
              estimated_minutes: { min: 60, max: 120 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Implement exponential backoff retry loop in Python for a mock endpoint.",
            },
            {
              id: "sk_05",
              name: "Batch Processing with Pandas/Polars",
              description: "Vectorized transformations, aggregations, and memory optimization.",
              prereq_ids: ["sk_sql_basics"],
              estimated_minutes: { min: 90, max: 150 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Profile memory usage of a DataFrame before and after type downcasting.",
            },
            {
              id: "sk_06",
              name: "Distributed Computing with PySpark",
              description: "Spark DataFrame API, partitioning, shuffles, and broadcast joins.",
              prereq_ids: ["sk_sql_basics", "sk_02"],
              estimated_minutes: { min: 120, max: 240 },
              difficulty: 3,
              verification_type: "applied",
              mvd_minutes: 20,
              mvd_task: "Explain why narrow transformations do not trigger a shuffle stage.",
            },
            {
              id: "sk_07",
              name: "Workflow Orchestration with Airflow",
              description: "DAG definition, operators, task dependencies, and idempotent retries.",
              prereq_ids: ["sk_sql_basics", "sk_04"],
              estimated_minutes: { min: 90, max: 180 },
              difficulty: 3,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Draft an Airflow DAG with 3 tasks using taskflow API syntax.",
            },
            {
              id: "sk_08",
              name: "Data Lake Storage & Parquet/Iceberg",
              description: "Columnar formats, compression codecs, partitioning, and lakehouses.",
              prereq_ids: ["sk_03", "sk_06"],
              estimated_minutes: { min: 90, max: 150 },
              difficulty: 3,
              verification_type: "recall",
              mvd_minutes: 15,
              mvd_task: "Inspect Parquet metadata file statistics using pyarrow.",
            },
            {
              id: "sk_09",
              name: "Data Transformation with dbt",
              description: "Modularity, ref(), tests, documentation, and incremental models.",
              prereq_ids: ["sk_02", "sk_03"],
              estimated_minutes: { min: 90, max: 180 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Write a dbt generic test YAML block for unique and not-null constraints.",
            },
            {
              id: "sk_10",
              name: "Streaming Foundations (Kafka)",
              description: "Topics, partitions, consumer groups, offset management, and delivery semantics.",
              prereq_ids: ["sk_sql_basics"],
              estimated_minutes: { min: 120, max: 240 },
              difficulty: 4,
              verification_type: "recall",
              mvd_minutes: 20,
              mvd_task: "Diagram producer, broker, and consumer group offset commit flow.",
            },
            {
              id: "sk_11",
              name: "Data Quality & Observability",
              description: "Great Expectations, anomaly alerts, SLA tracking, and schema validation.",
              prereq_ids: ["sk_07", "sk_09"],
              estimated_minutes: { min: 60, max: 120 },
              difficulty: 2,
              verification_type: "applied",
              mvd_minutes: 15,
              mvd_task: "Formulate 3 expectation suites for an incoming raw data table.",
            },
            {
              id: "sk_12",
              name: "End-to-End Pipeline Capstone",
              description: "Build an automated, tested ELT pipeline with ingestion, staging, and analytics.",
              prereq_ids: ["sk_07", "sk_08", "sk_09", "sk_11"],
              estimated_minutes: { min: 180, max: 360 },
              difficulty: 4,
              verification_type: "artifact",
              mvd_minutes: 25,
              mvd_task: "Commit a clean pipeline architecture diagram and test suite README.",
            },
          ],
        };

      case "link_materials":
        return {
          links: [
            {
              skill_id: "sk_01",
              material_id: "mat_sample_1",
              confidence: 0.95,
              reason: "Directly covers core Python syntax and dictionary processing.",
            },
          ],
        };

      case "search_queries":
        return {
          queries: [
            "SQL fundamentals window functions tutorial",
            "PostgreSQL indexing best practices beginner",
          ],
        };

      case "classify_resource":
        return {
          type: "article",
          estimated_minutes: 20,
          relevance: 0.9,
        };

      case "make_quiz":
        return {
          questions: [
            {
              id: "q_sql_01",
              type: "recall_mc",
              prompt: "Which clause filters rows before aggregation in SQL?",
              options: ["WHERE", "HAVING", "ORDER BY", "GROUP BY"],
              answer_key: 0,
              rubric: null,
              source_chunk_ids: ["chunk_sql_01"],
              skill_id: "sk_02",
            },
            {
              id: "q_sql_applied_01",
              type: "applied",
              prompt: "Explain when to use an INNER JOIN versus a LEFT JOIN in analytics queries.",
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
              source_chunk_ids: ["chunk_sql_01"],
              skill_id: "sk_02",
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
          cited_chunk_ids: ["chunk_sql_01"],
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
