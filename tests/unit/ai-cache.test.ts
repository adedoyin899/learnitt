import { describe, expect, it } from "vitest";
import { canonicalize, computeAICacheKey } from "@/lib/ai/cache";

describe("AI Cache Key Determinism", () => {
  it("sorts nested object keys deterministically", () => {
    expect(canonicalize({ b: 2, a: 1 })).toEqual({ a: 1, b: 2 });
  });

  it("canonicalizes object key ordering so identical payloads produce identical cache keys", () => {
    const input1 = {
      title: "Data Engineering",
      options: { level: "beginner", hours: 8 },
      tags: ["sql", "python"],
    };

    const input2 = {
      tags: ["sql", "python"],
      options: { hours: 8, level: "beginner" },
      title: "Data Engineering",
    };

    const key1 = computeAICacheKey({
      task: "skill_graph",
      input: input1,
      providerId: "gemini-flash",
      promptVersion: "1.0.0",
    });

    const key2 = computeAICacheKey({
      task: "skill_graph",
      input: input2,
      providerId: "gemini-flash",
      promptVersion: "1.0.0",
    });

    expect(key1).toBe(key2);
  });

  it("produces different cache keys when task, input, provider, or prompt version changes", () => {
    const baseInput = { title: "Data Engineering" };

    const baseKey = computeAICacheKey({
      task: "skill_graph",
      input: baseInput,
      providerId: "provider-a",
      promptVersion: "1.0.0",
    });

    const diffTask = computeAICacheKey({
      task: "search_queries",
      input: baseInput,
      providerId: "provider-a",
      promptVersion: "1.0.0",
    });
    expect(diffTask).not.toBe(baseKey);

    const diffProvider = computeAICacheKey({
      task: "skill_graph",
      input: baseInput,
      providerId: "provider-b",
      promptVersion: "1.0.0",
    });
    expect(diffProvider).not.toBe(baseKey);

    const diffVersion = computeAICacheKey({
      task: "skill_graph",
      input: baseInput,
      providerId: "provider-a",
      promptVersion: "1.0.1",
    });
    expect(diffVersion).not.toBe(baseKey);
  });
});
