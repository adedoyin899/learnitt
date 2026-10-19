import crypto from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { Database } from "@/types/database";
import { AITask } from "./types";

/**
 * Deterministically sorts object keys for canonical serialization.
 */
export function canonicalize(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalize);
  }
  const sortedKeys = Object.keys(val as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    result[key] = canonicalize((val as Record<string, unknown>)[key]);
  }
  return result;
}

export function computeAICacheKey(params: {
  task: AITask;
  input: unknown;
  providerId: string;
  promptVersion: string;
}): string {
  const canonicalInput = JSON.stringify(canonicalize(params.input));
  const raw = `${params.task}|${params.providerId}|${params.promptVersion}|${canonicalInput}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function checkAICache<T>(params: {
  cacheKey: string;
  dbClient?: SupabaseClient<Database>;
}): Promise<T | null> {
  const client = params.dbClient || createServiceRoleClient();
  const { data, error } = await client
    .from("ai_cache")
    .select("result")
    .eq("cache_key", params.cacheKey)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return data.result as T;
}

export async function storeAICache(params: {
  cacheKey: string;
  task: AITask;
  provider: string;
  promptVersion: string;
  result: unknown;
  dbClient?: SupabaseClient<Database>;
}): Promise<void> {
  const client = params.dbClient || createServiceRoleClient();
  await client.from("ai_cache").upsert(
    {
      cache_key: params.cacheKey,
      task: params.task,
      provider: params.provider,
      prompt_version: params.promptVersion,
      result: params.result as unknown as Database["public"]["Tables"]["ai_cache"]["Insert"]["result"],
    },
    { onConflict: "cache_key" }
  );
}
