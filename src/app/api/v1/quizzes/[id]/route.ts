import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/quizzes/[id]
 * Returns quiz and questions.
 * INVARIANT: NEVER returns recall answer keys to the client.
 * PRD 7.4, 9 & Phase L7 Requirement 2.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: quizId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Fetch quiz
  const { data: quiz, error: quizErr } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", quizId)
    .eq("owner_id", user.id)
    .single();

  if (quizErr || !quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  // 2. Fetch skill details for context
  const { data: skill } = await supabase
    .from("skills")
    .select("id, name, verification_type")
    .eq("id", quiz.skill_id)
    .single();

  // 3. Fetch questions
  const { data: rawQuestions, error: qErr } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("quiz_id", quizId)
    .eq("owner_id", user.id)
    .order("position", { ascending: true });

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  // 4. Sanitize questions: STRICTLY STRIP answer_key FOR RECALL QUESTIONS
  const questions = (rawQuestions || []).map((q) => {
    const isRecall = q.type === "recall_mc" || q.type === "recall_tf";
    const { answer_key, ...safeQuestion } = q;

    return {
      ...safeQuestion,
      // For recall, answer_key is completely omitted/null
      answer_key: isRecall ? null : answer_key,
    };
  });

  return NextResponse.json({
    quiz: {
      ...quiz,
      skill,
    },
    questions,
  });
}
