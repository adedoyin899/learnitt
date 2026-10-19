import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * POST /api/v1/push/subscribe
 * Registers a device's Web Push subscription from an installed PWA.
 * PRD Section 11 & Requirement 3.
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
  const parseResult = pushSubscriptionSchema.safeParse(body);

  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid subscription payload", details: parseResult.error.format() },
      { status: 400 }
    );
  }

  const { endpoint, keys } = parseResult.data;

  // 1. Upsert into push_subscriptions
  const { data: sub, error: subErr } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        owner_id: user.id,
        endpoint,
        keys: keys as any,
      },
      { onConflict: "endpoint" }
    )
    .select()
    .single();

  if (subErr) {
    return NextResponse.json(
      { error: `Failed to save push subscription: ${subErr.message}` },
      { status: 500 }
    );
  }

  // 2. Enable push in reminder_settings
  await supabase
    .from("reminder_settings")
    .upsert({
      owner_id: user.id,
      push_enabled: true,
    } as any);

  return NextResponse.json({
    success: true,
    push_enabled: true,
    data: sub,
    message: "Device successfully subscribed to push reminders.",
  });
}
