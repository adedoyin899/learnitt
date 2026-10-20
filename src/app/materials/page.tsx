"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Dropzone } from "@/components/ui/dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConsentDialog } from "@/components/materials/consent-dialog";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileText,
  Globe,
  Link as LinkIcon,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

interface MaterialItem {
  id: string;
  title: string;
  kind: string;
  byte_size: number | null;
  status: "pending" | "ready" | "needs_attention";
  status_reason: string | null;
  chunk_count: number;
  signed_view_url: string | null;
  source_url: string | null;
  created_at: string;
}

interface UncoveredSkill {
  id: string;
  title: string;
  category?: string | null;
}

interface ProposedLinkItem {
  skill_id: string;
  skill_name: string;
  material_id: string;
  material_title: string;
  confidence: number;
  category: "suggested" | "weak";
  confirmed: boolean;
}

function MaterialsLibraryContent() {
  const searchParams = useSearchParams();
  const goalId = searchParams.get("goal_id");

  const [materials, setMaterials] = React.useState<MaterialItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uncoveredSkills, setUncoveredSkills] = React.useState<UncoveredSkill[]>([]);
  const [links, setLinks] = React.useState<ProposedLinkItem[]>([]);
  const [urlInput, setUrlInput] = React.useState("");
  const [urlSubmitting, setUrlSubmitting] = React.useState(false);
  const [linkingLoading, setLinkingLoading] = React.useState(false);

  // Consent modal state
  const [consentModalOpen, setConsentModalOpen] = React.useState(false);
  const [consentStatus, setConsentStatus] = React.useState<{ asked: boolean; consent: boolean }>({
    asked: false,
    consent: false,
  });

  const loadMaterials = React.useCallback(async () => {
    try {
      setLoading(true);
      const url = goalId ? `/api/v1/materials?goal_id=${goalId}` : "/api/v1/materials";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setMaterials(data.materials || []);
      }
    } catch {
      toast.error("Failed to load materials.");
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  const loadUncoveredSkills = React.useCallback(async () => {
    if (!goalId) return;
    try {
      const res = await fetch(`/api/v1/materials/uncovered-skills?goal_id=${goalId}`);
      const data = await res.json();
      if (res.ok) {
        setUncoveredSkills(data.uncoveredSkills || []);
      }
    } catch {
      // ignore
    }
  }, [goalId]);

  const loadLinks = React.useCallback(async () => {
    if (!goalId) return;
    try {
      const res = await fetch(`/api/v1/materials/links?goal_id=${goalId}`);
      const data = await res.json();
      if (res.ok) {
        setLinks(data.links || []);
      }
    } catch {
      // ignore
    }
  }, [goalId]);

  const loadConsentStatus = React.useCallback(async () => {
    try {
      const res = await fetch("/api/v1/user/consent");
      const data = await res.json();
      if (res.ok && data.status) {
        setConsentStatus({
          asked: data.status.asked,
          consent: data.status.consent,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    loadMaterials();
    loadConsentStatus();
    if (goalId) {
      loadUncoveredSkills();
      loadLinks();
    }
  }, [loadMaterials, loadConsentStatus, loadUncoveredSkills, loadLinks, goalId]);

  // Dropzone file upload handler
  const handleFileUpload = async (files: File[]) => {
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        let declaredKind = "text";
        if (file.name.endsWith(".pdf")) declaredKind = "pdf";
        else if (file.name.endsWith(".docx")) declaredKind = "docx";
        else if (file.name.endsWith(".md")) declaredKind = "markdown";
        formData.append("kind", declaredKind);
        if (goalId) formData.append("goal_id", goalId);

        const res = await fetch("/api/v1/materials", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || `Failed to upload ${file.name}`);
          continue;
        }

        if (data.duplicate) {
          toast.info(`${file.name} is an exact duplicate and was skipped.`);
        } else {
          toast.success(`Uploaded ${file.name}`);
          // Trigger extraction immediately
          if (data.material?.id) {
            await fetch(`/api/v1/materials/${data.material.id}/process`, {
              method: "POST",
            });
          }
        }
      } catch (err: unknown) {
        toast.error((err as Error).message || `Upload failed for ${file.name}`);
      }
    }
    await loadMaterials();
    if (goalId) {
      await loadUncoveredSkills();
    }
  };

  // URL upload handler
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    try {
      setUrlSubmitting(true);
      const res = await fetch("/api/v1/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "url",
          sourceUrl: urlInput.trim(),
          goalId: goalId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to add URL.");
        return;
      }

      if (data.duplicate) {
        toast.info("This URL was already added.");
      } else {
        toast.success("URL material added.");
        if (data.material?.id) {
          await fetch(`/api/v1/materials/${data.material.id}/process`, {
            method: "POST",
          });
        }
      }
      setUrlInput("");
      await loadMaterials();
    } catch {
      toast.error("Failed to add URL.");
    } finally {
      setUrlSubmitting(false);
    }
  };

  // Process / re-process material
  const handleProcessMaterial = async (id: string) => {
    try {
      toast.loading("Extracting and chunking text...", { id: "process" });
      const res = await fetch(`/api/v1/materials/${id}/process`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.status === "needs_attention") {
        toast.error(data.reason || "Extraction failed.", { id: "process" });
      } else {
        toast.success(`Extraction complete (${data.chunk_count} chunks).`, { id: "process" });
      }
      await loadMaterials();
    } catch {
      toast.error("Processing failed.", { id: "process" });
    }
  };

  // Link Materials to skills
  const handleTriggerLinking = async () => {
    if (!goalId) {
      toast.error("Select a goal to link materials.");
      return;
    }

    // Check consent first (PRD I3 & Prompt Requirement 7)
    if (!consentStatus.consent) {
      setConsentModalOpen(true);
      return;
    }

    try {
      setLinkingLoading(true);
      toast.loading("Analyzing materials against skills...", { id: "link-job" });
      const res = await fetch(`/api/v1/goals/${goalId}/link-materials`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.consent_required) {
          setConsentModalOpen(true);
          toast.dismiss("link-job");
          return;
        }
        toast.error(data.error || "Linking job failed.", { id: "link-job" });
        return;
      }

      toast.success("AI linking job queued. Processing links...", { id: "link-job" });

      // Run worker tick in dev/mock environment
      await fetch("/api/v1/dev/worker-tick", { method: "POST" });
      await loadLinks();
      await loadUncoveredSkills();
    } catch {
      toast.error("Linking failed.", { id: "link-job" });
    } finally {
      setLinkingLoading(false);
    }
  };

  // Confirm or Remove link
  const handleLinkAction = async (action: "confirm" | "remove", skillId: string, materialId: string) => {
    try {
      const res = await fetch("/api/v1/materials/links", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, skillId, materialId }),
      });

      if (res.ok) {
        toast.success(action === "confirm" ? "Link confirmed." : "Link removed.");
        await loadLinks();
        await loadUncoveredSkills();
      } else {
        toast.error("Failed to update link.");
      }
    } catch {
      toast.error("Failed to update link.");
    }
  };

  const handleConsentResponse = async (granted: boolean) => {
    try {
      const res = await fetch("/api/v1/user/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: granted }),
      });

      if (res.ok) {
        setConsentStatus({ asked: true, consent: granted });
        if (granted) {
          toast.success("Consent granted. Ready for AI material analysis.");
          handleTriggerLinking();
        } else {
          toast.info("AI materials consent declined. Materials will remain private.");
        }
      }
    } catch {
      toast.error("Failed to update consent preference.");
    }
  };

  const consentPreviewItems = materials
    .filter((m) => m.status === "ready")
    .map((m) => ({
      id: m.id,
      title: m.title,
      chunkCount: m.chunk_count,
      byteSize: m.byte_size,
    }));
  const totalChunks = consentPreviewItems.reduce((acc, curr) => acc + curr.chunkCount, 0);

  return (
    <div className="flex-1 w-full bg-background text-foreground pb-20">
      <main className="container max-w-5xl mx-auto px-4 py-8 space-y-8">
        <PageHeader
          title="Materials Library"
          description="Upload and link study materials, textbooks, documentation, and reference links."
        />

        {/* Uncovered Skills Banner (Prompt Requirement 6 & S06 Discovery) */}
        {goalId && uncoveredSkills.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <AlertCircle className="size-5 shrink-0 text-warning mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold text-foreground">
                  {uncoveredSkills.length} skills currently have no study materials:
                </span>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {uncoveredSkills.map((s) => (
                    <Badge key={s.id} variant="outline" className="text-xs">
                      {s.title}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <Link href={`/goals/${goalId}/resources`}>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs border-warning/40 hover:bg-warning/20">
                <Sparkles className="size-3.5 text-brand" />
                Discover Resources (S06)
              </Button>
            </Link>
          </div>
        )}

        {/* Upload Section (Dropzone & URL input) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UploadCloud className="size-4 text-brand" />
                Upload Documents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Dropzone
                accept=".pdf,.docx,.md,.txt"
                maxSize={20 * 1024 * 1024}
                maxFiles={10}
                multiple
                onFiles={handleFileUpload}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="size-4 text-brand" />
                Add Web URL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUrlSubmit} className="space-y-3">
                <input
                  type="url"
                  placeholder="https://example.com/article"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  required
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={urlSubmitting || !urlInput.trim()}
                  className="w-full"
                >
                  {urlSubmitting ? "Fetching..." : "Add URL Material"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* AI Linking Section */}
        {goalId && materials.some((m) => m.status === "ready") && (
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/60 bg-card">
            <div>
              <h3 className="font-semibold text-sm">Semantic Skill Linking</h3>
              <p className="text-xs text-muted-foreground">
                Automatically map uploaded material passages to goal skills.
              </p>
            </div>
            <Button
              onClick={handleTriggerLinking}
              disabled={linkingLoading}
              variant="default"
              size="sm"
              className="gap-2"
            >
              <Sparkles className="size-4" />
              {linkingLoading ? "Linking..." : "Link Materials to Skills"}
            </Button>
          </div>
        )}

        {/* Proposed and Confirmed Links (Prompt Requirement 4) */}
        {goalId && links.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <LinkIcon className="size-4 text-brand" />
              Skill-to-Material Connections
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {links.map((link) => (
                <div
                  key={`${link.skill_id}-${link.material_id}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border border-border/50 bg-card text-sm"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{link.skill_name}</span>
                      <Badge
                        variant={link.confirmed ? "success" : link.category === "suggested" ? "brand" : "outline"}
                        className="text-[10px] uppercase font-bold tracking-wider"
                      >
                        {link.confirmed ? "Confirmed" : link.category}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {link.material_title} · Confidence {(link.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!link.confirmed && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => handleLinkAction("confirm", link.skill_id, link.material_id)}
                      >
                        <CheckCircle2 className="size-3 mr-1 text-success" />
                        Confirm
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => handleLinkAction("remove", link.skill_id, link.material_id)}
                    >
                      <Trash2 className="size-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Materials Table & Status Badges (Prompt Requirement 5) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Your Materials ({materials.length})</h3>
            <Button variant="ghost" size="sm" onClick={loadMaterials} className="gap-1.5 text-xs">
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Loading materials...
            </div>
          ) : materials.length === 0 ? (
            <EmptyState
              bordered
              title="No materials uploaded yet"
              description="Drop a PDF, Word document, Markdown file, or paste a reference URL above."
              icon={<UploadCloud className="size-6 text-muted-foreground" />}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Kind</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Chunks</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {materials.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium flex items-center gap-2 max-w-xs truncate">
                        {m.kind === "url" ? (
                          <Globe className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{m.title}</span>
                      </td>
                      <td className="px-4 py-3 uppercase text-xs font-mono text-muted-foreground">
                        {m.kind}
                      </td>
                      <td className="px-4 py-3">
                        {m.status === "ready" && (
                          <Badge variant="success" className="text-xs">
                            Ready
                          </Badge>
                        )}
                        {m.status === "pending" && (
                          <Badge variant="secondary" className="text-xs">
                            Pending
                          </Badge>
                        )}
                        {m.status === "needs_attention" && (
                          <div className="space-y-1">
                            <Badge variant="destructive" className="text-xs">
                              Needs Attention
                            </Badge>
                            {m.status_reason && (
                              <p className="text-[11px] text-destructive max-w-xs truncate">
                                {m.status_reason}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {m.chunk_count}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        {m.status === "needs_attention" && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleProcessMaterial(m.id)}
                          >
                            Retry
                          </Button>
                        )}
                        {m.status === "pending" && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => handleProcessMaterial(m.id)}
                          >
                            Process
                          </Button>
                        )}
                        <Link href={`/materials/${m.id}`}>
                          <Button size="xs" variant="ghost">
                            <Eye className="size-3.5 mr-1" />
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Consent Modal Dialog */}
        <ConsentDialog
          open={consentModalOpen}
          onOpenChange={setConsentModalOpen}
          materials={consentPreviewItems}
          totalChunks={totalChunks}
          onConsentResponse={handleConsentResponse}
        />
      </main>
    </div>
  );
}

export default function MaterialsLibraryPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center text-sm text-muted-foreground">
          Loading materials library...
        </div>
      }
    >
      <MaterialsLibraryContent />
    </React.Suspense>
  );
}
