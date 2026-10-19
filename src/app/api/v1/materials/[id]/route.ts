import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSignedViewUrl } from "@/lib/materials/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/materials/[id]
 * Retrieves single material with chunk count and temporary signed view URL.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: material, error } = await supabase
    .from("materials")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (error || !material) {
    return NextResponse.json({ error: "Material not found" }, { status: 404 });
  }

  // Fetch chunks
  const { data: chunks } = await supabase
    .from("material_chunks")
    .select("id, ordinal, content, tokens")
    .eq("material_id", id)
    .eq("owner_id", user.id)
    .order("ordinal", { ascending: true });

  let signedViewUrl: string | null = null;
  if (material.storage_path) {
    try {
      signedViewUrl = await createSignedViewUrl(material.storage_path, supabase);
    } catch {
      // ignore
    }
  }

  return NextResponse.json({
    material: {
      ...material,
      chunk_count: chunks?.length || 0,
      signed_view_url: signedViewUrl,
      chunks: chunks || [],
    },
  });
}

/**
 * DELETE /api/v1/materials/[id]
 * Deletes material and cascades to chunks & links.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("materials") as any)
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
