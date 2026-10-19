import { SupabaseClient } from "@supabase/supabase-js";
import { isRetryableAIError } from "@/lib/ai/adapters/fallback-adapter";
import { AICapReachedError, executeAITaskWithRetry } from "@/lib/ai/core";
import { AIJobRecord, AIJobStatus, AIProvider, AITask } from "@/lib/ai/types";
import { getAIProvider } from "@/lib/providers/registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { Database } from "@/types/database";
import { persistSkillGraphForGoal, SkillGraphPayloadItem } from "@/lib/planner/persist-graph";
import { applyProposedLinks } from "@/lib/materials/linking";

export interface WorkerTickOptions {
  batchSize?: number;
  leaseSeconds?: number;
  dbClient?: SupabaseClient<Database>;
  provider?: AIProvider;
}

export interface WorkerJobResult {
  id: string;
  task: AITask;
  status: AIJobStatus;
  error?: string;
  fromCache?: boolean;
}

export interface WorkerTickResult {
  processed: number;
  jobs: WorkerJobResult[];
}

export async function runWorkerTick(options: WorkerTickOptions = {}): Promise<WorkerTickResult> {
  const batchSize = options.batchSize || 3;
  const leaseSeconds = options.leaseSeconds || 60;
  const client = options.dbClient || createServiceRoleClient();
  const provider = options.provider || getAIProvider();

  const nowIso = new Date().toISOString();
  const leaseUntilIso = new Date(Date.now() + leaseSeconds * 1000).toISOString();

  // 1. Fetch eligible candidate jobs
  // (status = queued AND run_after <= now) OR (status = running AND locked_until < now)
  const { data: candidates, error: fetchErr } = await client
    .from("ai_jobs")
    .select("*")
    .or(`status.eq.queued,and(status.eq.running,locked_until.lt.${nowIso})`)
    .lte("run_after", nowIso)
    .order("run_after", { ascending: true })
    .limit(batchSize);

  if (fetchErr || !candidates || candidates.length === 0) {
    return { processed: 0, jobs: [] };
  }

  const results: WorkerJobResult[] = [];

  // 2. Process each job with lease locking
  for (const rawJob of candidates) {
    const job = rawJob as unknown as AIJobRecord;

    // Atomically claim the lease
    const { data: claimed, error: claimErr } = await client
      .from("ai_jobs")
      .update({
        status: "running",
        locked_until: leaseUntilIso,
        attempts: job.attempts + 1,
      })
      .eq("id", job.id)
      // Concurrency guard: Ensure it hasn't been claimed by another worker tick
      .or(`status.eq.queued,and(status.eq.running,locked_until.lt.${nowIso})`)
      .select("id, attempts")
      .maybeSingle();

    if (claimErr || !claimed) {
      // Another worker claimed this job; skip safely
      continue;
    }

    const currentAttempts = claimed.attempts;

    try {
      // 2a. Custom dispatch for make_quiz
      if (job.task === "make_quiz" && job.payload?.skill_id) {
        const { generateQuizForSkill } = await import("@/lib/quiz/generate");
        const quizResult = await generateQuizForSkill(
          client,
          String(job.payload.skill_id),
          job.owner_id,
          provider
        );

        await client
          .from("ai_jobs")
          .update({
            status: "succeeded",
            result_ref: { quiz_id: quizResult.quiz.id } as any,
            last_error: null,
            locked_until: null,
          })
          .eq("id", job.id);

        results.push({
          id: job.id,
          task: job.task,
          status: "succeeded",
        });
        continue;
      }

      // 2b. Custom dispatch for grade_applied
      if (job.task === "grade_applied" && job.payload?.attempt_id) {
        const { gradeAppliedAttempt } = await import("@/lib/quiz/grading");
        const gradeResult = await gradeAppliedAttempt(
          client,
          String(job.payload.attempt_id),
          job.owner_id,
          provider
        );

        await client
          .from("ai_jobs")
          .update({
            status: gradeResult.isPending ? "paused_cap" : "succeeded",
            result_ref: gradeResult.grade ? ({ grade_id: gradeResult.grade.id } as any) : null,
            last_error: null,
            locked_until: null,
          })
          .eq("id", job.id);

        results.push({
          id: job.id,
          task: job.task,
          status: gradeResult.isPending ? "paused_cap" : "succeeded",
        });
        continue;
      }

      // Execute general task with caching, caps, and schema validation
      const execution = await executeAITaskWithRetry<Record<string, unknown>>({
        ownerId: job.owner_id,
        task: job.task,
        payload: job.payload,
        provider,
        dbClient: client,
      });

      // If task is skill_graph and attached to a goal, persist the skills to the database
      if (job.task === "skill_graph" && job.payload?.goal_id && execution.data) {
        const skillsData = (execution.data as { skills?: SkillGraphPayloadItem[] }).skills || [];
        if (skillsData.length > 0) {
          await persistSkillGraphForGoal(
            client,
            job.owner_id,
            String(job.payload.goal_id),
            skillsData,
            "ai"
          );
        }
      }

      // If task is link_materials, apply proposed links while preserving confirmed ones
      if (job.task === "link_materials" && execution.data) {
        const proposedLinks = (execution.data as { links?: any[] }).links || [];
        if (proposedLinks.length > 0) {
          await applyProposedLinks(job.owner_id, proposedLinks, client);
        }
      }

      // Mark job as succeeded
      await client
        .from("ai_jobs")
        .update({
          status: "succeeded",
          result_ref: execution.data as unknown as Database["public"]["Tables"]["ai_jobs"]["Update"]["result_ref"],
          last_error: null,
          locked_until: null,
        })
        .eq("id", job.id);

      results.push({
        id: job.id,
        task: job.task,
        status: "succeeded",
        fromCache: execution.fromCache,
      });
    } catch (err: unknown) {
      const error = err as Error;

      if (err instanceof AICapReachedError || (err as { isCapReached?: boolean }).isCapReached) {
        // Cap hit: mark job paused_cap
        await client
          .from("ai_jobs")
          .update({
            status: "paused_cap",
            last_error: error.message,
            locked_until: null,
          })
          .eq("id", job.id);

        results.push({
          id: job.id,
          task: job.task,
          status: "paused_cap",
          error: error.message,
        });
      } else if (isRetryableAIError(err)) {
        // Rate-limit or transient provider error: exponential backoff
        // Backoff: min 5s * 2^attempts, capped at 300s
        const backoffSeconds = Math.min(300, Math.pow(2, currentAttempts) * 5);
        const nextRunAfter = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        await client
          .from("ai_jobs")
          .update({
            status: "queued",
            run_after: nextRunAfter,
            last_error: `Rate limit / transient error: ${error.message}`,
            locked_until: null,
          })
          .eq("id", job.id);

        results.push({
          id: job.id,
          task: job.task,
          status: "queued",
          error: `Backoff ${backoffSeconds}s: ${error.message}`,
        });
      } else {
        // Fatal or unrecoverable error (e.g. repeated schema validation failure)
        await client
          .from("ai_jobs")
          .update({
            status: "failed",
            last_error: error.message || "Unknown error",
            locked_until: null,
          })
          .eq("id", job.id);

        results.push({
          id: job.id,
          task: job.task,
          status: "failed",
          error: error.message,
        });
      }
    }
  }

  return {
    processed: results.length,
    jobs: results,
  };
}

/**
 * Resolves attempts that were in 'pending_grade' status (e.g., when the daily cap resets).
 */
export async function resolvePendingGrades(
  client: SupabaseClient<Database> = createServiceRoleClient(),
  ownerId?: string,
  provider?: AIProvider
): Promise<{ resolved: number; results: any[] }> {
  const { gradeAppliedAttempt } = await import("@/lib/quiz/grading");

  let query = client.from("attempts").select("id, owner_id").eq("status", "pending_grade");
  if (ownerId) {
    query = query.eq("owner_id", ownerId);
  }

  const { data: pendingAttempts, error } = await query;
  if (error || !pendingAttempts || pendingAttempts.length === 0) {
    return { resolved: 0, results: [] };
  }

  const results: any[] = [];
  for (const att of pendingAttempts) {
    try {
      const res = await gradeAppliedAttempt(client, att.id, att.owner_id, provider);
      results.push({ attemptId: att.id, ...res });
    } catch (err: any) {
      results.push({ attemptId: att.id, error: err.message });
    }
  }

  return {
    resolved: results.filter(
      (r) => r.attemptStatus === "graded" || r.attemptStatus === "needs_your_review"
    ).length,
    results,
  };
}
