import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { EmailProvider } from "@/lib/email/types";
import { getEmailProvider } from "@/lib/email/registry";
import { PushProvider } from "@/lib/push/types";
import { getPushProvider } from "@/lib/push/registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { checkAdaptTrigger } from "@/lib/planner/adapt";

export interface UserLocalTime {
  localDate: string; // YYYY-MM-DD
  localHour: number; // 0-23
  localMinute: number; // 0-59
  isoWeekday: number; // 1 (Mon) - 7 (Sun)
}

export interface WeeklyStatsResult {
  plannedMinutes: number;
  doneMinutes: number;
  plannedHours: number;
  doneHours: number;
  completionRate: number;
  missedCount: number;
  adaptTriggered: boolean;
  adaptReason?: string;
  startDate: string;
  endDate: string;
}

/**
 * Calculates local date, hour, minute, and weekday for a given IANA timezone.
 * Accurately respects Daylight Saving Time (DST) transitions.
 */
export function getUserLocalTime(
  timezone: string = "Europe/London",
  nowUtc: Date = new Date()
): UserLocalTime {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      weekday: "narrow",
    });

    const parts = formatter.formatToParts(nowUtc);
    let year = "2026";
    let month = "01";
    let day = "01";
    let hour = "00";
    let minute = "00";

    for (const p of parts) {
      if (p.type === "year") year = p.value;
      if (p.type === "month") month = p.value;
      if (p.type === "day") day = p.value;
      if (p.type === "hour") hour = p.value;
      if (p.type === "minute") minute = p.value;
    }

    // Handle 24:00 edge cases in some formatters
    const parsedHour = parseInt(hour, 10) % 24;
    const parsedMinute = parseInt(minute, 10);
    const localDate = `${year}-${month}-${day}`;

    // Compute ISO weekday (1 = Monday, 7 = Sunday) in user's timezone
    const dayOfWeekFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    const weekdayStr = dayOfWeekFormatter.format(nowUtc);
    const weekdayMap: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    const isoWeekday = weekdayMap[weekdayStr] || 1;

    return {
      localDate,
      localHour: parsedHour,
      localMinute: parsedMinute,
      isoWeekday,
    };
  } catch {
    // Fallback to UTC if timezone string is invalid
    const y = nowUtc.getUTCFullYear();
    const m = String(nowUtc.getUTCMonth() + 1).padStart(2, "0");
    const d = String(nowUtc.getUTCDate()).padStart(2, "0");
    const day = nowUtc.getUTCDay();
    return {
      localDate: `${y}-${m}-${d}`,
      localHour: nowUtc.getUTCHours(),
      localMinute: nowUtc.getUTCMinutes(),
      isoWeekday: day === 0 ? 7 : day,
    };
  }
}

/**
 * Checks if target daily_time (e.g. "09:00:00" or "18:30") is due.
 * Window: within toleranceMinutes of target time, or matching hour if tolerance is 60.
 */
export function isTimeDue(
  dailyTime: string | null | undefined,
  localHour: number,
  localMinute: number,
  toleranceMinutes: number = 60
): boolean {
  if (!dailyTime) return false;

  const [tHourStr, tMinStr] = dailyTime.split(":");
  const targetHour = parseInt(tHourStr, 10);
  const targetMinute = parseInt(tMinStr || "0", 10);

  const targetTotal = targetHour * 60 + targetMinute;
  const currentTotal = localHour * 60 + localMinute;

  // Due if current time is at or past target time within tolerance
  const diff = currentTotal - targetTotal;
  return diff >= 0 && diff <= toleranceMinutes;
}

/**
 * Invariant: Check if today's primary session is already complete.
 * A day is complete if:
 * 1. A check_in row exists for today with outcome "done" or "mvd_only".
 * 2. Or all scheduled plan_items for today have status "done" or "mvd_only".
 */
export async function isDayComplete(
  ownerId: string,
  localDate: string,
  dbClient: SupabaseClient<Database>
): Promise<boolean> {
  // 1. Fetch today's plan items
  const { data: planItems } = await dbClient
    .from("plan_items")
    .select("id, status")
    .eq("owner_id", ownerId)
    .eq("scheduled_date", localDate);

  if (!planItems || planItems.length === 0) {
    return false;
  }

  // If any plan item for today is marked done or mvd_only
  const anyDone = planItems.some(
    (item) => item.status === "done" || item.status === "mvd_only"
  );
  if (anyDone) {
    return true;
  }

  // 2. Check check_ins for today's plan items
  const planItemIds = planItems.map((p) => p.id);
  const { data: checkIns } = await dbClient
    .from("check_ins")
    .select("outcome")
    .eq("owner_id", ownerId)
    .in("plan_item_id", planItemIds);

  if (checkIns && checkIns.some((c) => c.outcome === "done" || c.outcome === "mvd_only")) {
    return true;
  }

  return false;
}

