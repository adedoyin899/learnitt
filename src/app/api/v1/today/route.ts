import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface TodayResponse {
  has_goal: boolean;
  has_plan: boolean;
  date: string;
  goal?: {
    id: string;
    title: string;
    target_date: string;
    weekly_hours: number;
    study_days: number[];
    status?: string;
    domain?: string;
  };
  goals?: Array<{
    id: string;
    title: string;
    target_date: string;
    weekly_hours: number;
    study_days: number[];
    status: string;
    domain?: string;
  }>;
  primary_item?: {
    id: string;
    skill_id: string | null;
    skill_name: string;
    kind: "learn" | "practise" | "apply" | "quiz";
    planned_minutes: number;
    mvd_minutes: number;
    mvd_task: string;
    status: string;
    evidence_level?: number;
    material?: {
      id: string;
      filename: string;
      type: string;
    } | null;
    resource_url?: string | null;
    check_in?: {
      id: string;
      outcome: string;
      minutes_actual: number | null;
      created_at: string;
    } | null;
  } | null;
  review_item?: {
    id: string;
    skill_id: string | null;
    skill_name: string;
    planned_minutes: number;
    mvd_minutes: number;
    mvd_task: string;
    status: string;
    evidence_level?: number;
    check_in?: {
      id: string;
      outcome: string;
      minutes_actual: number | null;
      created_at: string;
    } | null;
  } | null;
  is_mvd_complete: boolean;
  is_planned_complete: boolean;
  total_planned_minutes_today: number;
  total_completed_minutes_today: number;
  stats?: {
    total_skills: number;
    verified_skills: number;
  };
  upcoming_items?: Array<{
    id: string;
    scheduled_date: string;
    kind: string;
    planned_minutes: number;
    skill_name?: string;
  }>;
}

