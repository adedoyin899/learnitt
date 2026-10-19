import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

export interface RetentionStats {
  purgedAiCache: number;
  purgedAiJobs: number;
  purgedUsageCounters: number;
  timestamp: string;
}

/**
 * Runs the data retention job (Phase L12, Requirement 3):
 * - Purges `ai_cache` rows older than 30 days.
 * - Purges `ai_jobs` payloads / completed jobs older than 30 days.
 * - Keeps `usage_counters` for 13 months (purges counters older than 13 months).
 */
export async function runRetentionPurge(
  dbClient: SupabaseClient<Database> | any
): Promise<RetentionStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  // 13 months = ~395 days
  const thirteenMonthsAgoDate = new Date();
  thirteenMonthsAgoDate.setMonth(thirteenMonthsAgoDate.getMonth() - 13);
  const thirteenMonthsAgoStr = thirteenMonthsAgoDate.toISOString().split("T")[0];

  let purgedAiCache = 0;
  let purgedAiJobs = 0;
  let purgedUsageCounters = 0;

  // Support direct query if available (e.g. PGlite or raw SQL)
  if (typeof dbClient.query === "function") {
    const cacheRes = await dbClient.query(
      "DELETE FROM public.ai_cache WHERE created_at < $1 RETURNING cache_key",
      [thirtyDaysAgo]
    );
    purgedAiCache = cacheRes.rows?.length || 0;

    const jobsRes = await dbClient.query(
      "DELETE FROM public.ai_jobs WHERE created_at < $1 RETURNING id",
      [thirtyDaysAgo]
    );
    purgedAiJobs = jobsRes.rows?.length || 0;

    const countersRes = await dbClient.query(
      "DELETE FROM public.usage_counters WHERE day < $1 RETURNING owner_id",
      [thirteenMonthsAgoStr]
    );
    purgedUsageCounters = countersRes.rows?.length || 0;
  } else {
    // Supabase JS client
    const { data: cacheData } = await dbClient
      .from("ai_cache")
      .delete()
      .lt("created_at", thirtyDaysAgo)
      .select("cache_key");
    purgedAiCache = cacheData?.length || 0;

    const { data: jobsData } = await dbClient
      .from("ai_jobs")
      .delete()
      .lt("created_at", thirtyDaysAgo)
      .select("id");
    purgedAiJobs = jobsData?.length || 0;

    const { data: countersData } = await dbClient
      .from("usage_counters")
      .delete()
      .lt("day", thirteenMonthsAgoStr)
      .select("owner_id");
    purgedUsageCounters = countersData?.length || 0;
  }

  return {
    purgedAiCache,
    purgedAiJobs,
    purgedUsageCounters,
    timestamp: new Date().toISOString(),
  };
}
