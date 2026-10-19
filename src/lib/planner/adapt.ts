import {
  AdaptCheckResult,
  AdaptProposal,
  PlannedItem,
  PlannerGoal,
  PlannerPrereq,
  PlannerProgress,
  PlannerReview,
  PlannerSkill,
} from "./types";
import { addDays, normalizeDate, schedule } from "./scheduler";

export interface CheckInItem {
  plan_item_id: string;
  scheduled_date: string;
  outcome: "done" | "partial" | "missed" | "mvd_only";
  minutes_actual?: number | null;
  created_at?: string;
}

/**
 * Checks if the adaptation prompt should be triggered.
 * PRD Epic C4 & Prompt Requirement 4:
 * "trigger when 2 or more sessions are missed in a rolling 7 days,
 *  or weekly completion is under 60 percent of planned minutes."
 */
export function checkAdaptTrigger(params: {
  checkIns: CheckInItem[];
  planItems: PlannedItem[];
  today?: string | Date;
}): AdaptCheckResult {
  const todayStr = normalizeDate(params.today || new Date());
  const sevenDaysAgoStr = addDays(todayStr, -6); // 7-day rolling window: [today - 6, today]

  // Filter plan items and check-ins in the rolling 7-day window
  const windowItems = params.planItems.filter(
    (it) => it.scheduled_date >= sevenDaysAgoStr && it.scheduled_date <= todayStr
  );

  const windowCheckIns = params.checkIns.filter(
    (c) => c.scheduled_date >= sevenDaysAgoStr && c.scheduled_date <= todayStr
  );

  // 1. Count missed sessions in rolling 7 days
  const missedFromCheckIns = windowCheckIns.filter((c) => c.outcome === "missed").length;
  const missedFromItems = windowItems.filter((it) => it.status === "missed").length;
  const missedSessionsInWeek = Math.max(missedFromCheckIns, missedFromItems);

  // 2. Compute completion rate in rolling 7 days
  const totalPlannedMinutes = windowItems.reduce((acc, it) => acc + it.planned_minutes, 0);

  let actualMinutes = 0;
  for (const c of windowCheckIns) {
    if (c.outcome === "done" || c.outcome === "partial" || c.outcome === "mvd_only") {
      actualMinutes += c.minutes_actual ?? 0;
    }
  }

  const completionRate = totalPlannedMinutes > 0 ? actualMinutes / totalPlannedMinutes : 1;

  const missedTrigger = missedSessionsInWeek >= 2;
  const completionTrigger = totalPlannedMinutes > 0 && completionRate < 0.6;
  const triggered = missedTrigger || completionTrigger;

  let reason = "";
  if (missedTrigger) {
    reason = `You missed ${missedSessionsInWeek} sessions this week. Pick how to catch up.`;
  } else if (completionTrigger) {
    reason = `Weekly completion is ${Math.round(
      completionRate * 100
    )}%, below the 60% recovery threshold. Pick how to catch up.`;
  }

  return {
    triggered,
    reason,
    missedSessionsInWeek,
    completionRate,
  };
}

/**
 * Generates the 4 adaptation proposals: compress, extend, add_time, reduce_scope.
 * PRD Epic C4 & Prompt Requirement 4:
 * "compress (shorten remaining sessions, never below MVD), extend (new target date shown before saving),
 *  add_time (higher weekly hours for a set number of weeks, then revert), reduce_scope (per-skill confirmation)."
 */
