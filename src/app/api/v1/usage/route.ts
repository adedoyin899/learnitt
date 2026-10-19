import { NextResponse } from "next/server";
import { getUserUsageStats } from "@/lib/ai/cost-control";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized: You must be signed in to check usage stats" },
      { status: 401 }
    );
  }

  try {
    const stats = await getUserUsageStats({ ownerId: user.id });
    return NextResponse.json({ data: stats });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || "Failed to retrieve usage stats" },
      { status: 500 }
    );
  }
}
