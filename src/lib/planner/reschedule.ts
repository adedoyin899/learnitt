import { PlannedItem, PlannerGoal } from "./types";
import { addDays, calculateCapacity, getIsoWeekday, normalizeDate, parseDate } from "./scheduler";

export interface RescheduleRequest {
  item: PlannedItem;
  goal: PlannerGoal;
  existingItems: PlannedItem[];
  missCount?: number; // Times this item / skill has been missed
  confirmedExceedWeeklyHours?: boolean;
  searchFromDate?: string | Date; // Default to item.scheduled_date
}

export interface RescheduleResult {
  success: boolean;
  rescheduledItem?: PlannedItem;
  newDate?: string;
  triggerAdapt?: boolean;
  requiresWeeklyConfirmation?: boolean;
  exceedsWeeklyMinutesBy?: number;
  reason?: string;
}

/**
 * Returns Monday (start) and Sunday (end) for the ISO week containing dateStr.
 */
export function getIsoWeekRange(dateStr: string): { startOfWeek: string; endOfWeek: string } {
  const d = parseDate(dateStr);
  const isoDay = getIsoWeekday(d); // 1 = Mon ... 7 = Sun
  const mondayOffset = 1 - isoDay;
  const sundayOffset = 7 - isoDay;

  return {
    startOfWeek: addDays(dateStr, mondayOffset),
    endOfWeek: addDays(dateStr, sundayOffset),
  };
}

/**
 * Computes total active planned minutes for a given ISO week.
 */
export function getWeeklyPlannedMinutes(
  items: PlannedItem[],
  dateStr: string,
  excludeItemId?: string
): number {
  const { startOfWeek, endOfWeek } = getIsoWeekRange(dateStr);
  return items
    .filter((it) => {
      if (excludeItemId && it.id === excludeItemId) return false;
      if (it.status === "missed" || it.status === "unscheduled") return false;
      return it.scheduled_date >= startOfWeek && it.scheduled_date <= endOfWeek;
    })
    .reduce((sum, it) => sum + it.planned_minutes, 0);
}

/**
 * Reschedules a missed plan item according to PRD C5 & Prompt Requirement 5:
 * - A missed item moves to the next day with free capacity within 7 days.
 * - Never push a week over weekly hours without confirmation.
 * - An item missed 3 times triggers the adapt prompt.
 */
export function rescheduleMissedItem(request: RescheduleRequest): RescheduleResult {
  const {
    item,
    goal,
    existingItems,
    missCount = 1,
    confirmedExceedWeeklyHours = false,
  } = request;

  // 1. If missed 3 times, immediately trigger adapt prompt
  if (missCount >= 3) {
    return {
      success: false,
      triggerAdapt: true,
      reason: "This item has been missed 3 times. Pick how to adapt your schedule to stay on track.",
    };
  }

  const baseDate = normalizeDate(request.searchFromDate || item.scheduled_date);
  const maxWeeklyMinutes = goal.weekly_hours * 60;

  // Search window: next 1 to 7 days
  for (let offset = 1; offset <= 7; offset++) {
    const candidateDate = addDays(baseDate, offset);
    const dayCapacity = calculateCapacity(goal, candidateDate);

    if (dayCapacity <= 0) {
      // Not a study day
      continue;
    }

    // Minutes already scheduled on this candidate day (excluding missed items and current item)
    const dayUsedMinutes = existingItems
      .filter((it) => {
        if (item.id && it.id === item.id) return false;
        if (it.status === "missed" || it.status === "unscheduled") return false;
        return it.scheduled_date === candidateDate;
      })
      .reduce((sum, it) => sum + it.planned_minutes, 0);

    const freeCapacity = dayCapacity - dayUsedMinutes;

    // Check if item fits in day capacity
    if (freeCapacity >= item.planned_minutes) {
      // Check weekly capacity invariant
      const weekPlanned = getWeeklyPlannedMinutes(existingItems, candidateDate, item.id);
      const totalWeekWithItem = weekPlanned + item.planned_minutes;

      if (totalWeekWithItem > maxWeeklyMinutes && !confirmedExceedWeeklyHours) {
        return {
          success: false,
          requiresWeeklyConfirmation: true,
          newDate: candidateDate,
          exceedsWeeklyMinutesBy: totalWeekWithItem - maxWeeklyMinutes,
          reason: `Moving this session to ${candidateDate} pushes that week to ${Math.round(
            (totalWeekWithItem / 60) * 10
          ) / 10} hours (exceeding your ${goal.weekly_hours}h weekly goal). Confirmation is required.`,
        };
      }

      // Success! Reschedule to candidateDate
      const rescheduledItem: PlannedItem = {
        ...item,
        scheduled_date: candidateDate,
        rescheduled_from: item.rescheduled_from || item.scheduled_date,
        status: "rescheduled",
      };

      return {
        success: true,
        rescheduledItem,
        newDate: candidateDate,
      };
    }
  }

  // If no day with free capacity within 7 days, trigger adapt prompt
  return {
    success: false,
    triggerAdapt: true,
    reason: "No study day with free capacity found within the next 7 days. Adapt your plan to catch up.",
  };
}
