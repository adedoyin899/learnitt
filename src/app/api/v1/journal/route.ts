import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOrEditJournalEntry, listJournalTimeline } from "@/lib/journal/service";
import { z } from "zod";

const journalSchema = z.object({
  body: z.string().min(1, "Journal body cannot be empty"),
  mood: z.number().int().min(1).max(5).optional().nullable(),
  linked_check_in_id: z.string().uuid().optional().nullable(),
  linked_skill_id: z.string().uuid().optional().nullable(),
  entry_id: z.string().uuid().optional().nullable(),
  client_id: z.string().optional().nullable(),
});

/**
 * POST /api/v1/journal
 * Saves a new journal entry or adds a new version to an existing entry.
 * Idempotent by client_id.
 * PRD Epic G1 & Phase L8 Requirement 5 & 6.
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

  const parsed = journalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const entry = await createOrEditJournalEntry(supabase, {
      ownerId: user.id,
      body: parsed.data.body,
      mood: parsed.data.mood,
      linkedCheckInId: parsed.data.linked_check_in_id,
      linkedSkillId: parsed.data.linked_skill_id,
      entryId: parsed.data.entry_id,
      clientId: parsed.data.client_id,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/v1/journal
 * Retrieves the user's journal timeline with version history.
 */
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entries = await listJournalTimeline(supabase, user.id);
    return NextResponse.json({ entries });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
