import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { selfGradeAttempt } from "@/lib/quiz/grading";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const selfGradeSchema = z.object({
  total: z.number().int().min(0).max(100),
  verdict: z.enum(["pass", "fail"]),
  criterion_scores: z.any().optional(),
  feedback: z.any().optional(),
});

/**
 * POST /api/v1/attempts/[id]/self-grade
 * Allows user to self-grade when AI is paused or pending.
 * Stored with source: 'self', NEVER counts as E2 per PRD 6.3.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = selfGradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const grade = await selfGradeAttempt(supabase, {
      attemptId,
      ownerId: user.id,
      total: parsed.data.total,
      verdict: parsed.data.verdict,
      criterionScores: parsed.data.criterion_scores,
      feedback: parsed.data.feedback,
    });

    return NextResponse.json({
      success: true,
      grade,
      message: "Self-grade recorded (never counted as verified E2 evidence).",
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
