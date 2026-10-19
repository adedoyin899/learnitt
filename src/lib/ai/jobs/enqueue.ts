import { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { Database } from "@/types/database";
import { EnqueueJobParams } from "../types";

export async function enqueueJob(
  params: EnqueueJobParams & { dbClient?: SupabaseClient<Database> }
): Promise<{ jobId: string }> {
  const client = params.dbClient || createServiceRoleClient();
  const runAfter = params.runAfter ? params.runAfter.toISOString() : new Date().toISOString();

  const { data, error } = await client
    .from("ai_jobs")
    .insert({
      owner_id: params.ownerId,
      task: params.task,
      payload: params.payload as unknown as Database["public"]["Tables"]["ai_jobs"]["Insert"]["payload"],
      status: "queued",
      run_after: runAfter,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to enqueue AI job: ${error?.message || "Unknown error"}`);
  }

  return { jobId: data.id };
}
