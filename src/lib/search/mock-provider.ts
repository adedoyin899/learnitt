import { SearchCandidate, SearchOptions, SearchProvider, SearchCapReachedError } from "./types";
import { SEARCH_CONFIG } from "@/lib/config/search";

export class MockSearchProvider implements SearchProvider {
  readonly id = "mock-search";
  public recordedCalls: Array<SearchOptions> = [];
  public forcedCap: number | null = null;
  public customCandidates: Record<string, SearchCandidate[]> = {};
  public injectDeadLinks: boolean = false;

  constructor(options?: { dailyCap?: number }) {
    if (options?.dailyCap !== undefined) {
      this.forcedCap = options.dailyCap;
    }
  }

  async search(options: SearchOptions): Promise<SearchCandidate[]> {
    this.recordedCalls.push(options);

    const cap = this.forcedCap !== null ? this.forcedCap : SEARCH_CONFIG.DAILY_SEARCH_CALL_CAP;
    if (this.recordedCalls.length > cap) {
      throw new SearchCapReachedError(`Search call cap of ${cap} reached.`);
    }

    const cleanQuery = options.query.toLowerCase();

    // Check if custom candidates match
    for (const [key, list] of Object.entries(this.customCandidates)) {
      if (cleanQuery.includes(key.toLowerCase())) {
        return list.slice(0, options.maxResults || 5);
      }
    }

    // Default high-signal mock database for tech/domain queries
    const results: SearchCandidate[] = [];

    if (cleanQuery.includes("index") || cleanQuery.includes("b-tree")) {
      results.push(
        {
          url: "https://www.postgresql.org/docs/current/indexes-btree.html",
          title: "B-Tree Indexes - PostgreSQL Documentation",
          snippet: "PostgreSQL includes an implementation of the standard Lehman & Yao algorithm for B-Tree index structure.",
          domain: "postgresql.org",
        },
        {
          url: "https://use-the-index-luke.com/sql/anatomy",
          title: "Anatomy of an Index - Use The Index, Luke",
          snippet: "Understanding database index leaf nodes, tree depth, and double-linked lists for range queries.",
          domain: "use-the-index-luke.com",
        }
      );
    } else if (cleanQuery.includes("wal") || cleanQuery.includes("checkpoint")) {
      results.push(
        {
          url: "https://www.postgresql.org/docs/current/wal-intro.html",
          title: "Write-Ahead Logging (WAL) - PostgreSQL Manual",
          snippet: "Write-Ahead Logging is a standard approach to transaction logging ensuring ACID durability and fast crashes recovery.",
          domain: "postgresql.org",
        },
        {
          url: "https://wiki.postgresql.org/wiki/WAL_Internals",
          title: "PostgreSQL WAL Internals & Checkpoint Tuning",
          snippet: "In-depth guide to checkpoints, dirty buffers, and tuning max_wal_size.",
          domain: "postgresql.org",
        }
      );
    } else if (
      cleanQuery.includes("sql") ||
      cleanQuery.includes("relational") ||
      cleanQuery.includes("join") ||
      cleanQuery.includes("table")
    ) {
      results.push(
        {
          url: "https://en.wikipedia.org/wiki/SQL",
          title: "SQL Overview & Language Fundamentals",
          snippet: "Declarative SQL syntax, standard joins, filtering predicates, and window aggregations.",
          domain: "en.wikipedia.org",
        },
        {
          url: "https://en.wikipedia.org/wiki/Relational_model",
          title: "Relational Model & Database Normalization",
          snippet: "Core principles of relation tables, foreign keys, and third normal form schema design.",
          domain: "en.wikipedia.org",
        },
        {
          url: "https://www.sqlite.org/queryplanner.html",
          title: "The SQLite Query Planner & Index Optimization",
          snippet: "How database engines analyze expressions, scan tables, and optimize multi-table query plans.",
          domain: "sqlite.org",
        }
      );
    } else if (cleanQuery.includes("warehouse") || cleanQuery.includes("star schema") || cleanQuery.includes("dimensional")) {
      results.push(
        {
          url: "https://en.wikipedia.org/wiki/Data_warehouse",
          title: "Data Warehousing Architecture & Core Principles",
          snippet: "Central repositories of integrated data from disparate sources, optimized for reporting and analysis.",
          domain: "en.wikipedia.org",
        },
        {
          url: "https://en.wikipedia.org/wiki/Star_schema",
          title: "Star Schema & Dimensional Modeling",
          snippet: "Fact tables and dimension tables design for lightning-fast business intelligence queries.",
          domain: "en.wikipedia.org",
        }
      );
    } else if (cleanQuery.includes("ingest") || cleanQuery.includes("api") || cleanQuery.includes("etl")) {
      results.push(
        {
          url: "https://en.wikipedia.org/wiki/Extract,_transform,_load",
          title: "ETL Architecture & Pipeline Patterns",
          snippet: "Data integration patterns for extracting from sources, transforming formats, and loading targets.",
          domain: "en.wikipedia.org",
        },
        {
          url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
          title: "Using the Fetch API - MDN Web Docs",
          snippet: "How to fetch remote data over HTTP, handle REST responses, and manage streaming requests.",
          domain: "developer.mozilla.org",
        }
      );
    } else if (cleanQuery.includes("pandas") || cleanQuery.includes("polars") || cleanQuery.includes("batch")) {
      results.push(
        {
          url: "https://pandas.pydata.org/docs/user_guide/10min.html",
          title: "10 Minutes to Pandas - Official User Guide",
          snippet: "Practical hands-on introduction to DataFrames, series filtering, aggregation, and grouping.",
          domain: "pandas.pydata.org",
        },
        {
          url: "https://docs.python.org/3/tutorial/datastructures.html",
          title: "Data Structures - Python Official Documentation",
          snippet: "Efficient manipulation of lists, dictionaries, sets, and comprehension loops for data workflows.",
          domain: "docs.python.org",
        }
      );
    } else if (cleanQuery.includes("spark") || cleanQuery.includes("distributed")) {
      results.push(
        {
          url: "https://spark.apache.org/docs/latest/quick-start.html",
          title: "Apache Spark Quick Start & PySpark Basics",
          snippet: "Distributed dataset transformations, lazy evaluation, cluster nodes, and DataFrame operations.",
          domain: "spark.apache.org",
        },
        {
          url: "https://en.wikipedia.org/wiki/Apache_Spark",
          title: "Apache Spark - Architecture & Distributed Processing",
          snippet: "Unified analytics engine for large-scale data processing across clusters.",
          domain: "en.wikipedia.org",
        }
      );
    } else if (cleanQuery.includes("airflow") || cleanQuery.includes("orchestrat") || cleanQuery.includes("dag")) {
      results.push(
        {
          url: "https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dags.html",
          title: "DAGs & Task Pipelines - Apache Airflow Guide",
          snippet: "Authoring directed acyclic graphs, operator dependencies, sensors, and execution schedules.",
          domain: "airflow.apache.org",
        },
        {
          url: "https://en.wikipedia.org/wiki/Apache_Airflow",
          title: "Apache Airflow Overview & Best Practices",
          snippet: "Open-source workflow management platform for authoring, scheduling, and monitoring workflows.",
          domain: "en.wikipedia.org",
        }
      );
    } else if (cleanQuery.includes("lake") || cleanQuery.includes("parquet") || cleanQuery.includes("iceberg") || cleanQuery.includes("storage")) {
      results.push(
        {
          url: "https://en.wikipedia.org/wiki/Apache_Parquet",
          title: "Apache Parquet - Columnar Storage Format",
          snippet: "Efficient data storage and encoding schemes for big data query engines.",
          domain: "en.wikipedia.org",
        },
        {
          url: "https://en.wikipedia.org/wiki/Data_lake",
          title: "Data Lake Storage & Object Repositories",
          snippet: "Centralized storage repositories that hold vast amounts of raw data in native formats.",
          domain: "en.wikipedia.org",
        }
      );
    } else if (cleanQuery.includes("dbt") || cleanQuery.includes("transform")) {
      results.push(
        {
          url: "https://docs.getdbt.com/docs/build/models",
          title: "Building Models - dbt Documentation",
          snippet: "Transforming raw warehouse data into modular, testable, and version-controlled SQL models.",
          domain: "docs.getdbt.com",
        },
        {
          url: "https://en.wikipedia.org/wiki/Data_transformation_(computing)",
          title: "Data Transformation Concepts & Lineage",
          snippet: "Converting data from source format into destination format with validation and tests.",
          domain: "en.wikipedia.org",
        }
      );
    } else if (cleanQuery.includes("kafka") || cleanQuery.includes("stream") || cleanQuery.includes("queue")) {
      results.push(
        {
          url: "https://kafka.apache.org/documentation/",
          title: "Apache Kafka Core Documentation & Architecture",
          snippet: "Distributed event streaming platform for high-throughput, low-latency data pipelines.",
          domain: "kafka.apache.org",
        },
        {
          url: "https://en.wikipedia.org/wiki/Apache_Kafka",
          title: "Event Streaming Foundations with Kafka",
          snippet: "Topics, partitions, consumer groups, and replayable distributed commit logs.",
          domain: "en.wikipedia.org",
        }
      );
    } else if (cleanQuery.includes("quality") || cleanQuery.includes("observability") || cleanQuery.includes("monitor")) {
      results.push(
        {
          url: "https://en.wikipedia.org/wiki/Data_quality",
          title: "Data Quality - Metrics, Profiling, and Anomaly Detection",
          snippet: "Ensuring accuracy, completeness, timeliness, and validity across data pipelines.",
          domain: "en.wikipedia.org",
        },
        {
          url: "https://en.wikipedia.org/wiki/Observability_(software)",
          title: "Observability - Logs, Metrics, and Tracing",
          snippet: "Understanding internal system state based on external pipeline outputs and telemetry.",
          domain: "en.wikipedia.org",
        }
      );
    } else if (cleanQuery.includes("python")) {
      results.push(
        {
          url: "https://docs.python.org/3/tutorial/datastructures.html",
          title: "Python Data Structures Tutorial",
          snippet: "Lists, tuples, sets, and dictionaries in Python for scripting and data manipulation.",
          domain: "docs.python.org",
        },
        {
          url: "https://en.wikipedia.org/wiki/Python_(programming_language)",
          title: "Python Language Overview & Idioms",
          snippet: "High-level, general-purpose programming language emphasizing code readability.",
          domain: "en.wikipedia.org",
        }
      );
    } else {
      results.push(
        {
          url: "https://developer.mozilla.org/en-US/docs/Learn",
          title: `${options.query} - MDN Web Docs Learning Area`,
          snippet: `Structured learning guides, tutorials, and practical examples for ${options.query}.`,
          domain: "developer.mozilla.org",
        },
        {
          url: "https://en.wikipedia.org/wiki/Computer_science",
          title: `${options.query} - Computer Science Overview`,
          snippet: `Core concepts, algorithmic principles, and architectural foundations for ${options.query}.`,
          domain: "en.wikipedia.org",
        }
      );
    }

    if (this.injectDeadLinks) {
      results.push({
        url: "https://invalid-dead-domain-404.org/broken-resource-page",
        title: "Broken link",
        snippet: "This page does not exist.",
        domain: "invalid-dead-domain-404.org",
      });
    }

    return results.slice(0, options.maxResults || 5);
  }
}
