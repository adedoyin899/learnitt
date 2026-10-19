import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConversation } from "@/lib/tutor/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/conversations/[id]
 * Retrieves conversation thread with messages, cited chunks, and linked skill/goal context.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getConversation(supabase, conversationId, user.id);
    return NextResponse.json(data);
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message },
      { status: error.message.includes("not found") ? 404 : 500 }
    );
  }
}
