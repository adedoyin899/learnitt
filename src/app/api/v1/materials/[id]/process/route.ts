import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processMaterial } from "@/lib/materials/service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/materials/[id]/process
 * Enqueues / executes extraction and chunking for a material.
 * PRD Epic B1 AC2 & Prompt Requirement 2:
 * "POST /materials/:id/process enqueues extraction. Extract text from each type
 *  (a PDF parser and a DOCX parser, with timeouts). URLs: fetch the page and extract
 *  readable text, with a size limit and a block on private IP ranges (SSRF protection).
 *  Failures set status needs_attention with a readable reason. The file stays."
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processMaterial(id, user.id, supabase);

    if (result.error) {
      return NextResponse.json(
        {
          material: result.material,
          status: "needs_attention",
          reason: result.error,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        material: result.material,
        status: "ready",
        chunk_count: result.chunkCount,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || "Material processing failed." },
      { status: 500 }
    );
  }
}
