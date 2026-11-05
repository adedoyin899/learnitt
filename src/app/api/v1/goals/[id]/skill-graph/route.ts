import { NextRequest, NextResponse } from "next/server";
import { enqueueJob } from "@/lib/ai/jobs/enqueue";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/goals/[id]/skill-graph
 * Enqueues the skill_graph AI job (PRD 7.3, Epic A2).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { skipCache?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine
  }

  // 1. Verify goal exists and belongs to user
  const { data: goal, error: goalErr } = await supabase
    .from("goals")
    .select("id, title, domain, starting_level, target_date, weekly_hours")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (goalErr || !goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  try {
    if (body.skipCache) {
      await supabase.from("resources").delete().eq("goal_id", id).eq("owner_id", user.id);
    }

    // 2. Enqueue the skill_graph job
    const { jobId } = await enqueueJob({
      ownerId: user.id,
      task: "skill_graph",
      payload: {
        goal_id: goal.id,
        title: goal.title,
        domain: goal.domain,
        starting_level: goal.starting_level,
        target_date: goal.target_date,
        weekly_hours: Number(goal.weekly_hours || 6),
        ...(body.skipCache ? { refreshed_at: new Date().toISOString() } : {}),
      },
    });

    // In production / serverless environments, immediately trigger a worker tick
    // so the skill graph is generated without relying on an external cron process.
    if (process.env.NODE_ENV !== "test") {
      try {
        const { runWorkerTick } = await import("@/lib/ai/jobs/worker");
        await runWorkerTick({ batchSize: 1 });
      } catch (tickErr) {
        console.warn("Inline worker tick non-fatal error:", tickErr);
      }
    }

    return NextResponse.json(
      {
        jobId,
        status: "queued",
        message: "Skill graph generation started.",
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
