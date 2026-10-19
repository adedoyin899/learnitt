import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createMaterial } from "@/lib/materials/service";
import { createSignedViewUrl } from "@/lib/materials/storage";
import { MATERIAL_KINDS, MaterialKind } from "@/lib/materials/types";

const createMaterialSchema = z.object({
  kind: z.enum(MATERIAL_KINDS),
  title: z.string().optional(),
  filename: z.string().optional(),
  contentBase64: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  goalId: z.string().uuid().optional(),
});

/**
 * GET /api/v1/materials
 * Lists all materials belonging to the authenticated user.
 * Optional query parameter: ?goal_id=UUID
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const goalId = searchParams.get("goal_id");

  let query = supabase
    .from("materials")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (goalId) {
    query = query.eq("goal_id", goalId);
  }

  const { data: materials, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get chunk counts for each material
  const materialIds = (materials || []).map((m: any) => m.id);
  const chunkCountMap = new Map<string, number>();

  if (materialIds.length > 0) {
    const { data: chunkRows } = await supabase
      .from("material_chunks")
      .select("material_id")
      .eq("owner_id", user.id)
      .in("material_id", materialIds);

    if (chunkRows) {
      for (const row of chunkRows as any[]) {
        const cur = chunkCountMap.get(row.material_id) || 0;
        chunkCountMap.set(row.material_id, cur + 1);
      }
    }
  }

  // Generate 5-minute signed view URLs for materials with storage paths
  const enriched = await Promise.all(
    (materials || []).map(async (m: any) => {
      let signedViewUrl: string | null = null;
      if (m.storage_path) {
        try {
          signedViewUrl = await createSignedViewUrl(m.storage_path, supabase);
        } catch {
          // ignore error generating view url
        }
      }
      return {
        ...m,
        chunk_count: chunkCountMap.get(m.id) || 0,
        signed_view_url: signedViewUrl,
      };
    })
  );

  return NextResponse.json({ materials: enriched });
}

/**
 * POST /api/v1/materials
 * Creates a material record (from file upload or URL) with validation.
 * PRD Epic B1 & Prompt Requirement 1:
 * "Upload (Dropzone): PDF, .md, .txt, .docx and URLs. Max 20 MB per file, 200 MB per user.
 *  POST /materials returns a signed upload URL to the private bucket.
 *  Validate type by magic bytes on the server, sanitise the filename, store the content hash and skip exact duplicates."
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let kind: MaterialKind = "text";
    let title: string | undefined;
    let filename: string | undefined;
    let fileBuffer: Buffer | undefined;
    let sourceUrl: string | undefined;
    let goalId: string | null = null;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const declaredKind = formData.get("kind") as string | null;
      title = (formData.get("title") as string) || undefined;
      sourceUrl = (formData.get("source_url") as string) || undefined;
      goalId = (formData.get("goal_id") as string) || null;

      if (declaredKind && MATERIAL_KINDS.includes(declaredKind as MaterialKind)) {
        kind = declaredKind as MaterialKind;
      }

      if (file) {
        filename = file.name;
        const arrayBuf = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuf);
      }
    } else {
      const body = await request.json();
      const parsed = createMaterialSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid material data." },
          { status: 400 }
        );
      }

      kind = parsed.data.kind;
      title = parsed.data.title;
      filename = parsed.data.filename;
      sourceUrl = parsed.data.sourceUrl;
      goalId = parsed.data.goalId || null;

      if (parsed.data.contentBase64) {
        fileBuffer = Buffer.from(parsed.data.contentBase64, "base64");
      }
    }

    const result = await createMaterial(
      {
        ownerId: user.id,
        kind,
        title,
        filename,
        fileBuffer,
        sourceUrl,
        goalId,
      },
      supabase
    );

    return NextResponse.json(
      {
        material: result.material,
        duplicate: result.duplicate,
        signed_upload_url: result.signedUploadUrl,
      },
      { status: result.duplicate ? 200 : 201 }
    );
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || "Failed to create material.";
    const status =
      errorMsg.includes("forbidden") ||
      errorMsg.includes("magic byte") ||
      errorMsg.includes("exceeds") ||
      errorMsg.includes("quota") ||
      errorMsg.includes("Blocked SSRF")
        ? 400
        : 500;

    return NextResponse.json({ error: errorMsg }, { status });
  }
}
