import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rescheduleMissedItem } from "@/lib/planner/reschedule";
import { PlannedItem, PlannerGoal } from "@/lib/planner/types";

const rescheduleSchema = z.object({
  plan_item_id: z.string().uuid(),
  confirmed_exceed_weekly_hours: z.boolean().optional().default(false),
});

/**
 * POST /api/v1/plan/reschedule
 * Reschedules a missed plan item according to PRD Epic C5:
 * - A missed item moves to the next day with free capacity within 7 days.
 * - Never push a week over weekly hours without confirmation.
 * - An item missed 3 times triggers the adapt prompt.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = rescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { plan_item_id, confirmed_exceed_weekly_hours } = parsed.data;

  // 1. Fetch item
  const { data: itemRow, error: itemErr } = await supabase
    .from("plan_items")
    .select("*")
    .eq("id", plan_item_id)
    .eq("owner_id", user.id)
    .single();

  if (itemErr || !itemRow) {
    return NextResponse.json({ error: "Plan item not found" }, { status: 404 });
  }

  // 2. Fetch goal
  const { data: goalRow, error: goalErr } = await supabase
    .from("goals")
    .select("*")
    .eq("id", itemRow.goal_id)
    .eq("owner_id", user.id)
    .single();

  if (goalErr || !goalRow) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // 3. Count misses on this item
  const { data: missedCheckIns } = await supabase
    .from("check_ins")
    .select("id")
    .eq("plan_item_id", plan_item_id)
    .eq("outcome", "missed");

  const missCount = missedCheckIns?.length || 0;
  const effectiveMissCount = missCount + (itemRow.status === "missed" ? 1 : 0);

  // 4. Fetch all active plan items around this period
  const todayStr =
    typeof itemRow.scheduled_date === "object"
      ? (itemRow.scheduled_date as Date).toISOString().split("T")[0]
      : String(itemRow.scheduled_date).split("T")[0];

  const { data: existingRows } = await supabase
    .from("plan_items")
    .select("*")
    .eq("owner_id", user.id)
    .gte("scheduled_date", todayStr);

  const plannerGoal: PlannerGoal = {
    id: goalRow.id,
    target_date: goalRow.target_date,
    weekly_hours: Number(goalRow.weekly_hours) || 8,
    study_days: goalRow.study_days && goalRow.study_days.length > 0 ? goalRow.study_days : [1, 2, 3, 4, 5],
  };

  const currentItem: PlannedItem = {
    id: itemRow.id,
    skill_id: itemRow.skill_id,
    skill_name: "Learning Session",
    scheduled_date:
      typeof itemRow.scheduled_date === "object"
        ? itemRow.scheduled_date.toISOString().split("T")[0]
        : String(itemRow.scheduled_date).split("T")[0],
    kind: itemRow.kind,
    planned_minutes: itemRow.planned_minutes,
    mvd_minutes: itemRow.mvd_minutes,
    mvd_task: "Review core concept and write 3 summary bullets.",
    status: itemRow.status,
    position: itemRow.position,
    plan_version: itemRow.plan_version,
    material_id: itemRow.material_id,
    resource_id: itemRow.resource_id,
    rescheduled_from: itemRow.rescheduled_from,
  };

  const existingItems: PlannedItem[] = (existingRows || []).map((r) => ({
    id: r.id,
    skill_id: r.skill_id,
    scheduled_date:
      typeof r.scheduled_date === "object"
        ? r.scheduled_date.toISOString().split("T")[0]
        : String(r.scheduled_date).split("T")[0],
    kind: r.kind,
    planned_minutes: r.planned_minutes,
    mvd_minutes: r.mvd_minutes,
    mvd_task: "",
    status: r.status,
    position: r.position,
    plan_version: r.plan_version,
    rescheduled_from: r.rescheduled_from,
  }));

  // Run pure rescheduling logic
  const result = rescheduleMissedItem({
    item: currentItem,
    goal: plannerGoal,
    existingItems,
    missCount: effectiveMissCount,
    confirmedExceedWeeklyHours: confirmed_exceed_weekly_hours,
  });

  if (result.triggerAdapt) {
    return NextResponse.json({
      success: false,
      trigger_adapt: true,
      reason: result.reason,
    });
  }

  if (result.requiresWeeklyConfirmation) {
    return NextResponse.json({
      success: false,
      requires_confirmation: true,
      proposed_date: result.newDate,
      exceeds_by_minutes: result.exceedsWeeklyMinutesBy,
      reason: result.reason,
    });
  }

  if (!result.success || !result.rescheduledItem) {
    return NextResponse.json({
      success: false,
      reason: result.reason || "Unable to reschedule item",
    }, { status: 400 });
  }

  // Update item in database
  const { error: updateErr } = await supabase
    .from("plan_items")
    .update({
      scheduled_date: result.rescheduledItem.scheduled_date,
      rescheduled_from: result.rescheduledItem.rescheduled_from,
      status: "rescheduled",
    })
    .eq("id", plan_item_id)
    .eq("owner_id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    rescheduled_item: result.rescheduledItem,
    new_date: result.newDate,
  });
}
