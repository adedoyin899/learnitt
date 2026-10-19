/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { POST as createGoalRoute, GET as listGoalsRoute } from "@/app/api/v1/goals/route";
import { GET as getGoalRoute, PATCH as updateGoalRoute } from "@/app/api/v1/goals/[id]/route";
import { POST as enqueueSkillGraphRoute } from "@/app/api/v1/goals/[id]/skill-graph/route";
import { POST as activateGoalRoute } from "@/app/api/v1/goals/[id]/activate/route";
import { POST as addSkillRoute } from "@/app/api/v1/goals/[id]/skills/route";
import {
  PATCH as editSkillRoute,
  DELETE as deleteSkillRoute,
} from "@/app/api/v1/goals/[id]/skills/[skillId]/route";
import { PUT as reorderSkillsRoute } from "@/app/api/v1/goals/[id]/skills/reorder/route";
import { POST as applyRemedyRoute } from "@/app/api/v1/goals/[id]/feasibility/apply-remedy/route";
import { POST as importPlanRoute } from "@/app/api/v1/goals/import/route";
import { MockAIProvider } from "@/lib/ai/adapters/mock-adapter";
import { runWorkerTick } from "@/lib/ai/jobs/worker";
import * as serverAuth from "@/lib/supabase/server";
import * as serviceAuth from "@/lib/supabase/service-role";
import { createPgliteSupabaseAdapter } from "../db/pglite-adapter";
import { createTestDatabase } from "../db/test-db";

const USER_A = "11111111-1111-1111-1111-111111111111"; // Maz

