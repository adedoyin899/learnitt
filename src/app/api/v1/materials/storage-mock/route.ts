import { NextRequest, NextResponse } from "next/server";
import { getMockStorageMap } from "@/lib/materials/storage";

/**
 * GET /api/v1/materials/storage-mock?path=...
 * Serves in-memory mock storage files in local test/dev environments.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const expires = searchParams.get("expires");

  if (!path) {
    return NextResponse.json({ error: "Missing path parameter." }, { status: 400 });
  }

  if (expires && Date.now() > parseInt(expires, 10)) {
    return NextResponse.json({ error: "Signed URL expired." }, { status: 403 });
  }

  const map = getMockStorageMap();
  const buffer = map.get(path);

  if (!buffer) {
    return NextResponse.json({ error: "File not found in storage." }, { status: 404 });
  }

  let contentType = "application/octet-stream";
  if (path.endsWith(".pdf")) contentType = "application/pdf";
  else if (path.endsWith(".txt")) contentType = "text/plain";
  else if (path.endsWith(".md")) contentType = "text/markdown";
  else if (path.endsWith(".docx")) {
    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "private, no-cache",
    },
  });
}
