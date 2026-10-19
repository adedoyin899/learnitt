import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/goals/[id]/resources/discover
 * Enqueues a resource discovery job for the goal (search_queries task).
 * PRD Epic B3/B4 & Prompt Requirement 2:
 * "POST /goals/:id/resources/discover enqueues a job. Steps: search_queries task makes up to 3
 *  queries per skill that lacks material or needs depth. The search provider returns
 *  candidates. NO URL comes from the model. Reject any resource whose URL did not come from
 *  the search provider (enforce with a test)."
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Verify goal ownership
  const { data: goal, error: goalErr } = await supabase
    .from("goals")
    .select("id, title")
    .eq("id", goalId)
    .eq("owner_id", user.id)
    .single();

  if (goalErr || !goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // 2. Parse optional body parameters
  let skillId: string | undefined;
  let maxSkills: number | undefined;

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.skill_id) {
      skillId = String(body.skill_id);
    }
    if (body?.max_skills) {
      maxSkills = Number(body.max_skills);
    }
  } catch {
    // optional body
  }

  // 3. Enqueue AI job for resource discovery
  const serviceRole = createServiceRoleClient();
  const payload = {
    goal_id: goalId,
    skill_id: skillId,
    max_skills: maxSkills || 3,
  };

  const { data: job, error: jobErr } = await serviceRole
    .from("ai_jobs")
    .insert({
      owner_id: user.id,
      task: "search_queries",
      payload: payload as any,
      status: "queued",
    })
    .select("id, status")
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: `Failed to enqueue discovery job: ${jobErr?.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      job_id: job.id,
      status: job.status,
      message: "Resource discovery job queued.",
    },
  });
}
