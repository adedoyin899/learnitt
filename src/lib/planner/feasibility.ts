/**
 * Feasibility Calculation Engine (PRD Section 5.2, Epic A3)
 * Pure, deterministic calculation of remaining work vs. capacity.
 */

export type FeasibilityBand = "feasible" | "tight" | "not_feasible";

export interface SkillFeasibilityItem {
  id: string;
  name: string;
  priority: number; // 1 (highest), 2 (normal), 3 (lowest)
  estimated_min_minutes: number;
  estimated_max_minutes: number;
  prereq_ids?: string[];
  status?: string;
}

export interface FeasibilityInput {
  skills: SkillFeasibilityItem[];
  targetDate: string | Date;
  weeklyHours: number;
  studyDays?: number[]; // ISO weekdays 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
  today?: string | Date;
  useEstimate?: "max" | "min" | "mean";
}

export interface ScopeCandidate {
  id: string;
  name: string;
  priority: number;
  estimatedMinutes: number;
}

export interface ScopeReductionProposal {
  candidateSkills: ScopeCandidate[];
  totalMinutesReduced: number;
  newRatio: number;
  newBand: FeasibilityBand;
}

export interface FeasibilityResult {
  remainingMinutes: number;
  capacityMinutes: number;
  ratio: number; // e.g. 0.84, 0.85, 1.00, 1.01
  percentage: number; // e.g. 84, 85, 100, 101
  band: FeasibilityBand;
  studyDaysCount: number;
  summaryMessage: string;
  options?: {
    extendDate: {
      proposedTargetDate: string;
      additionalDays: number;
      projectedRatio: number;
    };
    addHours: {
      proposedWeeklyHours: number;
      addedHours: number;
      projectedRatio: number;
    };
    reduceScope: ScopeReductionProposal;
  };
}

/**
 * Normalizes a Date to midnight UTC or local calendar date (YYYY-MM-DD)
 */
