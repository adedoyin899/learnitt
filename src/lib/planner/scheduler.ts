import {
  PlannedItem,
  PlannerGoal,
  PlannerOutput,
  PlannerPrereq,
  PlannerProgress,
  PlannerReview,
  PlannerSkill,
} from "./types";

/**
 * Normalizes a Date or date string to UTC midnight YYYY-MM-DD.
 */
export function normalizeDate(d: string | Date): string {
  if (typeof d === "string") {
    return d.split("T")[0];
  }
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD string into a Date object at UTC midnight.
 */
export function parseDate(d: string | Date): Date {
  const str = normalizeDate(d);
  const [y, m, day] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

/**
 * Returns ISO weekday: 1 for Monday to 7 for Sunday.
 */
export function getIsoWeekday(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Adds N days to a date string.
 */
export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return normalizeDate(d);
}

/**
 * Calculates daily study capacity for a given goal on a specific date.
 * PRD 5.2 Step 1 & Prompt Requirement 1:
 * "capacity(goal, today): per study day, weekly_hours * 60 / number of study days,
 *  rounded down to 5 minute steps"
 */
export function calculateCapacity(goal: PlannerGoal, date: string | Date): number {
  const studyDays = goal.study_days && goal.study_days.length > 0 ? goal.study_days : [1, 2, 3, 4, 5];
  const d = parseDate(date);
  const isoDay = getIsoWeekday(d);

  if (!studyDays.includes(isoDay)) {
    return 0;
  }

  const weeklyHours = Math.max(1, Math.min(20, goal.weekly_hours || 8));
  const rawDailyMins = (weeklyHours * 60) / studyDays.length;
  return Math.floor(rawDailyMins / 5) * 5;
}

/**
 * Extracts Minimum Viable Day (MVD) configuration for a planned item.
 * PRD 5.2 Step 5 & Prompt Requirement 1:
 * "mvd(item): 15 to 20 minutes, from the skill's mvd_minutes and mvd_task.
 *  MVD always present and never above the planned minutes."
 */
export function calculateMvd(
  skill: { mvd_minutes?: number; mvd_task?: string | null },
  plannedMinutes: number
): { mvd_minutes: number; mvd_task: string } {
  const targetMvd = Math.min(20, Math.max(15, skill.mvd_minutes ?? 15));
  const mvdMinutes = Math.min(plannedMinutes, targetMvd);
  const mvdTask = skill.mvd_task?.trim() || "Review core concept and write 3 summary bullets.";

  return {
    mvd_minutes: mvdMinutes,
    mvd_task: mvdTask,
  };
}

export interface ScheduleParams {
  goal: PlannerGoal;
  skills: PlannerSkill[];
  prereqs: PlannerPrereq[];
  progress?: PlannerProgress;
  reviews?: PlannerReview[];
  startDate?: string | Date;
  planVersion?: number;
}

/**
 * Pure, deterministic planning engine with NO I/O.
 * PRD Section 5 & Prompt Requirement 1 & 2:
 * "schedule(skills, prereqs, progress, capacity, reviews): topological order, ties broken by
 *  priority (high first), difficulty (low first), then id. Fill days, max 60 minutes per
 *  session, a skill may span sessions, a skill never starts before its prerequisites end.
 *  Review blocks: spaced review minutes are inserted before new learning, capped at 15 minutes a day.
 *  Unscheduled tail when work exceeds capacity."
 */
export function schedule(params: ScheduleParams): PlannerOutput {
  const { goal, skills, prereqs, progress = {}, reviews = [], planVersion = 1 } = params;

  const startDateStr = normalizeDate(params.startDate || new Date());
  const targetDateStr = normalizeDate(goal.target_date);

  // 1. Build dependency graph
  const prereqsBySkill = new Map<string, Set<string>>();
  const dependentsBySkill = new Map<string, Set<string>>();

  for (const s of skills) {
    prereqsBySkill.set(s.id, new Set());
    dependentsBySkill.set(s.id, new Set());
  }

  for (const p of prereqs) {
    if (prereqsBySkill.has(p.skill_id) && prereqsBySkill.has(p.prereq_id)) {
      prereqsBySkill.get(p.skill_id)!.add(p.prereq_id);
      dependentsBySkill.get(p.prereq_id)!.add(p.skill_id);
    }
  }

  // 2. Compute remaining minutes per skill (using midpoint of min/max if not specified)
  const remainingMinutesBySkill = new Map<string, number>();
  for (const s of skills) {
    const prog = progress[s.id];
    if (s.status === "verified" || prog?.verified) {
      remainingMinutesBySkill.set(s.id, 0);
      continue;
    }

    const estimatedTotal = Math.round(
      (s.estimated_min_minutes + s.estimated_max_minutes) / 2
    );
    const completed = prog?.completed_minutes ?? 0;
    const remaining = Math.max(0, estimatedTotal - completed);
    remainingMinutesBySkill.set(s.id, remaining);
  }

  // 3. Build array of study days from startDate to targetDate
  interface DaySchedule {
    dateStr: string;
    totalCapacity: number;
    usedMinutes: number;
    items: PlannedItem[];
  }

  const days: DaySchedule[] = [];
  const curr = parseDate(startDateStr);
  const target = parseDate(targetDateStr);

  while (curr <= target) {
    const dStr = normalizeDate(curr);
    const cap = calculateCapacity(goal, dStr);
    days.push({
      dateStr: dStr,
      totalCapacity: cap,
      usedMinutes: 0,
      items: [],
    });
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  const totalCapacityMinutes = days.reduce((sum, d) => sum + d.totalCapacity, 0);

  // 4. Insert Review Blocks first (capped at 15 minutes a day, before new learning)
  // PRD 5.4 & Prompt Requirement 2:
  // "Review blocks: spaced review minutes are inserted before new learning, capped at 15 minutes a day."
  const unplacedReviews = [...reviews].sort((a, b) => a.due_date.localeCompare(b.due_date));

  for (const day of days) {
    if (day.totalCapacity <= 0) continue;

    // Find reviews due on or before this day
    const dueReviews = unplacedReviews.filter((r) => r.due_date <= day.dateStr && r.minutes > 0);
    if (dueReviews.length === 0) continue;

    let dayReviewMinutes = 0;
    for (const rev of dueReviews) {
      if (dayReviewMinutes >= 15) break;

      const toAllocate = Math.min(15 - dayReviewMinutes, rev.minutes);
      if (toAllocate <= 0) continue;

      dayReviewMinutes += toAllocate;
      rev.minutes -= toAllocate;

      const mvdCalc = calculateMvd({ mvd_minutes: 15, mvd_task: "Spaced review recall test." }, toAllocate);

      day.items.push({
        skill_id: rev.skill_id,
        skill_name: rev.skill_name || "Spaced Review",
        scheduled_date: day.dateStr,
        kind: "review",
        planned_minutes: toAllocate,
        mvd_minutes: mvdCalc.mvd_minutes,
        mvd_task: mvdCalc.mvd_task,
        status: "planned",
        position: day.items.length,
        plan_version: planVersion,
      });
    }

    day.usedMinutes += dayReviewMinutes;
  }

  // 5. Tracking skill completion state for topological ordering
  // completedSkills: skills whose required learning minutes have been scheduled
  const completedSkills = new Set<string>();
  for (const s of skills) {
    if ((remainingMinutesBySkill.get(s.id) ?? 0) <= 0) {
      completedSkills.add(s.id);
    }
  }

  // Helper to test if all prerequisites of a skill are completed
  const isReady = (skillId: string) => {
    const prereqSet = prereqsBySkill.get(skillId);
    if (!prereqSet || prereqSet.size === 0) return true;
    for (const p of prereqSet) {
      if (!completedSkills.has(p)) return false;
    }
    return true;
  };

  // Tie-breaker comparator for ready skills
  // PRD 5.2 Step 3 & Prompt Requirement 1:
  // "topological order, ties broken by priority (high first), difficulty (low first), then id"
  // Priority 1 is high, 2 is normal, 3 is lowest.
  const compareSkills = (a: PlannerSkill, b: PlannerSkill) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority; // 1 before 2 before 3
    }
    if (a.difficulty !== b.difficulty) {
      return a.difficulty - b.difficulty; // low difficulty first (1 < 2 < ...)
    }
    return a.id.localeCompare(b.id); // stable determinism
  };

  const scheduledItems: PlannedItem[] = [];

  // 6. Fill days with learning sessions
  // Rules:
  // - Max 60 minutes per session
  // - A skill may span sessions
  // - A skill never starts before its prerequisites end
  for (let dIdx = 0; dIdx < days.length; dIdx++) {
    const day = days[dIdx];
    if (day.totalCapacity <= 0) continue;

    let availableOnDay = day.totalCapacity - day.usedMinutes;

    while (availableOnDay >= 5) {
      // Find ready skills with remaining minutes
      const readySkills = skills
        .filter((s) => (remainingMinutesBySkill.get(s.id) ?? 0) > 0 && isReady(s.id))
        .sort(compareSkills);

      if (readySkills.length === 0) {
        // No skills currently ready to be scheduled on this day
        break;
      }

      const currentSkill = readySkills[0];
      const remainingForSkill = remainingMinutesBySkill.get(currentSkill.id)!;

      // Session length: up to 60 minutes, capped by remaining skill minutes and remaining day capacity
      const sessionMinutes = Math.min(60, remainingForSkill, availableOnDay);

      // Deduct from skill and day
      remainingMinutesBySkill.set(currentSkill.id, remainingForSkill - sessionMinutes);
      day.usedMinutes += sessionMinutes;
      availableOnDay -= sessionMinutes;

      // If skill is now fully scheduled, mark as completed so its dependents can become ready!
      if (remainingMinutesBySkill.get(currentSkill.id)! <= 0) {
        completedSkills.add(currentSkill.id);
      }

      const mvdCalc = calculateMvd(currentSkill, sessionMinutes);

      day.items.push({
        skill_id: currentSkill.id,
        skill_name: currentSkill.name,
        scheduled_date: day.dateStr,
        kind: "learn",
        planned_minutes: sessionMinutes,
        mvd_minutes: mvdCalc.mvd_minutes,
        mvd_task: mvdCalc.mvd_task,
        status: "planned",
        position: day.items.length,
        plan_version: planVersion,
        material_id: currentSkill.material_id || null,
        resource_id: currentSkill.resource_id || null,
      });
    }
  }

  // Collect all scheduled items across days
  for (const day of days) {
    scheduledItems.push(...day.items);
  }

  // 7. Unscheduled tail
  // PRD 5.2 Step 6 & Prompt Requirement 1:
  // "unscheduled tail when work exceeds capacity"
  const unscheduledItems: PlannedItem[] = [];
  const incompleteSkills = skills
    .filter((s) => (remainingMinutesBySkill.get(s.id) ?? 0) > 0)
    .sort(compareSkills);

  let unscheduledPosition = 0;
  for (const s of incompleteSkills) {
    let rem = remainingMinutesBySkill.get(s.id)!;

    while (rem > 0) {
      const chunkMins = Math.min(60, rem);
      rem -= chunkMins;

      const mvdCalc = calculateMvd(s, chunkMins);

      unscheduledItems.push({
        skill_id: s.id,
        skill_name: s.name,
        scheduled_date: targetDateStr, // flagged as unscheduled tail
        kind: "learn",
        planned_minutes: chunkMins,
        mvd_minutes: mvdCalc.mvd_minutes,
        mvd_task: mvdCalc.mvd_task,
        status: "unscheduled",
        position: unscheduledPosition++,
        plan_version: planVersion,
        material_id: s.material_id || null,
        resource_id: s.resource_id || null,
      });
    }
  }

  const allItems = [...scheduledItems, ...unscheduledItems];
  const totalPlannedMinutes = allItems.reduce((acc, it) => acc + it.planned_minutes, 0);

  return {
    plan_version: planVersion,
    scheduled_items: scheduledItems,
    unscheduled_items: unscheduledItems,
    total_planned_minutes: totalPlannedMinutes,
    total_capacity_minutes: totalCapacityMinutes,
    days_count: days.length,
    all_items: allItems,
  };
}
