import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { approveSkillResources } from "@/lib/discovery/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/skills/[id]/resources/approve-all
 * Approves all pending resources for a given skill.
 * Requirement 5: "Approve per resource or per skill."
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: skillId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let goalId = "";
  try {
    const body = await request.json();
    goalId = body?.goal_id || "";
  } catch {
    // If not provided in body, look up skill
  }

  if (!goalId) {
    const { data: skill } = await supabase
      .from("skills")
      .select("goal_id")
      .eq("id", skillId)
      .single();

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    goalId = skill.goal_id;
  }

  try {
    const result = await approveSkillResources(skillId, goalId, user.id, supabase);
    return NextResponse.json({
      data: {
        skill_id: skillId,
        approvedCount: result.approvedCount,
        attachedPlanItemIds: result.attachedPlanItemIds,
        message: `Approved ${result.approvedCount} resources for skill.`,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to approve resources for skill" },
      { status: 400 }
    );
  }
}
