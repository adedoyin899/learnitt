"use client";

import * as React from "react";
import {
  ExternalLink,
  Check,
  X,
  Sparkles,
  AlertTriangle,
  Clock,
  BookOpen,
  Video,
  FileCode,
  FileText,
  Search,
  CheckCheck,
  RefreshCw,
  ThumbsDown,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ResourceType, ResourceApproval } from "@/types/database";

export interface ResourceItem {
  id: string;
  goal_id: string;
  skill_id: string | null;
  url: string;
  title: string | null;
  domain: string | null;
  type: ResourceType | null;
  estimated_minutes: number | null;
  relevance: number | null;
  found_by_query: string | null;
  search_provider: string | null;
  approval: ResourceApproval;
  status: string;
  found_at: string;
  skill?: {
    id: string;
    name: string;
    level: string | null;
  } | null;
}

export interface ApprovalQueueProps {
  goalId: string;
  goalTitle?: string;
  initialResources?: ResourceItem[];
  initialActiveJob?: {
    id: string;
    status: string;
    last_error: string | null;
  } | null;
}

export function ApprovalQueue({
  goalId,
  goalTitle,
  initialResources = [],
  initialActiveJob = null,
}: ApprovalQueueProps) {
  const [resources, setResources] = React.useState<ResourceItem[]>(initialResources);
  const [activeJob, setActiveJob] = React.useState(initialActiveJob);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState<"pending" | "approved" | "all">("pending");
  const [isDiscovering, setIsDiscovering] = React.useState(false);
  const [showRerunPlannerDialog, setShowRerunPlannerDialog] = React.useState(false);
  const [approvedCountSession, setApprovedCountSession] = React.useState(0);
  const [isRerunningPlanner, setIsRerunningPlanner] = React.useState(false);

  // Poll for active discovery job if running
  React.useEffect(() => {
    let timer: NodeJS.Timeout;

    const checkJob = async () => {
      if (!activeJob || (activeJob.status !== "queued" && activeJob.status !== "running")) {
        return;
      }

      try {
        const res = await fetch(`/api/v1/jobs/${activeJob.id}`);
        if (res.ok) {
          const json = await res.json();
          const job = json.data;
          setActiveJob(job);

          if (job.status === "succeeded") {
            toast.success("Resource discovery completed! Candidates are ready for review.");
            loadResources();
          } else if (job.status === "paused_cap") {
            toast.warning("Daily search or AI quota reached. Discovery paused cleanly.");
            loadResources();
          } else if (job.status === "failed") {
            toast.error(job.last_error || "Discovery job failed.");
          }
        }
      } catch (err) {
        console.error("Failed to poll discovery job:", err);
      }
    };

    if (activeJob && (activeJob.status === "queued" || activeJob.status === "running")) {
      timer = setInterval(checkJob, 3000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [activeJob]);

  const loadResources = async () => {
    try {
      const res = await fetch(`/api/v1/goals/${goalId}/resources`);
      if (res.ok) {
        const json = await res.json();
        setResources(json.data.resources || []);
        if (json.data.activeJob) {
          setActiveJob(json.data.activeJob);
        }
      }
    } catch (err) {
      console.error("Failed to fetch resources:", err);
    }
  };

  const handleDiscover = async () => {
    setIsDiscovering(true);
    try {
      const res = await fetch(`/api/v1/goals/${goalId}/resources/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_skills: 3 }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to start discovery");
      }

      const json = await res.json();
      setActiveJob({
        id: json.data.job_id,
        status: json.data.status,
        last_error: null,
      });
      toast.info("Discovery started in background. Searching candidates...");
    } catch (err: any) {
      toast.error(err.message || "Failed to enqueue discovery job");
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleApprove = async (resourceId: string) => {
    try {
      const res = await fetch(`/api/v1/resources/${resourceId}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to approve resource");
      }

      setResources((prev) =>
        prev.map((r) => (r.id === resourceId ? { ...r, approval: "approved" as const } : r))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(resourceId);
        return next;
      });

      setApprovedCountSession((prev) => prev + 1);
      toast.success("Resource approved and attached to plan item.");
    } catch (err: any) {
      toast.error(err.message || "Error approving resource");
    }
  };

  const handleReject = async (resourceId: string, reason: string = "user_rejected") => {
    try {
      const res = await fetch(`/api/v1/resources/${resourceId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to reject resource");
      }

      setResources((prev) =>
        prev.map((r) => (r.id === resourceId ? { ...r, approval: "rejected" as const } : r))
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(resourceId);
        return next;
      });

      toast.info(
        reason === "not_useful"
          ? "Resource marked 'Not useful' and added to exclusion list."
          : "Resource rejected and excluded from future discovery."
      );
    } catch (err: any) {
      toast.error(err.message || "Error rejecting resource");
    }
  };

  const handleApproveSkill = async (skillId: string) => {
    try {
      const res = await fetch(`/api/v1/skills/${skillId}/resources/approve-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal_id: goalId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to approve resources for skill");
      }

      const json = await res.json();
      const count = json.data.approvedCount;

      setResources((prev) =>
        prev.map((r) =>
          r.skill_id === skillId && r.approval === "pending"
            ? { ...r, approval: "approved" as const }
            : r
        )
      );

      setApprovedCountSession((prev) => prev + count);
      toast.success(`Approved ${count} resources for this skill.`);
    } catch (err: any) {
      toast.error(err.message || "Error approving resources for skill");
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    let count = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/v1/resources/${id}/approve`, { method: "POST" });
        if (res.ok) count++;
      } catch {
        // continue
      }
    }

    setResources((prev) =>
      prev.map((r) => (selectedIds.has(r.id) ? { ...r, approval: "approved" as const } : r))
    );
    setSelectedIds(new Set());
    setApprovedCountSession((prev) => prev + count);
    toast.success(`Approved ${count} selected resources.`);
  };

  const handleRerunPlanner = async () => {
    setIsRerunningPlanner(true);
    try {
      // Re-run planner for goal
      const res = await fetch(`/api/v1/goals/${goalId}/plan`, {
        method: "POST",
      });

      if (res.ok) {
        toast.success("Plan recalculated successfully with approved resources.");
        setShowRerunPlannerDialog(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to re-run planner");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to re-run planner");
    } finally {
      setIsRerunningPlanner(false);
    }
  };

  // Filter resources
  const filteredResources = resources.filter((r) => {
    if (filter === "pending") return r.approval === "pending";
    if (filter === "approved") return r.approval === "approved";
    return true;
  });

  // Group by skill
  const groupedBySkill = React.useMemo(() => {
    const map = new Map<string, { skillName: string; skillId: string; items: ResourceItem[] }>();

    for (const res of filteredResources) {
      const key = res.skill_id || "unassigned";
      const skillName = res.skill?.name || "General Resources";
      if (!map.has(key)) {
        map.set(key, { skillName, skillId: key, items: [] });
      }
      map.get(key)!.items.push(res);
    }

    return Array.from(map.values());
  }, [filteredResources]);

  const getTypeIcon = (type: ResourceType | null) => {
    switch (type) {
      case "video":
        return <Video className="h-3.5 w-3.5" />;
      case "docs":
        return <FileCode className="h-3.5 w-3.5" />;
      case "course":
      case "book":
        return <BookOpen className="h-3.5 w-3.5" />;
      case "article":
      default:
        return <FileText className="h-3.5 w-3.5" />;
    }
  };

  const pendingCount = resources.filter((r) => r.approval === "pending").length;
  const approvedCount = resources.filter((r) => r.approval === "approved").length;

  return (
    <div className="space-y-6" data-testid="approval-queue-container">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            Resource Approval Queue
            <Badge variant="outline" className="text-xs px-2 py-0.5 font-mono">
              S06
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Strictly search-grounded candidates. Nothing enters your plan until approved.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadResources}
            className="h-8 gap-1.5 text-xs"
            title="Refresh list"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={handleDiscover}
            disabled={isDiscovering || activeJob?.status === "running"}
            className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
            data-testid="discover-resources-btn"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {isDiscovering || activeJob?.status === "running"
              ? "Discovering..."
              : "Discover Resources"}
          </Button>
        </div>
      </div>

      {/* Paused Cap Notice Banner */}
      {activeJob?.status === "paused_cap" && (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200 flex items-start gap-3"
          data-testid="cap-reached-banner"
        >
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-amber-300">
              Quota Reached · Discovery Paused Cleanly
            </h4>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              {activeJob.last_error ||
                "Daily search call cap or AI token quota reached. The discovery job paused cleanly without losing candidate state. You can approve existing candidates below."}
            </p>
          </div>
        </div>
      )}

      {/* Running Job Progress Indicator */}
      {(activeJob?.status === "running" || activeJob?.status === "queued") && (
        <div
          className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-200 flex items-center justify-between"
          data-testid="discovery-progress-banner"
        >
          <div className="flex items-center gap-3">
            <RefreshCw className="h-4 w-4 text-blue-400 animate-spin" />
            <div>
              <p className="font-medium text-xs text-blue-300">
                Resource Discovery in Progress...
              </p>
              <p className="text-[11px] text-blue-200/80">
                Generating search queries, fetching live web candidates, and vetting HTTP status.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
            {activeJob.status}
          </Badge>
        </div>
      )}

      {/* Re-run Planner Banner */}
      {approvedCountSession > 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCheck className="h-4 w-4 text-emerald-400" />
            <span>
              <strong>{approvedCountSession}</strong> resource(s) approved and attached to plan
              items.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowRerunPlannerDialog(true)}
            className="h-7 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20"
            data-testid="re-run-planner-btn"
          >
            Re-run Planner...
          </Button>
        </div>
      )}

      {/* Filter Tabs & Bulk Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={filter === "pending" ? "default" : "secondary"}
            onClick={() => setFilter("pending")}
            className="h-8 text-xs font-mono"
            data-testid="filter-pending-btn"
          >
            Pending ({pendingCount})
          </Button>
          <Button
            size="sm"
            variant={filter === "approved" ? "default" : "secondary"}
            onClick={() => setFilter("approved")}
            className="h-8 text-xs font-mono"
            data-testid="filter-approved-btn"
          >
            Approved ({approvedCount})
          </Button>
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "secondary"}
            onClick={() => setFilter("all")}
            className="h-8 text-xs font-mono"
            data-testid="filter-all-btn"
          >
            All ({resources.length})
          </Button>
        </div>

        {selectedIds.size > 0 && filter === "pending" && (
          <Button
            size="sm"
            onClick={handleBulkApprove}
            className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="approve-selected-btn"
          >
            <Check className="h-3.5 w-3.5" />
            Approve Selected ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Empty State */}
      {filteredResources.length === 0 && (
        <EmptyState
          icon={<Search className="h-5 w-5" />}
          title={
            filter === "pending"
              ? "No pending resources in queue"
              : filter === "approved"
              ? "No approved resources yet"
              : "No discovered resources"
          }
          description="Click 'Discover Resources' above to search vetted materials for skills that need depth or lack study content."
          action={
            <Button
              size="sm"
              onClick={handleDiscover}
              disabled={isDiscovering}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Discover Resources
            </Button>
          }
        />
      )}

      {/* Grouped Skills and Resource Cards */}
      <div className="space-y-8">
        {groupedBySkill.map((group) => (
          <div key={group.skillId} className="space-y-3" data-testid={`skill-group-${group.skillId}`}>
            <div className="flex items-center justify-between border-b border-border/30 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">{group.skillName}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {group.items.length} {group.items.length === 1 ? "candidate" : "candidates"}
                </Badge>
              </div>

              {group.skillId !== "unassigned" &&
                group.items.some((i) => i.approval === "pending") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleApproveSkill(group.skillId)}
                    className="h-7 text-xs text-primary hover:text-primary/90 hover:bg-primary/10 gap-1"
                    data-testid={`approve-skill-${group.skillId}`}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Approve all for this skill
                  </Button>
                )}
            </div>

            <div className="grid gap-3">
              {group.items.map((res) => {
                const isSelected = selectedIds.has(res.id);
                const isPending = res.approval === "pending";
                const isApproved = res.approval === "approved";
                const isRejected = res.approval === "rejected";

                return (
                  <Card
                    key={res.id}
                    data-testid={`resource-card-${res.id}`}
                    className={`transition-all border ${
                      isSelected
                        ? "border-primary/60 bg-primary/5"
                        : isApproved
                        ? "border-emerald-500/30 bg-emerald-950/10"
                        : isRejected
                        ? "border-rose-500/20 opacity-60 bg-rose-950/5"
                        : "border-border/50 hover:border-border"
                    }`}
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {isPending && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(res.id);
                                  else next.delete(res.id);
                                  return next;
                                });
                              }}
                              className="mt-1"
                              data-testid={`select-resource-${res.id}`}
                            />
                          )}

                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono gap-1 capitalize px-1.5 py-0"
                              >
                                {getTypeIcon(res.type)}
                                {res.type || "article"}
                              </Badge>

                              {res.estimated_minutes && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {res.estimated_minutes} min
                                </span>
                              )}

                              {res.relevance !== null && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] font-mono px-1.5 py-0"
                                >
                                  {Math.round(res.relevance * 100)}% match
                                </Badge>
                              )}

                              {isApproved && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0"
                                >
                                  Approved
                                </Badge>
                              )}

                              {isRejected && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-rose-400 border-rose-500/30 bg-rose-500/10 px-1.5 py-0"
                                >
                                  Rejected
                                </Badge>
                              )}
                            </div>

                            <CardTitle className="text-sm font-semibold leading-snug">
                              <a
                                href={res.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline flex items-center gap-1.5 text-foreground group"
                                data-testid={`resource-external-link-${res.id}`}
                              >
                                {res.title || res.url}
                                <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors inline shrink-0" />
                              </a>
                            </CardTitle>

                            <CardDescription className="text-xs text-muted-foreground font-mono">
                              {res.domain}
                            </CardDescription>
                          </div>
                        </div>

                        {/* Resource Approval Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isPending && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleApprove(res.id)}
                                className="h-7 px-2.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30"
                                data-testid={`approve-resource-${res.id}`}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                Approve
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleReject(res.id, "not_useful")}
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-amber-400"
                                title="Not useful - exclude from future runs"
                                data-testid={`not-useful-${res.id}`}
                              >
                                <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                                Not useful
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleReject(res.id, "user_rejected")}
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-400"
                                title="Reject"
                                data-testid={`reject-resource-${res.id}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    {/* Provenance Footer */}
                    <CardContent className="p-4 pt-1">
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground/80 flex-wrap bg-muted/20 px-2.5 py-1.5 rounded border border-border/20">
                        {res.found_by_query && (
                          <span className="flex items-center gap-1">
                            <Search className="h-3 w-3 text-muted-foreground" />
                            Query: &ldquo;{res.found_by_query}&rdquo;
                          </span>
                        )}

                        {res.search_provider && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            via {res.search_provider}
                          </span>
                        )}

                        {res.found_at && (
                          <span className="text-[10px] text-muted-foreground/60 ml-auto">
                            {new Date(res.found_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Dialog for Planner Re-run */}
      <Dialog open={showRerunPlannerDialog} onOpenChange={setShowRerunPlannerDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              Re-run Planner with Approved Resources?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              You have approved {approvedCountSession} new resource(s) that are attached to your
              skills. Re-running the planner will recalculate your daily study blocks and capacity.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRerunPlannerDialog(false)}
              className="text-xs h-8"
            >
              Keep Current Schedule
            </Button>
            <Button
              size="sm"
              onClick={handleRerunPlanner}
              disabled={isRerunningPlanner}
              className="text-xs h-8 bg-primary text-primary-foreground font-medium"
              data-testid="confirm-rerun-planner-btn"
            >
              {isRerunningPlanner ? "Recalculating..." : "Confirm & Re-run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
