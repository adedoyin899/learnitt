"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { db, DexieCheckIn, DexieTodayPayload, DexiePlanItem } from "@/lib/offline/db";
import { useOfflineSync } from "@/lib/offline/sync";
import { TodayResponse } from "@/app/api/v1/today/route";
import type { CheckInItem, OutcomeType } from "./check-in-drawer";

// Lazy-load drawer and session modals to keep initial Today JS bundle under 180 KB gzipped
const CheckInDrawer = dynamic(
  () => import("./check-in-drawer").then((mod) => mod.CheckInDrawer),
  { ssr: false }
);

const SessionView = dynamic(
  () => import("./session-view").then((mod) => mod.SessionView),
  { ssr: false }
);
import { EvidenceBadge } from "@/components/evidence/evidence-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Play,
  RotateCw,
  Sparkles,
  WifiOff,
  ArrowRight,
  Target,
  AlertTriangle,
  Lock,
  Plus,
  Layers,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface TodayClientProps {
  initialData?: TodayResponse | null;
}

export function TodayClient({ initialData }: TodayClientProps) {
  const [data, setData] = React.useState<TodayResponse | null>(initialData ?? null);
  const [isLoading, setIsLoading] = React.useState<boolean>(!initialData);
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);
  const [selectedGoalId, setSelectedGoalId] = React.useState<string>(initialData?.goal?.id || "");
  const [isActivatingGoal, setIsActivatingGoal] = React.useState<boolean>(false);
  const [_error, setError] = React.useState<string | null>(null);

  // Modal / Drawer states
  const [isCheckInOpen, setIsCheckInOpen] = React.useState<boolean>(false);
  const [isSessionOpen, setIsSessionOpen] = React.useState<boolean>(false);
  const [activeCheckInItem, setActiveCheckInItem] = React.useState<CheckInItem | null>(null);
  const [checkInInitialOutcome, setCheckInInitialOutcome] = React.useState<OutcomeType>("done");

  // Offline status & Outbox sync hook (PRD Section 10 & Phase L6)
  const { isOnline, pendingCount, isSyncing, statusText, syncNow } = useOfflineSync();

  // 1. Initial Load: Read from Dexie first (<1s first paint), then refresh from server
  React.useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        // Fast paint from Dexie cache if available
        const cached = await db.today_payload.get("current");
        if (cached && cached.payload && isMounted) {
          setData(cached.payload as unknown as TodayResponse);
          if ((cached.payload as any)?.goal?.id) {
            setSelectedGoalId((cached.payload as any).goal.id);
          }
          setIsLoading(false);
        }

        // Refresh from server
        await refreshServerData();
      } catch (err) {
        console.warn("Dexie read or background refresh error:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const refreshServerData = async (goalId?: string) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }
    setIsRefreshing(true);
    try {
      const targetId = goalId !== undefined ? goalId : selectedGoalId;
      const url = targetId ? `/api/v1/today?goal_id=${targetId}` : "/api/v1/today";
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const fresh: TodayResponse = await res.json();
        setData(fresh);
        if (fresh.goal?.id) {
          setSelectedGoalId(fresh.goal.id);
        }
        setError(null);

        // Mirror to Dexie for offline first paint and local cache
        const cacheEntry: DexieTodayPayload = {
          id: "current",
          date: fresh.date,
          payload: fresh as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        };
        await db.today_payload.put(cacheEntry);

        // Mirror active goal & plan items for offline query
        if (fresh.goal) {
          await db.goals.put({
            id: fresh.goal.id,
            title: fresh.goal.title,
            target_date: fresh.goal.target_date,
            weekly_hours: fresh.goal.weekly_hours,
            study_days: fresh.goal.study_days,
            status: "active",
            updated_at: new Date().toISOString(),
          });
        }

        if (fresh.upcoming_items && fresh.goal) {
          for (const item of fresh.upcoming_items) {
            await db.plan_items.put({
              id: item.id,
              goal_id: fresh.goal.id,
              skill_id: null,
              scheduled_date: item.scheduled_date,
              kind: item.kind as DexiePlanItem["kind"],
              planned_minutes: item.planned_minutes,
              mvd_minutes: 15,
              mvd_task: "MVD Task",
              status: "planned",
              position: 0,
              plan_version: 1,
            });
          }
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.error || "Failed to load latest plan");
      }
    } catch {
      // Offline network error is expected if disconnected
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectGoal = async (goalId: string) => {
    setSelectedGoalId(goalId);
    await refreshServerData(goalId);
  };

  const handleActivateGoal = async (goalId: string) => {
    setIsActivatingGoal(true);
    try {
      const res = await fetch(`/api/v1/goals/${goalId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archiveExisting: true }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to activate plan");
      }
      toast.success("Goal set as primary active plan.");
      await refreshServerData(goalId);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Could not activate goal.");
    } finally {
      setIsActivatingGoal(false);
    }
  };

  // Optimistic UI check-in callback
  const handleCheckInSaved = (checkIn: DexieCheckIn) => {
    if (!data) return;

    const isPlanned = checkIn.outcome === "done";
    const isMvd = isPlanned || checkIn.outcome === "mvd_only";

    const updatedData: TodayResponse = {
      ...data,
      is_planned_complete: isPlanned || data.is_planned_complete,
      is_mvd_complete: isMvd || data.is_mvd_complete,
      primary_item: data.primary_item
        ? {
            ...data.primary_item,
            status: checkIn.outcome,
            check_in: {
              id: checkIn.client_id,
              outcome: checkIn.outcome,
              minutes_actual: checkIn.minutes_actual ?? null,
              created_at: checkIn.created_at,
            },
          }
        : null,
      total_completed_minutes_today:
        (data.total_completed_minutes_today || 0) + (checkIn.minutes_actual || 0),
    };

    setData(updatedData);

    // Update Dexie today payload immediately
    db.today_payload.put({
      id: "current",
      date: updatedData.date,
      payload: updatedData as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    });
  };

  const handleOpenCheckInFor = (item: CheckInItem | null | undefined, defaultOutcome: OutcomeType = "done") => {
    if (!item) return;
    setActiveCheckInItem(item);
    setCheckInInitialOutcome(defaultOutcome);
    setIsCheckInOpen(true);
  };

  const handleStartSession = () => {
    if (data?.primary_item) {
      setActiveCheckInItem(data.primary_item);
      setIsSessionOpen(true);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto py-6 px-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    );
  }

  // Empty state: No Goal or No Plan exists
  if (!data || !data.has_goal) {
    return (
      <div className="max-w-2xl mx-auto py-10 px-4">
        <EmptyState
          icon={<Target className="size-5" />}
          title="No Active Learning Goal"
          description="Create a goal, set your weekly commitment, and Learnitt will build your personalized study path."
          action={
            <Link href="/goals/new">
              <Button size="default" className="text-xs font-semibold gap-1.5">
                <span>Setup Your First Goal</span>
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (!data.has_plan || (!data.primary_item && !data.review_item)) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-4">
        {/* Offline Status Line if disconnected */}
        {!isOnline && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WifiOff className="size-4 shrink-0" />
              <span>{statusText || "No signal. You are currently offline."}</span>
            </div>
          </div>
        )}

        <EmptyState
          icon={<Calendar className="size-5" />}
          title="No Study Plan Generated Yet"
          description={`Your goal "${data.goal?.title}" is ready, but no study plan items are scheduled.`}
          action={
            isOnline ? (
              <Link href={`/goals/${data.goal?.id}/graph`}>
                <Button size="default" className="text-xs font-semibold gap-1.5">
                  <span>Generate Study Plan</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Button disabled size="default" className="text-xs font-semibold gap-1.5 opacity-60">
                  <Lock className="size-3.5" />
                  <span>Generate Study Plan</span>
                </Button>
                <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="size-3 text-warning" />
                  Requires connection to generate AI plan
                </span>
              </div>
            )
          }
        />
      </div>
    );
  }

  const primary = data.primary_item;
  const review = data.review_item;
  const isMvdDone = data.is_mvd_complete;
  const isPlannedDone = data.is_planned_complete;

  return (
    <div className="max-w-2xl mx-auto py-4 px-4 sm:px-6 space-y-6">
      {/* 1. Offline & Sync Status Banner (Prompt Requirement 7 & PRD Section 10) */}
      {!isOnline ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-foreground flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <WifiOff className="size-4 text-warning shrink-0" />
            <span className="font-medium text-warning">
              {pendingCount > 0
                ? `No signal. ${pendingCount} change${pendingCount > 1 ? "s" : ""} will sync when you are back online.`
                : "No signal. You are currently offline."}
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-warning/20 text-warning uppercase">
            Offline
          </span>
        </div>
      ) : pendingCount > 0 ? (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs text-foreground flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCw className={cn("size-3.5 text-primary", isSyncing && "animate-spin")} />
            <span>
              {isSyncing
                ? `Syncing ${pendingCount} pending change${pendingCount > 1 ? "s" : ""}...`
                : `${pendingCount} change${pendingCount > 1 ? "s" : ""} ready to sync`}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => syncNow()}
            disabled={isSyncing}
            className="h-7 text-xs px-2 text-primary hover:bg-primary/20"
          >
            Sync now
          </Button>
        </div>
      ) : null}

      {/* Multi-Goal Plan Switcher */}
      {data.goals && data.goals.length > 0 && (
        <div className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur p-3.5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-semibold">
              <Target className="size-3.5 text-primary" />
              <span>Learning Plans ({data.goals.length})</span>
            </span>
            <div className="flex items-center gap-2">
              <Link
                href="/goals/new"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="size-3" />
                <span>New Goal</span>
              </Link>
              <span className="text-border">·</span>
              <Link
                href="/settings?tab=goals"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Manage
              </Link>
            </div>
          </div>

          {/* Goal Selector Chips */}
          <div
            className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none"
            role="tablist"
            aria-label="Learning Plans"
          >
            {data.goals.map((g) => {
              const isSelected = g.id === (data.goal?.id || selectedGoalId);
              const isActivePlan = g.status === "active";
              return (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => handleSelectGoal(g.id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all shrink-0 select-none",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30"
                      : "border-border/70 bg-background/60 hover:bg-background hover:border-border text-muted-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "size-2 rounded-full shrink-0",
                      isActivePlan
                        ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                        : "bg-amber-500/80"
                    )}
                  />
                  <div className="flex flex-col min-w-0">
                    <span
                      className={cn(
                        "text-xs font-semibold leading-tight truncate max-w-[150px] sm:max-w-[200px]",
                        isSelected ? "text-foreground" : "text-foreground/80"
                      )}
                    >
                      {g.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {g.weekly_hours}h/wk {isActivePlan ? "· Active Focus" : "· Paused"}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Quick Add Plan Button */}
            <Link
              href="/goals/new"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border/80 bg-background/40 hover:bg-background hover:border-primary/50 text-muted-foreground hover:text-foreground transition-all shrink-0 text-xs font-medium"
            >
              <Plus className="size-3.5" />
              <span>Add Goal</span>
            </Link>
          </div>

          {/* Prompt to set as primary if viewing a non-active goal */}
          {data.goal && data.goal.status !== "active" && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-600 dark:text-amber-400">
              <span>
                Viewing plan for <strong>{data.goal.title}</strong>. Set as primary active plan for daily reminders and notifications?
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={isActivatingGoal}
                onClick={() => handleActivateGoal(data.goal!.id)}
                className="h-7 text-xs border-amber-500/30 text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 shrink-0 self-end sm:self-auto"
              >
                {isActivatingGoal ? "Activating..." : "Set as Primary"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 2. Top Header & Active Goal Summary */}
      <div className="flex items-center justify-between border-b border-border/50 pb-3">
        <div>
          <span className="text-[11px] font-mono tracking-wider uppercase text-muted-foreground">
            Today · {data.date}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Daily Learning Loop
          </h1>
        </div>

        {/* Refresh button when online */}
        {isOnline && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void refreshServerData()}
            disabled={isRefreshing}
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Refresh today plan"
          >
            <RotateCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
          </Button>
        )}
      </div>

      {/* 3. Progress Card & Status Badges */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-foreground">
              {data.goal?.title}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <span>{data.goal?.weekly_hours} hrs/wk</span>
              <span>·</span>
              <span>Target: {data.goal?.target_date}</span>
            </div>
          </div>

          {/* Completion Badges (Requirement 3: Show MVD complete separately from planned complete) */}
          <div className="flex flex-col items-end gap-1.5">
            {isPlannedDone ? (
              <Badge variant="success" className="gap-1 font-mono text-[11px]">
                <CheckCircle2 className="size-3" />
                Planned complete
              </Badge>
            ) : isMvdDone ? (
              <Badge variant="brand" className="gap-1 font-mono text-[11px]">
                <Sparkles className="size-3" />
                MVD complete
              </Badge>
            ) : (
              <Badge variant="outline" className="font-mono text-[11px] text-muted-foreground">
                Incomplete
              </Badge>
            )}

            {isPlannedDone && (
              <span className="text-[10px] font-mono text-muted-foreground">
                MVD also fulfilled
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <Progress
            value={data.total_completed_minutes_today}
            max={data.total_planned_minutes_today || 60}
            label="Today's Study Time"
            valueLabel={`${data.total_completed_minutes_today} of ${data.total_planned_minutes_today} min`}
            size="default"
          />
        </div>
      </div>

      {/* 4. One Primary Action Button (Prompt Requirement 1) */}
      <div>
        {!isPlannedDone ? (
          <Button
            size="lg"
            onClick={handleStartSession}
            className="w-full h-12 text-sm font-semibold gap-2 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all"
          >
            <Play className="size-4 fill-current" />
            <span>
              {isMvdDone ? "Continue Full Session" : "Start Today's Session"}
            </span>
          </Button>
        ) : (
          <Button
            size="lg"
            variant="outline"
            onClick={() => handleOpenCheckInFor(primary, "done")}
            className="w-full h-12 text-sm font-semibold gap-2 border-success/40 bg-success/5 hover:bg-success/10 text-success"
          >
            <CheckCircle2 className="size-4" />
            <span>Planned Session Completed — Update Check-in</span>
          </Button>
        )}
      </div>

      {/* 5. Task Rows (Prompt Requirement 1 & Screen S08) */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Today&apos;s Scheduled Tasks
        </h2>

        {/* Primary Session Task Row */}
        {primary && (
          <div
            className={cn(
              "rounded-xl border p-4 transition-all space-y-3",
              isPlannedDone
                ? "border-success/30 bg-success/5"
                : isMvdDone
                  ? "border-brand/30 bg-brand/5"
                  : "border-border/80 bg-card hover:border-border"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-surface border border-border/60 text-primary font-semibold">
                    Primary {primary.kind}
                  </span>
                  {primary.status === "done" && (
                    <span className="text-[10px] font-mono text-success flex items-center gap-0.5 font-medium">
                      <CheckCircle2 className="size-3" /> Done
                    </span>
                  )}
                  {primary.status === "mvd_only" && (
                    <span className="text-[10px] font-mono text-brand flex items-center gap-0.5 font-medium">
                      <Sparkles className="size-3" /> MVD Done
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-semibold text-foreground tracking-tight truncate">
                    {primary.skill_name}
                  </h3>
                  <EvidenceBadge level={(primary.evidence_level as any) || 0} />
                </div>

                {/* MVD Dose information */}
                <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
                  <div className="flex items-center gap-3 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      Plan: {primary.planned_minutes} min
                    </span>
                    <span className="flex items-center gap-1 text-brand">
                      <Sparkles className="size-3" />
                      MVD: {primary.mvd_minutes} min
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/90 italic pt-0.5 line-clamp-2">
                    MVD dose: {primary.mvd_task}
                  </p>
                </div>
              </div>

              {/* Action buttons on row */}
              <div className="flex flex-col gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenCheckInFor(primary, isPlannedDone ? "done" : "mvd_only")}
                  className="h-8 text-xs px-2.5 gap-1.5"
                >
                  <CheckCircle2 className="size-3.5" />
                  <span>Check In</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleStartSession}
                  className="h-8 text-xs px-2.5 text-muted-foreground hover:text-foreground"
                >
                  Launch
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Review Block Task Row (Prompt Requirement 1) */}
        {review && (
          <div className="rounded-xl border border-border/80 bg-card p-4 transition-all space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-surface border border-border/60 text-warning font-semibold">
                    Spaced Review
                  </span>
                  {review.status === "done" && (
                    <span className="text-[10px] font-mono text-success flex items-center gap-0.5 font-medium">
                      <CheckCircle2 className="size-3" /> Done
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm sm:text-base font-semibold text-foreground tracking-tight truncate">
                    {review.skill_name}
                  </h3>
                  <EvidenceBadge level={(review.evidence_level as any) || 0} />
                </div>

                <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" />
                  Planned: {review.planned_minutes} min
                </span>
              </div>

              <div className="flex flex-col gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenCheckInFor(review, "done")}
                  className="h-8 text-xs px-2.5 gap-1.5"
                >
                  <CheckCircle2 className="size-3.5" />
                  <span>Review Check-in</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. Network-dependent actions note (PRD Section 10: "Actions that need the network are disabled with a reason, not hidden") */}
      <div className="rounded-xl border border-border/50 bg-surface/30 p-4 space-y-2 text-xs">
        <span className="text-muted-foreground font-medium">Next actions</span>
        <div className="flex flex-wrap gap-2">
          {isOnline ? (
            <Link href="/plan">
              <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5">
                <Calendar className="size-3.5" />
                <span>Full Study Plan</span>
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled
              className="h-8 text-xs opacity-50 gap-1.5 cursor-not-allowed"
              title="Requires connection"
            >
              <Lock className="size-3.5" />
              <span>Full Study Plan (offline)</span>
            </Button>
          )}

          {isOnline ? (
            <Link href={`/goals/${data.goal?.id}/graph`}>
              <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5">
                <Target className="size-3.5" />
                <span>Skill Graph</span>
              </Button>
            </Link>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled
              className="h-8 text-xs opacity-50 gap-1.5 cursor-not-allowed"
              title="Requires connection"
            >
              <Lock className="size-3.5" />
              <span>Skill Graph (offline)</span>
            </Button>
          )}
        </div>
      </div>

      {/* Check-in Sheet Drawer (Screen S09) */}
      <CheckInDrawer
        open={isCheckInOpen}
        onOpenChange={setIsCheckInOpen}
        item={activeCheckInItem}
        initialOutcome={checkInInitialOutcome}
        onCheckInSaved={handleCheckInSaved}
      />

      {/* Session View (Viewer & Optional passive timer) */}
      <SessionView
        open={isSessionOpen}
        onOpenChange={setIsSessionOpen}
        item={activeCheckInItem}
        material={primary?.material}
        resourceUrl={primary?.resource_url}
        onOpenCheckIn={() => {
          setIsSessionOpen(false);
          setIsCheckInOpen(true);
        }}
      />
    </div>
  );
}
