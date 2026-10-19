import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const updateReminderSettingsSchema = z.object({
  daily_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/, "Invalid time format (HH:MM or HH:MM:SS)")
    .nullable()
    .optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).optional(),
  email_enabled: z.boolean().optional(),
  push_enabled: z.boolean().optional(),
  weekly_review_day: z.number().int().min(0).max(6).nullable().optional(),
  timezone: z.string().min(1).optional(),
});

/**
 * GET /api/v1/reminders
 * Retrieves user's reminder settings and current profile timezone.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Fetch reminder settings
  const { data: settings } = await supabase
    .from("reminder_settings")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();

  // 2. Fetch profile timezone
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const defaultSettings = {
    owner_id: user.id,
    daily_time: "09:00:00",
    weekdays: [1, 2, 3, 4, 5],
    email_enabled: true,
    push_enabled: false,
    weekly_review_day: 0,
    timezone: profile?.timezone || "Europe/London",
  };

  return NextResponse.json({
    data: {
      ...defaultSettings,
      ...(settings || {}),
      timezone: profile?.timezone || defaultSettings.timezone,
    },
  });
}

/**
 * PUT /api/v1/reminders
 * Updates user's reminder settings and optionally profile timezone.
 */
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parseResult = updateReminderSettingsSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parseResult.error.format() },
      { status: 400 }
    );
  }

  const { timezone, ...settingsPayload } = parseResult.data;

  // 1. Update profile timezone if specified
  if (timezone) {
    await supabase
      .from("profiles")
      .update({ timezone })
      .eq("id", user.id);
  }

  // 2. Format daily_time to HH:MM:00 if provided as HH:MM
  let formattedDailyTime = settingsPayload.daily_time;
  if (formattedDailyTime && formattedDailyTime.length === 5) {
    formattedDailyTime = `${formattedDailyTime}:00`;
  }

  // 3. Upsert reminder_settings
  const upsertData: Record<string, any> = {
    owner_id: user.id,
    ...(settingsPayload.weekdays !== undefined ? { weekdays: settingsPayload.weekdays } : {}),
    ...(settingsPayload.email_enabled !== undefined ? { email_enabled: settingsPayload.email_enabled } : {}),
    ...(settingsPayload.push_enabled !== undefined ? { push_enabled: settingsPayload.push_enabled } : {}),
    ...(settingsPayload.weekly_review_day !== undefined ? { weekly_review_day: settingsPayload.weekly_review_day } : {}),
    ...(formattedDailyTime !== undefined ? { daily_time: formattedDailyTime } : {}),
  };

  const { data: updated, error: upsertErr } = await supabase
    .from("reminder_settings")
    .upsert(upsertData as any)
    .select("*")
    .single();

  if (upsertErr) {
    return NextResponse.json(
      { error: `Failed to update reminder settings: ${upsertErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      ...updated,
      timezone: timezone || "Europe/London",
    },
    message: "Reminder settings updated successfully.",
  });
}