function parseDateOnly(d: string | Date): Date {
  if (typeof d === "string") {
    const parts = d.split("T")[0].split("-").map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Returns ISO weekday: 1 for Monday to 7 for Sunday.
 */
function getIsoWeekday(d: Date): number {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Pure feasibility computation.
 */
export function calculateFeasibility(input: FeasibilityInput): FeasibilityResult {
  const studyDays = input.studyDays && input.studyDays.length > 0 ? input.studyDays : [1, 2, 3, 4, 5];
  const weeklyHours = Math.max(1, Math.min(20, input.weeklyHours || 8));
  const today = parseDateOnly(input.today || new Date());
  const targetDate = parseDateOnly(input.targetDate);

  // Daily capacity rounded down to 5-minute steps per PRD 5.2:
  // capacity = weekly_hours * 60 / len(study_days) for study days, 0 otherwise.
  const rawDailyMins = (weeklyHours * 60) / studyDays.length;
  const dailyCapacityMinutes = Math.floor(rawDailyMins / 5) * 5;

  // Count study days between today and targetDate (inclusive)
  let studyDaysCount = 0;
  const current = new Date(today.getTime());
  while (current <= targetDate) {
    const isoDay = getIsoWeekday(current);
    if (studyDays.includes(isoDay)) {
      studyDaysCount++;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const capacityMinutes = studyDaysCount * dailyCapacityMinutes;

  // Sum remaining minutes for skills not verified/completed
  const useEst = input.useEstimate || "max";
  let remainingMinutes = 0;
  for (const skill of input.skills) {
    if (skill.status === "verified" || skill.status === "completed") {
      continue;
    }
    let mins = skill.estimated_max_minutes;
    if (useEst === "min") {
      mins = skill.estimated_min_minutes;
    } else if (useEst === "mean") {
      mins = Math.round((skill.estimated_min_minutes + skill.estimated_max_minutes) / 2);
    }
    remainingMinutes += Math.max(0, mins);
  }

  // Calculate ratio
  let ratio = 0;
  if (capacityMinutes > 0) {
    ratio = Math.round((remainingMinutes / capacityMinutes) * 100) / 100;
  } else if (remainingMinutes > 0) {
    ratio = 999; // Insufficient capacity
  }

  const percentage = Math.round(ratio * 100);

  // Feasibility Bands (PRD A3):
  // feasible: under 85% (< 0.85)
  // tight: 85 to 100% (0.85 <= ratio <= 1.00)
  // not feasible: over 100% (> 1.00)
  let band: FeasibilityBand = "feasible";
  if (ratio > 1.0) {
    band = "not_feasible";
  } else if (ratio >= 0.85) {
    band = "tight";
  }

  const workHours = Math.round(remainingMinutes / 60);
  const capHours = Math.round(capacityMinutes / 60);

  let summaryMessage = `This plan is feasible. You have ${workHours} hours of work and ${capHours} hours available.`;
  if (band === "tight") {
    summaryMessage = `This is tight. You have ${workHours} hours of work and ${capHours} hours available. Pick one option.`;
  } else if (band === "not_feasible") {
    summaryMessage = `This is not feasible. You have ${workHours} hours of work and ${capHours} hours available. Pick one option.`;
  }

  const result: FeasibilityResult = {
    remainingMinutes,
    capacityMinutes,
    ratio,
    percentage,
    band,
    studyDaysCount,
    summaryMessage,
  };

  // Remedies are offered for tight and not_feasible bands
  if (band !== "feasible") {
    // 1. Extend date: bring ratio down to <= 0.84
    const targetCapacityFor084 = Math.ceil(remainingMinutes / 0.84);
    const neededDailyCapacity = dailyCapacityMinutes > 0 ? dailyCapacityMinutes : 1;
    const neededStudyDays = Math.ceil(targetCapacityFor084 / neededDailyCapacity);
    const addStudyDays = Math.max(1, neededStudyDays - studyDaysCount);

    // Find date with needed study days
    const extendCursor = new Date(targetDate.getTime());
    let added = 0;
    while (added < addStudyDays) {
      extendCursor.setUTCDate(extendCursor.getUTCDate() + 1);
      if (studyDays.includes(getIsoWeekday(extendCursor))) {
        added++;
      }
    }
    const proposedTargetDate = extendCursor.toISOString().split("T")[0];
    const newCap = (studyDaysCount + addStudyDays) * dailyCapacityMinutes;
    const projectedExtendRatio = Math.round((remainingMinutes / (newCap || 1)) * 100) / 100;

    // 2. Add weekly hours: bring ratio down to <= 0.84
    // needed weekly capacity in minutes = remainingMinutes / 0.84
    // weekly hours = neededCapacity / (studyDaysCount / studyDays.length * 60)
    const neededWeeklyHours = Math.min(
      20,
      Math.ceil(((remainingMinutes / 0.84) / Math.max(1, studyDaysCount) * studyDays.length) / 30) * 0.5
    );
    const proposedWeeklyHours = Math.max(weeklyHours + 0.5, neededWeeklyHours);
    const addedHours = Math.round((proposedWeeklyHours - weeklyHours) * 10) / 10;
    const newDailyCap = Math.floor(((proposedWeeklyHours * 60) / studyDays.length) / 5) * 5;
    const projectedAddHoursCap = studyDaysCount * newDailyCap;
    const projectedAddHoursRatio = Math.round((remainingMinutes / (projectedAddHoursCap || 1)) * 100) / 100;

    // 3. Reduce scope: lowest priority first (priority 3, then 2, then 1)
    // Dependent check: skills with no dependents preferred first among same priority
    const dependentCount = new Map<string, number>();
    for (const s of input.skills) {
      for (const p of s.prereq_ids || []) {
        dependentCount.set(p, (dependentCount.get(p) || 0) + 1);
      }
    }

    const candidatePool = [...input.skills]
      .filter((s) => s.status !== "verified" && s.status !== "completed")
      .map((s) => {
        let mins = s.estimated_max_minutes;
        if (useEst === "min") mins = s.estimated_min_minutes;
        else if (useEst === "mean") mins = Math.round((s.estimated_min_minutes + s.estimated_max_minutes) / 2);
        return {
          id: s.id,
          name: s.name,
          priority: s.priority || 2,
          estimatedMinutes: mins,
          dependents: dependentCount.get(s.id) || 0,
        };
      })
      .sort((a, b) => {
        // Higher priority number = lower priority (3 = lowest priority first)
        if (b.priority !== a.priority) return b.priority - a.priority;
        // Among same priority: skills with zero dependents first
        if (a.dependents !== b.dependents) return a.dependents - b.dependents;
        // Higher minutes first
        return b.estimatedMinutes - a.estimatedMinutes;
      });

    const targetRemainingFor084 = Math.floor(capacityMinutes * 0.84);
    const candidateSkills: ScopeCandidate[] = [];
    let reducedMinutes = 0;
    let currRemaining = remainingMinutes;

    for (const item of candidatePool) {
      if (currRemaining <= targetRemainingFor084) break;
      candidateSkills.push({
        id: item.id,
        name: item.name,
        priority: item.priority,
        estimatedMinutes: item.estimatedMinutes,
      });
      reducedMinutes += item.estimatedMinutes;
      currRemaining -= item.estimatedMinutes;
    }

    const newRatio = capacityMinutes > 0 ? Math.round((currRemaining / capacityMinutes) * 100) / 100 : 0;
    const newBand: FeasibilityBand = newRatio < 0.85 ? "feasible" : newRatio <= 1.0 ? "tight" : "not_feasible";

    result.options = {
      extendDate: {
        proposedTargetDate,
        additionalDays: Math.ceil(
          (extendCursor.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
        ),
        projectedRatio: projectedExtendRatio,
      },
      addHours: {
        proposedWeeklyHours,
        addedHours,
        projectedRatio: projectedAddHoursRatio,
      },
      reduceScope: {
        candidateSkills,
        totalMinutesReduced: reducedMinutes,
        newRatio,
        newBand,
      },
    };
  }

  return result;
}