/**
 * Generates calm, specific copy:
 * PRD Section 11 & Requirement 4:
 * "Copy is specific and calm: 'Today: Dimensional modelling, 45 min. Minimum version: 15 min.'"
 */
export async function getTodaySessionCopy(
  ownerId: string,
  localDate: string,
  dbClient: SupabaseClient<Database>
): Promise<{
  title: string;
  plannedMinutes: number;
  mvdMinutes: number;
  formattedText: string;
}> {
  // Query today's primary session
  const { data: items } = await dbClient
    .from("plan_items")
    .select("id, skill_id, planned_minutes, mvd_minutes, position")
    .eq("owner_id", ownerId)
    .eq("scheduled_date", localDate)
    .order("position", { ascending: true })
    .limit(1);

  if (items && items.length > 0 && items[0].skill_id) {
    const item = items[0];
    const skillId = item.skill_id as string;
    const { data: skill } = await dbClient
      .from("skills")
      .select("name")
      .eq("id", skillId)
      .maybeSingle();

    const skillName = skill?.name || "Daily Study Session";
    const plannedMinutes = item.planned_minutes || 45;
    const mvdMinutes = item.mvd_minutes || 15;

    return {
      title: skillName,
      plannedMinutes,
      mvdMinutes,
      formattedText: `Today: ${skillName}, ${plannedMinutes} min. Minimum version: ${mvdMinutes} min.`,
    };
  }

  return {
    title: "Daily Focus",
    plannedMinutes: 30,
    mvdMinutes: 15,
    formattedText: "Today: Daily Study Session, 30 min. Minimum version: 15 min.",
  };
}

export async function getWeeklyStats(
  ownerId: string,
  localDate: string,
  dbClient: SupabaseClient<Database>
): Promise<WeeklyStatsResult> {
  const endDate = localDate;
  const endD = new Date(`${endDate}T12:00:00Z`);
  const startD = new Date(endD.getTime() - 6 * 24 * 60 * 60 * 1000);
  const startDate = startD.toISOString().slice(0, 10);

  const { data: planItems } = await dbClient
    .from("plan_items")
    .select("id, goal_id, skill_id, scheduled_date, position, planned_minutes, mvd_minutes, status")
    .eq("owner_id", ownerId)
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate);

  const items = planItems || [];
  const planItemIds = items.map((p) => p.id);
  const planItemDateMap = new Map(items.map((p) => [p.id, p.scheduled_date]));

  let checks: any[] = [];
  if (planItemIds.length > 0) {
    const { data: fetchedChecks } = await dbClient
      .from("check_ins")
      .select("id, plan_item_id, outcome, minutes_actual, created_at")
      .eq("owner_id", ownerId)
      .in("plan_item_id", planItemIds);
    checks = fetchedChecks || [];
  }

  const plannedMinutes = items.reduce((acc, it) => acc + (it.planned_minutes || 0), 0);

  let doneMinutes = 0;
  for (const c of checks) {
    if (c.outcome === "done" || c.outcome === "partial" || c.outcome === "mvd_only") {
      doneMinutes += c.minutes_actual || 0;
    }
  }

  if (doneMinutes === 0 && items.length > 0) {
    for (const it of items) {
      if (it.status === "done") {
        doneMinutes += it.planned_minutes || 0;
      } else if (it.status === "mvd_only") {
        doneMinutes += it.mvd_minutes || 15;
      }
    }
  }

  const completionRate = plannedMinutes > 0 ? doneMinutes / plannedMinutes : 1;
  const missedCount =
    checks.filter((c) => c.outcome === "missed").length +
    items.filter((it) => it.status === "missed").length;

  const adaptCheck = checkAdaptTrigger({
    checkIns: checks.map((c) => ({
      plan_item_id: c.plan_item_id || "",
      scheduled_date: planItemDateMap.get(c.plan_item_id) || endDate,
      outcome: c.outcome as any,
      minutes_actual: c.minutes_actual,
    })),
    planItems: items as any,
    today: endDate,
  });

  return {
    plannedMinutes,
    doneMinutes,
    plannedHours: Math.round((plannedMinutes / 60) * 10) / 10,
    doneHours: Math.round((doneMinutes / 60) * 10) / 10,
    completionRate: Math.round(completionRate * 100) / 100,
    missedCount,
    adaptTriggered: adaptCheck.triggered,
    adaptReason: adaptCheck.reason,
    startDate,
    endDate,
  };
}

