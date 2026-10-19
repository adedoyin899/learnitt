import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { overrideGrade } from "@/lib/quiz/grading";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const overrideSchema = z.object({
  override_reason: z.string().min(1, "Override reason is required"),
  criterion_scores: z
    .array(
      z.object({
        criterion: z.string().min(1),
        score: z.number().int().min(0).max(2),
        max_score: z.number().int().min(1).default(2),
        feedback: z.string().optional(),
      })
    )
    .optional(),
  total: z.number().int().min(0).max(100).optional(),
  verdict: z.enum(["pass", "fail"]).optional(),
  feedback: z.any().optional(),
});

/**
 * POST /api/v1/grades/[id]/override
 * Overrides a grade by grade id (PRD Section 9 table).
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: gradeId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the grade to get the attempt_id
  const { data: grade, error: gradeErr } = await supabase
    .from("grades")
    .select("attempt_id")
    .eq("id", gradeId)
    .eq("owner_id", user.id)
    .single();

  if (gradeErr || !grade) {
    return NextResponse.json({ error: "Grade not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const newGrade = await overrideGrade(supabase, {
      attemptId: grade.attempt_id,
      ownerId: user.id,
      overrideReason: parsed.data.override_reason,
      criterionScores: parsed.data.criterion_scores,
      total: parsed.data.total,
      verdict: parsed.data.verdict,
      feedback: parsed.data.feedback,
    });

    return NextResponse.json({
      success: true,
      grade: newGrade,
      message: "Grade overridden successfully.",
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
