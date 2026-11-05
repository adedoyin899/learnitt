import { describe, it, expect, beforeEach } from "vitest";
import { MockSearchProvider } from "@/lib/search/mock-provider";
import { MockAIProvider } from "@/lib/ai/adapters/mock-adapter";
import { discoverResourcesForGoal, approveResource } from "@/lib/discovery/service";

class InMemoryDbAdapter {
  public tables: Record<string, any[]> = {
    goals: [],
    skills: [],
    skill_material_links: [],
    resource_exclusions: [],
    resources: [],
    plan_items: [],
  };

  from(table: string) {
    const rows = this.tables[table] || [];

    const builder: any = {
      _filters: [] as ((row: any) => boolean)[],
      _selectedFields: null as string[] | null,
      _orderBy: null as { field: string; ascending: boolean } | null,
      _limitCount: null as number | null,

      eq(field: string, val: any) {
        builder._filters.push((r: any) => r[field] === val);
        return builder;
      },
      neq(field: string, val: any) {
        builder._filters.push((r: any) => r[field] !== val);
        return builder;
      },
      in(field: string, vals: any[]) {
        builder._filters.push((r: any) => vals.includes(r[field]));
        return builder;
      },
      is(field: string, val: any) {
        builder._filters.push((r: any) => r[field] === val);
        return builder;
      },
      order(field: string, opts = { ascending: true }) {
        builder._orderBy = { field, ascending: opts.ascending };
        return builder;
      },
      limit(n: number) {
        builder._limitCount = n;
        return builder;
      },
      update(updates: any) {
        builder._updateData = updates;
        return builder;
      },
      select(fields = "*") {
        builder._selectedFields = fields === "*" ? null : fields.split(",").map((f: string) => f.trim());
        return builder;
      },
      insert(newRows: any | any[]) {
        const toAdd = Array.isArray(newRows) ? newRows : [newRows];
        const withIds = toAdd.map((r, i) => ({
          id: r.id || `gen_id_${Date.now()}_${i}`,
          ...r,
        }));
        rows.push(...withIds);
        builder._insertedData = withIds;
        return builder;
      },
      async single() {
        if (builder._updateData) {
          for (let i = 0; i < rows.length; i++) {
            if (builder._filters.every((f: any) => f(rows[i]))) {
              rows[i] = { ...rows[i], ...builder._updateData };
              return { data: rows[i], error: null };
            }
          }
        }
        const filtered = rows.filter((r: any) => builder._filters.every((f: any) => f(r)));
        return { data: filtered[0] || null, error: null };
      },
      then(resolve: any) {
        if (builder._insertedData) {
          return resolve({ data: builder._insertedData, error: null });
        }
        if (builder._updateData) {
          const updated: any[] = [];
          for (let i = 0; i < rows.length; i++) {
            if (builder._filters.every((f: any) => f(rows[i]))) {
              rows[i] = { ...rows[i], ...builder._updateData };
              updated.push(rows[i]);
            }
          }
          return resolve({ data: updated, error: null });
        }
        let filtered = rows.filter((r: any) => builder._filters.every((f: any) => f(r)));
        if (builder._limitCount) {
          filtered = filtered.slice(0, builder._limitCount);
        }
        resolve({ data: filtered, error: null });
      },
    };

    return builder;
  }
}

