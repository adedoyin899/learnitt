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
      // Dynamic live search for ANY learning field (Art, Music, Cooking, Science, Tech, etc.)
      let fetchedDynamically = false;
      try {
        const cleanForSearch =
          options.query
            .replace(
              /\b(beginner|intermediate|advanced|practical|guide|tutorial|best practices|documentation|reference|how to|examples)\b/gi,
              ""
            )
            .replace(/[&/\\#,+()$~%.'":*?<>{}]/g, " ")
            .replace(/\s+/g, " ")
            .trim() || options.query;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const searchApiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
          cleanForSearch
        )}&format=json&utf8=1`;
        const res = await fetch(searchApiUrl, {
          signal: controller.signal,
          headers: { "User-Agent": "Learnitt-Bot/1.0 (+https://learnitt.app)" },
        });
        clearTimeout(timer);

        if (res.ok) {
          const data = (await res.json()) as {
            query?: { search?: Array<{ title?: string; snippet?: string }> };
          };
          const items = data.query?.search || [];
          if (items.length > 0) {
            for (const item of items.slice(0, options.maxResults || 4)) {
              if (!item.title) continue;
              const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`;
              results.push({
                url: articleUrl,
                title: item.title,
                snippet: (item.snippet || "").replace(/<[^>]+>/g, ""),
                domain: "en.wikipedia.org",
              });
            }
            fetchedDynamically = true;
          }
        }
      } catch {
        // Fall back gracefully if offline or request times out
      }

      if (!fetchedDynamically) {
        if (
          cleanQuery.includes("art") ||
          cleanQuery.includes("paint") ||
          cleanQuery.includes("draw") ||
          cleanQuery.includes("color")
        ) {
          results.push(
            {
              url: "https://en.wikipedia.org/wiki/Color_theory",
              title: "Color Theory & Harmonies",
              snippet: "Practical guidance to color mixing and the visual effects of specific color combinations.",
              domain: "en.wikipedia.org",
            },
            {
              url: "https://en.wikipedia.org/wiki/Chiaroscuro",
              title: "Chiaroscuro & Value Contrast",
              snippet: "The use of strong contrasts between light and dark in artistic compositions.",
              domain: "en.wikipedia.org",
            },
            {
              url: "https://en.wikipedia.org/wiki/Oil_painting",
              title: "Oil Painting Techniques & Mediums",
              snippet: "The process of painting with pigments bound with a medium of drying oil.",
              domain: "en.wikipedia.org",
            }
          );
        } else if (
          cleanQuery.includes("music") ||
          cleanQuery.includes("piano") ||
          cleanQuery.includes("guitar") ||
          cleanQuery.includes("scale") ||
          cleanQuery.includes("chord") ||
          cleanQuery.includes("notation") ||
          cleanQuery.includes("clef") ||
          cleanQuery.includes("rhythm") ||
          cleanQuery.includes("metronome") ||
          cleanQuery.includes("pedal") ||
          cleanQuery.includes("sight-reading") ||
          cleanQuery.includes("triad") ||
          cleanQuery.includes("arpeggio") ||
          cleanQuery.includes("repertoire") ||
          cleanQuery.includes("keyboard")
        ) {
          results.push(
            {
              url: "https://en.wikipedia.org/wiki/Piano",
              title: "Piano Technique, Keyboard Layout & Mechanics",
              snippet: "Comprehensive guide to acoustic and digital pianos, keyboard posture, pedaling, and finger dexterity.",
              domain: "en.wikipedia.org",
            },
            {
              url: "https://en.wikipedia.org/wiki/Music_theory",
              title: "Music Theory, Scales & Chord Progressions",
              snippet: "The practices and possibilities of music, harmony, scales, counterpoint, and rhythm.",
              domain: "en.wikipedia.org",
            },
            {
              url: "https://en.wikipedia.org/wiki/Musical_notation",
              title: "Musical Notation, Grand Staff & Sight-Reading",
              snippet: "Reading treble and bass clefs, key signatures, time signatures, and rhythmic subdivisions.",
              domain: "en.wikipedia.org",
            }
          );
        } else if (
          cleanQuery.includes("cook") ||
          cleanQuery.includes("pastry") ||
          cleanQuery.includes("baking")
        ) {
          results.push(
            {
              url: "https://en.wikipedia.org/wiki/Pastry",
              title: "Pastry Doughs & Baking Methods",
              snippet: "Techniques for laminating dough, blind baking, and classic European pastries.",
              domain: "en.wikipedia.org",
            },
            {
              url: "https://en.wikipedia.org/wiki/French_cuisine",
              title: "French Culinary Techniques",
              snippet: "Traditional cooking methods, sauces, and culinary foundations of French cuisine.",
              domain: "en.wikipedia.org",
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
      }
    }

    if (this.injectDeadLinks) {
      results.unshift({
        url: "https://invalid-dead-domain-404.org/broken-resource-page",
        title: "Broken link",
        snippet: "This page does not exist.",
        domain: "invalid-dead-domain-404.org",
      });
    }

    return results.slice(0, options.maxResults || 5);
  }
}
