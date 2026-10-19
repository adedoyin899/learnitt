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
 * POST /api/v1/attempts/[id]/override
 * Overrides a grade with a required short reason.
 * Stores as a new row with source: user_override, keeps original for audit,
 * logs an audit_events row, and updates evidence engine.
 * PRD Section 6, 8 & Phase L7 Requirement 6.
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

  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const newGrade = await overrideGrade(supabase, {
      attemptId,
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
