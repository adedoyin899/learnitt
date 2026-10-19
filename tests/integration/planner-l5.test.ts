/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as generatePlanRoute } from "@/app/api/v1/goals/[id]/plan/generate/route";
import { GET as getPlanRoute } from "@/app/api/v1/plan/route";
import { POST as adaptPlanRoute } from "@/app/api/v1/plan/adapt/route";
import { POST as reschedulePlanRoute } from "@/app/api/v1/plan/reschedule/route";
import * as serverAuth from "@/lib/supabase/server";
import * as serviceAuth from "@/lib/supabase/service-role";
import { createPgliteSupabaseAdapter } from "../db/pglite-adapter";
import { createTestDatabase } from "../db/test-db";

const USER_MAZ = "11111111-1111-1111-1111-111111111111";

describe("L5 Integration Suite · Planner & Adaptation (Epic C, S07 & S17)", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let supabaseAdapter: ReturnType<typeof createPgliteSupabaseAdapter>;
  let activeGoalId: string;
  let skillIds: string[] = [];

  beforeEach(async () => {
    testDb = await createTestDatabase();
    supabaseAdapter = createPgliteSupabaseAdapter(testDb.db);

    // Mock createServiceRoleClient
    vi.spyOn(serviceAuth, "createServiceRoleClient").mockReturnValue(
      supabaseAdapter as unknown as ReturnType<typeof serviceAuth.createServiceRoleClient>
    );

    // Mock user session as Maz
    vi.spyOn(serverAuth, "createClient").mockImplementation(async () => {
      return {
        auth: {
          getUser: async () => ({
            data: {
              user: {
                id: USER_MAZ,
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
        from: (table: string) => (supabaseAdapter as any).from(table),
        rpc: (fn: string, args: Record<string, unknown>) => (supabaseAdapter as any).rpc(fn, args),
      } as unknown as ReturnType<typeof serverAuth.createClient>;
    });

    // The Data Engineering Goal is already seeded in seed.sql:
    // ID: a1111111-1111-1111-1111-111111111111
    activeGoalId = "a1111111-1111-1111-1111-111111111111";

    const skillsRes = await testDb.db.query<{ id: string }>(`
      select id from public.skills
      where goal_id = '${activeGoalId}' and owner_id = '${USER_MAZ}'
      order by position asc;
    `);
    skillIds = skillsRes.rows.map((r) => r.id);
  });

  it("1. generates data engineering plan and writes plan_items with plan_version = 1", async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoalId}/plan/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: "2026-10-19" }),
    });

    const res = await generatePlanRoute(req, {
      params: Promise.resolve({ id: activeGoalId }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.plan_version).toBe(1);
    expect(data.scheduled_items.length).toBeGreaterThan(0);

    // Verify DB insertion
    const dbItems = await testDb.db.query<{
      id: string;
      scheduled_date: string;
      planned_minutes: number;
      mvd_minutes: number;
      kind: string;
    }>(`
      select id, scheduled_date, planned_minutes, mvd_minutes, kind
      from public.plan_items
      where goal_id = '${activeGoalId}' and owner_id = '${USER_MAZ}'
      order by scheduled_date asc, position asc;
    `);

    expect(dbItems.rows.length).toBe(data.scheduled_items.length);

    // Inspect first week (2026-10-19 to 2026-10-23):
    // 5 study days, each day capacity is 95 min, each session <= 60 min, MVD between 15 and 20 min
    const firstWeekItems = dbItems.rows.filter((it) => {
      const dStr =
        typeof it.scheduled_date === "object"
          ? (it.scheduled_date as Date).toISOString().split("T")[0]
          : String(it.scheduled_date).split("T")[0];
      return dStr >= "2026-10-19" && dStr <= "2026-10-23";
    });
    expect(firstWeekItems.length).toBeGreaterThan(0);

    for (const it of firstWeekItems) {
      expect(it.planned_minutes).toBeLessThanOrEqual(60);
      expect(it.planned_minutes).toBeGreaterThanOrEqual(5);
      expect(it.mvd_minutes).toBeGreaterThanOrEqual(Math.min(15, it.planned_minutes));
      expect(it.mvd_minutes).toBeLessThanOrEqual(20);
      expect(it.mvd_minutes).toBeLessThanOrEqual(it.planned_minutes);
    }
  });

  it("2. GET /plan reads date ranges and formats items", async () => {
    // First generate the plan
    const genReq = new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoalId}/plan/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: "2026-10-19" }),
    });
    await generatePlanRoute(genReq, { params: Promise.resolve({ id: activeGoalId }) });

    // Read range for first week
    const readReq = new NextRequest(
      `http://localhost:3000/api/v1/plan?from=2026-10-19&to=2026-10-25&goal_id=${activeGoalId}`
    );
    const res = await getPlanRoute(readReq);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.items).toBeDefined();
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0].skill_name).toBeTruthy();
    expect(data.items[0].mvd_task).toBeTruthy();
  });

  it("3. marks items missed in the seed and sees adapt prompt trigger", async () => {
    // Generate plan
    const genReq = new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoalId}/plan/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: "2026-10-19" }),
    });
    await generatePlanRoute(genReq, { params: Promise.resolve({ id: activeGoalId }) });

    // Mark 2 items as missed in database
    const itemsRes = await testDb.db.query<{ id: string }>(`
      select id from public.plan_items
      where goal_id = '${activeGoalId}'
      order by scheduled_date asc, position asc
      limit 2;
    `);
    const [item1, item2] = itemsRes.rows;

    await testDb.db.exec(`
      update public.plan_items set status = 'missed' where id in ('${item1.id}', '${item2.id}');

      insert into public.check_ins (owner_id, plan_item_id, outcome, client_id)
      values
        ('${USER_MAZ}', '${item1.id}', 'missed', gen_random_uuid()),
        ('${USER_MAZ}', '${item2.id}', 'missed', gen_random_uuid());
    `);

    // Fetch /api/v1/plan and check adapt trigger
    const planReq = new NextRequest(`http://localhost:3000/api/v1/plan?goal_id=${activeGoalId}`);
    const res = await getPlanRoute(planReq);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.adapt_status.triggered).toBe(true);
    expect(data.adapt_status.missedSessionsInWeek).toBeGreaterThanOrEqual(2);
    expect(data.adapt_status.reason).toContain("You missed 2 sessions this week. Pick how to catch up.");
    expect(data.adapt_status.proposals).toBeDefined();
    expect(data.adapt_status.proposals.length).toBe(4);
  });

  it("4. reduce_scope without confirmation changes nothing", async () => {
    // Generate plan
    const genReq = new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoalId}/plan/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: "2026-10-19" }),
    });
    await generatePlanRoute(genReq, { params: Promise.resolve({ id: activeGoalId }) });

    // Attempt reduce_scope without confirming any skills
    const adaptReq = new NextRequest("http://localhost:3000/api/v1/plan/adapt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: activeGoalId,
        option: "reduce_scope",
        confirmed_skill_ids: [], // Unconfirmed!
      }),
    });

    const res = await adaptPlanRoute(adaptReq);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.no_op).toBe(true);
    expect(data.message).toContain("reduce_scope without confirmation changes nothing");

    // Verify 0 rows in goal_changes
    const changes = await testDb.db.query<{ count: string | number }>("select count(*) from public.goal_changes;");
    expect(Number(changes.rows[0].count)).toBe(0);

    // Verify all 12 skills remain
    const skills = await testDb.db.query<{ count: string | number }>(`select count(*) from public.skills where goal_id = '${activeGoalId}';`);
    expect(Number(skills.rows[0].count)).toBe(12);
  });

  it("5. each adapt option produces a valid plan and a goal_changes row", async () => {
    // Generate baseline plan
    const genReq = new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoalId}/plan/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: "2026-10-19" }),
    });
    await generatePlanRoute(genReq, { params: Promise.resolve({ id: activeGoalId }) });

    // Option A: compress
    const compressReq = new NextRequest("http://localhost:3000/api/v1/plan/adapt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: activeGoalId,
        option: "compress",
      }),
    });
    const compressRes = await adaptPlanRoute(compressReq);
    expect(compressRes.status).toBe(200);
    const compressData = await compressRes.json();
    expect(compressData.success).toBe(true);
    expect(compressData.change_type).toBe("compress");

    // Option B: extend
    const extendReq = new NextRequest("http://localhost:3000/api/v1/plan/adapt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: activeGoalId,
        option: "extend",
        custom_target_date: "2027-01-15",
      }),
    });
    const extendRes = await adaptPlanRoute(extendReq);
    expect(extendRes.status).toBe(200);
    const extendData = await extendRes.json();
    expect(extendData.success).toBe(true);
    expect(extendData.change_type).toBe("extend");
    expect(extendData.updated_goal.target_date).toBe("2027-01-15");

    // Option C: add_time
    const addTimeReq = new NextRequest("http://localhost:3000/api/v1/plan/adapt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: activeGoalId,
        option: "add_time",
        temporary_hours: 12,
        weeks_count: 3,
      }),
    });
    const addTimeRes = await adaptPlanRoute(addTimeReq);
    expect(addTimeRes.status).toBe(200);
    const addTimeData = await addTimeRes.json();
    expect(addTimeData.success).toBe(true);
    expect(addTimeData.change_type).toBe("add_time");
    expect(addTimeData.updated_goal.weekly_hours).toBe(12);

    // Option D: reduce_scope with confirmation
    // Drop skill 4 (Airflow)
    const reduceReq = new NextRequest("http://localhost:3000/api/v1/plan/adapt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: activeGoalId,
        option: "reduce_scope",
        confirmed_skill_ids: [skillIds[4]], // Confirm dropping Airflow
      }),
    });
    const reduceRes = await adaptPlanRoute(reduceReq);
    expect(reduceRes.status).toBe(200);
    const reduceData = await reduceRes.json();
    expect(reduceData.success).toBe(true);
    expect(reduceData.change_type).toBe("reduce_scope");

    // Verify goal_changes table has all 4 recorded changes
    const changeRows = await testDb.db.query<{ change_type: string }>(`
      select change_type from public.goal_changes
      where goal_id = '${activeGoalId}' and owner_id = '${USER_MAZ}'
      order by created_at asc;
    `);
    expect(changeRows.rows.length).toBe(4);
    const loggedTypes = changeRows.rows.map((r) => r.change_type);
    expect(loggedTypes).toEqual(["compress", "extend", "add_time", "reduce_scope"]);
  });

  it("6. reschedule respects weekly hours and triggers adapt after 3 misses", async () => {
    // Generate plan
    const genReq = new NextRequest(`http://localhost:3000/api/v1/goals/${activeGoalId}/plan/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: "2026-10-19" }),
    });
    await generatePlanRoute(genReq, { params: Promise.resolve({ id: activeGoalId }) });

    // Pick a plan item to reschedule
    const itemsRes = await testDb.db.query<{ id: string; scheduled_date: string }>(`
      select id, scheduled_date from public.plan_items
      where goal_id = '${activeGoalId}'
      order by scheduled_date asc, position asc
      limit 1;
    `);
    const targetItem = itemsRes.rows[0];

    // Mark targetItem as missed and delete one item on Tuesday so Tuesday has 60m free capacity
    await testDb.db.exec(`
      update public.plan_items set status = 'missed' where id = '${targetItem.id}';
      insert into public.check_ins (owner_id, plan_item_id, outcome, client_id)
      values ('${USER_MAZ}', '${targetItem.id}', 'missed', gen_random_uuid());

      delete from public.plan_items where id in (
        select id from public.plan_items
        where scheduled_date = '2026-10-20' and goal_id = '${activeGoalId}'
        limit 1
      );
    `);

    // 1. Reschedule attempt -> moves to next day with free capacity (Tuesday)
    const resReq = new NextRequest("http://localhost:3000/api/v1/plan/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_item_id: targetItem.id,
      }),
    });
    const resRes = await reschedulePlanRoute(resReq);
    expect(resRes.status).toBe(200);
    const resData = await resRes.json();
    expect(resData.success).toBe(true);
    expect(resData.rescheduled_item.status).toBe("rescheduled");
    expect(resData.new_date).toBe("2026-10-20");

    // 2. Mark this item missed 2 more times (total 3 misses)
    await testDb.db.exec(`
      insert into public.check_ins (owner_id, plan_item_id, outcome, client_id)
      values
        ('${USER_MAZ}', '${targetItem.id}', 'missed', gen_random_uuid()),
        ('${USER_MAZ}', '${targetItem.id}', 'missed', gen_random_uuid());
    `);

    // 3. Reschedule attempt after 3 misses -> triggers adapt prompt!
    const thirdMissReq = new NextRequest("http://localhost:3000/api/v1/plan/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_item_id: targetItem.id }),
    });
    const thirdMissRes = await reschedulePlanRoute(thirdMissReq);
    expect(thirdMissRes.status).toBe(200);
    const thirdMissData = await thirdMissRes.json();
    expect(thirdMissData.success).toBe(false);
    expect(thirdMissData.trigger_adapt).toBe(true);
    expect(thirdMissData.reason).toContain("missed 3 times");
  });
});
