import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calculateFeasibility, SkillFeasibilityItem } from "@/lib/planner/feasibility";
import { Database } from "@/types/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const addSkillSchema = z.object({
  name: z.string().min(1, "Skill name is required").max(80),
  description: z.string().max(255).optional(),
  estimated_min_minutes: z.number().int().min(5).default(60),
  estimated_max_minutes: z.number().int().min(5).default(120),
  difficulty: z.number().int().min(1).max(5).default(2),
  priority: z.number().int().min(1).max(3).default(2),
  verification_type: z.enum(["recall", "applied", "artifact", "self"]).default("applied"),
  mvd_minutes: z.number().int().min(10).max(30).default(15),
  mvd_task: z.string().max(140).optional(),
  prereq_ids: z.array(z.string().uuid()).optional().default([]),
});

/**
 * POST /api/v1/goals/[id]/skills
 * Adds a new skill to the goal, logs graph_edit to goal_changes, recomputes feasibility.
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

  const parsed = addSkillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.format() }, { status: 400 });
  }

  const val = parsed.data;
  if (val.estimated_min_minutes > val.estimated_max_minutes) {
    return NextResponse.json(
      { error: "Minimum estimate must be less than or equal to maximum estimate." },
      { status: 400 }
    );
  }

  // Determine next position
  const { data: existingSkills } = await supabase
    .from("skills")
    .select("id, position")
    .eq("goal_id", id)
    .eq("owner_id", user.id);

  const nextPos = (existingSkills?.length || 0);

  // 2. Insert skill
  const { data: newSkill, error: insertErr } = await supabase
    .from("skills")
    .insert({
      owner_id: user.id,
      goal_id: id,
      name: val.name,
      description: val.description || null,
      estimated_min_minutes: val.estimated_min_minutes,
      estimated_max_minutes: val.estimated_max_minutes,
      difficulty: val.difficulty,
      priority: val.priority,
      verification_type: val.verification_type,
      mvd_minutes: val.mvd_minutes,
      mvd_task: val.mvd_task || `Review core vocabulary for ${val.name.slice(0, 50)}.`,
      position: nextPos,
      source: "user",
    })
    .select()
    .single();

  if (insertErr || !newSkill) {
    return NextResponse.json({ error: insertErr?.message || "Failed to create skill" }, { status: 500 });
  }

  // 3. Insert prerequisites if provided
  if (val.prereq_ids.length > 0) {
    const prereqRows = val.prereq_ids.map((prereqId) => ({
      owner_id: user.id,
      skill_id: newSkill.id,
      prereq_id: prereqId,
    }));
    await supabase.from("skill_prereqs").insert(prereqRows);
  }

  // 4. Log graph_edit change to goal_changes
  await supabase.from("goal_changes").insert({
    owner_id: user.id,
    goal_id: id,
    change_type: "graph_edit",
    detail: {
      action: "add_skill",
      skill_id: newSkill.id,
      name: newSkill.name,
      estimated_min_minutes: newSkill.estimated_min_minutes,
      estimated_max_minutes: newSkill.estimated_max_minutes,
      priority: newSkill.priority,
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

  return NextResponse.json({ skill: newSkill, feasibility }, { status: 201 });
}