export interface ReminderProcessResult {
  evaluatedCount: number;
  sentCount: number;
  skippedDayCompleteCount: number;
  skippedAlreadySentCount: number;
  skippedNotDueCount: number;
  skippedWeekdayCount: number;
  details: Array<{
    ownerId: string;
    action:
      | "sent"
      | "sent_weekly_checkin"
      | "skipped_day_complete"
      | "skipped_already_sent"
      | "skipped_not_due"
      | "skipped_weekday";
    channels?: string[];
    copy?: string;
  }>;
}

/**
 * Core reminder cron processing:
 * Evaluates all users with active reminders, checks timezone, weekday, completion, and deduplication.
 */
export async function processDueReminders(options: {
  dbClient?: SupabaseClient<Database>;
  emailProvider?: EmailProvider;
  pushProvider?: PushProvider;
  nowUtc?: Date;
  toleranceMinutes?: number;
} = {}): Promise<ReminderProcessResult> {
  const client = options.dbClient || createServiceRoleClient();
  const emailProvider = options.emailProvider || getEmailProvider();
  const pushProvider = options.pushProvider || getPushProvider();
  const nowUtc = options.nowUtc || new Date();
  const tolerance = options.toleranceMinutes ?? 60;

  // 1. Fetch all users with reminders enabled
  const { data: settingsList, error: settingsErr } = await client
    .from("reminder_settings")
    .select("*")
    .or("email_enabled.eq.true,push_enabled.eq.true");

  if (settingsErr || !settingsList || settingsList.length === 0) {
    return {
      evaluatedCount: 0,
      sentCount: 0,
      skippedDayCompleteCount: 0,
      skippedAlreadySentCount: 0,
      skippedNotDueCount: 0,
      skippedWeekdayCount: 0,
      details: [],
    };
  }

  // 2. Fetch profiles for timezone and names
  const ownerIds = settingsList.map((s) => s.owner_id);
  const { data: profiles } = await client
    .from("profiles")
    .select("id, timezone, display_name")
    .in("id", ownerIds);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  let sentCount = 0;
  let skippedDayCompleteCount = 0;
  let skippedAlreadySentCount = 0;
  let skippedNotDueCount = 0;
  let skippedWeekdayCount = 0;
  const details: ReminderProcessResult["details"] = [];

  for (const settings of settingsList) {
    const ownerId = settings.owner_id;
    const profile = profileMap.get(ownerId);
    const timezone = profile?.timezone || "Europe/London";

    const localTime = getUserLocalTime(timezone, nowUtc);

    // A. Check weekday
    const userWeekdays = settings.weekdays && settings.weekdays.length > 0
      ? settings.weekdays
      : [1, 2, 3, 4, 5];

    if (!userWeekdays.includes(localTime.isoWeekday)) {
      skippedWeekdayCount++;
      details.push({ ownerId, action: "skipped_weekday" });
      continue;
    }

    // B. Check time due
    const due = isTimeDue(
      settings.daily_time,
      localTime.localHour,
      localTime.localMinute,
      tolerance
    );
    if (!due) {
      skippedNotDueCount++;
      details.push({ ownerId, action: "skipped_not_due" });
      continue;
    }

    // C. Check if today's primary session is already done
    const isComplete = await isDayComplete(ownerId, localTime.localDate, client);
    if (isComplete) {
      skippedDayCompleteCount++;
      details.push({ ownerId, action: "skipped_day_complete" });
      continue;
    }

    // D. Dedupe check: has a daily_study reminder already been sent today?
    const { data: existingLog } = await client
      .from("reminder_log")
      .select("owner_id")
      .eq("owner_id", ownerId)
      .eq("kind", "daily_study")
      .eq("day", localTime.localDate)
      .maybeSingle();

    if (existingLog) {
      skippedAlreadySentCount++;
      details.push({ ownerId, action: "skipped_already_sent" });
      continue;
    }

    // E. Formulate specific and calm copy
    const sessionCopy = await getTodaySessionCopy(ownerId, localTime.localDate, client);
    const channelsSent: string[] = [];

    // F. Send Email if enabled
    if (settings.email_enabled) {
      // Get user email from auth or profile
      let userEmail = "";
      try {
        const { data: authUser } = await (client as any).auth?.admin?.getUserById(ownerId);
        userEmail = authUser?.user?.email || "";
      } catch {
        // Fallback for mock environments
        userEmail = `${ownerId}@example.com`;
      }

      if (!userEmail) {
        userEmail = `${ownerId}@example.com`;
      }

      await emailProvider.sendEmail({
        to: userEmail,
        subject: `Today: ${sessionCopy.title}, ${sessionCopy.plannedMinutes} min`,
        text: sessionCopy.formattedText,
        html: `<div style="font-family: sans-serif; max-width: 500px; padding: 20px; color: #111;">
          <h2 style="font-size: 18px; margin-bottom: 8px;">Your Daily Focus in Learnitt</h2>
          <p style="font-size: 16px; line-height: 1.5; color: #333;">${sessionCopy.formattedText}</p>
          <div style="margin-top: 24px;">
            <a href="https://learnitt.app/today" style="background: #111; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 500; font-size: 14px;">Open Today's Session</a>
          </div>
        </div>`,
      });
      channelsSent.push("email");
    }

    // G. Send Web Push if enabled
    if (settings.push_enabled) {
      const { data: subs } = await client
        .from("push_subscriptions")
        .select("endpoint, keys")
        .eq("owner_id", ownerId);

      for (const sub of subs || []) {
        await pushProvider.sendPush({
          subscription: {
            endpoint: sub.endpoint,
            keys: sub.keys as any,
          },
          title: "Learnitt Daily Focus",
          body: sessionCopy.formattedText,
          url: "/today",
        });
      }
      channelsSent.push("push");
    }

    // H. Record send in reminder_log for deduplication
    await client.from("reminder_log").insert({
      owner_id: ownerId,
      kind: "daily_study",
      day: localTime.localDate,
    });

    sentCount++;
    details.push({
      ownerId,
      action: "sent",
      channels: channelsSent,
      copy: sessionCopy.formattedText,
    });

    // I. Weekly Review Check-In evaluation (PRD Epic H2)
    const isWeeklyDay =
      settings.weekly_review_day !== null &&
      settings.weekly_review_day !== undefined &&
      (localTime.isoWeekday % 7) === settings.weekly_review_day;

    if (isWeeklyDay) {
      const { data: existingWeeklyLog } = await client
        .from("reminder_log")
        .select("owner_id")
        .eq("owner_id", ownerId)
        .eq("kind", "weekly_checkin")
        .eq("day", localTime.localDate)
        .maybeSingle();

      if (!existingWeeklyLog) {
        const weeklyStats = await getWeeklyStats(ownerId, localTime.localDate, client);
        const weeklyChannels: string[] = [];

        if (settings.email_enabled) {
          let userEmail = "";
          try {
            const { data: authUser } = await (client as any).auth?.admin?.getUserById(ownerId);
            userEmail = authUser?.user?.email || "";
          } catch {
            userEmail = `${ownerId}@example.com`;
          }
          if (!userEmail) userEmail = `${ownerId}@example.com`;

          await emailProvider.sendEmail({
            to: userEmail,
            subject: `Weekly check-in: ${weeklyStats.plannedHours}h planned, ${weeklyStats.doneHours}h completed`,
            text: `Weekly check-in: You planned ${weeklyStats.plannedHours} hours and completed ${weeklyStats.doneHours} hours this week. What got in the way? Reflect and adapt your schedule at https://learnitt.app/settings?tab=review`,
            html: `<div style="font-family: sans-serif; max-width: 500px; padding: 20px; color: #111;">
              <h2 style="font-size: 18px; margin-bottom: 8px;">Weekly Learning Check-in</h2>
              <p style="font-size: 15px; line-height: 1.5; color: #333;">
                This week: <strong>${weeklyStats.plannedHours}h planned</strong>, <strong>${weeklyStats.doneHours}h completed</strong>.
              </p>
              <p style="font-size: 14px; color: #666; margin-top: 12px;">
                Take a brief moment to reflect on what went well and what got in the way.
              </p>
              <div style="margin-top: 20px;">
                <a href="https://learnitt.app/settings?tab=review" style="background: #111; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-weight: 500; font-size: 14px;">Open Weekly Check-in</a>
              </div>
            </div>`,
          });
          weeklyChannels.push("email");
        }

        if (settings.push_enabled) {
          const { data: subs } = await client
            .from("push_subscriptions")
            .select("endpoint, keys")
            .eq("owner_id", ownerId);

          for (const sub of subs || []) {
            await pushProvider.sendPush({
              subscription: {
                endpoint: sub.endpoint,
                keys: sub.keys as any,
              },
              title: "Learnitt Weekly Check-in",
              body: `Planned: ${weeklyStats.plannedHours}h, Done: ${weeklyStats.doneHours}h. Tap to reflect on what got in the way.`,
              url: "/settings?tab=review",
            });
          }
          weeklyChannels.push("push");
        }

        await client.from("reminder_log").insert({
          owner_id: ownerId,
          kind: "weekly_checkin",
          day: localTime.localDate,
        });

        details.push({
          ownerId,
          action: "sent_weekly_checkin",
          channels: weeklyChannels,
          copy: `Weekly check-in: ${weeklyStats.plannedHours}h planned, ${weeklyStats.doneHours}h completed`,
        });
      }
    }
  }

  return {
    evaluatedCount: settingsList.length,
    sentCount,
    skippedDayCompleteCount,
    skippedAlreadySentCount,
    skippedNotDueCount,
    skippedWeekdayCount,
    details,
  };
}