describe("Dynamic Field Goals & Learning Resources (PRD Dynamic Curriculum)", () => {
  let db: InMemoryDbAdapter;
  const ownerId = "user_art_enthusiast";
  const goalId = "goal_art_mastery";

  beforeEach(() => {
    db = new InMemoryDbAdapter();
    db.tables.goals.push({
      id: goalId,
      owner_id: ownerId,
      title: "Master Oil Painting & Visual Arts in 6 Months",
      domain: "Arts",
    });
  });

  it("dynamically generates art-specific curriculum and retrieves relevant art guides", async () => {
    const ai = new MockAIProvider();
    const search = new MockSearchProvider();

    // 1. Generate skill graph for Art
    const graphResult = await ai.generateStructured<any>({
      task: "skill_graph",
      system: "Curriculum architect",
      user: "Learner Goal:\nTitle: Master Oil Painting\nDomain: Arts\nStarting Level: beginner",
      schema: {},
      maxOutputTokens: 2000,
      temperature: 0.2,
    });

    expect(graphResult.data.skills).toBeDefined();
    expect(graphResult.data.skills.length).toBeGreaterThanOrEqual(12);

    const firstSkill = graphResult.data.skills[0];
    expect(firstSkill.name.toLowerCase()).toContain("color theory");

    // Seed skills and plan items into db
    db.tables.skills.push({
      id: "sk_art_color",
      goal_id: goalId,
      name: firstSkill.name,
      difficulty: 1,
    });
    db.tables.plan_items.push({
      id: "plan_item_art_01",
      goal_id: goalId,
      skill_id: "sk_art_color",
      owner_id: ownerId,
      scheduled_date: "2026-11-06",
      resource_id: null,
    });

    // 2. Discover resources for the Art skill
    const discResult = await discoverResourcesForGoal({
      goalId,
      ownerId,
      dbClient: db as any,
      searchProvider: search,
      aiProvider: ai,
      maxSkillsToDiscover: 1,
      skillId: "sk_art_color",
    });

    expect(discResult.skillsEvaluated).toBe(1);
    expect(discResult.resourcesCreated.length).toBeGreaterThan(0);

    const topResource = discResult.resourcesCreated[0];
    expect(topResource.title?.toLowerCase() || "").toMatch(/color|art|paint|chiaroscuro/);
    expect(topResource.url).toContain("wikipedia.org");

    // 3. Approve resource and verify it attaches to the art plan item
    const approval = await approveResource(topResource.id, ownerId, db as any);
    expect(approval.resource.approval).toBe("approved");
    expect(approval.attachedPlanItemIds).toContain("plan_item_art_01");

    const updatedPlanItem = db.tables.plan_items.find((p) => p.id === "plan_item_art_01");
    expect(updatedPlanItem.resource_id).toBe(topResource.id);
  });

  it("dynamically generates Piano & Music curriculum and music resources (never SQL)", async () => {
    const ai = new MockAIProvider();
    const search = new MockSearchProvider();

    const graphResult = await ai.generateStructured<any>({
      task: "skill_graph",
      system: "Curriculum architect",
      user: "Learner Goal:\nTitle: Piano lessons\nDomain: Piano musical\nStarting Level: beginner",
      schema: {},
      maxOutputTokens: 2000,
      temperature: 0.2,
    });

    expect(graphResult.data.skills).toBeDefined();
    expect(graphResult.data.skills.length).toBe(12);
    expect(graphResult.data.skills[0].name).toContain("Keyboard Posture");
    expect(
      graphResult.data.skills.some((s: any) => s.name.toLowerCase().includes("sql"))
    ).toBe(false);

    const searchResults = await search.search({
      query: `${graphResult.data.skills[0].name} Piano musical`,
      maxResults: 3,
    });
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].url).toContain("wikipedia.org");
  });

  it("dynamically generates tailored skills for any arbitrary subject (e.g. Culinary Pastry)", async () => {
    const ai = new MockAIProvider();

    const graphResult = await ai.generateStructured<any>({
      task: "skill_graph",
      system: "Curriculum architect",
      user: "Learner Goal:\nTitle: French Pastry & Baking\nDomain: Culinary Arts\nStarting Level: beginner",
      schema: {},
      maxOutputTokens: 2000,
      temperature: 0.2,
    });

    expect(graphResult.data.skills).toBeDefined();
    expect(graphResult.data.skills.length).toBe(12);
    expect(graphResult.data.skills[0].name).toContain("French Pastry & Baking");
    expect(
      graphResult.data.skills.some((s: any) => s.name.toLowerCase().includes("sql"))
    ).toBe(false);
  });
});
