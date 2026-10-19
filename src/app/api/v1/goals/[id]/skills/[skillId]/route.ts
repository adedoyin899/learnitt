import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calculateFeasibility, SkillFeasibilityItem } from "@/lib/planner/feasibility";
import { Database } from "@/types/database";

interface RouteParams {
  params: Promise<{ id: string; skillId: string }>;
}

const updateSkillSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(255).optional(),
  estimated_min_minutes: z.number().int().min(5).optional(),
  estimated_max_minutes: z.number().int().min(5).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  verification_type: z.enum(["recall", "applied", "artifact", "self"]).optional(),
  mvd_minutes: z.number().int().min(10).max(30).optional(),
  mvd_task: z.string().max(140).optional(),
  prereq_ids: z.array(z.string().uuid()).optional(),
});

/**
 * PATCH /api/v1/goals/[id]/skills/[skillId]
 * Updates a skill (rename, estimates, priority, prereqs), records graph_edit, recomputes feasibility.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id, skillId } = await params;
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

  // 2. Fetch existing skill
  const { data: currentSkill, error: skillErr } = await supabase
    .from("skills")
    .select("*")
    .eq("id", skillId)
    .eq("goal_id", id)
    .eq("owner_id", user.id)
    .single();

  if (skillErr || !currentSkill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSkillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.format() }, { status: 400 });
  }

  const val = parsed.data;
  const newMin = val.estimated_min_minutes ?? currentSkill.estimated_min_minutes;
  const newMax = val.estimated_max_minutes ?? currentSkill.estimated_max_minutes;

  if (newMin > newMax) {
    return NextResponse.json(
      { error: "Minimum estimate must be less than or equal to maximum estimate." },
      { status: 400 }
    );
  }

  // 3. Update skill
  const updateFields: Partial<Database["public"]["Tables"]["skills"]["Update"]> = {
    updated_at: new Date().toISOString(),
  };
  if (val.name !== undefined) updateFields.name = val.name;
  if (val.description !== undefined) updateFields.description = val.description;
  if (val.estimated_min_minutes !== undefined) updateFields.estimated_min_minutes = val.estimated_min_minutes;
  if (val.estimated_max_minutes !== undefined) updateFields.estimated_max_minutes = val.estimated_max_minutes;
  if (val.difficulty !== undefined) updateFields.difficulty = val.difficulty;
  if (val.priority !== undefined) updateFields.priority = val.priority;
  if (val.verification_type !== undefined) updateFields.verification_type = val.verification_type;
  if (val.mvd_minutes !== undefined) updateFields.mvd_minutes = val.mvd_minutes;
  if (val.mvd_task !== undefined) updateFields.mvd_task = val.mvd_task;

  const { data: updatedSkill, error: updateErr } = await supabase
    .from("skills")
    .update(updateFields)
    .eq("id", skillId)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (updateErr || !updatedSkill) {
    return NextResponse.json({ error: updateErr?.message || "Failed to update skill" }, { status: 500 });
  }

  // 4. Update prerequisites if provided
  if (val.prereq_ids !== undefined) {
    await supabase.from("skill_prereqs").delete().eq("skill_id", skillId).eq("owner_id", user.id);
    if (val.prereq_ids.length > 0) {
      const prereqsToInsert = val.prereq_ids.map((pId) => ({
        owner_id: user.id,
        skill_id: skillId,
        prereq_id: pId,
      }));
      await supabase.from("skill_prereqs").insert(prereqsToInsert);
    }
  }

  // 5. Log graph_edit to goal_changes
  await supabase.from("goal_changes").insert({
    owner_id: user.id,
    goal_id: id,
    change_type: "graph_edit",
    detail: {
      action: "edit_skill",
      skill_id: skillId,
      changes: val,
      previous: {
        name: currentSkill.name,
        estimated_min_minutes: currentSkill.estimated_min_minutes,
        estimated_max_minutes: currentSkill.estimated_max_minutes,
        priority: currentSkill.priority,
      },
    } as unknown as Database["public"]["Tables"]["goal_changes"]["Insert"]["detail"],
  });

  // 6. Recompute feasibility
  const { data: allSkills } = await supabase
    .from("skills")
    .select("*")
    .eq("goal_id", id)
    .eq("owner_id", user.id);

  const feasibilityItems: SkillFeasibilityItem[] = (allSkills || []).map((s) => ({
    id: s.id,
    name: s.name,
    priority: s.priority,
    estimated_min_minutes: s.estimated_min_minutes,
    estimated_max_minutes: s.estimated_max_minutes,
    status: s.status,
  }));

  const feasibility = calculateFeasibility({
    skills: feasibilityItems,
    targetDate: goal.target_date,
    weeklyHours: Number(goal.weekly_hours),
    studyDays: goal.study_days,
  });

  return NextResponse.json({ skill: updatedSkill, feasibility });
}

/**
 * DELETE /api/v1/goals/[id]/skills/[skillId]
 * Deletes a skill. Requires explicit confirmation (PRD Epic A2, AC4).
 * Records graph_edit in goal_changes, recomputes feasibility.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id, skillId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check confirmation
  const url = new URL(req.url);
  const confirmedQuery = url.searchParams.get("confirmed") === "true";

  let confirmedBody = false;
  try {
    const text = await req.text();
    if (text) {
      const json = JSON.parse(text);
      confirmedBody = json.confirmed === true;
    }
  } catch {
    // Body optional if provided in query
  }

  if (!confirmedQuery && !confirmedBody) {
    return NextResponse.json(
      { error: "Skill removal requires explicit confirmation.", code: "CONFIRMATION_REQUIRED" },
      { status: 400 }
    );
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

  // 2. Fetch existing skill
  const { data: skillToDelete, error: skillErr } = await supabase
    .from("skills")
    .select("id, name, estimated_max_minutes, priority")
    .eq("id", skillId)
    .eq("goal_id", id)
    .eq("owner_id", user.id)
    .single();

  if (skillErr || !skillToDelete) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  // 3. Delete skill (skill_prereqs cascades automatically)
  const { error: deleteErr } = await supabase
    .from("skills")
    .delete()
    .eq("id", skillId)
    .eq("owner_id", user.id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  // 4. Log graph_edit to goal_changes
  await supabase.from("goal_changes").insert({
    owner_id: user.id,
    goal_id: id,
    change_type: "graph_edit",
    detail: {
      action: "remove_skill",
      skill_id: skillId,
      name: skillToDelete.name,
      estimated_max_minutes: skillToDelete.estimated_max_minutes,
      priority: skillToDelete.priority,
    } as unknown as Database["public"]["Tables"]["goal_changes"]["Insert"]["detail"],
  });

  // 5. Recompute feasibility
  const { data: allSkills } = await supabase
    .from("skills")
    .select("*")
    .eq("goal_id", id)
    .eq("owner_id", user.id);

  const feasibilityItems: SkillFeasibilityItem[] = (allSkills || []).map((s) => ({
    id: s.id,
    name: s.name,
    priority: s.priority,
    estimated_min_minutes: s.estimated_min_minutes,
    estimated_max_minutes: s.estimated_max_minutes,
    status: s.status,
  }));

  const feasibility = calculateFeasibility({
    skills: feasibilityItems,
    targetDate: goal.target_date,
    weeklyHours: Number(goal.weekly_hours),
    studyDays: goal.study_days,
  });

  return NextResponse.json({
    success: true,
    removedSkillId: skillId,
    feasibility,
  });
}
