import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveCard, listSavedCards } from "@/lib/saved-cards/service";
import { z } from "zod";

const saveCardSchema = z.object({
  skill_id: z.string().uuid().optional().nullable(),
  question: z.string().min(1, "Question cannot be empty"),
  answer: z.string().min(1, "Answer cannot be empty"),
});

/**
 * POST /api/v1/saved-cards
 * Creates a saved flashcard from a tutor Q&A interaction.
 * PRD Epic F & Phase L8 Requirement 4:
 * "Make this a flashcard saves a question and answer pair to saved_cards for that skill."
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

  const parsed = saveCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const card = await saveCard(supabase, {
      ownerId: user.id,
      skillId: parsed.data.skill_id,
      question: parsed.data.question,
      answer: parsed.data.answer,
    });

    return NextResponse.json({ card }, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/v1/saved-cards
 * Lists saved flashcards for review.
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

  try {
    const cards = await listSavedCards(supabase, {
      ownerId: user.id,
      skillId,
    });

    return NextResponse.json({ cards });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