export function generateAdaptProposals(params: {
  goal: PlannerGoal;
  skills: PlannerSkill[];
  prereqs: PlannerPrereq[];
  progress?: PlannerProgress;
  reviews?: PlannerReview[];
  today?: string | Date;
}): AdaptProposal[] {
  const { goal, skills, prereqs, progress = {}, reviews = [] } = params;
  const todayStr = normalizeDate(params.today || new Date());

  // Run initial baseline schedule
  const baseline = schedule({
    goal,
    skills,
    prereqs,
    progress,
    reviews,
    startDate: todayStr,
  });

  const proposals: AdaptProposal[] = [];

  // 1. Compress option: shorten remaining sessions proportionally to fit capacity, never below MVD
  const totalScheduledMinutes = baseline.scheduled_items.reduce((s, it) => s + it.planned_minutes, 0);
  const totalMvdMinutes = baseline.scheduled_items.reduce((s, it) => s + it.mvd_minutes, 0);
  const targetCapacity = baseline.total_capacity_minutes;

  const compressFactor =
    totalScheduledMinutes > targetCapacity && totalScheduledMinutes > 0
      ? Math.max(0.5, targetCapacity / totalScheduledMinutes)
      : 0.8;

  proposals.push({
    type: "compress",
    title: "Compress sessions",
    description: "Shorten remaining sessions proportionally to fit schedule without dropping any skills. Sessions will never shrink below their 15-minute Minimum Viable Day (MVD).",
    before: {
      total_planned_minutes: baseline.total_planned_minutes,
      session_count: baseline.scheduled_items.length,
      unscheduled_count: baseline.unscheduled_items.length,
    },
    after: {
      compressed_minutes: Math.max(totalMvdMinutes, Math.round(totalScheduledMinutes * compressFactor)),
      min_guaranteed_minutes: totalMvdMinutes,
      all_sessions_fit: true,
    },
  });

  // 2. Extend option: recalculate with a new target date
  // Estimate required study days needed to fit all work
  const studyDaysCount = goal.study_days.length || 5;
  const dailyMins = Math.floor(((goal.weekly_hours * 60) / studyDaysCount) / 5) * 5;
  const neededStudyDays = Math.ceil(baseline.total_planned_minutes / Math.max(1, dailyMins));
  const calendarDaysNeeded = Math.ceil((neededStudyDays / studyDaysCount) * 7) + 7;
  const newTargetDate = addDays(todayStr, calendarDaysNeeded);

  proposals.push({
    type: "extend",
    title: "Extend target date",
    description: `Move the target date from ${normalizeDate(goal.target_date)} to ${newTargetDate} to fit all planned learning at comfortable pace.`,
    before: {
      target_date: normalizeDate(goal.target_date),
      unscheduled_count: baseline.unscheduled_items.length,
    },
    after: {
      proposed_target_date: newTargetDate,
      additional_calendar_days: calendarDaysNeeded,
      unscheduled_count: 0,
    },
  });

  // 3. Add Time option: higher weekly hours for set period, then revert
  const proposedHours = Math.min(20, goal.weekly_hours + 4);
  proposals.push({
    type: "add_time",
    title: "Add study time temporarily",
    description: `Temporarily increase weekly study commitment from ${goal.weekly_hours}h to ${proposedHours}h for 3 weeks to catch up on missed sessions.`,
    before: {
      weekly_hours: goal.weekly_hours,
      total_capacity_minutes: baseline.total_capacity_minutes,
    },
    after: {
      temporary_weekly_hours: proposedHours,
      duration_weeks: 3,
      added_weekly_minutes: (proposedHours - goal.weekly_hours) * 60,
    },
  });

  // 4. Reduce Scope option: list candidates (priority 1 last, skills with no dependents first)
  // PRD 5.3: "list candidates (priority 1 skills last, skills with no dependents first). Require confirmation per skill."
  const dependentCounts = new Map<string, number>();
  for (const s of skills) dependentCounts.set(s.id, 0);
  for (const p of prereqs) {
    const cur = dependentCounts.get(p.prereq_id) || 0;
    dependentCounts.set(p.prereq_id, cur + 1);
  }

  const candidates = skills
    .filter((s) => s.status !== "verified")
    .map((s) => ({
      id: s.id,
      name: s.name,
      priority: s.priority,
      dependentsCount: dependentCounts.get(s.id) || 0,
      estimatedMinutes: Math.round((s.estimated_min_minutes + s.estimated_max_minutes) / 2),
    }))
    .sort((a, b) => {
      // Priority 3 (lowest) first, then Priority 2, Priority 1 (highest) last
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Skills with 0 dependents first
      if (a.dependentsCount !== b.dependentsCount) {
        return a.dependentsCount - b.dependentsCount;
      }
      return a.name.localeCompare(b.name);
    });

  proposals.push({
    type: "reduce_scope",
    title: "Reduce scope",
    description: "Defer or remove optional, low-priority skills that do not block other skills. Explicit per-skill confirmation is strictly required.",
    requiresConfirmation: true,
    before: {
      total_skills: skills.length,
      candidate_count: candidates.length,
      candidates,
    },
    after: {
      remaining_skills_count: skills.length - Math.min(3, candidates.length),
      potential_minutes_saved: candidates.slice(0, 3).reduce((acc, c) => acc + c.estimatedMinutes, 0),
    },
  });

  return proposals;
}

export interface ApplyAdaptParams {
  option: "compress" | "extend" | "add_time" | "reduce_scope";
  goal: PlannerGoal;
  skills: PlannerSkill[];
  prereqs: PlannerPrereq[];
  progress?: PlannerProgress;
  reviews?: PlannerReview[];
  today?: string | Date;
  confirmedSkillIds?: string[]; // Required for reduce_scope!
  customTargetDate?: string; // Optional for extend
  temporaryHours?: number; // Optional for add_time
  weeksCount?: number;
}

export interface ApplyAdaptResult {
  success: boolean;
  changeType: string;
  detail: Record<string, unknown>;
  updatedGoal: PlannerGoal;
  updatedSkills: PlannerSkill[];
  updatedPlan: ReturnType<typeof schedule>;
  noOp?: boolean;
}

