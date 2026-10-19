import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized: You must be signed in to view job status" },
      { status: 401 }
    );
  }

  const serviceClient = createServiceRoleClient();
  const { data: job, error } = await serviceClient
    .from("ai_jobs")
    .select("id, owner_id, task, status, attempts, result_ref, last_error, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !job) {
    return NextResponse.json(
      { error: "Job not found" },
      { status: 404 }
    );
  }

  if (job.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Forbidden: You do not have permission to access this job" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    data: {
      id: job.id,
      task: job.task,
      status: job.status,
      attempts: job.attempts,
      result_ref: job.result_ref,
      last_error: job.last_error,
      created_at: job.created_at,
    },
  });
}
