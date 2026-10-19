import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getMaterialConsent,
  getMaterialPreviewForConsent,
  updateMaterialConsent,
} from "@/lib/materials/consent";

const updateConsentSchema = z.object({
  consent: z.boolean(),
});

/**
 * GET /api/v1/user/consent?goal_id=UUID
 * Returns the current consent state along with a preview of material names and chunk counts.
 * PRD Epic I3: "show what will be sent (material names and chunk counts) and ask once."
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

  try {
    const status = await getMaterialConsent(user.id, supabase);
    const preview = await getMaterialPreviewForConsent(user.id, goalId, supabase);

    return NextResponse.json({
      status,
      preview,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to retrieve consent status." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/user/consent
 * Updates the user's AI materials consent preference.
 * PRD Epic I3: "Store the answer on the profile."
 */
export async function POST(request: NextRequest) {
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
    const parsed = updateConsentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid consent payload." },
        { status: 400 }
      );
    }

    const updated = await updateMaterialConsent(user.id, parsed.data.consent, supabase);

    return NextResponse.json({
      status: updated,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to update consent." },
      { status: 500 }
    );
  }
}
