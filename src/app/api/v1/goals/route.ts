import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const createGoalSchema = z.object({
  title: z.string().min(1, "Goal title is required").max(100, "Goal title must be 100 characters or less"),
  domain: z.string().max(100).optional().default("General"),
  starting_level: z.enum(["beginner", "intermediate", "advanced"]),
  target_date: z.string().refine(
    (val) => {
      const target = new Date(val);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return !isNaN(target.getTime()) && target > today;
    },
    { message: "Target date must be in the future." }
  ),
  weekly_hours: z.number().min(1, "Weekly hours must be at least 1").max(20, "Weekly hours cannot exceed 20").default(8),
  study_days: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one study day").default([1, 2, 3, 4, 5]),
  health_flag: z.boolean().optional(),
});

/**
 * GET /api/v1/goals
 * Lists all goals belonging to the authenticated user.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: goals, error } = await supabase
    .from("goals")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ goals: goals || [] });
}

/**
 * POST /api/v1/goals
 * Creates a new draft goal (PRD Epic A1, Screen S02).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const val = parsed.data;

  // Determine health_flag: user-specified or inferred from domain/title
  const isHealth =
    val.health_flag ??
    (val.title.toLowerCase().includes("health") ||
      val.domain.toLowerCase().includes("health") ||
      val.domain.toLowerCase().includes("biostatistics"));

  const { data: newGoal, error: insertErr } = await supabase
    .from("goals")
    .insert({
      owner_id: user.id,
      title: val.title,
      domain: val.domain,
      starting_level: val.starting_level,
      target_date: val.target_date,
      weekly_hours: val.weekly_hours,
      study_days: val.study_days,
      status: "draft",
      health_flag: isHealth,
      graph_version: 1,
    })
    .select()
    .single();

  if (insertErr || !newGoal) {
    return NextResponse.json(
      { error: insertErr?.message || "Failed to create goal" },
      { status: 500 }
    );
  }

  return NextResponse.json({ goal: newGoal }, { status: 201 });
}
