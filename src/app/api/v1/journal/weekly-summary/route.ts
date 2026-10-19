import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWeeklySummary } from "@/lib/journal/service";
import { z } from "zod";

const summarySchema = z.object({
  include_journal: z.boolean().default(false),
});

/**
 * POST /api/v1/journal/weekly-summary
 * Generates an adaptive, supportive weekly progress summary.
 * PRD Epic G1 & Phase L8 Requirement 5:
 * "A weekly summary may be offered, and it runs only when the user taps 'Summarise my week',
 *  and only on structured stats unless the user also ticks 'Include my journal'."
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

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Optional body defaults to include_journal: false
    body = {};
  }

  const parsed = summarySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await generateWeeklySummary(supabase, {
      ownerId: user.id,
      includeJournal: parsed.data.include_journal,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
