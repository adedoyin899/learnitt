import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWeeklyStats } from "@/lib/reminders/service";
import { z } from "zod";

const submitWeeklyCheckInSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
  note: z.string().optional().nullable(),
  client_id: z.string().optional(),
});

/**
 * GET /api/v1/check-ins/weekly
 * Returns planned vs done hours, completion rate, and adapt trigger status for current user.
 * Epic H2 and PRD Section 11.
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

  // Get user timezone
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const timezone = profile?.timezone || "Europe/London";
  const now = new Date();
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);

  const stats = await getWeeklyStats(user.id, localDate, supabase);

  return NextResponse.json({
    data: stats,
  });
}

/**
 * POST /api/v1/check-ins/weekly
 * Submits the weekly check-in reflection: "what got in the way".
 * Epic H2 and PRD Section 11.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parseResult = submitWeeklyCheckInSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parseResult.error.flatten() },
      { status: 400 }
    );
  }

  const { reason, note } = parseResult.data;

  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();

  const timezone = profile?.timezone || "Europe/London";
  const now = new Date();
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);

  const stats = await getWeeklyStats(user.id, localDate, supabase);

  // 1. Record in reminder_log to mark weekly check-in complete for this week
  await supabase
    .from("reminder_log")
    .upsert(
      {
        owner_id: user.id,
        kind: "weekly_checkin",
        day: localDate,
      },
      { onConflict: "owner_id,kind,day" }
    );

  // 2. Record audit event for reflection
  await supabase.from("audit_events").insert({
    owner_id: user.id,
    event: "weekly_check_in",
    detail: {
      reason,
      note,
      planned_hours: stats.plannedHours,
      done_hours: stats.doneHours,
      completion_rate: stats.completionRate,
      adapt_triggered: stats.adaptTriggered,
      adapt_reason: stats.adaptReason,
      date: localDate,
    },
  });

  return NextResponse.json({
    success: true,
    data: {
      recorded_date: localDate,
      planned_hours: stats.plannedHours,
      done_hours: stats.doneHours,
      adapt_triggered: stats.adaptTriggered,
      adapt_reason: stats.adaptReason,
    },
    message: "Weekly check-in reflection saved.",
  });
}