/**
 * GET /api/v1/today
 * Returns today's primary session, MVD version, review block if due, and check-in status.
 * PRD Epic C3, D1, D2 & Prompt Requirement 1.
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

  const { searchParams } = new URL(req.url);
  const requestedDate = searchParams.get("date");
  const requestedGoalId = searchParams.get("goal_id");
  const todayStr = requestedDate || new Date().toISOString().split("T")[0];

  // 1. Fetch all user goals
  const { data: userGoals } = await supabase
    .from("goals")
    .select("id, title, target_date, weekly_hours, study_days, status, domain")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const allGoals = (userGoals || []).map((g) => ({
    id: g.id,
    title: g.title,
    target_date: g.target_date,
    weekly_hours: Number(g.weekly_hours),
    study_days: g.study_days,
    status: g.status,
    domain: g.domain,
  }));

  const activeGoal = requestedGoalId
    ? allGoals.find((g) => g.id === requestedGoalId) || null
    : allGoals.find((g) => g.status === "active") || allGoals[0] || null;

  if (!activeGoal) {
    return NextResponse.json({
      has_goal: false,
      has_plan: false,
      date: todayStr,
      goals: allGoals,
      is_mvd_complete: false,
      is_planned_complete: false,
      total_planned_minutes_today: 0,
      total_completed_minutes_today: 0,
    } satisfies TodayResponse);
  }

  // 2. Fetch plan items for today
  const { data: todayItems } = await supabase
    .from("plan_items")
    .select("*")
    .eq("owner_id", user.id)
    .eq("goal_id", activeGoal.id)
    .eq("scheduled_date", todayStr)
    .order("position", { ascending: true });

  // If no items for today, check if any plan items exist for this goal
  if (!todayItems || todayItems.length === 0) {
    const { count: planCount } = await supabase
      .from("plan_items")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("goal_id", activeGoal.id);

    return NextResponse.json({
      has_goal: true,
      has_plan: (planCount || 0) > 0,
      date: todayStr,
      goal: activeGoal,
      goals: allGoals,
      is_mvd_complete: false,
      is_planned_complete: false,
      total_planned_minutes_today: 0,
      total_completed_minutes_today: 0,
    } satisfies TodayResponse);
  }

  // 3. Fetch skills for metadata mapping
  const skillIds = todayItems.map((it) => it.skill_id).filter(Boolean) as string[];
  const { data: skills } = skillIds.length > 0
    ? await supabase.from("skills").select("*").in("id", skillIds)
    : { data: [] };

  const skillMap = new Map((skills || []).map((s) => [s.id, s]));

  // 4. Fetch materials if attached
  const materialIds = todayItems.map((it) => it.material_id).filter(Boolean) as string[];
  const { data: materials } = materialIds.length > 0
    ? await supabase.from("materials").select("id, filename, type").in("id", materialIds)
    : { data: [] };

  const materialMap = new Map((materials || []).map((m) => [m.id, m]));

  // 5. Fetch check-ins for today's items
  const itemIds = todayItems.map((it) => it.id);
  const { data: checkIns } = await supabase
    .from("check_ins")
    .select("id, plan_item_id, outcome, minutes_actual, created_at")
    .in("plan_item_id", itemIds)
    .order("created_at", { ascending: false });

  const checkInMap = new Map<string, { id: string; outcome: string; minutes_actual: number | null; created_at: string }>();
  for (const c of checkIns || []) {
    if (!checkInMap.has(c.plan_item_id)) {
      checkInMap.set(c.plan_item_id, c);
    }
  }

  // 6. Separate Review block from Primary learning block
  const reviewRow = todayItems.find((it) => it.kind === "review");
  const primaryRow = todayItems.find((it) => it.kind !== "review") || todayItems[0];

  const primarySkill = primaryRow?.skill_id ? skillMap.get(primaryRow.skill_id) : null;
  const reviewSkill = reviewRow?.skill_id ? skillMap.get(reviewRow.skill_id) : null;

  const primaryCheckIn = primaryRow ? checkInMap.get(primaryRow.id) : null;
  const reviewCheckIn = reviewRow ? checkInMap.get(reviewRow.id) : null;

  const primaryMaterial = primaryRow?.material_id ? materialMap.get(primaryRow.material_id) : null;

  // Distinct completion states (Prompt Requirement 3: "Show MVD complete separately from planned complete")
  const isPlannedComplete = primaryCheckIn?.outcome === "done" || primaryRow?.status === "done";
  const isMvdComplete = isPlannedComplete || primaryCheckIn?.outcome === "mvd_only" || primaryRow?.status === "mvd_only";

  const totalPlannedMinutesToday = todayItems.reduce((acc, it) => acc + it.planned_minutes, 0);
  let totalCompletedMinutesToday = 0;
  for (const it of todayItems) {
    const c = checkInMap.get(it.id);
    if (c?.outcome === "done") {
      totalCompletedMinutesToday += c.minutes_actual ?? it.planned_minutes;
    } else if (c?.outcome === "mvd_only") {
      totalCompletedMinutesToday += c.minutes_actual ?? it.mvd_minutes;
    }
  }

  // Stats for active goal
  const { count: totalSkills } = await supabase
    .from("skills")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", activeGoal.id);

  const { count: verifiedSkills } = await supabase
    .from("skills")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", activeGoal.id)
    .eq("status", "verified");

  // Fetch upcoming 14 days for Dexie local cache mirror
  const next14DaysStr = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
  const { data: upcomingItems } = await supabase
    .from("plan_items")
    .select("id, scheduled_date, kind, planned_minutes, skill_id")
    .eq("owner_id", user.id)
    .eq("goal_id", activeGoal.id)
    .gte("scheduled_date", todayStr)
    .lte("scheduled_date", next14DaysStr)
    .order("scheduled_date", { ascending: true });

  const responsePayload: TodayResponse = {
    has_goal: true,
    has_plan: true,
    date: todayStr,
    goals: allGoals,
    goal: {
      id: activeGoal.id,
      title: activeGoal.title,
      target_date: activeGoal.target_date,
      weekly_hours: Number(activeGoal.weekly_hours),
      study_days: activeGoal.study_days,
      status: activeGoal.status,
      domain: activeGoal.domain,
    },
    primary_item: primaryRow
      ? {
          id: primaryRow.id,
          skill_id: primaryRow.skill_id,
          skill_name: primarySkill?.name || "Primary Learning Session",
          kind: primaryRow.kind as "learn" | "practise" | "apply" | "quiz",
          planned_minutes: primaryRow.planned_minutes,
          mvd_minutes: primaryRow.mvd_minutes,
          mvd_task: primarySkill?.mvd_task || "Review core concept and write 3 summary bullets.",
          status: primaryRow.status,
          evidence_level: primarySkill?.evidence_level || 0,
          material: primaryMaterial ? {
            id: primaryMaterial.id,
            filename: primaryMaterial.filename,
            type: primaryMaterial.type,
          } : null,
          check_in: primaryCheckIn || null,
        }
      : null,
    review_item: reviewRow
      ? {
          id: reviewRow.id,
          skill_id: reviewRow.skill_id,
          skill_name: reviewSkill?.name || "Spaced Review",
          planned_minutes: reviewRow.planned_minutes,
          mvd_minutes: reviewRow.mvd_minutes,
          mvd_task: "Spaced review recall test.",
          status: reviewRow.status,
          evidence_level: reviewSkill?.evidence_level || 0,
          check_in: reviewCheckIn || null,
        }
      : null,
    is_mvd_complete: isMvdComplete,
    is_planned_complete: isPlannedComplete,
    total_planned_minutes_today: totalPlannedMinutesToday,
    total_completed_minutes_today: totalCompletedMinutesToday,
    stats: {
      total_skills: totalSkills || 0,
      verified_skills: verifiedSkills || 0,
    },
    upcoming_items: (upcomingItems || []).map((u) => ({
      id: u.id,
      scheduled_date: typeof u.scheduled_date === "object" ? (u.scheduled_date as Date).toISOString().split("T")[0] : String(u.scheduled_date).split("T")[0],
      kind: u.kind,
      planned_minutes: u.planned_minutes,
    })),
  };

  return NextResponse.json(responsePayload);
}
