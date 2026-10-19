import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkAdaptTrigger, generateAdaptProposals } from "@/lib/planner/adapt";
import { PlannedItem, PlannerGoal, PlannerSkill } from "@/lib/planner/types";

/**
 * GET /api/v1/plan?from=&to=&goal_id=
 * Reads plan items in a specified date range and checks adaptation trigger status.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const goalId = searchParams.get("goal_id");

  let query = supabase
    .from("plan_items")
    .select("*")
    .eq("owner_id", user.id)
    .order("scheduled_date", { ascending: true })
    .order("position", { ascending: true });

  if (from) {
    query = query.gte("scheduled_date", from);
  }
  if (to) {
    query = query.lte("scheduled_date", to);
  }
  if (goalId) {
    query = query.eq("goal_id", goalId);
  }

  const { data: items, error: itemsErr } = await query;

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  // Fetch skill metadata
  const { data: skillsData } = await supabase
    .from("skills")
    .select("id, name, priority, difficulty, mvd_minutes, mvd_task")
    .eq("owner_id", user.id);

  const skillMap = new Map((skillsData || []).map((s) => [s.id, s]));

  // Map skill name to item
  const formattedItems: PlannedItem[] = (items || []).map((it) => {
    const skillData = it.skill_id ? skillMap.get(it.skill_id) : null;
    return {
      id: it.id,
      skill_id: it.skill_id,
      skill_name: skillData?.name || (it.kind === "review" ? "Spaced Review" : "Learning Session"),
      scheduled_date: typeof it.scheduled_date === "object" ? it.scheduled_date.toISOString().split("T")[0] : String(it.scheduled_date).split("T")[0],
      kind: it.kind,
      planned_minutes: it.planned_minutes,
      mvd_minutes: it.mvd_minutes,
      mvd_task: skillData?.mvd_task || "Review core concept and write 3 summary bullets.",
      status: it.status,
      position: it.position,
      plan_version: it.plan_version,
      material_id: it.material_id,
      resource_id: it.resource_id,
      rescheduled_from: it.rescheduled_from ? (typeof it.rescheduled_from === "object" ? it.rescheduled_from.toISOString().split("T")[0] : String(it.rescheduled_from).split("T")[0]) : null,
    };
  });

  // Check recent check-ins for adapt trigger
  const todayStr = new Date().toISOString().split("T")[0];
  const { data: checkIns } = await supabase
    .from("check_ins")
    .select("*")
    .eq("owner_id", user.id);

  const adaptStatus = checkAdaptTrigger({
    checkIns: (checkIns || []).map((c) => {
      const dateStr = c.created_at
        ? (typeof c.created_at === "object" ? (c.created_at as Date).toISOString() : String(c.created_at)).split("T")[0]
        : todayStr;
      return {
        plan_item_id: c.plan_item_id,
        scheduled_date: c.scheduled_date || dateStr,
        outcome: c.outcome,
        minutes_actual: c.minutes_actual,
      };
    }),
    planItems: formattedItems,
    today: todayStr,
  });

  // If adapt is triggered and goal is provided or known, generate proposals
  let adaptProposals = undefined;
  if (adaptStatus.triggered && goalId) {
    const { data: goalRow } = await supabase
      .from("goals")
      .select("*")
      .eq("id", goalId)
      .eq("owner_id", user.id)
      .single();

    const { data: skillRows } = await supabase
      .from("skills")
      .select("*")
      .eq("goal_id", goalId)
      .eq("owner_id", user.id);

    const { data: prereqRows } = await supabase
      .from("skill_prereqs")
      .select("skill_id, prereq_id")
      .eq("owner_id", user.id);

    if (goalRow && skillRows) {
      const plannerGoal: PlannerGoal = {
        id: goalRow.id,
        target_date: goalRow.target_date,
        weekly_hours: Number(goalRow.weekly_hours) || 8,
        study_days: goalRow.study_days && goalRow.study_days.length > 0 ? goalRow.study_days : [1, 2, 3, 4, 5],
      };

      const plannerSkills: PlannerSkill[] = skillRows.map((s) => ({
        id: s.id,
        name: s.name,
        priority: s.priority ?? 2,
        difficulty: s.difficulty ?? 3,
        estimated_min_minutes: s.estimated_min_minutes,
        estimated_max_minutes: s.estimated_max_minutes,
        mvd_minutes: s.mvd_minutes ?? 15,
        mvd_task: s.mvd_task,
        status: s.status,
      }));

      adaptProposals = generateAdaptProposals({
        goal: plannerGoal,
        skills: plannerSkills,
        prereqs: prereqRows || [],
        today: todayStr,
      });
    }
  }

  return NextResponse.json({
    items: formattedItems,
    total_count: formattedItems.length,
    adapt_status: {
      ...adaptStatus,
      proposals: adaptProposals,
    },
  });
}
