export interface MVDStreakResult {
  current_streak: number;
  status: "active" | "paused";
  longest_streak: number;
  last_completed_date: string | null;
  message: string;
}

export interface EvidenceMixCounts {
  e0: number; // Self-rated
  e1: number; // Quiz passed
  e2: number; // Applied, graded
  e3: number; // Artifact checked
}

export interface WeeklyStudyMinutes {
  week: string; // ISO week string (e.g. '2026-W42' or date '2026-10-12')
  week_label: string;
  planned_minutes: number;
  done_minutes: number;
}

export interface VerifiedSkillPoint {
  date: string;
  cumulative_count: number;
}

export interface ProgressDataPayload {
  verified_skills_over_time: VerifiedSkillPoint[];
  planned_vs_done_minutes_per_week: WeeklyStudyMinutes[];
  mvd_streak: MVDStreakResult;
  evidence_mix: EvidenceMixCounts;
  skills_due_for_review: number;
  total_skills: number;
  verified_skills_count: number;
  plain_summary: string;
}

/**
 * Pure function: Calculates MVD streak from completion dates.
 * Prompt Requirement 6:
 * "MVD streak counts days with an MVD or better. A missed day resets nothing silently: show
 *  'Streak paused' with the count kept, and offer to restart. No guilt copy."
 */
export function calculateMVDStreak(
  completedDates: string[], // YYYY-MM-DD format, sorted ascending
  referenceDate?: Date
): MVDStreakResult {
  if (!completedDates || completedDates.length === 0) {
    return {
      current_streak: 0,
      status: "active",
      longest_streak: 0,
      last_completed_date: null,
      message: "Ready to start your streak with an MVD today!",
    };
  }

  // De-duplicate and sort dates ascending
  const uniqueDates = Array.from(new Set(completedDates)).sort();
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const todayStr = ref.toISOString().split("T")[0];

  // Calculate streaks across history
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const dateStr of uniqueDates) {
    const d = new Date(dateStr + "T00:00:00Z");
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diffDays = Math.round((d.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays === 1) {
        tempStreak += 1;
      } else if (diffDays > 1) {
        tempStreak = 1;
      }
    }
    prevDate = d;
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }
  }

  const lastCompleted = uniqueDates[uniqueDates.length - 1];
  const lastCompletedDate = new Date(lastCompleted + "T00:00:00Z");
  const todayDate = new Date(todayStr + "T00:00:00Z");

  const daysSinceLastCompletion = Math.round(
    (todayDate.getTime() - lastCompletedDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  // If completed today or yesterday -> streak is active
  if (daysSinceLastCompletion <= 1) {
    // Current streak is tempStreak ending at lastCompleted
    currentStreak = tempStreak;
    return {
      current_streak: currentStreak,
      status: "active",
      longest_streak: Math.max(longestStreak, currentStreak),
      last_completed_date: lastCompleted,
      message: `${currentStreak} day streak active! Keep going strong.`,
    };
  }

  // Missed a day: status is "paused", count is KEPT (no silent reset to 0, no guilt copy)
  currentStreak = tempStreak;
  return {
    current_streak: currentStreak,
    status: "paused",
    longest_streak: Math.max(longestStreak, currentStreak),
    last_completed_date: lastCompleted,
    message: `Streak paused at ${currentStreak} days. Pick up right where you left off!`,
  };
}

/**
 * Pure function: Generates a plain-language weekly summary from data by code, NOT by AI.
 * Prompt Requirement 5:
 * "The plain-language weekly summary is generated from data by code, not by AI.
 *  If an AI summary is shown, label it 'Written by AI'."
 */
export function generateCodeWeeklySummary(params: {
  doneMinutesThisWeek: number;
  plannedMinutesThisWeek: number;
  sessionsCompletedThisWeek: number;
  streak: MVDStreakResult;
  verifiedSkillsCount: number;
  skillsDueForReview: number;
  evidenceMix: EvidenceMixCounts;
}): string {
  const {
    doneMinutesThisWeek,
    plannedMinutesThisWeek,
    sessionsCompletedThisWeek,
    streak,
    verifiedSkillsCount,
    skillsDueForReview,
    evidenceMix,
  } = params;

  const parts: string[] = [];

  // 1. Time & Sessions
  if (sessionsCompletedThisWeek > 0) {
    const hours = (doneMinutesThisWeek / 60).toFixed(1);
    parts.push(
      `This week you completed ${sessionsCompletedThisWeek} learning session${
        sessionsCompletedThisWeek === 1 ? "" : "s"
      } totaling ${doneMinutesThisWeek} minutes (~${hours} hrs)${
        plannedMinutesThisWeek > 0
          ? ` of your ${plannedMinutesThisWeek} planned minutes`
          : ""
      }.`
    );
  } else {
    parts.push("You haven't logged any completed study sessions yet this week.");
  }

  // 2. Streak Status
  if (streak.status === "active" && streak.current_streak > 0) {
    parts.push(`Your MVD streak is active at ${streak.current_streak} days in a row.`);
  } else if (streak.status === "paused" && streak.current_streak > 0) {
    parts.push(
      `Your MVD streak is currently paused at ${streak.current_streak} days—ready to resume anytime without penalty.`
    );
  }

  // 3. Evidence & Skills Progress
  const highEvidence = evidenceMix.e2 + evidenceMix.e3;
  if (verifiedSkillsCount > 0) {
    parts.push(
      `You have ${verifiedSkillsCount} verified skill${
        verifiedSkillsCount === 1 ? "" : "s"
      } (${highEvidence} backed by hands-on applied/artifact evidence).`
    );
  }

  // 4. Spaced Reviews Due
  if (skillsDueForReview > 0) {
    parts.push(
      `${skillsDueForReview} skill${
        skillsDueForReview === 1 ? " is" : "s are"
      } ready for spaced review today.`
    );
  } else {
    parts.push("All your spaced reviews are up to date.");
  }

  return parts.join(" ");
}

/**
 * Pure function: Computes evidence mix distribution counts.
 */
export function computeEvidenceMix(
  skills: Array<{ evidence_level?: number | null }>
): EvidenceMixCounts {
  const counts: EvidenceMixCounts = { e0: 0, e1: 0, e2: 0, e3: 0 };
  for (const s of skills) {
    const lvl = s.evidence_level || 0;
    if (lvl <= 0) counts.e0 += 1;
    else if (lvl === 1) counts.e1 += 1;
    else if (lvl === 2) counts.e2 += 1;
    else counts.e3 += 1;
  }
  return counts;
}

/**
 * Pure function: Computes cumulative verified skills over time.
 */
export function computeVerifiedSkillsTimeline(
  skills: Array<{ verified_at?: string | null }>
): VerifiedSkillPoint[] {
  const verifiedDates = skills
    .map((s) => s.verified_at ? s.verified_at.split("T")[0] : null)
    .filter(Boolean) as string[];

  if (verifiedDates.length === 0) {
    return [];
  }

  verifiedDates.sort();

  const points: VerifiedSkillPoint[] = [];
  let count = 0;
  for (const date of verifiedDates) {
    count += 1;
    const existing = points.find((p) => p.date === date);
    if (existing) {
      existing.cumulative_count = count;
    } else {
      points.push({ date, cumulative_count: count });
    }
  }

  return points;
}
