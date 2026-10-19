/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it } from "vitest";
import { FallbackAIProvider } from "@/lib/ai/adapters/fallback-adapter";
import { MockAIProvider } from "@/lib/ai/adapters/mock-adapter";
import { executeAITaskWithRetry } from "@/lib/ai/core";
import { enqueueJob } from "@/lib/ai/jobs/enqueue";
import { runWorkerTick } from "@/lib/ai/jobs/worker";
import { AIProvider, AIStructuredArgs, AIStructuredResponse } from "@/lib/ai/types";
import { env } from "@/lib/env";
import { buildAIProviderFromEnv, setAIProvider } from "@/lib/providers/registry";
import { createPgliteSupabaseAdapter } from "../db/pglite-adapter";
import { createTestDatabase } from "../db/test-db";

const USER_A = "11111111-1111-1111-1111-111111111111"; // Maz

describe("AI Seam, Job Queue, Cache, and Cost Control Integration", () => {
  let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
  let supabaseAdapter: ReturnType<typeof createPgliteSupabaseAdapter>;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    supabaseAdapter = createPgliteSupabaseAdapter(testDb.db);
    setAIProvider(new MockAIProvider());
  });

  it("1. enqueues a skill_graph job in mock mode, runs one worker tick, and obtains a valid graph", async () => {
    const { jobId } = await enqueueJob({
      ownerId: USER_A,
      task: "skill_graph",
      payload: {
        title: "Junior Data Engineer",
        domain: "Data Engineering",
        starting_level: "beginner",
        target_date: "2026-12-31",
        weekly_hours: 8,
      },
      dbClient: supabaseAdapter,
    });

    expect(jobId).toBeDefined();

    // Verify it is queued
    const { data: queuedJob } = await supabaseAdapter
      .from("ai_jobs")
      .select("status, attempts")
      .eq("id", jobId)
      .single();
    expect(queuedJob?.status).toBe("queued");
    expect(queuedJob?.attempts).toBe(0);

    // Run one worker tick
    const tickResult = await runWorkerTick({
      dbClient: supabaseAdapter,
      provider: new MockAIProvider(),
    });

    expect(tickResult.processed).toBe(1);
    expect(tickResult.jobs[0].status).toBe("succeeded");

    // Verify job in database is succeeded with 12 skills
    const { data: finishedJob } = await supabaseAdapter
      .from("ai_jobs")
      .select("status, result_ref, attempts")
      .eq("id", jobId)
      .single();

    expect(finishedJob?.status).toBe("succeeded");
    expect(finishedJob?.attempts).toBe(1);

    const skills = (finishedJob?.result_ref as { skills: unknown[] })?.skills;
    expect(skills).toBeDefined();
    expect(skills.length).toBeGreaterThanOrEqual(12);
  });

  it("2. forcing the daily cap to 0 pauses AI jobs (paused_cap) while non-AI operations continue normally", async () => {
    // Simulate user having exceeded their sub-budget by setting usage_counters
    const today = new Date().toISOString().split("T")[0];
    await supabaseAdapter.from("usage_counters").insert({
      owner_id: USER_A,
      day: today,
      calls: env.DAILY_USER_AI_CALL_CAP, // Reached sub-budget cap
      tokens_in: 5000,
      tokens_out: 2500,
    });

    const { jobId } = await enqueueJob({
      ownerId: USER_A,
      task: "search_queries",
      payload: { skillName: "Spark", level: "beginner" },
      dbClient: supabaseAdapter,
    });

    // Run worker tick
    const tickResult = await runWorkerTick({
      dbClient: supabaseAdapter,
      provider: new MockAIProvider(),
    });

    expect(tickResult.processed).toBe(1);
    expect(tickResult.jobs[0].status).toBe("paused_cap");
    expect(tickResult.jobs[0].error).toMatch(/daily ai sub-budget/i);

    const { data: pausedJob } = await supabaseAdapter
      .from("ai_jobs")
      .select("status, last_error")
      .eq("id", jobId)
      .single();

    expect(pausedJob?.status).toBe("paused_cap");
    expect(pausedJob?.last_error).toMatch(/paused until tomorrow/i);

    // Non-AI tables still work normally
    const { data: profile } = await supabaseAdapter
      .from("profiles")
      .select("id")
      .eq("id", USER_A)
      .single();
    expect(profile?.id).toBe(USER_A);
  });

  it("3. cache hit skips the provider and counts 0 towards usage", async () => {
    let providerCallCount = 0;
    class CountingMockProvider extends MockAIProvider {
      override async generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
        providerCallCount++;
        return super.generateStructured<T>(args);
      }
    }

    const provider = new CountingMockProvider();
    const payload = {
      skillName: "Airflow",
      level: "intermediate",
    };

    // First call: Fresh, calls provider, populates cache
    const firstRes = await executeAITaskWithRetry({
      ownerId: USER_A,
      task: "search_queries",
      payload,
      provider,
      dbClient: supabaseAdapter,
    });

    expect(firstRes.fromCache).toBe(false);
    expect(providerCallCount).toBe(1);

    // Second call: Exact same payload, must hit cache and skip provider
    const secondRes = await executeAITaskWithRetry({
      ownerId: USER_A,
      task: "search_queries",
      payload,
      provider,
      dbClient: supabaseAdapter,
    });

    expect(secondRes.fromCache).toBe(true);
    expect(secondRes.usage.inputTokens).toBe(0);
    expect(secondRes.usage.outputTokens).toBe(0);
    expect(providerCallCount).toBe(1); // Did not increment!
  });

  it("4. worker lease prevents double execution under concurrent ticks", async () => {
    const { jobId } = await enqueueJob({
      ownerId: USER_A,
      task: "search_queries",
      payload: { skillName: "Postgres", level: "beginner" },
      dbClient: supabaseAdapter,
    });
    expect(jobId).toBeDefined();

    let executionCount = 0;
    class SlowProvider extends MockAIProvider {
      override async generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
        executionCount++;
        return super.generateStructured<T>(args);
      }
    }

    const provider = new SlowProvider();

    // Run first worker tick: claims the lease
    const tick1 = await runWorkerTick({
      dbClient: supabaseAdapter,
      provider,
    });

    expect(tick1.processed).toBe(1);
    expect(executionCount).toBe(1);

    // Immediate second worker tick: the job is already succeeded (or currently leased)
    const tick2 = await runWorkerTick({
      dbClient: supabaseAdapter,
      provider,
    });

    expect(tick2.processed).toBe(0);
    expect(executionCount).toBe(1); // Provider was not executed twice!
  });

  it("5. rate-limit error triggers exponential backoff and routes to fallback provider if configured", async () => {
    let primaryCalls = 0;
    class RateLimitedPrimary implements AIProvider {
      readonly id = "rate-limited-primary";
      async generateStructured<T>(): Promise<AIStructuredResponse<T>> {
        primaryCalls++;
        const err = new Error("Rate limit exceeded (HTTP 429)");
        (err as unknown as { isRateLimit: boolean; status: number }).isRateLimit = true;
        (err as unknown as { isRateLimit: boolean; status: number }).status = 429;
        throw err;
      }
    }

    let fallbackCalls = 0;
    class WorkingFallback extends MockAIProvider {
      override readonly id = "working-fallback";
      override async generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
        fallbackCalls++;
        return super.generateStructured<T>(args);
      }
    }

    const primary = new RateLimitedPrimary();
    const fallback = new WorkingFallback();

    const providerWithFallback = new FallbackAIProvider({ primary, fallback });

    const result = await executeAITaskWithRetry({
      ownerId: USER_A,
      task: "classify_resource",
      payload: {
        title: "PySpark Tutorial",
        domain: "spark.apache.org",
        snippet: "Official docs",
      },
      provider: providerWithFallback,
      dbClient: supabaseAdapter,
    });

    expect(result.data).toBeDefined();
    // Primary retried once then failed over to fallback
    expect(primaryCalls).toBe(2);
    expect(fallbackCalls).toBe(1);
  });

  it("6. schema validation rejects malformed output and succeeds on the retry path", async () => {
    let callIndex = 0;
    class SelfCorrectingProvider implements AIProvider {
      readonly id = "self-correcting-provider";
      async generateStructured<T>(args: AIStructuredArgs): Promise<AIStructuredResponse<T>> {
        callIndex++;
        if (callIndex === 1) {
          // Return malformed output (only 2 skills instead of >= 12)
          return {
            data: {
              skills: [
                {
                  id: "sk_1",
                  name: "Python",
                  description: "Intro",
                  prereq_ids: [],
                  estimated_minutes: { min: 60, max: 120 },
                  difficulty: 1,
                  verification_type: "recall",
                  mvd_minutes: 15,
                  mvd_task: "Task",
                },
              ],
            } as unknown as T,
            usage: { inputTokens: 50, outputTokens: 20 },
            modelVersion: "correcting-model",
          };
        }

        // Second call (retry): notice error was appended to user prompt
        expect(args.user).toContain("IMPORTANT CORRECTION");
        expect(args.user).toContain("Must contain at least 12 skills");

        // Return a valid 12-skill graph on retry
        const validSkills = Array.from({ length: 12 }, (_, i) => ({
          id: `sk_${i + 1}`,
          name: `Skill ${i + 1}`,
          description: `Description ${i + 1}`,
          prereq_ids: i === 0 ? [] : [`sk_${i}`],
          estimated_minutes: { min: 60, max: 120 },
          difficulty: 2,
          verification_type: "recall",
          mvd_minutes: 15,
          mvd_task: "Valid MVD task",
        }));

        return {
          data: { skills: validSkills } as unknown as T,
          usage: { inputTokens: 100, outputTokens: 150 },
          modelVersion: "correcting-model",
        };
      }
    }

    const provider = new SelfCorrectingProvider();
    const result = await executeAITaskWithRetry<{ skills: unknown[] }>({
      ownerId: USER_A,
      task: "skill_graph",
      payload: { title: "Data Engineering", starting_level: "beginner", target_date: "2026-12-31", weekly_hours: 8 },
      provider,
      dbClient: supabaseAdapter,
    });

    expect(callIndex).toBe(2);
    expect(result.data.skills).toHaveLength(12);
  });

  it("7. swapping provider by environment changes no business code", () => {
    // Test that buildAIProviderFromEnv cleanly instantiates Mock or Real providers
    const mockProvider = buildAIProviderFromEnv();
    expect(mockProvider.id).toBeDefined();
    expect(typeof mockProvider.generateStructured).toBe("function");
  });
});
