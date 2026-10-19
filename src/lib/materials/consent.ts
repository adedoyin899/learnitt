import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

export interface UserMaterialConsentStatus {
  asked: boolean;
  consent: boolean;
  askedAt: string | null;
}

export interface MaterialConsentPreviewItem {
  id: string;
  title: string;
  chunkCount: number;
  byteSize: number | null;
}

export interface MaterialConsentPreview {
  materials: MaterialConsentPreviewItem[];
  totalChunks: number;
}

/**
 * Retrieves the current AI materials consent state for a user.
 * PRD I3: Stored on profiles.ai_materials_consent & profiles.ai_consent_asked_at.
 */
export async function getMaterialConsent(
  ownerId: string,
  dbClient: SupabaseClient<Database>
): Promise<UserMaterialConsentStatus> {
  const { data, error } = await dbClient
    .from("profiles")
    .select("ai_materials_consent, ai_consent_asked_at")
    .eq("id", ownerId)
    .single();

  if (error || !data) {
    return {
      asked: false,
      consent: false,
      askedAt: null,
    };
  }

  const profile = data as unknown as {
    ai_materials_consent: boolean | null;
    ai_consent_asked_at: string | null;
  };

  return {
    asked: Boolean(profile.ai_consent_asked_at),
    consent: Boolean(profile.ai_materials_consent),
    askedAt: profile.ai_consent_asked_at,
  };
}

/**
 * Updates the user's AI materials consent setting.
 */
export async function updateMaterialConsent(
  ownerId: string,
  consent: boolean,
  dbClient: SupabaseClient<Database>
): Promise<UserMaterialConsentStatus> {
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (dbClient.from("profiles") as any)
    .update({
      ai_materials_consent: consent,
      ai_consent_asked_at: now,
    })
    .eq("id", ownerId);

  if (error) {
    throw new Error(`Failed to update AI materials consent: ${error.message}`);
  }

  return {
    asked: true,
    consent,
    askedAt: now,
  };
}

/**
 * Fetches preview of material names and chunk counts for consent prompt.
 * PRD I3: "show what will be sent (material names and chunk counts) and ask once."
 */
export async function getMaterialPreviewForConsent(
  ownerId: string,
  goalId?: string | null,
  dbClient?: SupabaseClient<Database>
): Promise<MaterialConsentPreview> {
  if (!dbClient) {
    return { materials: [], totalChunks: 0 };
  }

  let query = dbClient
    .from("materials")
    .select("id, title, byte_size, status")
    .eq("owner_id", ownerId)
    .eq("status", "ready");

  if (goalId) {
    query = query.eq("goal_id", goalId);
  }

  const { data: materialsData, error: matError } = await query;
  if (matError || !materialsData || materialsData.length === 0) {
    return { materials: [], totalChunks: 0 };
  }

  // Get chunks count per material
  const materialIds = materialsData.map((m: any) => m.id);
  const { data: chunksData } = await dbClient
    .from("material_chunks")
    .select("material_id")
    .in("material_id", materialIds);

  const chunkCountsByMatId = new Map<string, number>();
  if (chunksData) {
    for (const chunk of chunksData as any[]) {
      const cur = chunkCountsByMatId.get(chunk.material_id) || 0;
      chunkCountsByMatId.set(chunk.material_id, cur + 1);
    }
  }

  let totalChunks = 0;
  const items: MaterialConsentPreviewItem[] = materialsData.map((m: any) => {
    const chunkCount = chunkCountsByMatId.get(m.id) || 0;
    totalChunks += chunkCount;
    return {
      id: m.id,
      title: m.title,
      chunkCount,
      byteSize: m.byte_size,
    };
  });

  return {
    materials: items,
    totalChunks,
  };
}

/**
 * Asserts that the owner has explicitly granted AI materials consent.
 * Prompt Requirement 7: "The AI layer refuses material-based tasks if consent is off."
 */
export async function assertMaterialConsent(
  ownerId: string,
  dbClient: SupabaseClient<Database>
): Promise<void> {
  const status = await getMaterialConsent(ownerId, dbClient);
  if (!status.consent) {
    throw new Error(
      "AI materials consent is not granted. Materials cannot be shared with the AI layer until consent is approved."
    );
  }
}
