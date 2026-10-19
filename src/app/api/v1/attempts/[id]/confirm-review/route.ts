import { NextRequest, NextResponse } from "next/server";
import { confirmNeedsYourReviewAttempt } from "@/lib/quiz/grading";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/attempts/[id]/confirm-review
 * Confirms an attempt that had low confidence (< 0.6) and was in 'needs_your_review'.
 * Sets attempt to 'graded' and awards evidence.
 * PRD Section 6, 7 & Phase L7 Requirement 4.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id: attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: attempt, error: attErr } = await supabase
    .from("attempts")
    .select("id, status")
    .eq("id", attemptId)
    .eq("owner_id", user.id)
    .single();

  if (attErr || !attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  try {
    await confirmNeedsYourReviewAttempt(supabase, attemptId, user.id);
    return NextResponse.json({
      success: true,
      message: "Attempt confirmed and evidence updated.",
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
