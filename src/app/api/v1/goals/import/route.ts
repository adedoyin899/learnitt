import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePlanToSkills } from "@/lib/planner/plan-import";
import { persistSkillGraphForGoal, SkillGraphPayloadItem } from "@/lib/planner/persist-graph";
import { calculateFeasibility, SkillFeasibilityItem } from "@/lib/planner/feasibility";
import { Database } from "@/types/database";

/**
 * POST /api/v1/goals/import
 * Imports an existing plan from pasted text or uploaded .md / .txt file (PRD Epic A4).
 * Stores original content as a material of kind 'plan_import'.
 * Rejects other file formats.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";
  let rawContent = "";
  let filename = "plan.md";
  let saveAsDraftGoal = false;
  let targetDate = "";
  let weeklyHours = 8;
  let studyDays = [1, 2, 3, 4, 5];

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");
    const saveGoalFlag = formData.get("saveAsDraftGoal");
    const targetDateParam = formData.get("targetDate");
    const weeklyHoursParam = formData.get("weeklyHours");

    if (saveGoalFlag === "true") saveAsDraftGoal = true;
    if (typeof targetDateParam === "string") targetDate = targetDateParam;
    if (typeof weeklyHoursParam === "string") weeklyHours = parseFloat(weeklyHoursParam) || 8;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "A valid .md or .txt file is required." }, { status: 400 });
    }

    const fileObj = file as File;
    filename = fileObj.name || "plan.md";

    // Strict extension check: only .md or .txt
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext !== "md" && ext !== "txt") {
      return NextResponse.json(
        { error: "Only .md and .txt files are supported for plan import." },
        { status: 400 }
      );
    }

    rawContent = await fileObj.text();
  } else {
    // JSON body
    let body: {
      content?: string;
      filename?: string;
      saveAsDraftGoal?: boolean;
      targetDate?: string;
      weeklyHours?: number;
      studyDays?: number[];
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body.content || typeof body.content !== "string") {
      return NextResponse.json({ error: "content string is required." }, { status: 400 });
    }

    rawContent = body.content;
    if (body.filename) {
      filename = body.filename;
      const ext = filename.split(".").pop()?.toLowerCase();
      if (ext !== "md" && ext !== "txt") {
        return NextResponse.json(
          { error: "Only .md and .txt files are supported for plan import." },
          { status: 400 }
        );
      }
    }

    if (body.saveAsDraftGoal) saveAsDraftGoal = true;
    if (body.targetDate) targetDate = body.targetDate;
    if (body.weeklyHours) weeklyHours = body.weeklyHours;
    if (body.studyDays) studyDays = body.studyDays;
  }

  if (!rawContent.trim()) {
    return NextResponse.json({ error: "File or pasted text content is empty." }, { status: 400 });
  }

  // 1. Convert phases and weeks into reviewable skills
  const parsedPlan = parsePlanToSkills(rawContent);

  // If preview only (not yet saving)
  if (!saveAsDraftGoal) {
    const tempFeasibilityItems: SkillFeasibilityItem[] = parsedPlan.skills.map((s) => ({
      id: s.id,
      name: s.name,
      priority: s.priority || 2,
      estimated_min_minutes: s.estimated_min_minutes,
      estimated_max_minutes: s.estimated_max_minutes,
      status: "not_started",
    }));

    const previewDate = targetDate || new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const previewFeasibility = calculateFeasibility({
      skills: tempFeasibilityItems,
      targetDate: previewDate,
      weeklyHours,
      studyDays,
    });

    return NextResponse.json({
      title: parsedPlan.title,
      domain: parsedPlan.domain,
      skills: parsedPlan.skills,
      rawContent,
      feasibility: previewFeasibility,
      isReview: true,
    });
  }

  // 2. Save as draft goal & store original material
  const finalTargetDate =
    targetDate || new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const isHealth =
    parsedPlan.title.toLowerCase().includes("health") ||
    parsedPlan.domain.toLowerCase().includes("health");

  const { data: newGoal, error: goalErr } = await supabase
    .from("goals")
    .insert({
      owner_id: user.id,
      title: parsedPlan.title,
      domain: parsedPlan.domain,
      starting_level: "intermediate",
      target_date: finalTargetDate,
      weekly_hours: weeklyHours,
      study_days: studyDays,
      status: "draft",
      health_flag: isHealth,
      graph_version: 1,
    })
    .select()
    .single();

  if (goalErr || !newGoal) {
    return NextResponse.json({ error: goalErr?.message || "Failed to create draft goal" }, { status: 500 });
  }

  // 3. Store original plan as material of kind 'plan_import'
  const { data: material, error: matErr } = await supabase
    .from("materials")
    .insert({
      owner_id: user.id,
      goal_id: newGoal.id,
      kind: "plan_import",
      title: filename || parsedPlan.title,
      byte_size: Buffer.byteLength(rawContent, "utf-8"),
      status: "ready",
    })
    .select()
    .single();

  if (matErr) {
    // Non-fatal warning or rollback
  }

  // 4. Persist skills and prerequisites
  const payloadSkills: SkillGraphPayloadItem[] = parsedPlan.skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description || "",
    prereq_ids: s.prereq_ids || [],
    estimated_minutes: { min: s.estimated_min_minutes, max: s.estimated_max_minutes },
    difficulty: s.difficulty || 2,
    priority: s.priority || 2,
    verification_type: s.verification_type || "applied",
    mvd_minutes: s.mvd_minutes || 15,
    mvd_task: s.mvd_task || `Review core vocabulary for ${s.name.slice(0, 50)}.`,
  }));

  const persistRes = await persistSkillGraphForGoal(supabase, user.id, newGoal.id, payloadSkills, "import");

  // 5. Log import to goal_changes
  await supabase.from("goal_changes").insert({
    owner_id: user.id,
    goal_id: newGoal.id,
    change_type: "import",
    detail: {
      filename,
      skills_count: persistRes.savedSkills.length,
      material_id: material?.id,
    } as unknown as Database["public"]["Tables"]["goal_changes"]["Insert"]["detail"],
  });

  // 6. Calculate feasibility
  const savedFeasibilityItems: SkillFeasibilityItem[] = persistRes.savedSkills.map((s) => ({
    id: s.id,
    name: s.name,
    priority: s.priority,
    estimated_min_minutes: s.estimated_min_minutes,
    estimated_max_minutes: s.estimated_max_minutes,
    status: s.status,
  }));

  const feasibility = calculateFeasibility({
    skills: savedFeasibilityItems,
    targetDate: newGoal.target_date,
    weeklyHours: Number(newGoal.weekly_hours),
    studyDays: newGoal.study_days,
  });

  return NextResponse.json(
    {
      success: true,
      goal: newGoal,
      material,
      skills: persistRes.savedSkills,
      feasibility,
    },
    { status: 201 }
  );
}
