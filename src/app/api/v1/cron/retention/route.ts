import { NextRequest, NextResponse } from "next/server";
import { runRetentionPurge } from "@/lib/retention/service";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { env } from "@/lib/env";

/**
 * POST /api/v1/cron/retention
 * Purges ai_cache and ai_jobs older than 30 days, keeps usage counters 13 months.
 * Protected by CRON_SECRET header (Phase L12 Requirement 3).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecretHeader = req.headers.get("x-cron-secret");

  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  const providedSecret = cronSecretHeader || bearerToken;

  if (!providedSecret || providedSecret !== env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing CRON_SECRET" },
      { status: 401 }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const stats = await runRetentionPurge(supabase);

    return NextResponse.json({
      success: true,
      data: stats,
      message: `Retention purge executed: purged ${stats.purgedAiCache} ai_cache rows, ${stats.purgedAiJobs} ai_jobs rows, and ${stats.purgedUsageCounters} usage_counter rows.`,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      { error: error.message || "Failed to execute retention purge" },
      { status: 500 }
    );
  }
}
