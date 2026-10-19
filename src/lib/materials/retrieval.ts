import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { ChunkSearchResult } from "./types";

export interface SearchChunksOptions {
  ownerId: string;
  query: string;
  goalId?: string | null;
  limit?: number;
  dbClient: SupabaseClient<Database>;
}

/**
 * Searches material chunks using full-text search (tsvector/fts) ranked by relevance.
 * PRD Epic B1 AC3 & Prompt Requirement 3:
 * "search chunks by full-text query scoped to the owner and optionally to a goal,
 *  ranked, top N, returned with material title and ordinal.
 *  Retrieval never returns another user's chunk."
 */
export async function searchMaterialChunks(options: SearchChunksOptions): Promise<ChunkSearchResult[]> {
  const { ownerId, query, goalId, limit = 5, dbClient } = options;

  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return [];
  }

  // Call the database search RPC function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (dbClient as any).rpc("search_material_chunks", {
    p_owner_id: ownerId,
    p_query: cleanQuery,
    p_goal_id: goalId || null,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`Failed to retrieve material chunks: ${error.message}`);
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    material_id: row.material_id,
    material_title: row.material_title,
    ordinal: Number(row.ordinal),
    content: row.content,
    tokens: Number(row.tokens),
    rank: Number(row.rank),
  }));
}
