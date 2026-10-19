import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  MaterialKind,
  MaterialRecord,
  MAX_FILE_BYTES,
  MAX_USER_STORAGE_BYTES,
} from "./types";
import { hashContent, sanitizeFilename, validateMagicBytes } from "./validation";
import { validateUrlForSSRF } from "./ssrf";
import { extractTextFromMaterial } from "./extractor";
import { chunkText } from "./chunker";
import {
  createSignedUploadUrl,
  downloadMaterialBuffer,
  storeMaterialBuffer,
} from "./storage";

export interface CreateMaterialParams {
  ownerId: string;
  kind: MaterialKind;
  title?: string;
  filename?: string;
  fileBuffer?: Buffer;
  sourceUrl?: string;
  goalId?: string | null;
}

export interface CreateMaterialResult {
  material: MaterialRecord;
  duplicate: boolean;
  signedUploadUrl?: string;
}

export interface ProcessMaterialResult {
  material: MaterialRecord;
  chunkCount: number;
  error?: string;
}

/**
 * Checks if the user's total stored materials exceed the quota.
 * PRD B1 AC1: "Max 20 MB per file, 200 MB per user."
 */
export async function checkUserStorageQuota(
  ownerId: string,
  incomingBytes: number,
  dbClient: SupabaseClient<Database>
): Promise<void> {
  const { data, error } = await dbClient
    .from("materials")
    .select("byte_size")
    .eq("owner_id", ownerId);

  if (error) {
    throw new Error(`Failed to check user storage quota: ${error.message}`);
  }

  const currentTotal = (data || []).reduce(
    (sum: number, row: any) => sum + (Number(row.byte_size) || 0),
    0
  );

  if (currentTotal + incomingBytes > MAX_USER_STORAGE_BYTES) {
    const currentMb = (currentTotal / (1024 * 1024)).toFixed(1);
    const incomingMb = (incomingBytes / (1024 * 1024)).toFixed(1);
    throw new Error(
      `User storage quota exceeded (200 MB maximum). Current usage: ${currentMb} MB, Attempted: +${incomingMb} MB.`
    );
  }
}

/**
 * Creates a material record, validating magic bytes, storage quota, and checking for duplicates.
 * PRD Epic B1 & Prompt Requirement 1:
 * "Upload (Dropzone): PDF, .md, .txt, .docx and URLs. Max 20 MB per file, 200 MB per user.
 *  POST /materials returns a signed upload URL to the private bucket.
 *  Validate type by magic bytes on the server, sanitise the filename, store the content hash and skip exact duplicates."
 */
export async function createMaterial(
  params: CreateMaterialParams,
  dbClient: SupabaseClient<Database>
): Promise<CreateMaterialResult> {
  const { ownerId, kind, title, filename, fileBuffer, sourceUrl, goalId } = params;

  // 1. URL Material Path
  if (kind === "url") {
    if (!sourceUrl) {
      throw new Error("A valid sourceUrl is required for URL materials.");
    }

    // SSRF Validation
    const ssrf = validateUrlForSSRF(sourceUrl);
    if (!ssrf.valid) {
      throw new Error(ssrf.error || "Blocked URL target.");
    }

    const contentHash = hashContent(sourceUrl);

    // Check duplicate
    const { data: existingRows } = await dbClient
      .from("materials")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("content_hash", contentHash);

    if (existingRows && existingRows.length > 0) {
      return {
        material: existingRows[0] as unknown as MaterialRecord,
        duplicate: true,
      };
    }

    const materialTitle = title?.trim() || sourceUrl;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertErr } = await (dbClient.from("materials") as any)
      .insert({
        owner_id: ownerId,
        goal_id: goalId || null,
        kind: "url",
        title: materialTitle,
        source_url: sourceUrl,
        content_hash: contentHash,
        status: "pending",
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      throw new Error(`Failed to create URL material: ${insertErr?.message}`);
    }

    return {
      material: inserted as unknown as MaterialRecord,
      duplicate: false,
    };
  }

  // 2. File Upload Path (PDF, DOCX, Markdown, Text, plan_import)
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error("No file content buffer was provided for upload.");
  }

  // 2.1 File size check: Max 20 MB
  if (fileBuffer.length > MAX_FILE_BYTES) {
    throw new Error(
      `File exceeds the 20 MB size limit (Size: ${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB).`
    );
  }

  // 2.2 Magic byte validation
  const magicCheck = validateMagicBytes(fileBuffer, kind);
  if (!magicCheck.valid) {
    throw new Error(magicCheck.error || "Invalid file content format.");
  }

  // 2.3 User quota check: Max 200 MB per user
  await checkUserStorageQuota(ownerId, fileBuffer.length, dbClient);

  // 2.4 Hash content and check duplicates
  const contentHash = hashContent(fileBuffer);

  const { data: existingRows } = await dbClient
    .from("materials")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("content_hash", contentHash);

  if (existingRows && existingRows.length > 0) {
    return {
      material: existingRows[0] as unknown as MaterialRecord,
      duplicate: true,
    };
  }

  // 2.5 Sanitize filename
  const cleanFilename = sanitizeFilename(filename || `upload.${kind}`);
  const storagePath = `materials/${ownerId}/${Date.now()}_${cleanFilename}`;

  // Store buffer in private storage
  await storeMaterialBuffer(storagePath, fileBuffer, dbClient);

  // Generate 5-minute signed upload URL
  const { signedUrl } = await createSignedUploadUrl(storagePath, dbClient);

  const materialTitle = title?.trim() || cleanFilename;

  // Insert material row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertErr } = await (dbClient.from("materials") as any)
    .insert({
      owner_id: ownerId,
      goal_id: goalId || null,
      kind,
      title: materialTitle,
      storage_path: storagePath,
      byte_size: fileBuffer.length,
      content_hash: contentHash,
      status: "pending",
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    throw new Error(`Failed to create material record: ${insertErr?.message}`);
  }

  return {
    material: inserted as unknown as MaterialRecord,
    duplicate: false,
    signedUploadUrl: signedUrl,
  };
}

