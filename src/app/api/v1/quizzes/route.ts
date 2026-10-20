import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface QuizListItem {
  id: string;
  skill_id: string;
  skill_name: string;
  goal_id: string;
  goal_title: string;
  created_at: string;
  question_count: number;
  question_types: string[];
  status: "not_started" | "in_progress" | "passed" | "needs_review";
  latest_score: number | null;
  latest_attempt_at: string | null;
}

export interface AvailableSkillItem {
  id: string;
  name: string;
  goal_id: string;
  goal_title: string;
  status: string;
  evidence_level: number;
  verification_type: string;
}

/**
 * GET /api/v1/quizzes
 * Returns all quizzes created for the authenticated user, enriched with skill & goal metadata,
 * latest score/attempt status, plus a list of available skills to generate quizzes on demand.
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

  try {
    // 1. Fetch user's quizzes
    const { data: quizzes, error: quizErr } = await supabase
      .from("quizzes")
      .select("id, skill_id, created_at, prompt_version, model_version")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });

    if (quizErr) {
      throw quizErr;
    }

    // 2. Fetch user's goals
    const { data: goals } = await supabase
      .from("goals")
      .select("id, title, status")
      .eq("owner_id", user.id);

    const goalMap = new Map((goals || []).map((g) => [g.id, g.title]));

    // 3. Fetch user's skills
    const { data: skills } = await supabase
      .from("skills")
      .select("id, name, goal_id, status, evidence_level, verification_type")
      .eq("owner_id", user.id);

    const skillMap = new Map((skills || []).map((s) => [s.id, s]));

    // 4. Fetch questions and attempts for these quizzes
    const quizIds = (quizzes || []).map((q) => q.id);

    let questionsByQuiz = new Map<string, Array<{ id: string; type: string }>>();
    let allQuestionIds: string[] = [];

    if (quizIds.length > 0) {
      const { data: questions } = await supabase
        .from("quiz_questions")
        .select("id, quiz_id, type")
        .in("quiz_id", quizIds);

      for (const q of questions || []) {
        const list = questionsByQuiz.get(q.quiz_id) || [];
        list.push({ id: q.id, type: q.type });
        questionsByQuiz.set(q.quiz_id, list);
        allQuestionIds.push(q.id);
      }
    }

    // 5. Fetch attempts & grades for these questions
    let gradesByQuestionId = new Map<string, { total: number | null; verdict: string | null }>();
    let latestAttemptTimeByQuiz = new Map<string, string>();

    if (allQuestionIds.length > 0) {
      const { data: attempts } = await supabase
        .from("attempts")
        .select("id, question_id, created_at")
        .in("question_id", allQuestionIds)
        .order("created_at", { ascending: false });

      const attemptIds = (attempts || []).map((a) => a.id);
      const attemptQuestionMap = new Map((attempts || []).map((a) => [a.id, a.question_id]));

      if (attemptIds.length > 0) {
        const { data: grades } = await supabase
          .from("grades")
          .select("attempt_id, total, verdict")
          .in("attempt_id", attemptIds);

        for (const g of grades || []) {
          const qId = attemptQuestionMap.get(g.attempt_id);
          if (qId && !gradesByQuestionId.has(qId)) {
            gradesByQuestionId.set(qId, { total: g.total, verdict: g.verdict });
          }
        }
      }
    }

    // 6. Map into QuizListItem list
    const quizList: QuizListItem[] = (quizzes || []).map((q) => {
      const skill = skillMap.get(q.skill_id);
      const goalTitle = skill ? goalMap.get(skill.goal_id) || "Learning Goal" : "Goal";
      const questions = questionsByQuiz.get(q.id) || [];
      const types = Array.from(new Set(questions.map((qu) => qu.type)));

      // Calculate score if questions have grades
      let gradedCount = 0;
      let totalScore = 0;
      let hasPass = false;

      for (const qu of questions) {
        const grade = gradesByQuestionId.get(qu.id);
        if (grade && grade.total !== null) {
          gradedCount++;
          totalScore += grade.total;
          if (grade.verdict === "pass") hasPass = true;
        }
      }

      const avgScore = gradedCount > 0 ? Math.round(totalScore / gradedCount) : null;
      let status: QuizListItem["status"] = "not_started";

      if (gradedCount === questions.length && questions.length > 0) {
        status = hasPass || (avgScore !== null && avgScore >= 70) ? "passed" : "needs_review";
      } else if (gradedCount > 0) {
        status = "in_progress";
      }

      return {
        id: q.id,
        skill_id: q.skill_id,
        skill_name: skill?.name || "Skill Assessment",
        goal_id: skill?.goal_id || "",
        goal_title: goalTitle,
        created_at: q.created_at,
        question_count: questions.length,
        question_types: types,
        status,
        latest_score: avgScore,
        latest_attempt_at: latestAttemptTimeByQuiz.get(q.id) || null,
      };
    });

    // 7. Prepare available skills for on-demand quiz generation
    const availableSkills: AvailableSkillItem[] = (skills || []).map((s) => ({
      id: s.id,
      name: s.name,
      goal_id: s.goal_id,
      goal_title: goalMap.get(s.goal_id) || "Learning Goal",
      status: s.status,
      evidence_level: s.evidence_level,
      verification_type: s.verification_type,
    }));

    // Stats
    const totalCount = quizList.length;
    const passedCount = quizList.filter((q) => q.status === "passed").length;
    const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

    return NextResponse.json({
      success: true,
      quizzes: quizList,
      available_skills: availableSkills,
      stats: {
        total_quizzes: totalCount,
        passed_quizzes: passedCount,
        pass_rate_percent: passRate,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load quizzes." },
      { status: 500 }
    );
  }
}
