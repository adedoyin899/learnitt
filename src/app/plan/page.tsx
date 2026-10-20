"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  Clock,
  Layers,
  RotateCcw,
  Sparkles,
  Zap,
  Plus,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdaptSheet } from "@/components/plan/adapt-sheet";
import { AdaptProposal, PlannedItem } from "@/lib/planner/types";

// Lazy-loaded Gantt week view component (Prompt Requirement 6)
const LazyPlanGantt = dynamic(() => import("@/components/plan/plan-gantt"), {
  ssr: false,
  loading: () => (
    <div className="space-y-3 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  ),
});

interface GoalSummary {
  id: string;
  title: string;
  target_date: string;
  weekly_hours: number;
}

function PlanPageInner() {
  const searchParams = useSearchParams();
  const goalIdParam = searchParams.get("goal_id");

  const [goals, setGoals] = React.useState<GoalSummary[]>([]);
  const [selectedGoalId, setSelectedGoalId] = React.useState<string>(goalIdParam || "");
  const [items, setItems] = React.useState<PlannedItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);

  // Adapt status state
  const [adaptTriggered, setAdaptTriggered] = React.useState(false);
  const [adaptReason, setAdaptReason] = React.useState("You missed 2 sessions this week. Pick how to catch up.");
  const [adaptProposals, setAdaptProposals] = React.useState<AdaptProposal[]>([]);
  const [isAdaptOpen, setIsAdaptOpen] = React.useState(false);

  // Reschedule confirmation modal state
  const [rescheduleConfirmOpen, setRescheduleConfirmOpen] = React.useState(false);
  const [itemToReschedule, setItemToReschedule] = React.useState<PlannedItem | null>(null);
  const [rescheduleNotice, setRescheduleNotice] = React.useState<string>("");

  const loadGoals = React.useCallback(async () => {
    try {
      const res = await fetch("/api/v1/goals");
      if (!res.ok) return;
      const data = await res.json();
      const list = data.goals || [];
      setGoals(list);
      if (list.length > 0) {
        if (goalIdParam && list.some((g: any) => g.id === goalIdParam)) {
          setSelectedGoalId(goalIdParam);
        } else if (!selectedGoalId) {
          const active = list.find((g: any) => g.status === "active");
          setSelectedGoalId(active ? active.id : list[0].id);
        }
      }
    } catch {
      // Fallback
    }
  }, [selectedGoalId, goalIdParam]);

  const loadPlan = React.useCallback(async (goalId: string) => {
    if (!goalId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/plan?goal_id=${goalId}`);
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = await res.json();
      setItems(data.items || []);

      if (data.adapt_status) {
        setAdaptTriggered(Boolean(data.adapt_status.triggered));
        if (data.adapt_status.reason) {
          setAdaptReason(data.adapt_status.reason);
        }
        if (data.adapt_status.proposals) {
          setAdaptProposals(data.adapt_status.proposals);
        }
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  React.useEffect(() => {
    if (selectedGoalId) {
      loadPlan(selectedGoalId);
    }
  }, [selectedGoalId, loadPlan]);

  const handleGeneratePlan = async () => {
    if (!selectedGoalId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/v1/goals/${selectedGoalId}/plan/generate`, {
        method: "POST",
      });
      if (res.ok) {
        await loadPlan(selectedGoalId);
      }
    } catch {
      // Handle error
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkMissed = async (item: PlannedItem) => {
    if (!item.id) return;
    // Update local state and trigger check-in
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, status: "missed" } : it))
    );

    // Also check if this missed item triggers adapt prompt
    const newItems = items.map((it) =>
      it.id === item.id ? { ...it, status: "missed" as const } : it
    );
    const missedIn7Days = newItems.filter(
      (it) => it.status === "missed"
    ).length;

    if (missedIn7Days >= 2) {
      setAdaptTriggered(true);
      setAdaptReason("You missed 2 sessions this week. Pick how to catch up.");
    }
  };

  const handleReschedule = async (item: PlannedItem, confirmed = false) => {
    if (!item.id) return;
    try {
      const res = await fetch("/api/v1/plan/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_item_id: item.id,
          confirmed_exceed_weekly_hours: confirmed,
        }),
      });

      const data = await res.json();

      if (data.trigger_adapt) {
        setAdaptTriggered(true);
        if (data.reason) setAdaptReason(data.reason);
        setIsAdaptOpen(true);
        return;
      }

      if (data.requires_confirmation) {
        setItemToReschedule(item);
        setRescheduleNotice(data.reason);
        setRescheduleConfirmOpen(true);
        return;
      }

      if (data.success) {
        setRescheduleConfirmOpen(false);
        setItemToReschedule(null);
        await loadPlan(selectedGoalId);
      }
    } catch {
      // Error handling
    }
  };

  // Group items by scheduled_date
  const itemsByDay = React.useMemo(() => {
    const map = new Map<string, PlannedItem[]>();
    for (const it of items) {
      if (it.status === "unscheduled") continue;
      const list = map.get(it.scheduled_date) || [];
      list.push(it);
      map.set(it.scheduled_date, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const unscheduledItems = React.useMemo(() => {
    return items.filter((it) => it.status === "unscheduled");
  }, [items]);

  return (
    <div className="flex-1 w-full bg-background text-foreground flex flex-col">
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Top Header */}
        <PageHeader
          title="Study Plan"
          description="Your adaptive day-by-day learning schedule grounded in prerequisites and weekly capacity."
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {goals.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground font-mono">Plan:</span>
                  <select
                    value={selectedGoalId}
                    onChange={(e) => setSelectedGoalId(e.target.value)}
                    className="bg-card border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium max-w-[160px] sm:max-w-[260px] truncate"
                  >
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Link href="/goals/new">
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-primary">
                  <Plus className="size-3.5" />
                  <span>New Goal</span>
                </Button>
              </Link>
              {items.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGeneratePlan}
                  disabled={generating}
                >
                  <RotateCcw className="size-3.5 mr-1.5" />
                  {generating ? "Re-generating..." : "Regenerate"}
                </Button>
              )}
            </div>
          }
        />

        {/* Adapt Prompt Banner (Prompt Requirement 6) */}
        {adaptTriggered && (
          <Alert variant="warning" className="border-amber-500/40 bg-amber-500/10">
            <AlertCircle className="size-4 text-amber-500" />
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <AlertTitle className="text-amber-400 font-semibold">
                  Schedule Adaptation Needed
                </AlertTitle>
                <AlertDescription className="text-amber-200/90 text-sm">
                  {adaptReason}
                </AlertDescription>
              </div>
              <Button
                size="sm"
                className="bg-amber-500 text-black hover:bg-amber-400 font-medium shrink-0"
                onClick={() => setIsAdaptOpen(true)}
              >
                <Sparkles className="size-3.5 mr-1.5" />
                Adapt Plan
              </Button>
            </div>
          </Alert>
        )}

        {/* Empty State when no items exist */}
        {!loading && items.length === 0 ? (
          <Card className="p-12 text-center">
            <EmptyState
              title="No study plan generated yet"
              description="Generate your deterministic schedule based on your goal's weekly hours and skill graph prerequisites."
              action={
                <Button onClick={handleGeneratePlan} disabled={generating || !selectedGoalId}>
                  <Sparkles className="size-4 mr-2" />
                  {generating ? "Generating Plan..." : "Generate Study Plan"}
                </Button>
              }
            />
          </Card>
        ) : (
          /* Main Views: Tabs between Day List and Week View */
          <Tabs defaultValue="days" className="space-y-4">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="days">
                  <Layers className="size-3.5 mr-1.5" />
                  Day List
                </TabsTrigger>
                <TabsTrigger value="week">
                  <Calendar className="size-3.5 mr-1.5" />
                  Week View (Gantt)
                </TabsTrigger>
              </TabsList>

              <div className="text-xs font-mono text-muted-foreground">
                {items.length} sessions planned
              </div>
            </div>

            {/* TAB 1: Day List (Task Rows) */}
            <TabsContent value="days" className="space-y-6">
              {itemsByDay.map(([dayDate, dayItems]) => {
                const totalMinutes = dayItems.reduce((acc, it) => acc + it.planned_minutes, 0);

                return (
                  <div key={dayDate} className="space-y-2.5">
                    {/* Day Header */}
                    <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          {new Date(dayDate + "T00:00:00").toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          ({dayDate})
                        </span>
                      </div>
                      <Badge variant="secondary" className="font-mono text-xs">
                        <Clock className="size-3 mr-1" />
                        {totalMinutes} min
                      </Badge>
                    </div>

                    {/* Task Rows for this day */}
                    <div className="space-y-2">
                      {dayItems.map((item) => (
                        <div
                          key={item.id || `${item.scheduled_date}-${item.position}`}
                          className={`rounded-lg border p-3.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            item.status === "missed"
                              ? "border-destructive/40 bg-destructive/5"
                              : item.status === "rescheduled"
                              ? "border-amber-500/30 bg-amber-500/5"
                              : item.kind === "review"
                              ? "border-purple-500/30 bg-purple-500/5"
                              : "border-border/80 bg-card hover:border-primary/40"
                          }`}
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant={
                                  item.kind === "review"
                                    ? "default"
                                    : item.kind === "quiz"
                                    ? "secondary"
                                    : "outline"
                                }
                                className="text-[10px] uppercase font-mono tracking-wider"
                              >
                                {item.kind}
                              </Badge>

                              {item.status !== "planned" && (
                                <Badge
                                  variant={
                                    item.status === "missed"
                                      ? "destructive"
                                      : item.status === "rescheduled"
                                      ? "warning"
                                      : "secondary"
                                  }
                                  className="text-[10px]"
                                >
                                  {item.status}
                                </Badge>
                              )}

                              <span className="font-medium text-sm text-foreground truncate">
                                {item.skill_name || "Session"}
                              </span>
                            </div>

                            {/* MVD Snippet (PRD 5.2 Step 5) */}
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                              <Zap className="size-3 text-amber-400 shrink-0" />
                              <span className="text-amber-400/90 font-medium">
                                MVD ({item.mvd_minutes}m):
                              </span>
                              <span className="truncate">{item.mvd_task}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.planned_minutes}m
                            </span>

                            {item.status === "planned" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs h-7 text-muted-foreground hover:text-destructive"
                                onClick={() => handleMarkMissed(item)}
                              >
                                Mark Missed
                              </Button>
                            )}

                            {(item.status === "missed" || item.status === "rescheduled") && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => handleReschedule(item)}
                              >
                                Reschedule
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Unscheduled Tail (PRD 5.2 Step 6) */}
              {unscheduledItems.length > 0 && (
                <div className="mt-8 pt-6 border-t border-dashed border-border/80">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="destructive" className="text-xs">
                      Unscheduled Tail ({unscheduledItems.length})
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Work exceeding capacity before target date.
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {unscheduledItems.map((u, i) => (
                      <div
                        key={i}
                        className="rounded border border-destructive/30 bg-destructive/5 p-2.5 text-xs flex justify-between items-center"
                      >
                        <span className="font-medium">{u.skill_name}</span>
                        <span className="font-mono text-muted-foreground">
                          {u.planned_minutes}m
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* TAB 2: Week View (Gantt, Lazy Loaded) */}
            <TabsContent value="week">
              <LazyPlanGantt items={items} />
            </TabsContent>
          </Tabs>
        )}

        {/* S17 Adapt Sheet Modal */}
        <AdaptSheet
          open={isAdaptOpen}
          onOpenChange={setIsAdaptOpen}
          goalId={selectedGoalId}
          reason={adaptReason}
          proposals={adaptProposals}
          onAdapted={() => loadPlan(selectedGoalId)}
        />

        {/* Reschedule Confirmation Dialog (Weekly Hours Exceeded) */}
        <Dialog open={rescheduleConfirmOpen} onOpenChange={setRescheduleConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="size-5 text-amber-500" />
                Confirm Weekly Overload
              </DialogTitle>
              <DialogDescription>
                {rescheduleNotice}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRescheduleConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  if (itemToReschedule) {
                    handleReschedule(itemToReschedule, true);
                  }
                }}
              >
                Confirm &amp; Overload Week
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

export default function PlanPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-6 text-xs text-muted-foreground">
          Loading plan...
        </div>
      }
    >
      <PlanPageInner />
    </React.Suspense>
  );
}
