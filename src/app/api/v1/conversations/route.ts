import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createConversation, listConversations } from "@/lib/tutor/service";
import { z } from "zod";

const createConversationSchema = z.object({
  skill_id: z.string().uuid().optional().nullable(),
  goal_id: z.string().uuid().optional().nullable(),
});

/**
 * POST /api/v1/conversations
 * Starts a new tutor conversation for a skill or goal.
 * PRD Epic F & Phase L8 Requirement 1 & 2.
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
    body = {};
  }

  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const conversation = await createConversation(supabase, {
      ownerId: user.id,
      skillId: parsed.data.skill_id,
      goalId: parsed.data.goal_id,
    });

    return NextResponse.json({ conversation }, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/v1/conversations
 * Lists conversations for the authenticated user, optionally scoped to skill or goal.
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

  const { searchParams } = new URL(req.url);
  const skillId = searchParams.get("skill_id") || undefined;
  const goalId = searchParams.get("goal_id") || undefined;

  try {
    const conversations = await listConversations(supabase, {
      ownerId: user.id,
      skillId,
      goalId,
    });

    return NextResponse.json({ conversations });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
