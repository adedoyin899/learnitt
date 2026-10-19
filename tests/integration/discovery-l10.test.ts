import { describe, expect, it, vi } from "vitest";
import { MockSearchProvider } from "@/lib/search/mock-provider";
import { MockAIProvider } from "@/lib/ai/adapters/mock-adapter";
import {
  discoverResourcesForGoal,
  approveResource,
  rejectResource,
  approveSkillResources,
  assertResourceApprovedForPlan,
} from "@/lib/discovery/service";
import { assertSearchSourced, normalizeUrl } from "@/lib/discovery/vetting";
import { runWorkerTick } from "@/lib/ai/jobs/worker";

describe("Phase L10 Integration Suite · Resource Discovery with Vetting & Approval Queue", () => {
  function createTestDb() {
    const goals: any[] = [];
    const skills: any[] = [];
    const skillMaterialLinks: any[] = [];
    const resources: any[] = [];
    const resourceExclusions: any[] = [];
    const planItems: any[] = [];
    const aiJobs: any[] = [];

    const getTable = (table: string): any[] => {
      if (table === "goals") return goals;
      if (table === "skills") return skills;
      if (table === "skill_material_links") return skillMaterialLinks;
      if (table === "resources") return resources;
      if (table === "resource_exclusions") return resourceExclusions;
      if (table === "plan_items") return planItems;
      if (table === "ai_jobs") return aiJobs;
      return [];
    };

    const dbClient: any = {
      _tables: {
        goals,
        skills,
        skillMaterialLinks,
        resources,
        resourceExclusions,
        planItems,
        aiJobs,
      },
      from: (table: string) => {
        const state: any = {
          _filters: [] as Array<(item: any) => boolean>,
          _orders: [] as Array<{ col: string; asc: boolean }>,
          _limit: null as number | null,
        };

        const builder: any = {
          select: (_cols?: string) => builder,
          insert: (val: any) => {
            const items = Array.isArray(val) ? val : [val];
            const list = getTable(table);
            const inserted = items.map((it: any) => {
              const row = {
                id: it.id || crypto.randomUUID(),
                created_at: it.created_at || new Date().toISOString(),
                ...it,
              };
              list.push(row);
              return row;
            });

            return {
              select: () => ({
                single: async () => ({ data: inserted[0], error: null }),
                maybeSingle: async () => ({ data: inserted[0], error: null }),
                then: (res: any) => res({ data: inserted, error: null }),
              }),
              then: (res: any) => res({ data: inserted, error: null }),
            };
          },
          upsert: (val: any, opts?: any) => {
            const items = Array.isArray(val) ? val : [val];
            const list = getTable(table);
            items.forEach((it: any) => {
              const row = {
                id: it.id || crypto.randomUUID(),
                created_at: it.created_at || new Date().toISOString(),
                ...it,
              };
              if (table === "resource_exclusions") {
                const idx = list.findIndex(
                  (r) => r.goal_id === it.goal_id && r.url === it.url
                );
                if (idx >= 0) list[idx] = { ...list[idx], ...row };
                else list.push(row);
              } else {
                list.push(row);
              }
            });
            return Promise.resolve({ error: null });
          },
          update: (val: any) => {
            const updateFilters: Array<(item: any) => boolean> = [];
            const updateBuilder: any = {
              eq: (col: string, targetVal: any) => {
                updateFilters.push((item) => item[col] === targetVal);
                return updateBuilder;
              },
              or: (_expr: string) => updateBuilder,
              select: (_cols?: string) => ({
                single: async () => {
                  const list = getTable(table);
                  const matched = list.filter((item) =>
                    updateFilters.every((f) => f(item))
                  );
                  if (matched.length > 0) {
                    Object.assign(matched[0], val);
                    return { data: matched[0], error: null };
                  }
                  return { data: null, error: null };
                },
                maybeSingle: async () => {
                  const list = getTable(table);
                  const matched = list.filter((item) =>
                    updateFilters.every((f) => f(item))
                  );
                  if (matched.length > 0) {
                    Object.assign(matched[0], val);
                    return { data: matched[0], error: null };
                  }
                  return { data: null, error: null };
                },
              }),
              then: (res: any) => {
                const list = getTable(table);
                list
                  .filter((item) => updateFilters.every((f) => f(item)))
                  .forEach((item) => Object.assign(item, val));
                return res({ error: null });
              },
            };
            return updateBuilder;
          },
          eq: (col: string, val: any) => {
            state._filters.push((it: any) => it[col] === val);
            return builder;
          },
          is: (col: string, val: any) => {
            state._filters.push((it: any) => it[col] === val);
            return builder;
          },
          in: (col: string, vals: any[]) => {
            const set = new Set(vals);
            state._filters.push((it: any) => set.has(it[col]));
            return builder;
          },
          or: (_expr: string) => builder,
          lte: (col: string, val: any) => {
            state._filters.push((it: any) => it[col] <= val);
            return builder;
          },
          gte: (col: string, val: any) => {
            state._filters.push((it: any) => it[col] >= val);
            return builder;
          },
          contains: (col: string, val: any) => {
            state._filters.push((it: any) => {
              if (typeof val === "object" && typeof it[col] === "object") {
                return Object.entries(val).every(
                  ([k, v]) => it[col]?.[k] === v
                );
              }
              return true;
            });
            return builder;
          },
          order: (col: string, opts?: { ascending?: boolean }) => {
            state._orders.push({ col, asc: opts?.ascending ?? true });
            return builder;
          },
          limit: (n: number) => {
            state._limit = n;
            return builder;
          },
          single: async () => {
            const list = getTable(table);
            const filtered = list.filter((it) =>
              state._filters.every((f: any) => f(it))
            );
            return { data: filtered[0] || null, error: null };
          },
          maybeSingle: async () => {
            const list = getTable(table);
            const filtered = list.filter((it) =>
              state._filters.every((f: any) => f(it))
            );
            return { data: filtered[0] || null, error: null };
          },
          then: (res: any) => {
            const list = getTable(table);
            let filtered = list.filter((it) =>
              state._filters.every((f: any) => f(it))
            );
            if (state._limit !== null) {
              filtered = filtered.slice(0, state._limit);
            }
            return res({ data: filtered, error: null });
          },
        };

        return builder;
      },
    };

    return { dbClient, ...dbClient._tables };
  }

  it("1. runs discovery for three skills, reviews candidates with provenance, and approves some", async () => {
    const { dbClient, skills, goals, planItems, resources } = createTestDb();
    const ownerId = "user_l10_01";
    const goalId = "goal_db_internals";

    // Setup Goal
    goals.push({ id: goalId, owner_id: ownerId, title: "Database Systems Mastery" });

    // Setup 3 skills lacking material
    const s1 = { id: "sk_btree", goal_id: goalId, name: "B-Tree Indexes", level: "intermediate" };
    const s2 = { id: "sk_wal", goal_id: goalId, name: "Write-Ahead Logging", level: "advanced" };
    const s3 = { id: "sk_vacuum", goal_id: goalId, name: "MVCC and VACUUM", level: "intermediate" };
    skills.push(s1, s2, s3);

    // Setup empty plan items awaiting resources
    planItems.push(
      {
        id: "plan_item_01",
        owner_id: ownerId,
        goal_id: goalId,
        skill_id: s1.id,
        scheduled_date: "2026-10-25",
        resource_id: null,
      },
      {
        id: "plan_item_02",
        owner_id: ownerId,
        goal_id: goalId,
        skill_id: s2.id,
        scheduled_date: "2026-10-26",
        resource_id: null,
      }
    );

    const searchProvider = new MockSearchProvider();
    const aiProvider = new MockAIProvider();
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("invalid-dead-domain-404")) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    // Run discovery
    const result = await discoverResourcesForGoal({
      goalId,
      ownerId,
      dbClient,
      searchProvider,
      aiProvider,
      maxSkillsToDiscover: 3,
      customFetch: mockFetch as any,
    });

    expect(result.skillsEvaluated).toBe(3);
    expect(result.resourcesCreated.length).toBeGreaterThanOrEqual(3);

    // Verify provenance is stored on each resource
    for (const res of resources) {
      expect(res.found_by_query).toBeTruthy();
      expect(res.search_provider).toBe("mock-search");
      expect(res.found_at).toBeTruthy();
      expect(res.approval).toBe("pending");
      expect(res.status).toBe("ok");
      expect(["course", "article", "video", "book", "exercise", "docs", "other"]).toContain(
        res.type
      );
      expect(res.estimated_minutes).toBeGreaterThan(0);
      expect(res.relevance).toBeGreaterThan(0);
    }

    // Approve one candidate resource
    const targetResource = resources[0];
    const approvalResult = await approveResource(targetResource.id, ownerId, dbClient);

    expect(approvalResult.resource.approval).toBe("approved");
    expect(approvalResult.attachedPlanItemIds.length).toBe(1);
    expect(approvalResult.attachedPlanItemIds[0]).toBe("plan_item_01");

    // Verify plan item has resource_id attached
    const attachedPlanItem = planItems.find((p: any) => p.id === "plan_item_01");
    expect(attachedPlanItem.resource_id).toBe(targetResource.id);
  });

  it("2. strictly rejects model-proposed URLs that did not originate from the search provider", async () => {
    const searchProvidedUrls = new Set<string>([
      normalizeUrl("https://www.postgresql.org/docs/current/indexes-btree.html"),
      normalizeUrl("https://use-the-index-luke.com/sql/anatomy"),
    ]);

    const hallucinatedUrl = "https://unverified-external-blog.org/cheap-sql-tricks";

    expect(() => assertSearchSourced(hallucinatedUrl, searchProvidedUrls)).toThrowError(
      /Resource rejected by anti-hallucination gate/
    );
  });

  it("3. drops dead links and counts them in logs", async () => {
    const { dbClient, skills, goals } = createTestDb();
    const ownerId = "user_l10_02";
    const goalId = "goal_dead_links";

    goals.push({ id: goalId, owner_id: ownerId, title: "Dead Links Test" });
    skills.push({ id: "sk_dead", goal_id: goalId, name: "Dead Link Topic", level: "beginner" });

    // Enable dead link injection on mock search provider
    const searchProvider = new MockSearchProvider();
    searchProvider.injectDeadLinks = true;

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("invalid-dead-domain-404")) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    const result = await discoverResourcesForGoal({
      goalId,
      ownerId,
      dbClient,
      searchProvider,
      maxSkillsToDiscover: 1,
      customFetch: mockFetch as any,
    });

    // Dead link was dropped and counted
    expect(result.deadDroppedCount).toBeGreaterThan(0);
    // Dead link is NOT added to resources table
    const allResources = dbClient._tables.resources;
    expect(
      allResources.some((r: any) => r.url.includes("invalid-dead-domain-404"))
    ).toBe(false);
  });

  it("4. rejects/excludes resources and ensures excluded URLs never reappear on second runs", async () => {
    const { dbClient, skills, goals, resources, resourceExclusions } = createTestDb();
    const ownerId = "user_l10_03";
    const goalId = "goal_exclusions";

    goals.push({ id: goalId, owner_id: ownerId, title: "Exclusion Invariant Test" });
    skills.push({ id: "sk_b_tree", goal_id: goalId, name: "B-Tree Indexes", level: "beginner" });

    const searchProvider = new MockSearchProvider();
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      return Promise.resolve({ ok: true, status: 200 } as Response);
    });

    // First discovery run
    const firstRun = await discoverResourcesForGoal({
      goalId,
      ownerId,
      dbClient,
      searchProvider,
      maxSkillsToDiscover: 1,
      customFetch: mockFetch as any,
    });

    expect(firstRun.resourcesCreated.length).toBeGreaterThan(0);
    const rejectedTarget = resources[0];

    // Reject and mark 'not useful'
    const rejectRes = await rejectResource(
      rejectedTarget.id,
      ownerId,
      "Not useful",
      dbClient
    );
    expect(rejectRes.resource.approval).toBe("rejected");
    expect(rejectRes.exclusionCreated).toBe(true);

    // Verify written to resource_exclusions table
    expect(resourceExclusions.length).toBe(1);
    expect(resourceExclusions[0].goal_id).toBe(goalId);
    expect(resourceExclusions[0].url).toBe(normalizeUrl(rejectedTarget.url));

    // Clear resources to simulate fresh second run
    resources.length = 0;

    // Second discovery run
    const secondRun = await discoverResourcesForGoal({
      goalId,
      ownerId,
      dbClient,
      searchProvider,
      maxSkillsToDiscover: 1,
      customFetch: mockFetch as any,
    });

    // The excluded URL must be skipped and never reappear!
    expect(secondRun.excludedSkippedCount).toBeGreaterThanOrEqual(1);
    expect(
      resources.some((r: any) => normalizeUrl(r.url) === normalizeUrl(rejectedTarget.url))
    ).toBe(false);
  });

  it("5. approval gate blocks unapproved resources from entering the plan", async () => {
    const { dbClient, resources } = createTestDb();

    // Add unapproved (pending) resource
    const pendingRes = {
      id: "res_pending_01",
      approval: "pending",
      url: "https://example.com/unapproved",
    };
    resources.push(pendingRes);

    await expect(
      assertResourceApprovedForPlan(pendingRes.id, dbClient)
    ).rejects.toThrowError(/Approval gate violation/);

    // Add rejected resource
    const rejectedRes = {
      id: "res_rejected_01",
      approval: "rejected",
      url: "https://example.com/rejected",
    };
    resources.push(rejectedRes);

    await expect(
      assertResourceApprovedForPlan(rejectedRes.id, dbClient)
    ).rejects.toThrowError(/Approval gate violation/);

    // Add approved resource
    const approvedRes = {
      id: "res_approved_01",
      approval: "approved",
      url: "https://example.com/approved",
    };
    resources.push(approvedRes);

    await expect(
      assertResourceApprovedForPlan(approvedRes.id, dbClient)
    ).resolves.not.toThrow();
  });

  it("6. supports approving all resources for a specific skill", async () => {
    const { dbClient, skills, goals, resources, planItems } = createTestDb();
    const ownerId = "user_l10_04";
    const goalId = "goal_skill_approval";
    const skillId = "sk_indexing";

    goals.push({ id: goalId, owner_id: ownerId, title: "Skill Batch Approval" });
    skills.push({ id: skillId, goal_id: goalId, name: "Indexing Basics" });

    resources.push(
      {
        id: "res_01",
        owner_id: ownerId,
        goal_id: goalId,
        skill_id: skillId,
        approval: "pending",
        url: "https://example.com/1",
      },
      {
        id: "res_02",
        owner_id: ownerId,
        goal_id: goalId,
        skill_id: skillId,
        approval: "pending",
        url: "https://example.com/2",
      }
    );

    planItems.push({
      id: "plan_item_skill_01",
      owner_id: ownerId,
      goal_id: goalId,
      skill_id: skillId,
      resource_id: null,
    });

    const approveAllResult = await approveSkillResources(
      skillId,
      goalId,
      ownerId,
      dbClient
    );

    expect(approveAllResult.approvedCount).toBe(2);
    expect(resources.every((r: any) => r.approval === "approved")).toBe(true);
    expect(planItems[0].resource_id).toBeTruthy();
  });

  it("7. cap reached pauses the discovery job cleanly with visible status paused_cap", async () => {
    const { dbClient, aiJobs, goals, skills } = createTestDb();
    const ownerId = "user_l10_05";
    const goalId = "goal_cap_test";

    goals.push({ id: goalId, owner_id: ownerId, title: "Cap Test Goal" });
    skills.push({ id: "sk_cap", goal_id: goalId, name: "B-Tree Indexes" });

    // Enqueue discovery job
    const jobId = "job_discovery_cap_01";
    aiJobs.push({
      id: jobId,
      owner_id: ownerId,
      task: "search_queries",
      payload: { goal_id: goalId },
      status: "queued",
      attempts: 0,
      run_after: new Date(Date.now() - 1000).toISOString(),
      locked_until: null,
    });

    // Mock search provider with 0 remaining daily quota to simulate quota exhaustion
    const searchProvider = new MockSearchProvider({ dailyCap: 0 });
    const { setSearchProvider } = await import("@/lib/search/registry");
    setSearchProvider(searchProvider);

    try {
      const tickResult = await runWorkerTick({
        dbClient,
      });

      expect(tickResult.processed).toBe(1);
      const job = aiJobs.find((j: any) => j.id === jobId);
      expect(job.status).toBe("paused_cap");
      expect(job.last_error).toMatch(/cap/i);
    } finally {
      setSearchProvider(null);
    }
  });
});
