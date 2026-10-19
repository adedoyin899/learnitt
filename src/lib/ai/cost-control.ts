import { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { Database } from "@/types/database";

export interface CapCheckResult {
  allowed: boolean;
  reason?: string;
  userCallsToday: number;
  globalCallsToday: number;
  userCap: number;
  globalCap: number;
}

export function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

export async function checkDailyCaps(params: {
  ownerId: string;
  dbClient?: SupabaseClient<Database>;
}): Promise<CapCheckResult> {
  const client = params.dbClient || createServiceRoleClient();
  const today = getTodayDateString();

  // 1. Get user usage for today
  const { data: userData } = await client
    .from("usage_counters")
    .select("calls")
    .eq("owner_id", params.ownerId)
    .eq("day", today)
    .maybeSingle();

  const userCallsToday = userData?.calls ?? 0;

  // 2. Get global usage for today
  const { data: globalData } = await client
    .from("usage_counters")
    .select("calls")
    .eq("day", today);

  const globalCallsToday =
    globalData?.reduce((acc, row) => acc + (row.calls || 0), 0) ?? 0;

  const userCap = env.DAILY_USER_AI_CALL_CAP;
  const globalCap = env.DAILY_AI_CALL_CAP;

  if (userCallsToday >= userCap) {
    return {
      allowed: false,
      reason: `Your daily AI sub-budget (${userCap} calls) has been reached. AI operations are paused until tomorrow. Non-AI actions remain active.`,
      userCallsToday,
      globalCallsToday,
      userCap,
      globalCap,
    };
  }

  if (globalCallsToday >= globalCap) {
    return {
      allowed: false,
      reason: `The system daily AI quota (${globalCap} calls) has been reached. AI operations are paused until tomorrow. Non-AI actions remain active.`,
      userCallsToday,
      globalCallsToday,
      userCap,
      globalCap,
    };
  }

  return {
    allowed: true,
    userCallsToday,
    globalCallsToday,
    userCap,
    globalCap,
  };
}

export async function recordAIUsage(params: {
  ownerId: string;
  tokensIn: number;
  tokensOut: number;
  dbClient?: SupabaseClient<Database>;
}): Promise<void> {
  const client = params.dbClient || createServiceRoleClient();
  const today = getTodayDateString();

  const { data: existing } = await client
    .from("usage_counters")
    .select("calls, tokens_in, tokens_out")
    .eq("owner_id", params.ownerId)
    .eq("day", today)
    .maybeSingle();

  if (existing) {
    await client
      .from("usage_counters")
      .update({
        calls: existing.calls + 1,
        tokens_in: existing.tokens_in + params.tokensIn,
        tokens_out: existing.tokens_out + params.tokensOut,
      })
      .eq("owner_id", params.ownerId)
      .eq("day", today);
  } else {
    await client.from("usage_counters").insert({
      owner_id: params.ownerId,
      day: today,
      calls: 1,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
    });
  }
}

export async function getUserUsageStats(params: {
  ownerId: string;
  dbClient?: SupabaseClient<Database>;
}): Promise<{
  today: { calls: number; tokens_in: number; tokens_out: number };
  week: { calls: number; tokens_in: number; tokens_out: number };
  budget: { daily_cap: number; remaining: number };
}> {
  const client = params.dbClient || createServiceRoleClient();
  const today = getTodayDateString();

  // 7 days ago
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const { data: rows } = await client
    .from("usage_counters")
    .select("day, calls, tokens_in, tokens_out")
    .eq("owner_id", params.ownerId)
    .gte("day", weekAgo);

  const todayRow = rows?.find((r) => r.day === today);
  const todayCalls = todayRow?.calls ?? 0;
  const todayTokensIn = todayRow?.tokens_in ?? 0;
  const todayTokensOut = todayRow?.tokens_out ?? 0;

  const weekCalls = rows?.reduce((acc, r) => acc + (r.calls || 0), 0) ?? 0;
  const weekTokensIn = rows?.reduce((acc, r) => acc + (r.tokens_in || 0), 0) ?? 0;
  const weekTokensOut = rows?.reduce((acc, r) => acc + (r.tokens_out || 0), 0) ?? 0;

  const userCap = env.DAILY_USER_AI_CALL_CAP;

  return {
    today: {
      calls: todayCalls,
      tokens_in: todayTokensIn,
      tokens_out: todayTokensOut,
    },
    week: {
      calls: weekCalls,
      tokens_in: weekTokensIn,
      tokens_out: weekTokensOut,
    },
    budget: {
      daily_cap: userCap,
      remaining: Math.max(0, userCap - todayCalls),
    },
  };
}