describe("L3 Integration Suite · Goals, Skill Graph, Feasibility, Import & Activation", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let supabaseAdapter: ReturnType<typeof createPgliteSupabaseAdapter>;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    supabaseAdapter = createPgliteSupabaseAdapter(testDb.db);

    // Mock createServiceRoleClient to use test database adapter
    vi.spyOn(serviceAuth, "createServiceRoleClient").mockReturnValue(
      supabaseAdapter as unknown as ReturnType<typeof serviceAuth.createServiceRoleClient>
    );

    // Mock user session as User A (Maz)
    vi.spyOn(serverAuth, "createClient").mockResolvedValue({
      auth: {
        getUser: async () => ({
          data: {
            user: {
              id: USER_A,
              email: "maz@learnitt.com",
              app_metadata: {},
              user_metadata: {},
              aud: "authenticated",
              created_at: new Date().toISOString(),
            },
          },
          error: null,
        }),
      },
      from: (table: string) =>
        (supabaseAdapter as unknown as { from: (t: string) => unknown }).from(table),
    } as unknown as Awaited<ReturnType<typeof serverAuth.createClient>>);
  });

  it("1. creates a draft goal (S02) and validates future target date", async () => {
    // Past target date should fail validation
    const pastReq = new NextRequest("http://localhost:3000/api/v1/goals", {
      method: "POST",
      body: JSON.stringify({
        title: "Test Past Goal",
        starting_level: "beginner",
        target_date: "2020-01-01",
        weekly_hours: 8,
      }),
    });
    const pastRes = await createGoalRoute(pastReq);
    expect(pastRes.status).toBe(400);

    // Future target date succeeds
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const validReq = new NextRequest("http://localhost:3000/api/v1/goals", {
      method: "POST",
      body: JSON.stringify({
        title: "Modern Data Engineering Mastery",
        domain: "Data Engineering",
        starting_level: "intermediate",
        target_date: futureDate,
        weekly_hours: 10,
        study_days: [1, 2, 3, 4, 5],
      }),
    });
    const validRes = await createGoalRoute(validReq);
    expect(validRes.status).toBe(201);
    const body = await validRes.json();
    expect(body.goal).toBeDefined();
    expect(body.goal.title).toBe("Modern Data Engineering Mastery");
    expect(body.goal.status).toBe("draft");
    expect(body.goal.owner_id).toBe(USER_A);
  });

  it("2. enqueues skill_graph job, worker tick persists graph, and GET returns skills + feasibility", async () => {
    // Create goal
    const futureDate = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const goalRes = await createGoalRoute(
      new NextRequest("http://localhost:3000/api/v1/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Production Data Engineering",
          domain: "Data Engineering",
          starting_level: "intermediate",
          target_date: futureDate,
          weekly_hours: 8,
        }),
      })
    );
    const { goal } = await goalRes.json();

    // Enqueue skill graph job
    const enqueueRes = await enqueueSkillGraphRoute(
      new NextRequest(`http://localhost:3000/api/v1/goals/${goal.id}/skill-graph`, { method: "POST" }),
      { params: Promise.resolve({ id: goal.id }) }
    );
    expect(enqueueRes.status).toBe(202);
    const { jobId } = await enqueueRes.json();
    expect(jobId).toBeDefined();

    // Run worker tick to process the job using MockAIProvider
    const mockProvider = new MockAIProvider();
    const workerRes = await runWorkerTick({
      dbClient: supabaseAdapter,
      provider: mockProvider,
    });
    expect(workerRes.processed).toBeGreaterThanOrEqual(1);

    // GET goal details
    const getRes = await getGoalRoute(
      new NextRequest(`http://localhost:3000/api/v1/goals/${goal.id}`),
      { params: Promise.resolve({ id: goal.id }) }
    );
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.skills.length).toBeGreaterThanOrEqual(12);
    expect(getBody.skills.length).toBeLessThanOrEqual(20);
    expect(getBody.feasibility).toBeDefined();
    expect(getBody.feasibility.band).toBeDefined();
  });

  it("3. edits a skill (rename, estimates, priority) and records a goal_changes row", async () => {
    // Use User A's seeded data engineering goal
    const goalsRes = await listGoalsRoute();
    const { goals } = await goalsRes.json();
    const activeGoal = goals.find((g: { status: string }) => g.status === "active");

    const getRes = await getGoalRoute(
      new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoal.id}`),
      { params: Promise.resolve({ id: activeGoal.id }) }
    );
    const { skills } = await getRes.json();
    const targetSkill = skills[0];

    // Edit skill
    const editReq = new NextRequest(
      `http://localhost:3000/api/v1/goals/${activeGoal.id}/skills/${targetSkill.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: "Advanced SQL & Relational Architectures",
          estimated_min_minutes: 100,
          estimated_max_minutes: 200,
          priority: 1,
        }),
      }
    );
    const editRes = await editSkillRoute(editReq, {
      params: Promise.resolve({ id: activeGoal.id, skillId: targetSkill.id }),
    });
    expect(editRes.status).toBe(200);
    const editBody = await editRes.json();
    expect(editBody.skill.name).toBe("Advanced SQL & Relational Architectures");
    expect(editBody.feasibility).toBeDefined();

    // Add a new skill
    const addRes = await addSkillRoute(
      new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoal.id}/skills`, {
        method: "POST",
        body: JSON.stringify({
          name: "Real-Time Lakehouse Ingestion",
          estimated_min_minutes: 60,
          estimated_max_minutes: 120,
        }),
      }),
      { params: Promise.resolve({ id: activeGoal.id }) }
    );
    expect(addRes.status).toBe(201);

    // Reorder skills
    const reorderRes = await reorderSkillsRoute(
      new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoal.id}/skills/reorder`, {
        method: "PUT",
        body: JSON.stringify({
          skill_ids: [targetSkill.id],
        }),
      }),
      { params: Promise.resolve({ id: activeGoal.id }) }
    );
    expect(reorderRes.status).toBe(200);

    // Update goal config
    const updateGoalRes = await updateGoalRoute(
      new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoal.id}`, {
        method: "PATCH",
        body: JSON.stringify({ weekly_hours: 12 }),
      }),
      { params: Promise.resolve({ id: activeGoal.id }) }
    );
    expect(updateGoalRes.status).toBe(200);

    // Verify goal_changes row was written
    const { data: changes } = await supabaseAdapter
      .from("goal_changes")
      .select("*")
      .eq("goal_id", activeGoal.id)
      .eq("change_type", "graph_edit");

    expect(changes && changes.length > 0).toBe(true);
  });

  it("4. removes skill only with confirmation and rejects unconfirmed removal", async () => {
    const goalsRes = await listGoalsRoute();
    const { goals } = await goalsRes.json();
    const activeGoal = goals.find((g: { status: string }) => g.status === "active");

    const getRes = await getGoalRoute(
      new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoal.id}`),
      { params: Promise.resolve({ id: activeGoal.id }) }
    );
    const { skills } = await getRes.json();
    const skillToDelete = skills[skills.length - 1];

    // Unconfirmed delete MUST be rejected
    const unconfirmedReq = new NextRequest(
      `http://localhost:3000/api/v1/goals/${activeGoal.id}/skills/${skillToDelete.id}`,
      { method: "DELETE" }
    );
    const rejectRes = await deleteSkillRoute(unconfirmedReq, {
      params: Promise.resolve({ id: activeGoal.id, skillId: skillToDelete.id }),
    });
    expect(rejectRes.status).toBe(400);

    // Confirmed delete succeeds
    const confirmedReq = new NextRequest(
      `http://localhost:3000/api/v1/goals/${activeGoal.id}/skills/${skillToDelete.id}?confirmed=true`,
      { method: "DELETE" }
    );
    const successRes = await deleteSkillRoute(confirmedReq, {
      params: Promise.resolve({ id: activeGoal.id, skillId: skillToDelete.id }),
    });
    expect(successRes.status).toBe(200);
    const delBody = await successRes.json();
    expect(delBody.success).toBe(true);
    expect(delBody.removedSkillId).toBe(skillToDelete.id);
  });

  it("5. feasibility remedy: scope reduction never removes without tick confirmation", async () => {
    const goalsRes = await listGoalsRoute();
    const { goals } = await goalsRes.json();
    const activeGoal = goals.find((g: { status: string }) => g.status === "active");

    // Empty ticks should fail
    const emptyTickReq = new NextRequest(
      `http://localhost:3000/api/v1/goals/${activeGoal.id}/feasibility/apply-remedy`,
      {
        method: "POST",
        body: JSON.stringify({
          remedy: "reduce_scope",
          confirmed: true,
          confirmed_skill_ids: [],
        }),
      }
    );
    const emptyRes = await applyRemedyRoute(emptyTickReq, {
      params: Promise.resolve({ id: activeGoal.id }),
    });
    expect(emptyRes.status).toBe(400);

    // Without confirmed: true should fail
    const unconfirmedReq = new NextRequest(
      `http://localhost:3000/api/v1/goals/${activeGoal.id}/feasibility/apply-remedy`,
      {
        method: "POST",
        body: JSON.stringify({
          remedy: "reduce_scope",
          confirmed: false,
          confirmed_skill_ids: ["some-id"],
        }),
      }
    );
    const unconfirmedRes = await applyRemedyRoute(unconfirmedReq, {
      params: Promise.resolve({ id: activeGoal.id }),
    });
    expect(unconfirmedRes.status).toBe(400);
  });

  it("6. imports health analytics plan fixture and saves it as a second (draft) goal with plan_import material", async () => {
    const fixturePath = path.resolve(process.cwd(), "tests/fixtures/health-analytics-plan.md");
    const content = fs.readFileSync(fixturePath, "utf-8");

    // Reject non-.md / .txt
    const rejectReq = new NextRequest("http://localhost:3000/api/v1/goals/import", {
      method: "POST",
      body: JSON.stringify({ content, filename: "plan.pdf" }),
    });
    const rejectRes = await importPlanRoute(rejectReq);
    expect(rejectRes.status).toBe(400);
    const rejectBody = await rejectRes.json();
    expect(rejectBody.error).toContain("Only .md and .txt files are supported");

    // Import and save as draft goal
    const importReq = new NextRequest("http://localhost:3000/api/v1/goals/import", {
      method: "POST",
      body: JSON.stringify({
        content,
        filename: "health-analytics-plan.md",
        saveAsDraftGoal: true,
        weeklyHours: 10,
      }),
    });

    const importRes = await importPlanRoute(importReq);
    expect(importRes.status).toBe(201);
    const importBody = await importRes.json();

    expect(importBody.goal).toBeDefined();
    expect(importBody.goal.status).toBe("draft");
    expect(importBody.goal.health_flag).toBe(true);
    expect(importBody.material).toBeDefined();
    expect(importBody.material.kind).toBe("plan_import");
    expect(importBody.skills.length).toBeGreaterThanOrEqual(12);
    expect(importBody.skills.length).toBeLessThanOrEqual(20);
    expect(importBody.feasibility).toBeDefined();

    // Verify goal_changes table has change_type 'import'
    const { data: importChanges } = await supabaseAdapter
      .from("goal_changes")
      .select("*")
      .eq("goal_id", importBody.goal.id)
      .eq("change_type", "import");
    expect(importChanges && importChanges.length > 0).toBe(true);
  });

  it("7. activating a second goal prompts to archive the first; confirming archives first and activates second", async () => {
    // Create a new draft goal
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const draftRes = await createGoalRoute(
      new NextRequest("http://localhost:3000/api/v1/goals", {
        method: "POST",
        body: JSON.stringify({
          title: "Cloud Architecture Goal",
          starting_level: "beginner",
          target_date: futureDate,
          weekly_hours: 6,
        }),
      })
    );
    const { goal: draftGoal } = await draftRes.json();

    // Attempt to activate without archiveExisting -> MUST return 409
    const activateReq = new NextRequest(
      `http://localhost:3000/api/v1/goals/${draftGoal.id}/activate`,
      { method: "POST", body: JSON.stringify({}) }
    );
    const activateRes = await activateGoalRoute(activateReq, {
      params: Promise.resolve({ id: draftGoal.id }),
    });
    expect(activateRes.status).toBe(409);
    const conflictBody = await activateRes.json();
    expect(conflictBody.code).toBe("ACTIVE_GOAL_EXISTS");
    expect(conflictBody.error).toContain("Archive it first to activate this one");

    // Activate with archiveExisting: true -> MUST archive old and activate new
    const confirmReq = new NextRequest(
      `http://localhost:3000/api/v1/goals/${draftGoal.id}/activate`,
      { method: "POST", body: JSON.stringify({ archiveExisting: true }) }
    );
    const confirmRes = await activateGoalRoute(confirmReq, {
      params: Promise.resolve({ id: draftGoal.id }),
    });
    expect(confirmRes.status).toBe(200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody.success).toBe(true);
    expect(confirmBody.goal.status).toBe("active");

    // Verify only ONE active goal exists for User A
    const { data: activeGoals } = await supabaseAdapter
      .from("goals")
      .select("id, title, status")
      .eq("owner_id", USER_A)
      .eq("status", "active");

    expect(activeGoals).toHaveLength(1);
    expect(activeGoals![0].id).toBe(draftGoal.id);
  });
});
