import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDueReviewItems } from "@/lib/review/service";

/**
 * GET /api/v1/review/due
 * Returns due items for spaced review, strictly capped at 15 minutes.
 * Prompt Requirement 2:
 * "GET /review/due returns due items. The Today review block is capped at 15 minutes.
 *  Review uses short recall questions from existing quizzes, plus saved cards (self-rated)."
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const maxMinutesParam = searchParams.get("max_minutes");
  const maxMinutes = maxMinutesParam ? parseInt(maxMinutesParam, 10) : 15;

  try {
    const result = await getDueReviewItems(supabase, {
      ownerId: user.id,
      maxMinutes,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch due review items" },
      { status: 500 }
    );
  }
}
