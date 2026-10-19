import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { Database } from "@/types/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const reorderSchema = z.object({
  skill_ids: z.array(z.string().uuid()).min(1),
});

/**
 * PUT /api/v1/goals/[id]/skills/reorder
 * Reorders skills by position, logs graph_edit to goal_changes.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
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

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.format() }, { status: 400 });
  }

  const { skill_ids } = parsed.data;

  // Update positions sequentially
  for (let pos = 0; pos < skill_ids.length; pos++) {
    await supabase
      .from("skills")
      .update({ position: pos, updated_at: new Date().toISOString() })
      .eq("id", skill_ids[pos])
      .eq("goal_id", id)
      .eq("owner_id", user.id);
  }

  // Log graph_edit to goal_changes
  await supabase.from("goal_changes").insert({
    owner_id: user.id,
    goal_id: id,
    change_type: "graph_edit",
    detail: {
      action: "reorder_skills",
      new_order: skill_ids,
    } as unknown as Database["public"]["Tables"]["goal_changes"]["Insert"]["detail"],
  });

  return NextResponse.json({ success: true, count: skill_ids.length });
}
