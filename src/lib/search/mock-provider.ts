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
    } else {
      // General technical domain results
      const slug = cleanQuery.replace(/[^a-z0-9]+/g, "-").slice(0, 30);
      results.push(
        {
          url: `https://developer.mozilla.org/en-US/docs/Web/${slug}`,
          title: `${options.query} - MDN Web Docs`,
          snippet: `Comprehensive developer guide, tutorials, and practical examples for ${options.query}.`,
          domain: "developer.mozilla.org",
        },
        {
          url: `https://en.wikipedia.org/wiki/${slug}`,
          title: `${options.query} - Wikipedia Overview`,
          snippet: `Core concepts, mathematical definitions, and foundational principles for ${options.query}.`,
          domain: "wikipedia.org",
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
