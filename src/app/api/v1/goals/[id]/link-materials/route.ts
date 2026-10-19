import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getMaterialConsent } from "@/lib/materials/consent";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/goals/[id]/link-materials
 * Enqueues the link_materials AI job for a goal.
 * Strictly gated by user consent (PRD I3 & Prompt Requirement 7).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: goalId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Consent Gate (PRD I3 & Prompt Requirement 7)
  const consentStatus = await getMaterialConsent(user.id, supabase);
  if (!consentStatus.consent) {
    return NextResponse.json(
      {
        error: "AI materials consent is required before materials can be analyzed by AI.",
        consent_required: true,
      },
      { status: 403 }
    );
  }

  // 2. Verify goal ownership
  const { data: goal, error: goalErr } = await supabase
    .from("goals")
    .select("id, title")
    .eq("id", goalId)
    .eq("owner_id", user.id)
    .single();

  if (goalErr || !goal) {
    return NextResponse.json({ error: "Goal not found" }, { status: 404 });
  }

  // 3. Fetch skills for this goal
  const { data: skills, error: skillsErr } = await supabase
    .from("skills")
    .select("id, name")
    .eq("goal_id", goalId)
    .eq("owner_id", user.id);

  if (skillsErr || !skills || skills.length === 0) {
    return NextResponse.json(
      { error: "Goal has no skills to link materials with." },
      { status: 400 }
    );
  }

  // 4. Fetch ready materials and chunks
  const { data: materials } = await supabase
    .from("materials")
    .select("id, title")
    .eq("owner_id", user.id)
    .eq("status", "ready");

  if (!materials || materials.length === 0) {
    return NextResponse.json(
      { error: "No ready materials found. Upload and process materials before linking." },
      { status: 400 }
    );
  }

  const materialIds = materials.map((m: any) => m.id);
  const { data: chunks } = await supabase
    .from("material_chunks")
    .select("id, material_id, content")
    .eq("owner_id", user.id)
    .in("material_id", materialIds)
    .limit(20);

  const chunkSummaries = (chunks || []).map((c: any) => ({
    id: c.id,
    material_id: c.material_id,
    summary: c.content.slice(0, 300),
  }));

  // 5. Enqueue AI job
  const serviceRole = createServiceRoleClient();
  const payload = {
    goal_id: goalId,
    skills: skills.map((s: any) => ({ id: s.id, name: s.title })),
    chunks: chunkSummaries,
    materials: materials.map((m: any) => ({ id: m.id, title: m.title })),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobErr } = await (serviceRole.from("ai_jobs") as any)
    .insert({
      owner_id: user.id,
      task: "link_materials",
      payload,
      status: "queued",
    })
    .select()
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: `Failed to enqueue linking job: ${jobErr?.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    job_id: job.id,
    status: "queued",
  });
}
