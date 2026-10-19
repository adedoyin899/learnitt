import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateFeasibility, SkillFeasibilityItem } from "@/lib/planner/feasibility";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/goals/[id]/feasibility
 * Calculates and returns feasibility for a goal.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: goal, error: goalErr } = await supabase
    .from("goals")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (goalErr || !goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  const { data: skills, error: skillsErr } = await supabase
    .from("skills")
    .select("*")
    .eq("goal_id", id)
    .eq("owner_id", user.id);

  if (skillsErr) {
    return NextResponse.json({ error: skillsErr.message }, { status: 500 });
  }

  const feasibilityItems: SkillFeasibilityItem[] = (skills || []).map((s) => ({
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

  return NextResponse.json({ feasibility });
}
