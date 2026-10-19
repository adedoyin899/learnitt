import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/attempts/[id]
 * Returns attempt with question, current grade, and grade history.
 * PRD 9 & Phase L7 Screen S11.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
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
    .eq("id", attemptId)
    .eq("owner_id", user.id)
    .single();

  if (attErr || !attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  const { data: question } = await supabase
    .from("quiz_questions")
    .select("id, prompt, type, rubric, options")
    .eq("id", attempt.question_id)
    .single();

  const currentGrade = (attempt.grades || []).find((g: any) => g.is_current);

  return NextResponse.json({
    attempt: {
      ...attempt,
      question,
    },
    current_grade: currentGrade || null,
    grade_history: attempt.grades || [],
  });
}
