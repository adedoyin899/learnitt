import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calculateFeasibility, SkillFeasibilityItem } from "@/lib/planner/feasibility";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/goals/[id]
 * Returns goal details, skills, prerequisites, and dynamic feasibility.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
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

  // 2. Fetch skills
  const { data: skills, error: skillsErr } = await supabase
    .from("skills")
    .select("*")
    .eq("goal_id", id)
    .eq("owner_id", user.id)
    .order("position", { ascending: true });

  if (skillsErr) {
    return NextResponse.json({ error: skillsErr.message }, { status: 500 });
  }

  // 3. Fetch prerequisites
  const { data: prereqs, error: prereqErr } = await supabase
    .from("skill_prereqs")
    .select("skill_id, prereq_id")
    .eq("owner_id", user.id);

  if (prereqErr) {
    return NextResponse.json({ error: prereqErr.message }, { status: 500 });
  }

  // Group prerequisites by skill_id
  const prereqMap = new Map<string, string[]>();
  for (const p of prereqs || []) {
    const list = prereqMap.get(p.skill_id) || [];
    list.push(p.prereq_id);
    prereqMap.set(p.skill_id, list);
  }

  const enrichedSkills = (skills || []).map((s) => ({
    ...s,
    prereq_ids: prereqMap.get(s.id) || [],
  }));

  // 4. Calculate dynamic feasibility
  const feasibilityItems: SkillFeasibilityItem[] = enrichedSkills.map((s) => ({
    id: s.id,
    name: s.name,
    priority: s.priority,
    estimated_min_minutes: s.estimated_min_minutes,
    estimated_max_minutes: s.estimated_max_minutes,
    prereq_ids: s.prereq_ids,
    status: s.status,
  }));

  const feasibility = calculateFeasibility({
    skills: feasibilityItems,
    targetDate: goal.target_date,
    weeklyHours: Number(goal.weekly_hours),
    studyDays: goal.study_days,
  });

  return NextResponse.json({
    goal,
    skills: enrichedSkills,
    feasibility,
  });
}

const updateGoalSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  domain: z.string().max(100).optional(),
  target_date: z.string().optional(),
  weekly_hours: z.number().min(1).max(20).optional(),
  study_days: z.array(z.number().int().min(1).max(7)).optional(),
  status: z.enum(["draft", "active", "paused", "archived", "completed"]).optional(),
});

/**
 * PATCH /api/v1/goals/[id]
 * Updates goal configuration fields.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.format() }, { status: 400 });
  }

  const { data: updatedGoal, error: updateErr } = await supabase
    .from("goals")
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (updateErr || !updatedGoal) {
    return NextResponse.json({ error: updateErr?.message || "Goal not found" }, { status: 500 });
  }

  return NextResponse.json({ goal: updatedGoal });
}

/**
 * DELETE /api/v1/goals/[id]
 * Deletes a goal and cascades removal of rows, storage objects, and queued jobs (Phase L12 Requirement 1).
 * Requires typed confirmation matching the goal title.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
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
  const { data: goal, error: goalErr } = await supabase
    .from("goals")
    .select("id, title")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (goalErr || !goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // 2. Validate typed confirmation
  let body: { confirmation?: string; confirmation_title?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body
  }

  const entered = (body.confirmation_title || body.confirmation || "").trim();
  if (entered.toLowerCase() !== goal.title.trim().toLowerCase()) {
    return NextResponse.json(
      {
        error: `Confirmation text must match the goal title "${goal.title}".`,
      },
      { status: 400 }
    );
  }

  try {
    // 3. Remove storage objects for this goal's materials
    const { data: materials } = await supabase
      .from("materials")
      .select("storage_path")
      .eq("goal_id", id)
      .eq("owner_id", user.id);

    const storagePaths = (materials || [])
      .map((m) => m.storage_path)
      .filter((p): p is string => Boolean(p));

    if (storagePaths.length > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const storageClient = (supabase as any).storage?.from("materials");
        if (storageClient && typeof storageClient.remove === "function") {
          await storageClient.remove(storagePaths);
        }
      } catch (storageErr) {
        console.warn("Storage removal warning:", storageErr);
      }
    }

    // 4. Cancel/remove queued jobs referencing this goal
    try {
      const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
      const serviceClient = createServiceRoleClient();
      const { data: userJobs } = await serviceClient
        .from("ai_jobs")
        .select("id, payload")
        .eq("owner_id", user.id);

      const jobIdsToDelete: string[] = [];
      for (const job of (userJobs || []) as Array<{ id: string; payload: unknown }>) {
        const payloadStr =
          typeof job.payload === "string" ? job.payload : JSON.stringify(job.payload || {});
        if (payloadStr.includes(id)) {
          jobIdsToDelete.push(job.id);
        }
      }

      if (jobIdsToDelete.length > 0) {
        await serviceClient
          .from("ai_jobs")
          .delete()
          .in("id", jobIdsToDelete);
      }
    } catch (jobErr) {
      console.warn("Failed to delete queued jobs for goal:", jobErr);
    }

    // 5. Delete goal row (cascades all foreign key tables)
    const { error: delErr } = await supabase
      .from("goals")
      .delete()
      .eq("id", id)
      .eq("owner_id", user.id);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Goal "${goal.title}" and all associated data permanently deleted.`,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || "Failed to delete goal" },
      { status: 500 }
    );
  }
}

