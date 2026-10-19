import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rejectResource } from "@/lib/discovery/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/resources/[id]/reject
 * Rejects a resource (or marks 'Not useful') and adds its URL to resource_exclusions.
 * Requirement 5:
 * "Reject and 'Not useful' remove it and add the URL to a per-goal exclusion list so it is never suggested again."
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

  let reason = "user_rejected";
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.reason) {
      reason = String(body.reason);
    }
  } catch {
    // optional body
  }

  try {
    const result = await rejectResource(resourceId, user.id, reason, supabase);
    return NextResponse.json({
      data: {
        resource: result.resource,
        exclusionCreated: result.exclusionCreated,
        message: "Resource rejected and added to goal exclusions list.",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to reject resource" },
      { status: 400 }
    );
  }
}
