import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calculateFeasibility, SkillFeasibilityItem } from "@/lib/planner/feasibility";
import { Database } from "@/types/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const applyRemedySchema = z.object({
  remedy: z.enum(["extend_date", "add_time", "reduce_scope"]),
  confirmed: z.boolean(),
  // For extend_date:
  proposed_target_date: z.string().optional(),
  // For add_time:
  proposed_weekly_hours: z.number().min(1).max(20).optional(),
  // For reduce_scope:
  confirmed_skill_ids: z.array(z.string().uuid()).optional(),
});

/**
 * POST /api/v1/goals/[id]/feasibility/apply-remedy
 * Applies a user-confirmed feasibility remedy (PRD Epic A3).
 * Never removes without a tick.
 * Writes to goal_changes table under the appropriate change_type.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Fetch goal
  const { data: goal, error: goalErr } = await supabase
    .from("goals")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (goalErr || !goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = applyRemedySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.format() }, { status: 400 });
  }

  const val = parsed.data;

  // Confirmation required
  if (!val.confirmed) {
    return NextResponse.json(
      { error: "Remedy must be confirmed before applying.", code: "CONFIRMATION_REQUIRED" },
      { status: 400 }
    );
  }

  let updatedGoal = goal;

  if (val.remedy === "extend_date") {
    if (!val.proposed_target_date) {
      return NextResponse.json({ error: "proposed_target_date is required for extend_date remedy." }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("goals")
      .update({
        target_date: val.proposed_target_date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_id", user.id)
      .select()
      .single();

    if (updateErr || !updated) {
      return NextResponse.json({ error: updateErr?.message || "Failed to update target date" }, { status: 500 });
    }

    updatedGoal = updated;

    // Log to goal_changes
    await supabase.from("goal_changes").insert({
      owner_id: user.id,
      goal_id: id,
      change_type: "extend",
      detail: {
        previous_target_date: goal.target_date,
        new_target_date: val.proposed_target_date,
      } as unknown as Database["public"]["Tables"]["goal_changes"]["Insert"]["detail"],
    });
  } else if (val.remedy === "add_time") {
    if (!val.proposed_weekly_hours) {
      return NextResponse.json({ error: "proposed_weekly_hours is required for add_time remedy." }, { status: 400 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("goals")
      .update({
        weekly_hours: val.proposed_weekly_hours,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("owner_id", user.id)
      .select()
      .single();

    if (updateErr || !updated) {
      return NextResponse.json({ error: updateErr?.message || "Failed to update weekly hours" }, { status: 500 });
    }

    updatedGoal = updated;

    // Log to goal_changes
    await supabase.from("goal_changes").insert({
      owner_id: user.id,
      goal_id: id,
      change_type: "add_time",
      detail: {
        previous_weekly_hours: goal.weekly_hours,
        new_weekly_hours: val.proposed_weekly_hours,
      } as unknown as Database["public"]["Tables"]["goal_changes"]["Insert"]["detail"],
    });
  } else if (val.remedy === "reduce_scope") {
    const skillIds = val.confirmed_skill_ids || [];
    // PRD: "never removes without a tick."
    if (skillIds.length === 0) {
      return NextResponse.json(
        {
          error: "No skills were selected for scope reduction. Tick at least one skill to remove.",
          code: "NO_SKILLS_SELECTED",
        },
        { status: 400 }
      );
    }

    // Fetch names of skills being removed for changelog
    const { data: removingSkills } = await supabase
      .from("skills")
      .select("id, name, priority, estimated_max_minutes")
      .in("id", skillIds)
      .eq("goal_id", id)
      .eq("owner_id", user.id);

    // Delete selected skills
    const { error: deleteErr } = await supabase
      .from("skills")
      .delete()
      .in("id", skillIds)
      .eq("goal_id", id)
      .eq("owner_id", user.id);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    // Log to goal_changes
    await supabase.from("goal_changes").insert({
      owner_id: user.id,
      goal_id: id,
      change_type: "reduce_scope",
      detail: {
        removed_count: skillIds.length,
        removed_skills: removingSkills || [],
      } as unknown as Database["public"]["Tables"]["goal_changes"]["Insert"]["detail"],
    });
  }

  // Recompute feasibility after remedy applied
  const { data: currentSkills } = await supabase
    .from("skills")
    .select("*")
    .eq("goal_id", id)
    .eq("owner_id", user.id);

  const feasibilityItems: SkillFeasibilityItem[] = (currentSkills || []).map((s) => ({
    id: s.id,
    name: s.name,
    priority: s.priority,
    estimated_min_minutes: s.estimated_min_minutes,
    estimated_max_minutes: s.estimated_max_minutes,
    status: s.status,
  }));

  const newFeasibility = calculateFeasibility({
    skills: feasibilityItems,
    targetDate: updatedGoal.target_date,
    weeklyHours: Number(updatedGoal.weekly_hours),
    studyDays: updatedGoal.study_days,
  });

  return NextResponse.json({
    success: true,
    remedyApplied: val.remedy,
    goal: updatedGoal,
    feasibility: newFeasibility,
  });
}
