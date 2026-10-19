import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  confirmMaterialLink,
  getGoalLinksWithDetails,
  removeMaterialLink,
} from "@/lib/materials/linking";

const linkActionSchema = z.object({
  action: z.enum(["confirm", "remove"]),
  skillId: z.string().uuid(),
  materialId: z.string().uuid(),
});

/**
 * GET /api/v1/materials/links?goal_id=UUID
 * Returns all proposed and confirmed links for a goal.
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
    const links = await getGoalLinksWithDetails(user.id, goalId, supabase);
    return NextResponse.json({ links });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to retrieve links." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/materials/links
 * Allows the user to confirm or remove a link.
 * Confirmed links are never overwritten by a later run.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = linkActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid link action parameters." },
        { status: 400 }
      );
    }

    const { action, skillId, materialId } = parsed.data;

    if (action === "confirm") {
      await confirmMaterialLink(user.id, skillId, materialId, supabase);
    } else if (action === "remove") {
      await removeMaterialLink(user.id, skillId, materialId, supabase);
    }

    return NextResponse.json({ success: true, action, skillId, materialId });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to update link." },
      { status: 500 }
    );
  }
}
