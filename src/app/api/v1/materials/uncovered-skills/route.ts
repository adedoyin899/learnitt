import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSkillsWithoutMaterials } from "@/lib/materials/linking";

/**
 * GET /api/v1/materials/uncovered-skills?goal_id=UUID
 * Returns skills for a goal that have no materials linked yet.
 * PRD Epic B2 & Prompt Requirement 6: "Show which skills have no material yet."
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const goalId = searchParams.get("goal_id");

  if (!goalId) {
    return NextResponse.json(
      { error: "goal_id query parameter is required." },
      { status: 400 }
    );
  }

  try {
    const summary = await getSkillsWithoutMaterials(user.id, goalId, supabase);
    return NextResponse.json(summary);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to retrieve uncovered skills." },
      { status: 500 }
    );
  }
}
