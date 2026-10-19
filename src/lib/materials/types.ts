/**
 * Material, Extraction, Retrieval & Linking Types (PRD Epic B1 & B2)
 */

export const MATERIAL_KINDS = ["pdf", "text", "markdown", "docx", "url", "plan_import"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export const MATERIAL_STATUSES = ["pending", "ready", "needs_attention"] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file (PRD B1 AC1)
export const MAX_USER_STORAGE_BYTES = 200 * 1024 * 1024; // 200 MB per user in v0.1 (PRD B1 AC1)
export const SIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes (Prompt Requirement 8)

export const CHUNK_TARGET_TOKENS = 800; // About 800 tokens (PRD B1 AC3)
export const CHUNK_OVERLAP_TOKENS = 100; // 100 tokens overlap (PRD B1 AC3)

export interface MaterialRecord {
  id: string;
  owner_id: string;
  goal_id: string | null;
  kind: MaterialKind;
  title: string;
  storage_path: string | null;
  source_url: string | null;
  byte_size: number | null;
  content_hash: string | null;
  status: MaterialStatus;
  status_reason: string | null;
  created_at: string;
}

export interface MaterialChunkRecord {
  id: string;
  owner_id: string;
  material_id: string;
  ordinal: number;
  content: string;
  tokens: number;
}

export interface ChunkSearchResult {
  id: string;
  material_id: string;
  material_title: string;
  ordinal: number;
  content: string;
  tokens: number;
  rank: number;
}

export interface SkillMaterialLinkRecord {
  owner_id: string;
  skill_id: string;
  material_id: string;
  confidence: number;
  confirmed: boolean;
}

export interface ProposedLink {
  skill_id: string;
  skill_name: string;
  material_id: string;
  material_title: string;
  confidence: number;
  category: "suggested" | "weak"; // >= 0.7 is suggested, < 0.7 is weak
  confirmed: boolean;
}
