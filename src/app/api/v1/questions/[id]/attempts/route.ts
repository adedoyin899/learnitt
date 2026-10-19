import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recalculateSkillEvidence } from "@/lib/evidence/service";
import { gradeAppliedAttempt, markRecallAnswerDeterministically } from "@/lib/quiz/grading";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const attemptInputSchema = z.object({
  client_id: z.string().uuid(),
  answer_text: z.string().optional().nullable(),
  answer_file_path: z.string().optional().nullable(),
  user_confirmed_run: z.boolean().optional().nullable(),
  expected_output: z.string().optional().nullable(),
});

/**
 * POST /api/v1/questions/[id]/attempts
 * Submits an answer attempt. Idempotent by client_id.
 * - Recall is marked deterministically on the server (no AI).
 * - Applied/artifact is AI-graded with confidence routing and cap pausing.
 * PRD Section 7, 8 & Phase L7 Requirements 3, 4, 5, 7.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: questionId } = await params;
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

  const parsed = attemptInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { client_id, answer_text, answer_file_path, user_confirmed_run, expected_output } =
    parsed.data;

  // 1. Idempotency check: (owner_id, client_id)
  const { data: existingAttempt } = await supabase
    .from("attempts")
    .select(`
      id,
      question_id,
      answer_text,
      answer_file_path,
      status,
      client_id,
      created_at,
      grades (*)
    `)
    .eq("owner_id", user.id)
    .eq("client_id", client_id)
    .maybeSingle();

  if (existingAttempt) {
    const currentGrade = (existingAttempt.grades || []).find((g: any) => g.is_current);
    return NextResponse.json(
      {
        success: true,
        attempt: existingAttempt,
        grade: currentGrade || null,
        idempotent: true,
      },
      { status: 200 }
    );
  }

  // 2. Fetch question
  const { data: question, error: qErr } = await supabase
    .from("quiz_questions")
    .select("id, quiz_id, type, prompt, options, answer_key, rubric")
    .eq("id", questionId)
    .eq("owner_id", user.id)
    .single();

  if (qErr || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("skill_id")
    .eq("id", question.quiz_id)
    .single();

  const skillId = quiz?.skill_id;

  // Format stored answer (if artifact, record confirmation and expected output)
  let formattedAnswerText = answer_text || "";
  if (question.type === "artifact" || user_confirmed_run !== undefined || expected_output) {
    formattedAnswerText = JSON.stringify({
      answer: answer_text || "",
      expected_output: expected_output || "",
      user_confirmed_run: !!user_confirmed_run,
    });
  }

  // 3. Handle RECALL (deterministic marking on server, ZERO AI call)
  if (question.type === "recall_mc" || question.type === "recall_tf") {
    const recallResult = markRecallAnswerDeterministically(
      answer_text || "",
      question.answer_key,
      question.options as string[] | null
    );

    // Insert attempt as 'graded'
    const { data: attemptRow, error: attErr } = await supabase
      .from("attempts")
      .insert({
        owner_id: user.id,
        question_id: question.id,
        answer_text: formattedAnswerText,
        answer_file_path: answer_file_path || null,
        status: "graded",
        client_id,
      })
      .select()
      .single();

    if (attErr || !attemptRow) {
      return NextResponse.json({ error: attErr?.message || "Failed to save attempt" }, { status: 500 });
    }

    // Insert deterministic grade
    const { data: gradeRow, error: grErr } = await supabase
      .from("grades")
      .insert({
        owner_id: user.id,
        attempt_id: attemptRow.id,
        source: "mc_auto",
        total: recallResult.score,
        verdict: recallResult.verdict,
        feedback: recallResult.feedback,
        confidence: 1.0,
        is_current: true,
      })
      .select()
      .single();

    if (grErr || !gradeRow) {
      return NextResponse.json({ error: grErr?.message || "Failed to save grade" }, { status: 500 });
    }

    // Update skill evidence
    if (skillId) {
      await recalculateSkillEvidence(supabase, skillId, user.id);
    }

    return NextResponse.json(
      {
        success: true,
        attempt: attemptRow,
        grade: gradeRow,
      },
      { status: 201 }
    );
  }

  // 4. Handle APPLIED and ARTIFACT
  // Initial insert as 'submitted'
  const { data: attemptRow, error: attErr } = await supabase
    .from("attempts")
    .insert({
      owner_id: user.id,
      question_id: question.id,
      answer_text: formattedAnswerText,
      answer_file_path: answer_file_path || null,
      status: "submitted",
      client_id,
    })
    .select()
    .single();

  if (attErr || !attemptRow) {
    return NextResponse.json({ error: attErr?.message || "Failed to save attempt" }, { status: 500 });
  }

  // Grade the attempt
  try {
    const gradeResult = await gradeAppliedAttempt(supabase, attemptRow.id, user.id);

    return NextResponse.json(
      {
        success: true,
        attempt: {
          ...attemptRow,
          status: gradeResult.attemptStatus,
        },
        grade: gradeResult.grade || null,
        message: gradeResult.message,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      {
        success: true,
        attempt: attemptRow,
        warning: `Grading pending or delayed: ${error.message}`,
      },
      { status: 201 }
    );
  }
}
