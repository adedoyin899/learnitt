import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/goals/[id]/resources
 * Retrieves all discovered resources for the goal with skill details and active job status.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Verify goal
  const { data: goal, error: goalErr } = await supabase
    .from("goals")
    .select("id, title")
    .eq("id", goalId)
    .eq("owner_id", user.id)
    .single();

  if (goalErr || !goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // 2. Fetch resources for this goal
  const { data: resources, error: resErr } = await supabase
    .from("resources")
    .select("*")
    .eq("goal_id", goalId)
    .eq("owner_id", user.id)
    .order("found_at", { ascending: false });

  if (resErr) {
    return NextResponse.json(
      { error: `Failed to fetch resources: ${resErr.message}` },
      { status: 500 }
    );
  }

  // 3. Fetch skills for mapping
  const { data: skills } = await supabase
    .from("skills")
    .select("id, name, difficulty")
    .eq("goal_id", goalId)
    .eq("owner_id", user.id);

  const skillsMap = new Map<string, { id: string; name: string; level: string }>();
  for (const s of skills || []) {
    const level =
      (s.difficulty ?? 2) <= 2
        ? "beginner"
        : (s.difficulty ?? 2) <= 4
        ? "intermediate"
        : "advanced";
    skillsMap.set(s.id, { id: s.id, name: s.name, level });
  }

  const enrichedResources = (resources || []).map((r) => ({
    ...r,
    skill: r.skill_id ? skillsMap.get(r.skill_id) || null : null,
  }));

  // 4. Fetch latest discovery job for status / cap pause indicators
  const serviceRole = createServiceRoleClient();
  const { data: latestJob } = await serviceRole
    .from("ai_jobs")
    .select("id, status, last_error, created_at, result_ref")
    .eq("owner_id", user.id)
    .eq("task", "search_queries")
    .contains("payload", { goal_id: goalId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 5. Fetch count of excluded URLs
  const { count: exclusionsCount } = await supabase
    .from("resource_exclusions")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", goalId);

  return NextResponse.json({
    data: {
      resources: enrichedResources,
      skills: skills || [],
      exclusionsCount: exclusionsCount || 0,
      activeJob: latestJob || null,
    },
  });
}
