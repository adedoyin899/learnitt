import { SupabaseClient } from "@supabase/supabase-js";
import { executeAITaskWithRetry } from "@/lib/ai/core";
import { AIProvider } from "@/lib/ai/types";
import { SEARCH_CONFIG } from "@/lib/config/search";
import { Database, ResourceType } from "@/types/database";
import { SearchCandidate } from "@/lib/search/types";

export interface CandidateClassification {
  type: ResourceType;
  estimated_minutes: number;
  relevance: number;
}

export async function classifyCandidatesInBatches(
  ownerId: string,
  candidates: SearchCandidate[],
  options?: {
    dbClient?: SupabaseClient<Database>;
    provider?: AIProvider;
  }
): Promise<Map<string, CandidateClassification>> {
  const results = new Map<string, CandidateClassification>();
  if (!candidates || candidates.length === 0) {
    return results;
  }

  const batchSize = SEARCH_CONFIG.CLASSIFY_BATCH_SIZE;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const chunk = candidates.slice(i, i + batchSize);

    try {
      const response = await executeAITaskWithRetry<any>({
        ownerId,
        task: "classify_resource",
        payload: {
          candidates: chunk.map((c) => ({
            url: c.url,
            title: c.title,
            snippet: c.snippet || "",
            domain: c.domain,
          })),
        },
        dbClient: options?.dbClient,
        provider: options?.provider,
      });

      const data = response.data;

      // Handle various response structures (array, { candidates: [...] }, or single object)
      const list: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.candidates)
        ? data.candidates
        : [data];

      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        const match = list.find((c) => c?.url === item.url) || list[j] || list[0];

        const validTypes: ResourceType[] = [
          "course",
          "article",
          "video",
          "book",
          "exercise",
          "docs",
          "other",
        ];
        const type: ResourceType = validTypes.includes(match?.type)
          ? match.type
          : "article";
        const estimatedMinutes =
          typeof match?.estimated_minutes === "number" &&
          match.estimated_minutes >= 1 &&
          match.estimated_minutes <= 720
            ? Math.round(match.estimated_minutes)
            : 20;
        const relevance =
          typeof match?.relevance === "number" &&
          match.relevance >= 0 &&
          match.relevance <= 1
            ? match.relevance
            : 0.85;

        results.set(item.url, {
          type,
          estimated_minutes: estimatedMinutes,
          relevance,
        });
      }
    } catch (err) {
      // If classification fails for a batch, apply fallback defaults so discovery is resilient
      for (const item of chunk) {
        results.set(item.url, {
          type: "article",
          estimated_minutes: 20,
          relevance: 0.75,
        });
      }
    }
  }

  return results;
}
