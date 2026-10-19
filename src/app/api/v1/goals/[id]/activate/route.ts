import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/goals/[id]/activate
 * Activates a goal. Enforces one-active-goal rule (PRD Epic A1, AC2).
 * If another goal is active, prompts/requires archive confirmation first.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Check goal exists and belongs to user
  const { data: targetGoal, error: targetErr } = await supabase
    .from("goals")
    .select("id, title, status")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (targetErr || !targetGoal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  if (targetGoal.status === "active") {
    return NextResponse.json({ success: true, goal: targetGoal, message: "Goal is already active." });
  }

  let body: { archiveExisting?: boolean } = {};
  try {
    const text = await req.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    // Empty body is acceptable
  }

  // 2. Check if another goal is active for this owner
  const { data: activeGoals, error: activeErr } = await supabase
    .from("goals")
    .select("id, title")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .neq("id", id);

  if (activeErr) {
    return NextResponse.json({ error: activeErr.message }, { status: 500 });
  }

  const existingActive = activeGoals && activeGoals.length > 0 ? activeGoals[0] : null;

  if (existingActive) {
    if (!body.archiveExisting) {
      // Prompt user to archive first
      return NextResponse.json(
        {
          error: "Another goal is currently active. Archive it first to activate this one.",
          code: "ACTIVE_GOAL_EXISTS",
          activeGoal: {
            id: existingActive.id,
            title: existingActive.title,
          },
        },
        { status: 409 }
      );
    }

    // User confirmed: archive existing active goal
    const { error: archiveErr } = await supabase
      .from("goals")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", existingActive.id)
      .eq("owner_id", user.id);

    if (archiveErr) {
      return NextResponse.json({ error: `Failed to archive previous active goal: ${archiveErr.message}` }, { status: 500 });
    }
  }

  // 3. Activate target goal
  const { data: activatedGoal, error: activateErr } = await supabase
    .from("goals")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (activateErr || !activatedGoal) {
    return NextResponse.json({ error: activateErr?.message || "Failed to activate goal" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    goal: activatedGoal,
    archivedGoalId: existingActive ? existingActive.id : null,
  });
}
