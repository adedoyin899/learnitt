import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { schedule } from "@/lib/planner/scheduler";
import {
  PlannerGoal,
  PlannerPrereq,
  PlannerReview,
  PlannerSkill,
} from "@/lib/planner/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/goals/[id]/plan/generate
 * Runs the deterministic planner and writes plan_items with an incremented plan_version.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Fetch goal
  const { data: goalRow, error: goalErr } = await supabase
    .from("goals")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (goalErr || !goalRow) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // Parse optional body for startDate
  let startDate = new Date();
  try {
    const body = await req.json();
    if (body?.start_date) {
      startDate = new Date(body.start_date);
    }
  } catch {
    // Body is optional
  }

  // 2. Fetch skills
  const { data: skillRows, error: skillsErr } = await supabase
    .from("skills")
    .select("*")
    .eq("goal_id", id)
    .eq("owner_id", user.id)
    .order("position", { ascending: true });

  if (skillsErr) {
    return NextResponse.json({ error: skillsErr.message }, { status: 500 });
  }

  // 3. Fetch prerequisites
  const { data: prereqRows } = await supabase
    .from("skill_prereqs")
    .select("skill_id, prereq_id")
    .eq("owner_id", user.id);

  // 4. Fetch skill reviews
  const { data: reviewRows } = await supabase
    .from("skill_reviews")
    .select("*")
    .eq("owner_id", user.id);

  // 5. Determine next plan_version
  const { data: maxVersionRow } = await supabase
    .from("plan_items")
    .select("plan_version")
    .eq("goal_id", id)
    .eq("owner_id", user.id)
    .order("plan_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPlanVersion = (maxVersionRow?.plan_version ?? 0) + 1;

  // Format planner inputs
  const plannerGoal: PlannerGoal = {
    id: goalRow.id,
    title: goalRow.title,
    target_date: goalRow.target_date,
    weekly_hours: Number(goalRow.weekly_hours) || 8,
    study_days: goalRow.study_days && goalRow.study_days.length > 0 ? goalRow.study_days : [1, 2, 3, 4, 5],
    timezone: goalRow.timezone,
  };

  const plannerSkills: PlannerSkill[] = (skillRows || []).map((s) => ({
    id: s.id,
    name: s.name,
    priority: s.priority ?? 2,
    difficulty: s.difficulty ?? 3,
    estimated_min_minutes: s.estimated_min_minutes,
    estimated_max_minutes: s.estimated_max_minutes,
    mvd_minutes: s.mvd_minutes ?? 15,
    mvd_task: s.mvd_task,
    status: s.status,
    material_id: s.material_id,
    resource_id: s.resource_id,
  }));

  const plannerPrereqs: PlannerPrereq[] = (prereqRows || []).map((p) => ({
    skill_id: p.skill_id,
    prereq_id: p.prereq_id,
  }));

  const plannerReviews: PlannerReview[] = (reviewRows || []).map((r) => ({
    skill_id: r.skill_id,
    due_date: r.due_date,
    minutes: r.minutes || 15,
  }));

  // Run pure deterministic planner
  const planOutput = schedule({
    goal: plannerGoal,
    skills: plannerSkills,
    prereqs: plannerPrereqs,
    reviews: plannerReviews,
    startDate,
    planVersion: nextPlanVersion,
  });

  // Prepare database rows
  const allRowsToInsert = planOutput.all_items.map((item) => ({
    owner_id: user.id,
    goal_id: id,
    skill_id: item.skill_id,
    scheduled_date: item.scheduled_date,
    kind: item.kind,
    planned_minutes: item.planned_minutes,
    material_id: item.material_id || null,
    resource_id: item.resource_id || null,
    mvd_minutes: item.mvd_minutes,
    status: item.status,
    plan_version: nextPlanVersion,
    position: item.position,
    rescheduled_from: item.rescheduled_from || null,
  }));

  if (allRowsToInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from("plan_items")
      .insert(allRowsToInsert);

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    plan_version: nextPlanVersion,
    scheduled_items: planOutput.scheduled_items,
    unscheduled_items: planOutput.unscheduled_items,
    total_planned_minutes: planOutput.total_planned_minutes,
    total_capacity_minutes: planOutput.total_capacity_minutes,
    days_count: planOutput.days_count,
  });
}
