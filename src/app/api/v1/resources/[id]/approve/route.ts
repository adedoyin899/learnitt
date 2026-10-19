import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { approveResource } from "@/lib/discovery/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/resources/[id]/approve
 * Approves a resource and attaches it to the first available plan item for its skill.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: resourceId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await approveResource(resourceId, user.id, supabase);
    return NextResponse.json({
      data: {
        resource: result.resource,
        attachedPlanItemIds: result.attachedPlanItemIds,
        message: "Resource approved successfully.",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to approve resource" },
      { status: 400 }
    );
  }
}
