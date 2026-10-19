import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { applyAdaptDecision } from "@/lib/planner/adapt";
import { PlannerGoal, PlannerPrereq, PlannerSkill } from "@/lib/planner/types";

const adaptSchema = z.object({
  goal_id: z.string().uuid(),
  option: z.enum(["compress", "extend", "add_time", "reduce_scope"]),
  confirmed_skill_ids: z.array(z.string().uuid()).optional(),
  custom_target_date: z.string().optional(),
  temporary_hours: z.number().min(1).max(20).optional(),
  weeks_count: z.number().int().min(1).max(12).optional(),
});

/**
 * POST /api/v1/plan/adapt
 * Applies exactly one adaptation strategy: compress, extend, add_time, or reduce_scope.
 * Writes a row to goal_changes.
 * reduce_scope without confirmation changes nothing.
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

  // Rate limit per user (Phase L12 Requirement 2)
  const { checkAiRateLimit, rateLimitExceededResponse } = await import(
    "@/lib/security/rate-limit"
  );
  const aiLimit = checkAiRateLimit(user.id);
  if (!aiLimit.success) {
    return rateLimitExceededResponse(
      aiLimit,
      "AI rate limit exceeded. Maximum 20 AI requests per minute per user."
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = adaptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const {
    goal_id,
    option,
    confirmed_skill_ids,
    custom_target_date,
    temporary_hours,
    weeks_count,
  } = parsed.data;

  // 1. Fetch goal
  const { data: goalRow, error: goalErr } = await supabase
    .from("goals")
    .select("*")
    .eq("id", goal_id)
    .eq("owner_id", user.id)
    .single();

  if (goalErr || !goalRow) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // 2. Fetch skills
  const { data: skillRows, error: skillsErr } = await supabase
    .from("skills")
    .select("*")
    .eq("goal_id", goal_id)
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

  // 5. Build planner structures
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

  // Apply adapt decision
  const result = applyAdaptDecision({
    option,
    goal: plannerGoal,
    skills: plannerSkills,
    prereqs: plannerPrereqs,
    reviews: (reviewRows || []).map((r) => ({
      skill_id: r.skill_id,
      due_date: r.due_date,
      minutes: r.minutes || 15,
    })),
    confirmedSkillIds: confirmed_skill_ids,
    customTargetDate: custom_target_date,
    temporaryHours: temporary_hours,
    weeksCount: weeks_count,
  });

  // If reduce_scope had no confirmation: no-op, changes nothing
  if (result.noOp) {
    return NextResponse.json({
      success: false,
      no_op: true,
      message: "reduce_scope without confirmation changes nothing",
      change_type: option,
    });
  }

  // 6. Write to goal_changes
  const { data: changeRow, error: changeErr } = await supabase
    .from("goal_changes")
    .insert({
      owner_id: user.id,
      goal_id: goalRow.id,
      change_type: option,
      detail: result.detail,
    })
    .select()
    .single();

  if (changeErr) {
    return NextResponse.json({ error: changeErr.message }, { status: 500 });
  }

  // 7. Apply mutations according to adapt option
  if (option === "extend") {
    await supabase
      .from("goals")
      .update({ target_date: result.updatedGoal.target_date })
      .eq("id", goalRow.id)
      .eq("owner_id", user.id);
  } else if (option === "add_time") {
    await supabase
      .from("goals")
      .update({ weekly_hours: result.updatedGoal.weekly_hours })
      .eq("id", goalRow.id)
      .eq("owner_id", user.id);
  } else if (option === "reduce_scope" && confirmed_skill_ids && confirmed_skill_ids.length > 0) {
    for (const skillId of confirmed_skill_ids) {
      await supabase
        .from("skills")
        .delete()
        .eq("id", skillId)
        .eq("owner_id", user.id);
    }
  }

  // 8. Update plan items with new plan_version
  const { data: maxVersionRow } = await supabase
    .from("plan_items")
    .select("plan_version")
    .eq("goal_id", goalRow.id)
    .eq("owner_id", user.id)
    .order("plan_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (maxVersionRow?.plan_version ?? 1) + 1;

  // Insert updated plan items
  const newItemsToInsert = result.updatedPlan.all_items.map((item) => ({
    owner_id: user.id,
    goal_id: goalRow.id,
    skill_id: item.skill_id,
    scheduled_date: item.scheduled_date,
    kind: item.kind,
    planned_minutes: item.planned_minutes,
    material_id: item.material_id || null,
    resource_id: item.resource_id || null,
    mvd_minutes: item.mvd_minutes,
    status: item.status,
    plan_version: nextVersion,
    position: item.position,
    rescheduled_from: item.rescheduled_from || null,
  }));

  if (newItemsToInsert.length > 0) {
    await supabase.from("plan_items").insert(newItemsToInsert);
  }

  return NextResponse.json({
    success: true,
    change_type: option,
    change_id: changeRow?.id,
    detail: result.detail,
    updated_goal: result.updatedGoal,
    plan_version: nextVersion,
    scheduled_items: result.updatedPlan.scheduled_items,
    unscheduled_items: result.updatedPlan.unscheduled_items,
  });
}
