import { describe, it, expect, vi } from "vitest";
import {
  normalizeUrl,
  assertSearchSourced,
  isSearchSourced,
  vetUrl,
} from "@/lib/discovery/vetting";
import { classifyResourceSchema } from "@/lib/ai/schemas";

describe("L10 Unit Tests · Discovery Vetting & Anti-Hallucination Invariants", () => {
  describe("1. URL Normalization & Deduplication", () => {
    it("strips fragments and common marketing/tracking query parameters", () => {
      const raw =
        "https://example.com/tutorials/sql-joins/?utm_source=twitter&utm_medium=social&utm_campaign=launch&ref=producthunt&fbclid=xyz123#section-3";
      const normalized = normalizeUrl(raw);

      expect(normalized).toBe("https://example.com/tutorials/sql-joins");
    });

    it("lowercases hostname and scheme but preserves path case", () => {
      const raw = "HTTPS://WWW.Postgresql.ORG/docs/current/Indexes-Btree.html/";
      const normalized = normalizeUrl(raw);

      expect(normalized).toBe(
        "https://www.postgresql.org/docs/current/Indexes-Btree.html"
      );
    });

    it("handles root paths and query params without trailing slash issues", () => {
      expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
      expect(normalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
    });
  });

  describe("2. Anti-Hallucination Invariant (NO URL from Model)", () => {
    it("strictly rejects a model-proposed URL not present in the search provider results", () => {
      const searchResults = new Set<string>([
        "https://www.postgresql.org/docs/current/indexes-btree.html",
        "https://use-the-index-luke.com/sql/anatomy",
      ]);

      const hallucinatedModelUrl = "https://fake-hallucinated-guide.com/learn-sql-fast";

      expect(isSearchSourced(hallucinatedModelUrl, searchResults)).toBe(false);
      expect(() =>
        assertSearchSourced(hallucinatedModelUrl, searchResults)
      ).toThrowError(/Resource rejected by anti-hallucination gate/);
    });

    it("accepts candidate URLs that originated from the search provider", () => {
      const searchResults = new Set<string>([
        normalizeUrl("https://www.postgresql.org/docs/current/indexes-btree.html?utm_source=test"),
      ]);

      const validUrl = "https://www.postgresql.org/docs/current/indexes-btree.html";
      expect(isSearchSourced(validUrl, searchResults)).toBe(true);
      expect(() => assertSearchSourced(validUrl, searchResults)).not.toThrow();
    });
  });

  describe("3. SSRF Protection & Dead Link Dropping", () => {
    it("blocks SSRF attempts to private networks, loopbacks, and cloud metadata", async () => {
      const privateTargets = [
        "http://localhost:3000/internal",
        "http://127.0.0.1:8080/admin",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/api",
        "http://192.168.1.1/router",
      ];

      for (const target of privateTargets) {
        const result = await vetUrl(target);
        expect(result.isHealthy).toBe(false);
        expect(result.error).toMatch(/SSRF/i);
      }
    });

    it("drops dead links (e.g. 404 or 500) and marks them unhealthy", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      } as Response);

      const result = await vetUrl("https://example.com/broken-page-404", {
        customFetch: mockFetch as any,
      });

      expect(result.isHealthy).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(result.error).toContain("404");
    });

    it("accepts live pages returning 200 OK or redirects resolving to 200", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
      } as Response);

      const result = await vetUrl("https://developer.mozilla.org/en-US/docs/Web/SQL", {
        customFetch: mockFetch as any,
      });

      expect(result.isHealthy).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.domain).toBe("developer.mozilla.org");
    });
  });

  describe("4. Batch Classification Schema Validation", () => {
    it("validates a batch of up to 10 candidates matching classify_resource schema", () => {
      const validBatch = {
        candidates: [
          {
            url: "https://example.com/article1",
            type: "article",
            estimated_minutes: 20,
            relevance: 0.95,
          },
          {
            url: "https://example.com/video1",
            type: "video",
            estimated_minutes: 45,
            relevance: 0.88,
          },
        ],
      };

      const parseResult = classifyResourceSchema.safeParse(validBatch);
      expect(parseResult.success).toBe(true);
    });

    it("rejects batches with invalid types or out-of-range relevance", () => {
      const invalidBatch = {
        candidates: [
          {
            url: "https://example.com/bad",
            type: "invalid_media_type",
            estimated_minutes: 20,
            relevance: 0.95,
          },
        ],
      };

      expect(classifyResourceSchema.safeParse(invalidBatch).success).toBe(false);
    });
  });
});
