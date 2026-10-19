import { SearchProvider, SearchResult } from "../types";

export class MockSearchProvider implements SearchProvider {
  readonly id = "mock-search";

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const fixtureResults: SearchResult[] = [
      {
        url: "https://www.postgresql.org/docs/current/tutorial-sql.html",
        title: "PostgreSQL Tutorial - The SQL Language",
        snippet: "An introduction to SQL syntax, queries, joins, and aggregates in PostgreSQL.",
        domain: "postgresql.org",
      },
      {
        url: "https://sqlbolt.com/lesson/select_queries_introduction",
        title: "SQLBolt - Introduction to SELECT queries",
        snippet: "Interactive lessons covering basic filtering, joins, and aggregations.",
        domain: "sqlbolt.com",
      },
      {
        url: "https://mode.com/sql-tutorial/introduction-to-sql",
        title: "Mode SQL Tutorial for Data Analysis",
        snippet: "Comprehensive guide to SQL queries tailored for data analytics and data engineering.",
        domain: "mode.com",
      },
    ];

    return fixtureResults.slice(0, maxResults);
  }
}
