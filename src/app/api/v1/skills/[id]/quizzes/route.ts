import { NextRequest, NextResponse } from "next/server";
import { enqueueJob } from "@/lib/ai/jobs/enqueue";
import { generateQuizForSkill } from "@/lib/quiz/generate";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/skills/[id]/quizzes
 * Enqueues make_quiz (or executes synchronously if ?sync=true).
 * PRD 7.4 & Phase L7 Requirement 1.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: skillId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Verify skill exists and belongs to user
  const { data: skill, error: skillErr } = await supabase
    .from("skills")
    .select("id, name, verification_type")
    .eq("id", skillId)
    .eq("owner_id", user.id)
    .single();

  if (skillErr || !skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const isSync = req.nextUrl.searchParams.get("sync") === "true";

  if (isSync) {
    try {
      const result = await generateQuizForSkill(supabase, skill.id, user.id);
      return NextResponse.json(
        {
          success: true,
          quiz: result.quiz,
          questions: result.questions,
        },
        { status: 201 }
      );
    } catch (err: unknown) {
      const error = err as Error;
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  try {
    const { jobId } = await enqueueJob({
      ownerId: user.id,
      task: "make_quiz",
      payload: {
        skill_id: skill.id,
      },
    });

    return NextResponse.json(
      {
        jobId,
        status: "queued",
        message: "Quiz generation enqueued.",
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/v1/skills/[id]/quizzes
 * Returns all quizzes for a skill.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: skillId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: quizzes, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("skill_id", skillId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ quizzes });
}