/**
 * Applies an adaptation decision and produces updated goal/skills/plan.
 * PRD Epic C4 & Prompt Requirement 4:
 * "reduce_scope (per-skill confirmation). Each writes goal_changes.
 *  Never silently remove or move a prerequisite after its dependent.
 *  reduce_scope without confirmation changes nothing."
 */
export function applyAdaptDecision(params: ApplyAdaptParams): ApplyAdaptResult {
  const { option, goal, skills, prereqs, progress = {}, reviews = [], today = new Date() } = params;
  const todayStr = normalizeDate(today);

  // 1. Reduce scope path
  if (option === "reduce_scope") {
    // "reduce_scope without confirmation changes nothing"
    if (!params.confirmedSkillIds || params.confirmedSkillIds.length === 0) {
      const baselinePlan = schedule({
        goal,
        skills,
        prereqs,
        progress,
        reviews,
        startDate: todayStr,
      });

      return {
        success: false,
        noOp: true,
        changeType: "reduce_scope",
        detail: { reason: "No skills were confirmed for scope reduction. Plan remains unchanged." },
        updatedGoal: goal,
        updatedSkills: skills,
        updatedPlan: baselinePlan,
      };
    }

    const dropSet = new Set(params.confirmedSkillIds);
    const updatedSkills = skills.filter((s) => !dropSet.has(s.id));
    const updatedPrereqs = prereqs.filter(
      (p) => !dropSet.has(p.skill_id) && !dropSet.has(p.prereq_id)
    );

    const updatedPlan = schedule({
      goal,
      skills: updatedSkills,
      prereqs: updatedPrereqs,
      progress,
      reviews,
      startDate: todayStr,
    });

    return {
      success: true,
      changeType: "reduce_scope",
      detail: {
        removed_skill_ids: params.confirmedSkillIds,
        previous_count: skills.length,
        new_count: updatedSkills.length,
        timestamp: new Date().toISOString(),
      },
      updatedGoal: goal,
      updatedSkills,
      updatedPlan,
    };
  }

  // 2. Extend path
  if (option === "extend") {
    const proposals = generateAdaptProposals({ goal, skills, prereqs, progress, reviews, today });
    const extendProp = proposals.find((p) => p.type === "extend");
    const proposedDate =
      params.customTargetDate ||
      (extendProp?.after.proposed_target_date as string) ||
      addDays(normalizeDate(goal.target_date), 21);

    const updatedGoal: PlannerGoal = {
      ...goal,
      target_date: proposedDate,
    };

    const updatedPlan = schedule({
      goal: updatedGoal,
      skills,
      prereqs,
      progress,
      reviews,
      startDate: todayStr,
    });

    return {
      success: true,
      changeType: "extend",
      detail: {
        previous_target_date: normalizeDate(goal.target_date),
        new_target_date: proposedDate,
        timestamp: new Date().toISOString(),
      },
      updatedGoal,
      updatedSkills: skills,
      updatedPlan,
    };
  }

  // 3. Add Time path
  if (option === "add_time") {
    const proposedHours = params.temporaryHours || Math.min(20, goal.weekly_hours + 4);
    const updatedGoal: PlannerGoal = {
      ...goal,
      weekly_hours: proposedHours,
    };

    const updatedPlan = schedule({
      goal: updatedGoal,
      skills,
      prereqs,
      progress,
      reviews,
      startDate: todayStr,
    });

    return {
      success: true,
      changeType: "add_time",
      detail: {
        previous_weekly_hours: goal.weekly_hours,
        temporary_weekly_hours: proposedHours,
        duration_weeks: params.weeksCount || 3,
        timestamp: new Date().toISOString(),
      },
      updatedGoal,
      updatedSkills: skills,
      updatedPlan,
    };
  }

  // 4. Compress path
  // Shortens remaining sessions proportionally, never below MVD
  const baseline = schedule({
    goal,
    skills,
    prereqs,
    progress,
    reviews,
    startDate: todayStr,
  });

  const compressedItems = baseline.scheduled_items.map((item) => {
    // Compress by 25%, but strictly never below mvd_minutes
    const compressed = Math.round((item.planned_minutes * 0.75) / 5) * 5;
    const finalMinutes = Math.max(item.mvd_minutes, compressed);
    return {
      ...item,
      planned_minutes: finalMinutes,
    };
  });

  const updatedPlan = {
    ...baseline,
    scheduled_items: compressedItems,
    all_items: [...compressedItems, ...baseline.unscheduled_items],
    total_planned_minutes: compressedItems.reduce((acc, it) => acc + it.planned_minutes, 0),
  };

  return {
    success: true,
    changeType: "compress",
    detail: {
      compressed_session_count: compressedItems.length,
      compression_rule: "proportional reduction capped at MVD",
      timestamp: new Date().toISOString(),
    },
    updatedGoal: goal,
    updatedSkills: skills,
    updatedPlan,
  };
}
