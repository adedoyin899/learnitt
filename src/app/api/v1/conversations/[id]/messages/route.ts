import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { postMessageAndGenerateAnswer } from "@/lib/tutor/service";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const messageSchema = z.object({
  content: z.string().min(1, "Question content cannot be empty"),
});

/**
 * POST /api/v1/conversations/[id]/messages
 * Submits learner question, enqueues/executes answer_question with retrieved chunks.
 * Strict rules:
 * - Reply cites chunk ids.
 * - Removes any citation id not in the retrieved set.
 * - If unsupported, labels as general knowledge and sets general_knowledge flag.
 * PRD Epics F & Phase L8 Requirement 1.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: conversationId } = await params;
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

  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await postMessageAndGenerateAnswer(supabase, {
      conversationId,
      ownerId: user.id,
      content: parsed.data.content,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
