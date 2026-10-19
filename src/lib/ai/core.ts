import { SupabaseClient } from "@supabase/supabase-js";
import { getAIProvider } from "@/lib/providers/registry";
import { Database } from "@/types/database";
import { checkAICache, computeAICacheKey, storeAICache } from "./cache";
import { checkDailyCaps, recordAIUsage } from "./cost-control";
import { resolvePrompt } from "./prompts";
import { getTaskSchema } from "./schemas";
import { AIProvider, AITask, AIUsage } from "./types";

export class AICapReachedError extends Error {
  readonly isCapReached = true;
  constructor(message: string) {
    super(message);
    this.name = "AICapReachedError";
  }
}

export class AISchemaValidationError extends Error {
  readonly isSchemaValidationError = true;
  constructor(message: string) {
    super(message);
    this.name = "AISchemaValidationError";
  }
}

export interface ExecuteAITaskParams {
  ownerId: string;
  task: AITask;
  payload: Record<string, unknown>;
  provider?: AIProvider;
  dbClient?: SupabaseClient<Database>;
  skipCache?: boolean;
  skipCapCheck?: boolean;
}

export interface ExecuteAITaskResult<T> {
  data: T;
  fromCache: boolean;
  usage: AIUsage;
  modelVersion: string;
}

import { assertMaterialConsent } from "@/lib/materials/consent";

export async function executeAITaskWithRetry<T>(
  params: ExecuteAITaskParams
): Promise<ExecuteAITaskResult<T>> {
  const provider = params.provider || getAIProvider();
  const prompt = resolvePrompt(params.task, params.payload);
  const schema = getTaskSchema(params.task);

  // 0. Consent check for material-grounded tasks (PRD I3 & Prompt Requirement 7)
  const isMaterialBased =
    params.task === "link_materials" ||
    Boolean(
      params.payload?.materials ||
        params.payload?.material_ids ||
        params.payload?.chunks ||
        params.payload?.use_materials
    );

  if (isMaterialBased && params.dbClient && params.ownerId) {
    await assertMaterialConsent(params.ownerId, params.dbClient);
  }

  // 1. Cache Check
  const cacheKey = computeAICacheKey({
    task: params.task,
    input: params.payload,
    providerId: provider.id,
    promptVersion: prompt.promptVersion,
  });

  if (!params.skipCache) {
    const cached = await checkAICache<T>({ cacheKey, dbClient: params.dbClient });
    if (cached !== null) {
      return {
        data: cached,
        fromCache: true,
        usage: { inputTokens: 0, outputTokens: 0 },
        modelVersion: "cache-hit",
      };
    }
  }

  // 2. Cost Control / Cap Check
  if (!params.skipCapCheck) {
    const capCheck = await checkDailyCaps({
      ownerId: params.ownerId,
      dbClient: params.dbClient,
    });
    if (!capCheck.allowed) {
      throw new AICapReachedError(capCheck.reason || "Daily AI limit reached.");
    }
  }

  // 3. First Attempt
  let rawRes = await provider.generateStructured<T>({
    task: params.task,
    system: prompt.system,
    user: prompt.user,
    schema: schema as unknown as Record<string, unknown>,
    maxOutputTokens: prompt.maxOutputTokens,
    temperature: prompt.temperature,
  });

  let totalTokensIn = rawRes.usage.inputTokens;
  let totalTokensOut = rawRes.usage.outputTokens;
  let modelVersion = rawRes.modelVersion;

  let parseResult = schema.safeParse(rawRes.data);

  // 4. Retry Once with Error Appended if Validation Failed
  if (!parseResult.success) {
    const retryUserPrompt = `${prompt.user}\n\nIMPORTANT CORRECTION:\nYour previous response failed schema validation with error: ${parseResult.error.message}\nPlease fix your response and output strictly conforming JSON.`;

    const retryRes = await provider.generateStructured<T>({
      task: params.task,
      system: prompt.system,
      user: retryUserPrompt,
      schema: schema as unknown as Record<string, unknown>,
      maxOutputTokens: prompt.maxOutputTokens,
      temperature: prompt.temperature,
    });

    totalTokensIn += retryRes.usage.inputTokens;
    totalTokensOut += retryRes.usage.outputTokens;
    modelVersion = retryRes.modelVersion;

    parseResult = schema.safeParse(retryRes.data);
    if (!parseResult.success) {
      throw new AISchemaValidationError(
        `AI output failed schema validation after retry: ${parseResult.error.message}`
      );
    }
    rawRes = retryRes;
  }

  const validatedData = parseResult.data as T;

  // 5. Store in Cache (Cache hits do not count toward cap; cache writes happen on fresh successful responses)
  await storeAICache({
    cacheKey,
    task: params.task,
    provider: provider.id,
    promptVersion: prompt.promptVersion,
    result: validatedData,
    dbClient: params.dbClient,
  });

  // 6. Record Usage Counters
  await recordAIUsage({
    ownerId: params.ownerId,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    dbClient: params.dbClient,
  });

  return {
    data: validatedData,
    fromCache: false,
    usage: {
      inputTokens: totalTokensIn,
      outputTokens: totalTokensOut,
    },
    modelVersion,
  };
}
