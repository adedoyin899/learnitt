import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const checkInSchema = z.object({
  client_id: z.string().uuid(),
  plan_item_id: z.string().uuid(),
  outcome: z.enum(["done", "partial", "missed", "mvd_only"]),
  minutes_actual: z.number().int().min(0).max(480).optional().nullable(),
  reason: z
    .enum(["no_time", "unwell", "client_work", "too_hard", "too_easy", "other"])
    .optional()
    .nullable(),
  note: z.string().optional().nullable(),
});

/**
 * POST /api/v1/check-ins
 * Records a session check-in. Strictly idempotent by client_id.
 * PRD Section 8, Section 10 & Prompt Requirements 2 and 3.
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = checkInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { client_id, plan_item_id, outcome, minutes_actual, reason, note } = parsed.data;

  // 1. Idempotency Check: search for existing check-in by (owner_id, client_id)
  const { data: existingCheckIn } = await supabase
    .from("check_ins")
    .select("*")
    .eq("owner_id", user.id)
    .eq("client_id", client_id)
    .maybeSingle();

  if (existingCheckIn) {
    return NextResponse.json({
      success: true,
      check_in: existingCheckIn,
      is_duplicate: true,
      message: "Check-in already recorded with this client_id (idempotent)",
    });
  }

  // 2. Fetch the plan item to verify ownership and default minutes
  const { data: planItem, error: itemErr } = await supabase
    .from("plan_items")
    .select("id, planned_minutes, mvd_minutes, scheduled_date")
    .eq("id", plan_item_id)
    .eq("owner_id", user.id)
    .single();

  if (itemErr || !planItem) {
    return NextResponse.json({ error: "Plan item not found" }, { status: 404 });
  }

  // Default minutes if not provided
  let effectiveMinutes = minutes_actual;
  if (effectiveMinutes === undefined || effectiveMinutes === null) {
    if (outcome === "done") {
      effectiveMinutes = planItem.planned_minutes;
    } else if (outcome === "mvd_only") {
      effectiveMinutes = planItem.mvd_minutes;
    } else if (outcome === "missed") {
      effectiveMinutes = 0;
    } else if (outcome === "partial") {
      effectiveMinutes = Math.round(planItem.planned_minutes / 2);
    }
  }

  // 3. Insert new check-in row
  const { data: newCheckIn, error: insertErr } = await supabase
    .from("check_ins")
    .insert({
      owner_id: user.id,
      client_id,
      plan_item_id,
      outcome,
      minutes_actual: effectiveMinutes,
      reason: reason || null,
      note: note || null,
    })
    .select()
    .single();

  if (insertErr) {
    // If concurrent race inserted with same client_id, return existing
    if (insertErr.message.includes("unique") || insertErr.message.includes("duplicate")) {
      const { data: racedRow } = await supabase
        .from("check_ins")
        .select("*")
        .eq("owner_id", user.id)
        .eq("client_id", client_id)
        .maybeSingle();
      if (racedRow) {
        return NextResponse.json({
          success: true,
          check_in: racedRow,
          is_duplicate: true,
        });
      }
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // 4. Update status on plan_items
  await supabase
    .from("plan_items")
    .update({ status: outcome })
    .eq("id", plan_item_id)
    .eq("owner_id", user.id);

  return NextResponse.json({
    success: true,
    check_in: newCheckIn,
    is_duplicate: false,
  });
}