/**
 * Processes a material: extracts text, chunks it to ~800 tokens with 100 overlap,
 * and saves chunks into material_chunks with full-text search index.
 * PRD Epic B1 & Prompt Requirement 2 & 3:
 * "Failures set status needs_attention with a readable reason. The file stays."
 */
export async function processMaterial(
  materialId: string,
  ownerId: string,
  dbClient: SupabaseClient<Database>
): Promise<ProcessMaterialResult> {
  // Fetch material record
  const { data: materialData, error: fetchErr } = await dbClient
    .from("materials")
    .select("*")
    .eq("id", materialId)
    .eq("owner_id", ownerId)
    .single();

  if (fetchErr || !materialData) {
    throw new Error(`Material not found: ${materialId}`);
  }

  const material = materialData as unknown as MaterialRecord;

  try {
    let extractionText = "";
    let extractedTitle: string | undefined;

    if (material.kind === "url") {
      if (!material.source_url) {
        throw new Error("Missing source URL for URL material.");
      }
      const extraction = await extractTextFromMaterial({
        kind: "url",
        sourceUrl: material.source_url,
      });
      extractionText = extraction.text;
      extractedTitle = extraction.title;
    } else {
      if (!material.storage_path) {
        throw new Error("Missing storage path for file material.");
      }
      const buffer = await downloadMaterialBuffer(material.storage_path, dbClient);
      const extraction = await extractTextFromMaterial({
        kind: material.kind,
        buffer,
      });
      extractionText = extraction.text;
    }

    // Chunk text to ~800 tokens with 100 overlap
    const chunks = chunkText(extractionText);
    if (chunks.length === 0) {
      throw new Error("Document produced 0 text chunks during extraction.");
    }

    // Delete existing chunks if re-processing
    await dbClient
      .from("material_chunks")
      .delete()
      .eq("material_id", materialId)
      .eq("owner_id", ownerId);

    // Insert chunks
    const chunkRows = chunks.map((c) => ({
      owner_id: ownerId,
      material_id: materialId,
      ordinal: c.ordinal,
      content: c.content,
      tokens: c.tokens,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertChunksErr } = await (dbClient.from("material_chunks") as any).insert(
      chunkRows
    );

    if (insertChunksErr) {
      throw new Error(`Failed to save material chunks: ${insertChunksErr.message}`);
    }

    // Update material status to ready
    const updates: Record<string, unknown> = {
      status: "ready",
      status_reason: null,
    };
    if (extractedTitle && (!material.title || material.title === material.source_url)) {
      updates.title = extractedTitle;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedMaterial, error: updateErr } = await (dbClient.from("materials") as any)
      .update(updates)
      .eq("id", materialId)
      .eq("owner_id", ownerId)
      .select()
      .single();

    if (updateErr || !updatedMaterial) {
      throw new Error(`Failed to mark material as ready: ${updateErr?.message}`);
    }

    return {
      material: updatedMaterial as unknown as MaterialRecord,
      chunkCount: chunks.length,
    };
  } catch (err: unknown) {
    const reason = (err as Error).message || "Material extraction failed.";

    // Failures set status needs_attention with a readable reason. The file stays.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: failedMaterial } = await (dbClient.from("materials") as any)
      .update({
        status: "needs_attention",
        status_reason: reason,
      })
      .eq("id", materialId)
      .eq("owner_id", ownerId)
      .select()
      .single();

    return {
      material: (failedMaterial || material) as unknown as MaterialRecord,
      chunkCount: 0,
      error: reason,
    };
  }
}
