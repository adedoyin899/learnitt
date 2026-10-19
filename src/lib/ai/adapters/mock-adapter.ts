import { AIProvider, AIStructuredArgs, AIStructuredResponse, AITask } from "../types";

export class MockAIProvider implements AIProvider {
  readonly id: string;
  private readonly modelName: string;
  public readonly recordedCalls: AIStructuredArgs[] = [];

  constructor(options?: { id?: string; model?: string }) {
    this.id = options?.id || "mock-ai";
    this.modelName = options?.model ? `mock-ai-${options.model}` : "mock-ai-v1-deterministic";
  }

  async generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
    this.recordedCalls.push(args);
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

  private getDeterministicFixture(task: AITask, prompt: string): unknown {
    const isHealth = prompt.toLowerCase().includes("health") || prompt.toLowerCase().includes("biostatistics");

    switch (task) {
      case "skill_graph":
        if (isHealth) {
          return {
            skills: [
              {
                id: "sk_ha_01",
                name: "Probability Distributions in Clinical Medicine",
                description: "Core random variables, expectation, variance, binomial, and Poisson distributions.",
                prereq_ids: [],
                estimated_minutes: { min: 120, max: 180 },
                difficulty: 2,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Calculate expected value and variance for clinical trial outcome variables.",
              },
              {
                id: "sk_ha_02",
                name: "Statistical Inference & Hypothesis Testing",
                description: "Null hypothesis testing, p-values, confidence intervals, and power calculations.",
                prereq_ids: ["sk_ha_01"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Compute 95% confidence intervals for a difference between treatment and control means.",
              },
              {
                id: "sk_ha_03",
                name: "Linear and Logistic Regression in Healthcare",
                description: "Modeling continuous and binary health outcomes, odds ratios, and covariate adjustment.",
                prereq_ids: ["sk_ha_02"],
                estimated_minutes: { min: 120, max: 210 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Fit a logistic regression model in R/Python and interpret odds ratios with 95% CI.",
              },
              {
                id: "sk_ha_04",
                name: "Survival Analysis & Time-to-Event Data",
                description: "Kaplan-Meier estimation, log-rank tests, and Cox proportional hazards models.",
                prereq_ids: ["sk_ha_02", "sk_ha_03"],
                estimated_minutes: { min: 120, max: 240 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: "Plot a Kaplan-Meier survival curve and calculate median survival time.",
              },
              {
                id: "sk_ha_05",
                name: "Study Designs: Cohort, Case-Control & RCTs",
                description: "Observational vs experimental designs, bias, confounding, and causal inference.",
                prereq_ids: ["sk_ha_01"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Identify potential confounding variables in an observational cohort study protocol.",
              },
              {
                id: "sk_ha_06",
                name: "Measures of Disease Occurrence & Risk",
                description: "Incidence, prevalence, relative risk, attributable risk, and standardized rates.",
                prereq_ids: ["sk_ha_05"],
                estimated_minutes: { min: 60, max: 120 },
                difficulty: 1,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Calculate risk ratio and absolute risk reduction from a 2x2 clinical contingency table.",
              },
              {
                id: "sk_ha_07",
                name: "Missing Data & Imputation in Health Studies",
                description: "Mechanisms of missingness (MCAR, MAR, MNAR) and multiple imputation methods.",
                prereq_ids: ["sk_ha_03", "sk_ha_05"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Evaluate missing data mechanisms and set up mice imputation in R.",
              },
              {
                id: "sk_ha_08",
                name: "Meta-Analysis & Systematic Review Methods",
                description: "Effect sizes, forest plots, heterogeneity (I-squared), and publication bias.",
                prereq_ids: ["sk_ha_05", "sk_ha_06"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Construct a forest plot from 5 published trials and assess heterogeneity.",
              },
              {
                id: "sk_ha_09",
                name: "Electronic Health Records & Clinical Coding",
                description: "ICD-10, SNOMED-CT, LOINC, and RxNorm terminology mapping and ontologies.",
                prereq_ids: ["sk_ha_06"],
                estimated_minutes: { min: 90, max: 150 },
                difficulty: 2,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Map clinical diagnosis concepts to ICD-10 and SNOMED-CT identifiers.",
              },
              {
                id: "sk_ha_10",
                name: "Common Data Models: OMOP CDM & FHIR",
                description: "Observational Medical Outcomes Partnership schema, HL7 FHIR resources.",
                prereq_ids: ["sk_ha_09"],
                estimated_minutes: { min: 120, max: 240 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Design an OMOP CDM person and condition_occurrence table mapping schema.",
              },
              {
                id: "sk_ha_11",
                name: "Clinical Data Extraction & SQL Cohort Building",
                description: "Extracting patient cohorts, index dates, and adverse event flags from EHR.",
                prereq_ids: ["sk_ha_09", "sk_ha_10"],
                estimated_minutes: { min: 120, max: 210 },
                difficulty: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Write a SQL query extracting patient cohorts with at least 2 outpatient visits.",
              },
              {
                id: "sk_ha_12",
                name: "Phenotyping Algorithms & Validation",
                description: "Rule-based and probabilistic clinical phenotyping for disease cohorts.",
                prereq_ids: ["sk_ha_10", "sk_ha_11"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Define positive predictive value and sensitivity metrics for a diabetes phenotype.",
              },
              {
                id: "sk_ha_13",
                name: "Clinical Risk Prediction Models",
                description: "Developing, validating, and reporting multivariable models using TRIPOD guidelines.",
                prereq_ids: ["sk_ha_03", "sk_ha_11"],
                estimated_minutes: { min: 120, max: 240 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 20,
                mvd_task: "Draft a TRIPOD checklist table for a 30-day hospital readmission model.",
              },
              {
                id: "sk_ha_14",
                name: "Discrimination, Calibration & Clinical Utility",
                description: "C-statistic / AUROC, Brier score, calibration curves, and decision curve analysis.",
                prereq_ids: ["sk_ha_13"],
                estimated_minutes: { min: 90, max: 180 },
                difficulty: 3,
                verification_type: "applied",
                mvd_minutes: 15,
                mvd_task: "Plot calibration belt curves and calculate Brier score for risk predictions.",
              },
              {
                id: "sk_ha_15",
                name: "Ethics, Fairness & Privacy in Healthcare AI",
                description: "Algorithmic bias across demographics, differential privacy, HIPAA, and GDPR.",
                prereq_ids: ["sk_ha_13"],
                estimated_minutes: { min: 60, max: 120 },
                difficulty: 2,
                verification_type: "recall",
                mvd_minutes: 15,
                mvd_task: "Audit predictive performance parity across patient age and demographic groups.",
              },
              {
                id: "sk_ha_16",
                name: "Applied Capstone: Health Analytics Study",
                description: "End-to-end cohort selection, statistical modeling, validation, and reproducible report.",
                prereq_ids: ["sk_ha_04", "sk_ha_12", "sk_ha_14", "sk_ha_15"],
                estimated_minutes: { min: 180, max: 360 },
                difficulty: 4,
                verification_type: "artifact",
                mvd_minutes: 25,
                mvd_task: "Produce an end-to-end reproducible RMarkdown / Jupyter health study analysis.",
              },
            ],
          };
        }

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

      case "link_materials": {
        let skillId = "sk_01";
        let matId = "mat_sample_1";
        try {
          const skillsMatch = prompt.match(/Skills:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          const chunksMatch = prompt.match(/(?:Material Chunks|Materials):\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          if (skillsMatch) {
            const parsedSkills = JSON.parse(skillsMatch[1]);
            if (parsedSkills.length > 0 && parsedSkills[0].id) {
              skillId = parsedSkills[0].id;
            }
          }
          if (chunksMatch) {
            const parsedChunks = JSON.parse(chunksMatch[1]);
            if (parsedChunks.length > 0 && (parsedChunks[0].material_id || parsedChunks[0].id)) {
              matId = parsedChunks[0].material_id || parsedChunks[0].id;
            }
          }
        } catch {
          // fallback to defaults
        }

        return {
          links: [
            {
              skill_id: skillId,
              material_id: matId,
              confidence: 0.95,
              reason: "Directly covers core domain concepts.",
            },
          ],
        };
      }

      case "search_queries":
        return {
          queries: [
            "SQL fundamentals window functions tutorial",
            "PostgreSQL indexing best practices beginner",
          ],
        };

      case "classify_resource": {
        try {
          const match = prompt.match(/Classify the following batch of candidate resources:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          if (match) {
            const list = JSON.parse(match[1]);
            return {
              candidates: list.map((c: any) => ({
                url: c.url,
                type: c.url?.includes("video") || c.url?.includes("youtube") ? "video" : c.url?.includes("docs") ? "docs" : "article",
                estimated_minutes: 25,
                relevance: 0.88,
              })),
            };
          }
        } catch {
          // fallback
        }
        return {
          type: "article",
          estimated_minutes: 20,
          relevance: 0.9,
        };
      }

      case "make_quiz": {
        let chunkIds = ["chunk_sql_01"];
        try {
          const chunkMatch = prompt.match(/Context Chunks:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          if (chunkMatch) {
            const parsedChunks = JSON.parse(chunkMatch[1]);
            if (parsedChunks.length > 0 && parsedChunks[0].id) {
              chunkIds = parsedChunks.map((c: any) => c.id);
            }
          }
        } catch {
          // fallback
        }

        const validChunkId = chunkIds[0] || "chunk_sql_01";

        return {
          questions: [
            {
              id: "q_sql_01",
              type: "recall_mc",
              prompt: "Which clause filters rows before aggregation in SQL?",
              options: ["WHERE", "HAVING", "ORDER BY", "GROUP BY"],
              answer_key: 0,
              rubric: null,
              source_chunk_ids: [validChunkId],
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
                  weight: 40,
                  description: "Notes that only matching rows from both tables are retained.",
                },
                {
                  criterion: "Explains LEFT JOIN behavior",
                  weight: 30,
                  description: "Notes all left-table rows are preserved with NULLs for unmatched right.",
                },
                {
                  criterion: "Contrasts analytical use cases",
                  weight: 30,
                  description: "Provides realistic examples contrasting data loss vs NULL preservation.",
                },
              ],
              source_chunk_ids: [validChunkId],
              skill_id: "sk_02",
            },
          ],
        };
      }

      case "grade_applied": {
        const isLowConfidence =
          prompt.includes("low_confidence") || prompt.includes("low confidence");
        const isFail = prompt.includes("fail_grade");

        return {
          criterion_scores: [
            {
              criterion: "Explains INNER JOIN behavior",
              score: isFail ? 0 : 2,
              max_score: 2,
              feedback: isFail ? "Missing core explanation." : "Accurate description of inner join semantics.",
            },
            {
              criterion: "Explains LEFT JOIN behavior",
              score: isFail ? 1 : 2,
              max_score: 2,
              feedback: "Correctly mentions NULL preservation for unmatched rows.",
            },
            {
              criterion: "Contrasts analytical use cases",
              score: isFail ? 0 : 1,
              max_score: 2,
              feedback: "Adequate contrast with real-world examples.",
            },
          ],
          total: isFail ? 40 : 85,
          verdict: isFail ? "fail" : "pass",
          feedback: {
            summary: isFail
              ? "Explanation falls short of standard analytical accuracy."
              : "Clear explanation that covers the core distinction accurately.",
            strengths: ["Properly identified NULL handling in outer joins."],
            improvements: ["Could mention performance implications with large outer tables."],
          },
          confidence: isLowConfidence ? 0.45 : 0.95,
        };
      }

      case "answer_question": {
        let chunkIds: string[] = [];
        try {
          const m = prompt.match(/Retrieved Chunks:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
          if (m) {
            const parsed = JSON.parse(m[1]);
            chunkIds = parsed.map((c: any) => c.id).filter(Boolean);
          }
        } catch {
          // fallback
        }

        const isGeneral =
          prompt.toLowerCase().includes("unrelated") ||
          prompt.toLowerCase().includes("general knowledge") ||
          prompt.includes("Retrieved Chunks:\n[]") ||
          prompt.includes('"chunks": []') ||
          chunkIds.length === 0;

        if (isGeneral) {
          return {
            answer: "General knowledge: This topic is not covered in your uploaded materials.",
            cited_chunk_ids: [],
            general_knowledge: true,
          };
        }

        return {
          answer:
            "In SQL, the WHERE clause filters rows before grouping occurs, whereas HAVING filters groups after aggregation.",
          cited_chunk_ids: chunkIds.length > 0 ? [chunkIds[0]] : ["chunk_sql_01"],
          general_knowledge: false,
        };
      }

      case "explain_level": {
        const isSimpler = prompt.toLowerCase().includes("simpler") || prompt.toLowerCase().includes("eli5");
        const isTechnical = prompt.toLowerCase().includes("more_technical") || prompt.toLowerCase().includes("technical");
        const isExample = prompt.toLowerCase().includes("with_example") || prompt.toLowerCase().includes("example");

        if (isSimpler) {
          return {
            explanation:
              "Think of WHERE as a bouncer at the door checking individual tickets, and HAVING as judging the final groups inside.",
          };
        }
        if (isTechnical) {
          return {
            explanation:
              "In relational algebra query planning, WHERE executes relational selection (σ) prior to hash aggregate grouping (γ), while HAVING applies post-aggregation residual filter expressions.",
          };
        }
        if (isExample) {
          return {
            explanation:
              "For example: SELECT department, COUNT(*) FROM employees WHERE salary > 50000 GROUP BY department HAVING COUNT(*) > 5;",
          };
        }
        return {
          explanation: "Here is an explanation adapted to your requested cognitive style.",
        };
      }

      case "weekly_summary": {
        const includesJournal = prompt.includes("Journal") || prompt.includes("journal");
        return {
          summary: includesJournal
            ? "You completed 4 study sessions this week (6.4 hours) and reflected in your journal about mastering SQL query planning."
            : "You completed 4 study sessions this week, totaling 6.4 hours. Both SQL fundamentals and joins quizzes were passed.",
        };
      }

      default:
        return { result: "ok" };
    }
  }
}
