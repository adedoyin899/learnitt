import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchMaterialChunks } from "@/lib/materials/retrieval";

/**
 * GET /api/v1/materials/search?q=query&goal_id=UUID&limit=5
 * Full-text retrieval scoped strictly to the authenticated user.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const goalId = searchParams.get("goal_id");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 5;

  if (!query.trim()) {
    return NextResponse.json({ chunks: [] });
  }

  try {
    const chunks = await searchMaterialChunks({
      ownerId: user.id,
      query,
      goalId,
      limit,
      dbClient: supabase,
    });

    return NextResponse.json({ chunks });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Search failed." },
      { status: 500 }
    );
  }
}
