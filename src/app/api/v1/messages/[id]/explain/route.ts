import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { explainMessageStyle } from "@/lib/tutor/service";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const explainSchema = z.object({
  style: z.enum(["simpler", "more_technical", "with_example"], {
    errorMap: () => ({ message: "Style must be 'simpler', 'more_technical', or 'with_example'" }),
  }),
});

/**
 * POST /api/v1/messages/[id]/explain
 * Re-explains a tutor message in one of 3 requested styles: simpler, more technical, or with an example.
 * Each call counts against the AI cap.
 * PRD Epic F & Phase L8 Requirement 3.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: messageId } = await params;
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

  const parsed = explainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await explainMessageStyle(supabase, {
      messageId,
      ownerId: user.id,
      style: parsed.data.style,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
