"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/ui/site-header";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, ExternalLink, FileText, Globe, Layers } from "lucide-react";
import { toast } from "sonner";

// Lazy-load the Document Viewer for PDFs (Prompt Requirement 5: "Lazy-load the viewer")
const DocumentViewer = dynamic(
  () => import("@/components/ui/document-viewer").then((mod) => mod.DocumentViewer),
  {
    ssr: false,
    loading: () => (
      <div className="h-[650px] w-full rounded-lg border border-border flex items-center justify-center text-sm text-muted-foreground bg-muted/10 animate-pulse">
        Loading document viewer...
      </div>
    ),
  }
);

interface ChunkItem {
  id: string;
  ordinal: number;
  content: string;
  tokens: number;
}

interface MaterialDetail {
  id: string;
  title: string;
  kind: string;
  status: string;
  status_reason: string | null;
  chunk_count: number;
  signed_view_url: string | null;
  source_url: string | null;
  byte_size: number | null;
  chunks: ChunkItem[];
}

export default function MaterialViewerPage() {
  const { id } = useParams<{ id: string }>();
  const [material, setMaterial] = React.useState<MaterialDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("document");

  React.useEffect(() => {
    async function fetchMaterial() {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/materials/${id}`);
        const data = await res.json();
        if (res.ok) {
          setMaterial(data.material);
        } else {
          toast.error(data.error || "Failed to load material.");
        }
      } catch {
        toast.error("Failed to load material.");
      } finally {
        setLoading(false);
      }
    }
    if (id) {
      fetchMaterial();
    }
  }, [id]);

  const brandElement = (
    <Link href="/" className="font-bold text-lg tracking-tight">
      <span className="text-brand">Learnitt</span>
    </Link>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader brand={brandElement} />
        <main className="container max-w-5xl mx-auto px-4 py-12 text-center text-sm text-muted-foreground">
          Loading material details...
        </main>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader brand={brandElement} />
        <main className="container max-w-5xl mx-auto px-4 py-12 text-center space-y-4">
          <p className="text-muted-foreground">Material not found.</p>
          <Link href="/materials">
            <Button variant="outline" size="sm">
              <ArrowLeft className="size-4 mr-1.5" />
              Back to Materials
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  const isPdf = material.kind === "pdf";

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <SiteHeader brand={brandElement} />
      <main className="container max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/materials">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
              <ArrowLeft className="size-3.5" />
              Back to Library
            </Button>
          </Link>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="uppercase text-xs font-mono">
              {material.kind}
            </Badge>
            <Badge
              variant={
                material.status === "ready"
                  ? "success"
                  : material.status === "needs_attention"
                  ? "destructive"
                  : "secondary"
              }
              className="text-xs"
            >
              {material.status}
            </Badge>
          </div>
        </div>

        <PageHeader
          title={material.title}
          description={`Created with ${material.chunk_count} indexed chunks (${
            material.byte_size ? (material.byte_size / 1024).toFixed(0) + " KB" : "Web URL"
          }).`}
        />

        {material.source_url && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="size-4" />
            <a
              href={material.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline flex items-center gap-1"
            >
              {material.source_url}
              <ExternalLink className="size-3" />
            </a>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="document" className="gap-1.5">
              <FileText className="size-3.5" />
              Document
            </TabsTrigger>
            <TabsTrigger value="chunks" className="gap-1.5">
              <Layers className="size-3.5" />
              Extracted Chunks ({material.chunks.length})
            </TabsTrigger>
          </TabsList>

          {/* Document Content View (Lazy-loaded DocumentViewer for PDFs; plain rendering for text) */}
          <TabsContent value="document" className="space-y-4">
            {isPdf && material.signed_view_url ? (
              <div className="h-[750px] w-full rounded-lg border border-border overflow-hidden bg-muted/10">
                <DocumentViewer
                  src={material.signed_view_url}
                  title={material.title}
                  className="h-full w-full"
                />
              </div>
            ) : isPdf && !material.signed_view_url ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  Document viewer unavailable. Temporary signed URL expired.
                </CardContent>
              </Card>
            ) : (
              // Plain rendering for text / markdown / URLs (Prompt Requirement 5)
              <Card>
                <CardContent className="p-6">
                  {material.chunks.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      No extracted text available. Material may still be processing.
                    </div>
                  ) : (
                    <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap font-sans text-sm leading-relaxed space-y-4">
                      {material.chunks.map((c) => (
                        <p key={c.id}>{c.content}</p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Chunks Tab */}
          <TabsContent value="chunks" className="space-y-4">
            {material.chunks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No chunks have been generated for this material yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {material.chunks.map((chunk) => (
                  <Card key={chunk.id} className="border-border/60">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-semibold font-mono">Ordinal #{chunk.ordinal}</span>
                        <Badge variant="secondary" className="text-[11px]">
                          ~{chunk.tokens} tokens
                        </Badge>
                      </div>
                      <p className="text-sm whitespace-pre-wrap font-mono leading-relaxed bg-muted/30 p-3 rounded-md text-foreground/90">
                        {chunk.content}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
