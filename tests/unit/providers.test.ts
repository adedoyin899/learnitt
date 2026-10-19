import { describe, it, expect, beforeEach } from "vitest";
import {
  getAIProvider,
  getSearchProvider,
  getEmailProvider,
  getPushProvider,
  resetProviderInstances,
} from "@/lib/providers/registry";

describe("Mock Providers (src/lib/providers)", () => {
  beforeEach(() => {
    resetProviderInstances();
  });

  it("resolves MockAIProvider and returns deterministic fixtures", async () => {
    const ai = getAIProvider();
    expect(ai.id).toBe("mock-ai");

    const result = await ai.generateStructured<{ skills: Array<{ id: string; name: string }> }>({
      task: "skill_graph",
      system: "You are a curriculum designer",
      user: "Junior Data Engineer in 6 months",
      schema: {},
    });

    expect(result.data.skills).toBeDefined();
    expect(result.data.skills.length).toBeGreaterThan(0);
    expect(result.data.skills[0].id).toBe("sk_sql_basics");
    expect(result.modelVersion).toContain("mock-ai");
  });

  it("resolves MockSearchProvider and returns deterministic results", async () => {
    const search = getSearchProvider();
    expect(search.id).toBe("mock-search");

    const results = await search.search("SQL joins tutorial", 2);
    expect(results).toHaveLength(2);
    expect(results[0].url).toContain("postgresql.org");
    expect(results[0].domain).toBe("postgresql.org");
  });

  it("resolves MockEmailProvider and tracks sent emails in memory", async () => {
    const email = getEmailProvider();
    expect(email.id).toBe("mock-email");

    const response = await email.send({
      to: "maz@learnitt.com",
      subject: "Today's learning session",
      html: "<p>Dimensional modelling in 45 min</p>",
    });

    expect(response.success).toBe(true);
    expect(response.id).toContain("mock-email-");
  });

  it("resolves MockPushProvider and tracks push notifications", async () => {
    const push = getPushProvider();
    expect(push.id).toBe("mock-push");

    const response = await push.send(
      {
        endpoint: "https://fcm.googleapis.com/mock-endpoint",
        keys: { p256dh: "key", auth: "auth" },
      },
      {
        title: "Study session due",
        body: "Today: SQL Joins, 45 min. MVD: 15 min.",
      }
    );

    expect(response.success).toBe(true);
  });
});
