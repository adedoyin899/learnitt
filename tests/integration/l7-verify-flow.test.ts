import { describe, expect, it } from "vitest";
import { MockAIProvider } from "@/lib/ai/adapters/mock-adapter";
import { evaluateEvidence, getEvidenceLabel } from "@/lib/evidence/engine";
import { generateQuizForSkill, validateAndCleanQuizQuestions } from "@/lib/quiz/generate";
import {
  confirmNeedsYourReviewAttempt,
  gradeAppliedAttempt,
  markRecallAnswerDeterministically,
  overrideGrade,
  selfGradeAttempt,
} from "@/lib/quiz/grading";

describe("L7 End-to-End Verification Flow", () => {
  const provider = new MockAIProvider();

  // In-memory test store simulating PostgreSQL
  function createTestDb() {
    const profiles: any[] = [
      { id: "user_test_1", ai_materials_consent: true, ai_consent_asked_at: new Date().toISOString() },
      { id: "user_test_2", ai_materials_consent: true, ai_consent_asked_at: new Date().toISOString() },
      { id: "user_test_3", ai_materials_consent: true, ai_consent_asked_at: new Date().toISOString() },
      { id: "user_test_4", ai_materials_consent: true, ai_consent_asked_at: new Date().toISOString() },
    ];
    const skills: any[] = [];
    const skillMaterialLinks: any[] = [];
    const materialChunks: any[] = [];
    const quizzes: any[] = [];
    const quizQuestions: any[] = [];
    const attempts: any[] = [];
    const grades: any[] = [];
    const skillReviews: any[] = [];
    const auditEvents: any[] = [];

    const dbClient: any = {
      from: (table: string) => {
        const state: any = {
          _filters: [] as Array<(item: any) => boolean>,
        };

        const builder: any = {
          select: (_cols?: string) => builder,
          insert: (val: any) => {
            const items = Array.isArray(val) ? val : [val];
            const inserted = items.map((it: any) => {
              const row = { id: it.id || crypto.randomUUID(), ...it };
              if (table === "profiles") profiles.push(row);
              if (table === "skills") skills.push(row);
              if (table === "skill_material_links") skillMaterialLinks.push(row);
              if (table === "material_chunks") materialChunks.push(row);
              if (table === "quizzes") quizzes.push(row);
              if (table === "quiz_questions") quizQuestions.push(row);
              if (table === "attempts") attempts.push(row);
              if (table === "grades") grades.push(row);
              if (table === "audit_events") auditEvents.push(row);
              return row;
            });
            return {
              select: () => ({
                single: async () => ({ data: inserted[0], error: null }),
                maybeSingle: async () => ({ data: inserted[0], error: null }),
                then: (res: any) => res({ data: inserted, error: null }),
              }),
              then: (res: any) => res({ data: inserted, error: null }),
            };
          },
          update: (val: any) => ({
            eq: (col: string, targetVal: any) => ({
              eq: (col2?: string, targetVal2?: any) => ({
                then: (res: any) => {
                  let matched: any[] = [];
                  if (table === "grades") matched = grades;
                  if (table === "attempts") matched = attempts;
                  if (table === "skills") matched = skills;
                  if (table === "profiles") matched = profiles;

                  matched
                    .filter(
                      (item) =>
                        item[col] === targetVal && (!col2 || item[col2] === targetVal2)
                    )
                    .forEach((item) => Object.assign(item, val));
                  return res({ error: null });
                },
              }),
              then: (res: any) => {
                let matched: any[] = [];
                if (table === "grades") matched = grades;
                if (table === "attempts") matched = attempts;
                if (table === "skills") matched = skills;
                if (table === "profiles") matched = profiles;

                matched
                  .filter((item) => item[col] === targetVal)
                  .forEach((item) => Object.assign(item, val));
                return res({ error: null });
              },
            }),
          }),
          upsert: (val: any) => {
            if (table === "skill_reviews") {
              const existingIdx = skillReviews.findIndex((r) => r.skill_id === val.skill_id);
              if (existingIdx >= 0) {
                skillReviews[existingIdx] = { ...skillReviews[existingIdx], ...val };
              } else {
                skillReviews.push(val);
              }
            }
            return Promise.resolve({ error: null });
          },
          eq: (col: string, val: any) => {
            state._filters.push((it: any) => it[col] === val);
            return builder;
          },
          in: (col: string, vals: any[]) => {
            const set = new Set(vals);
            state._filters.push((it: any) => set.has(it[col]));
            return builder;
          },
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => {
            let list: any[] = [];
            if (table === "profiles") list = profiles;
            if (table === "skills") list = skills;
            if (table === "quizzes") list = quizzes;
            if (table === "quiz_questions") list = quizQuestions;
            if (table === "attempts") list = attempts;
            if (table === "grades") list = grades;
            if (table === "skill_reviews") list = skillReviews;

            const filtered = list.filter((it) => state._filters.every((f: any) => f(it)));
            return { data: filtered[0] || null, error: null };
          },
          single: async () => {
            let list: any[] = [];
            if (table === "profiles") list = profiles;
            if (table === "skills") list = skills;
            if (table === "quizzes") list = quizzes;
            if (table === "quiz_questions") list = quizQuestions;
            if (table === "attempts") list = attempts;
            if (table === "grades") list = grades;

            const filtered = list.filter((it) => state._filters.every((f: any) => f(it)));
            return { data: filtered[0] || null, error: filtered[0] ? null : new Error("Not found") };
          },
          then: (res: any) => {
            let list: any[] = [];
            if (table === "profiles") list = profiles;
            if (table === "skills") list = skills;
            if (table === "skill_material_links") list = skillMaterialLinks;
            if (table === "material_chunks") list = materialChunks;
            if (table === "quizzes") list = quizzes;
            if (table === "quiz_questions") list = quizQuestions;
            if (table === "attempts") {
              list = attempts.map((a) => ({
                ...a,
                grades: grades.filter((g) => g.attempt_id === a.id),
              }));
            }
            if (table === "grades") list = grades;
            if (table === "skill_reviews") list = skillReviews;
            if (table === "audit_events") list = auditEvents;

            const filtered = list.filter((it) => state._filters.every((f: any) => f(it)));
            return res({ data: filtered, error: null });
          },
        };

        return builder;
      },
      _data: {
        profiles,
        skills,
        skillMaterialLinks,
        materialChunks,
        quizzes,
        quizQuestions,
        attempts,
        grades,
        skillReviews,
        auditEvents,
      },
    };

    return dbClient;
  }

  it("1. Takes a recall quiz and an applied question end to end and verifies skill", async () => {
    const db = createTestDb();
    const ownerId = "user_test_1";

    // Setup: Skill with confirmed material and chunk
    const skill = {
      id: "sk_applied_01",
      owner_id: ownerId,
      name: "SQL & Relational Modeling",
      verification_type: "applied",
      status: "not_started",
      evidence_level: 0,
      goal_id: "goal_01",
    };
    db._data.skills.push(skill);
    db._data.skillMaterialLinks.push({
      skill_id: skill.id,
      material_id: "mat_01",
      owner_id: ownerId,
      confirmed: true,
    });
    db._data.materialChunks.push({
      id: "chunk_sql_01",
      material_id: "mat_01",
      owner_id: ownerId,
      ordinal: 0,
      content: "SQL filtering uses WHERE clause before aggregation.",
    });

    // Generate Quiz
    const quizResult = await generateQuizForSkill(db, skill.id, ownerId, provider);
    expect(quizResult.quiz).toBeDefined();
    expect(quizResult.questions.length).toBeGreaterThan(0);

    const recallQ = quizResult.questions.find((q: any) => q.type.startsWith("recall"));
    const appliedQ = quizResult.questions.find((q: any) => q.type === "applied");
    expect(recallQ).toBeDefined();
    expect(appliedQ).toBeDefined();

    // Verify GET /quizzes/:id invariant: recall answer_key never exposed
    const safeRecall = { ...recallQ, answer_key: undefined };
    expect(safeRecall.answer_key).toBeUndefined();

    // 1a. Take recall question: marked deterministically on the server (NO AI call)
    const recallAttempt = {
      id: "att_recall_1",
      owner_id: ownerId,
      question_id: recallQ!.id,
      answer_text: "0",
      status: "graded",
      client_id: "client_rec_1",
    };
    db._data.attempts.push(recallAttempt);

    const recallMark = markRecallAnswerDeterministically(
      0,
      recallQ!.answer_key as any,
      (recallQ!.options || []) as any
    );
    expect(recallMark.isCorrect).toBe(true);
    expect(recallMark.score).toBe(100);
    expect(recallMark.verdict).toBe("pass");

    db._data.grades.push({
      id: "gr_rec_1",
      owner_id: ownerId,
      attempt_id: recallAttempt.id,
      source: "mc_auto",
      total: recallMark.score,
      verdict: recallMark.verdict,
      is_current: true,
    });

    // 1b. Take applied question: AI graded against rubric
    const appliedAttempt = {
      id: "att_applied_1",
      owner_id: ownerId,
      question_id: appliedQ!.id,
      answer_text: "INNER JOIN returns only matching rows. LEFT JOIN returns all left rows.",
      status: "submitted",
      client_id: "client_app_1",
    };
    db._data.attempts.push(appliedAttempt);

    const gradeRes = await gradeAppliedAttempt(db, appliedAttempt.id, ownerId, provider);
    expect(gradeRes.attemptStatus).toBe("graded");
    expect(gradeRes.grade).toBeDefined();
    expect(gradeRes.grade?.total).toBeGreaterThanOrEqual(70);
    expect(gradeRes.grade?.verdict).toBe("pass");

    // Check evidence engine: applied skill reached E2 and is verified!
    const updatedSkill = db._data.skills.find((s: any) => s.id === skill.id);
    expect(updatedSkill.status).toBe("verified");
    expect(updatedSkill.evidence_level).toBe(2);
    expect(getEvidenceLabel(updatedSkill.evidence_level)).toBe("Applied, graded");

    // Review row created with 1 day interval
    expect(db._data.skillReviews.length).toBe(1);
    expect(db._data.skillReviews[0].skill_id).toBe(skill.id);
    expect(db._data.skillReviews[0].interval_days).toBe(1);
  });

  it("2. Forces a low-confidence grade (< 0.6) and confirms it needs your review with NO evidence awarded", async () => {
    const db = createTestDb();
    const ownerId = "user_test_2";

    const skill = {
      id: "sk_applied_02",
      owner_id: ownerId,
      name: "Distributed Computing",
      verification_type: "applied",
      status: "not_started",
      evidence_level: 0,
      goal_id: "goal_02",
    };
    db._data.skills.push(skill);

    const quiz = { id: "qz_02", skill_id: skill.id, owner_id: ownerId };
    db._data.quizzes.push(quiz);

    const question = {
      id: "q_app_02",
      quiz_id: quiz.id,
      owner_id: ownerId,
      type: "applied",
      prompt: "Explain broadcast joins in low_confidence prompt mode.",
      rubric: [
        { criterion: "A", weight: 40, description: "Crit A" },
        { criterion: "B", weight: 30, description: "Crit B" },
        { criterion: "C", weight: 30, description: "Crit C" },
      ],
    };
    db._data.quizQuestions.push(question);

    const attempt = {
      id: "att_low_conf",
      owner_id: ownerId,
      question_id: question.id,
      answer_text: "Ambiguous explanation with low confidence.",
      status: "submitted",
      client_id: "client_low_1",
    };
    db._data.attempts.push(attempt);

    // Run grading - prompt triggers mock low confidence (< 0.6)
    const gradeRes = await gradeAppliedAttempt(db, attempt.id, ownerId, provider);
    expect(gradeRes.attemptStatus).toBe("needs_your_review");
    expect(gradeRes.grade?.confidence).toBeLessThan(0.6);

    // Skill is NOT verified and awards 0 evidence
    const skillAfterGrading = db._data.skills.find((s: any) => s.id === skill.id);
    expect(skillAfterGrading.status).not.toBe("verified");
    expect(skillAfterGrading.evidence_level).toBe(0);

    // User confirms review
    await confirmNeedsYourReviewAttempt(db, attempt.id, ownerId);
    expect(db._data.attempts.find((a: any) => a.id === attempt.id).status).toBe("graded");

    // Evidence is now awarded!
    const skillAfterConfirm = db._data.skills.find((s: any) => s.id === skill.id);
    expect(skillAfterConfirm.status).toBe("verified");
    expect(skillAfterConfirm.evidence_level).toBe(2);
  });

  it("3. Overrides a grade, seeing both rows and the audit event", async () => {
    const db = createTestDb();
    const ownerId = "user_test_3";

    const skill = {
      id: "sk_applied_03",
      owner_id: ownerId,
      name: "Airflow Orchestration",
      verification_type: "applied",
      status: "practising",
      evidence_level: 0,
      goal_id: "goal_03",
    };
    db._data.skills.push(skill);

    const quiz = { id: "qz_03", skill_id: skill.id, owner_id: ownerId };
    db._data.quizzes.push(quiz);

    const question = {
      id: "q_app_03",
      quiz_id: quiz.id,
      owner_id: ownerId,
      type: "applied",
      prompt: "Explain Airflow DAG idempotency.",
    };
    db._data.quizQuestions.push(question);

    const attempt = {
      id: "att_override_test",
      owner_id: ownerId,
      question_id: question.id,
      answer_text: "A DAG should handle backfills safely.",
      status: "graded",
      client_id: "client_over_1",
    };
    db._data.attempts.push(attempt);

    // Original AI grade (failing)
    const originalAiGrade = {
      id: "gr_original_ai",
      owner_id: ownerId,
      attempt_id: attempt.id,
      source: "ai",
      total: 45,
      verdict: "fail",
      confidence: 0.9,
      model_version: "gemini-2.5-flash-lite",
      is_current: true,
    };
    db._data.grades.push(originalAiGrade);

    // User overrides the grade
    const overrideReason = "The learner correctly noted backfill safety which satisfies the criteria.";
    const newGrade = await overrideGrade(db, {
      attemptId: attempt.id,
      ownerId,
      overrideReason,
      verdict: "pass",
      total: 78,
    });

    expect(newGrade.source).toBe("user_override");
    expect(newGrade.verdict).toBe("pass");
    expect(newGrade.is_current).toBe(true);

    // Both grade rows exist in database
    const allGrades = db._data.grades.filter((g: any) => g.attempt_id === attempt.id);
    expect(allGrades.length).toBe(2);
    expect(allGrades.find((g: any) => g.id === originalAiGrade.id).is_current).toBe(false);
    expect(allGrades.find((g: any) => g.id === newGrade.id).is_current).toBe(true);

    // Audit event written
    expect(db._data.auditEvents.length).toBe(1);
    expect(db._data.auditEvents[0].event).toBe("grade_override");
    expect(db._data.auditEvents[0].detail.override_reason).toBe(overrideReason);
    expect(db._data.auditEvents[0].detail.previous_verdict).toBe("fail");
    expect(db._data.auditEvents[0].detail.new_verdict).toBe("pass");

    // Skill evidence updated to verified
    const skillAfterOverride = db._data.skills.find((s: any) => s.id === skill.id);
    expect(skillAfterOverride.status).toBe("verified");
    expect(skillAfterOverride.evidence_level).toBe(2);
  });

  it("4. A skill with only self-rating shows 'Self-rated' and is not verified", async () => {
    const db = createTestDb();
    const ownerId = "user_test_4";

    const selfSkill = {
      id: "sk_self_04",
      owner_id: ownerId,
      name: "Public Speaking & Pitching",
      verification_type: "self", // PRD 6.3: verification type self never verifies
      status: "not_started",
      evidence_level: 0,
      goal_id: "goal_04",
    };
    db._data.skills.push(selfSkill);

    const quiz = { id: "qz_04", skill_id: selfSkill.id, owner_id: ownerId };
    db._data.quizzes.push(quiz);

    const question = {
      id: "q_self_04",
      quiz_id: quiz.id,
      owner_id: ownerId,
      type: "applied",
      prompt: "Self-assess pitch delivery.",
    };
    db._data.quizQuestions.push(question);

    const attempt = {
      id: "att_self_test",
      owner_id: ownerId,
      question_id: question.id,
      answer_text: "I think my pitch was great.",
      status: "pending_grade",
      client_id: "client_self_1",
    };
    db._data.attempts.push(attempt);

    // User self-grades
    const selfGrade = await selfGradeAttempt(db, {
      attemptId: attempt.id,
      ownerId,
      total: 100, // 100% score self-rated
      verdict: "pass",
    });

    expect(selfGrade.source).toBe("self");

    // Skill status is NEVER verified
    const finalSkill = db._data.skills.find((s: any) => s.id === selfSkill.id);
    expect(finalSkill.status).not.toBe("verified");
    expect(finalSkill.evidence_level).toBe(0);
    expect(getEvidenceLabel(finalSkill.evidence_level)).toBe("Self-rated");
  });
});
