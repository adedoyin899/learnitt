import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOrEditJournalEntry } from "@/lib/journal/service";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const editSchema = z.object({
  body: z.string().min(1, "Journal body cannot be empty"),
  mood: z.number().int().min(1).max(5).optional().nullable(),
  linked_check_in_id: z.string().uuid().optional().nullable(),
  linked_skill_id: z.string().uuid().optional().nullable(),
  client_id: z.string().optional().nullable(),
});

/**
 * PUT /api/v1/journal/[id]
 * Edits an existing journal entry by appending a new version row.
 * Preserves the previous version.
 * PRD Epic G1 & Phase L8 Requirement 5: "Edits create a new version."
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find the entry to get its entry_id
  const { data: existing, error: findErr } = await supabase
    .from("journal_entries")
    .select("id, entry_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (findErr || !existing) {
    return NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const newVersionEntry = await createOrEditJournalEntry(supabase, {
      ownerId: user.id,
      entryId: existing.entry_id || existing.id,
      body: parsed.data.body,
      mood: parsed.data.mood,
      linkedCheckInId: parsed.data.linked_check_in_id,
      linkedSkillId: parsed.data.linked_skill_id,
      clientId: parsed.data.client_id,
    });

    return NextResponse.json({ entry: newVersionEntry });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
