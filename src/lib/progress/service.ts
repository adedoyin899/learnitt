import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  ProgressDataPayload,
  calculateMVDStreak,
  computeEvidenceMix,
  computeVerifiedSkillsTimeline,
  generateCodeWeeklySummary,
  WeeklyStudyMinutes,
} from "./stats";

export interface GetProgressOptions {
  ownerId: string;
  goalId?: string | null;
  now?: Date;
}

/**
 * Service: Gathers progress statistics, calculates MVD streak, evidence mix,
 * timeline, and generates a plain-language summary by code (NO AI).
 * PRD Epic G2, G3 & Prompt Requirements 4, 5, 6.
 */
export async function getProgressData(
  supabase: SupabaseClient<Database>,
  options: GetProgressOptions
): Promise<ProgressDataPayload> {
  const { ownerId, now = new Date() } = options;
  const todayStr = now.toISOString().split("T")[0];

  // 1. Fetch active goal if not provided
  let goalId = options.goalId;
  if (!goalId) {
    const { data: activeGoal } = await supabase
      .from("goals")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    goalId = activeGoal?.id;
  }

  // 2. Fetch skills
  let skillsQuery = supabase
    .from("skills")
    .select("id, name, status, evidence_level, verified_at, goal_id")
    .eq("owner_id", ownerId);

  if (goalId) {
    skillsQuery = skillsQuery.eq("goal_id", goalId);
  }

  const { data: skillsData } = await skillsQuery;
  const skills = skillsData || [];

  const verifiedSkillsCount = skills.filter((s) => s.status === "verified").length;
  const evidenceMix = computeEvidenceMix(skills);
  const verifiedTimeline = computeVerifiedSkillsTimeline(skills);

  // 3. Count skills due for review
  const { data: dueReviews } = await supabase
    .from("skill_reviews")
    .select("skill_id")
    .eq("owner_id", ownerId)
    .lte("due_on", todayStr);

  const dueSkillsSet = new Set<string>((dueReviews || []).map((r) => r.skill_id));
  skills.filter((s) => s.status === "needs_review").forEach((s) => dueSkillsSet.add(s.id));
  const skillsDueForReview = dueSkillsSet.size;

  // 4. Fetch check-ins for MVD streak and actual minutes
  const { data: checkInsData } = await supabase
    .from("check_ins")
    .select("id, plan_item_id, outcome, minutes_actual, created_at")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  const checkIns = checkInsData || [];

  // Determine dates with MVD or better completion
  const completionDates: string[] = [];
  const checkInDatesMap = new Map<string, number>();

  for (const c of checkIns) {
    const dateStr = c.created_at ? c.created_at.split("T")[0] : todayStr;
    const actualMins = c.minutes_actual || 0;

    checkInDatesMap.set(dateStr, (checkInDatesMap.get(dateStr) || 0) + actualMins);

    // MVD or done counts toward streak
    if (c.outcome === "done" || c.outcome === "mvd_only" || actualMins >= 15) {
      completionDates.push(dateStr);
    }
  }

  const mvdStreak = calculateMVDStreak(completionDates, now);

  // 5. Fetch plan items for weekly planned vs done minutes
  let planQuery = supabase
    .from("plan_items")
    .select("id, scheduled_date, planned_minutes, status")
    .eq("owner_id", ownerId);

  if (goalId) {
    planQuery = planQuery.eq("goal_id", goalId);
  }

  const { data: planItemsData } = await planQuery;
  const planItems = planItemsData || [];

  // Group into past 4 weekly buckets
  const weeklyMap = new Map<string, { planned: number; done: number; label: string }>();

  // Initialize 4 weeks (current week and previous 3 weeks)
  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const day = weekStart.getDay();
    const diffToMonday = weekStart.getDate() - day + (day === 0 ? -6 : 1);
    weekStart.setDate(diffToMonday);
    const weekKey = weekStart.toISOString().split("T")[0];
    const monthName = weekStart.toLocaleDateString("en-US", { month: "short" });
    const label = `${monthName} ${weekStart.getDate()}`;
    weeklyMap.set(weekKey, { planned: 0, done: 0, label });
  }

  // Populate planned minutes
  for (const item of planItems) {
    const itemDateStr = typeof item.scheduled_date === "object"
      ? (item.scheduled_date as Date).toISOString().split("T")[0]
      : String(item.scheduled_date).split("T")[0];

    const itemDate = new Date(itemDateStr + "T00:00:00Z");
    const day = itemDate.getDay();
    const diffToMonday = itemDate.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(itemDate);
    monday.setDate(diffToMonday);
    const weekKey = monday.toISOString().split("T")[0];

    if (weeklyMap.has(weekKey)) {
      const bucket = weeklyMap.get(weekKey)!;
      bucket.planned += item.planned_minutes || 0;
    }
  }

  // Populate done minutes from checkIns
  for (const c of checkIns) {
    const cDateStr = c.created_at ? c.created_at.split("T")[0] : todayStr;
    const cDate = new Date(cDateStr + "T00:00:00Z");
    const day = cDate.getDay();
    const diffToMonday = cDate.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(cDate);
    monday.setDate(diffToMonday);
    const weekKey = monday.toISOString().split("T")[0];

    if (weeklyMap.has(weekKey)) {
      const bucket = weeklyMap.get(weekKey)!;
      bucket.done += c.minutes_actual || 0;
    }
  }

  const plannedVsDoneList: WeeklyStudyMinutes[] = Array.from(weeklyMap.entries()).map(
    ([week, data]) => ({
      week,
      week_label: data.label,
      planned_minutes: data.planned,
      done_minutes: data.done,
    })
  );

  // Current week stats for the summary
  const currentWeekBucket = plannedVsDoneList[plannedVsDoneList.length - 1];
  const doneMinutesThisWeek = currentWeekBucket ? currentWeekBucket.done_minutes : 0;
  const plannedMinutesThisWeek = currentWeekBucket ? currentWeekBucket.planned_minutes : 0;

  // Filter sessions in current week
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const sessionsThisWeek = checkIns.filter(
    (c) => c.created_at && c.created_at >= sevenDaysAgo && (c.outcome === "done" || c.outcome === "mvd_only")
  ).length;

  // 6. Generate weekly summary by pure code (NO AI)
  const plainSummary = generateCodeWeeklySummary({
    doneMinutesThisWeek,
    plannedMinutesThisWeek,
    sessionsCompletedThisWeek: sessionsThisWeek,
    streak: mvdStreak,
    verifiedSkillsCount,
    skillsDueForReview,
    evidenceMix,
  });

  return {
    verified_skills_over_time: verifiedTimeline,
    planned_vs_done_minutes_per_week: plannedVsDoneList,
    mvd_streak: mvdStreak,
    evidence_mix: evidenceMix,
    skills_due_for_review: skillsDueForReview,
    total_skills: skills.length,
    verified_skills_count: verifiedSkillsCount,
    plain_summary: plainSummary,
  };
}
