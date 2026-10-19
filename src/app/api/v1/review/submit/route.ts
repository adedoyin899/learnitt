import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitReviewOutcome } from "@/lib/review/service";

/**
 * POST /api/v1/review/submit
 * Records a review pass or fail outcome, updating skill_reviews interval and skill status.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { skill_id, item_id, item_type, verdict } = body;

    if (!skill_id || !verdict || !["pass", "fail"].includes(verdict)) {
      return NextResponse.json(
        { error: "skill_id and a valid verdict ('pass' | 'fail') are required" },
        { status: 400 }
      );
    }

    const result = await submitReviewOutcome(supabase, {
      ownerId: user.id,
      skillId: skill_id,
      itemId: item_id || "",
      itemType: item_type || "recall_question",
      verdict,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to submit review outcome" },
      { status: 500 }
    );
  }
}
