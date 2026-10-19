"use client";

import * as React from "react";
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Send,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import Link from "next/link";
import { WeeklyStatsResult } from "@/lib/reminders/service";

const REASON_OPTIONS = [
  { id: "work_commitments", label: "Unexpected work or life commitments" },
  { id: "energy_fatigue", label: "Tired or low cognitive energy" },
  { id: "material_hard", label: "Material was harder than expected" },
  { id: "lost_focus", label: "Lost focus or procrastinated" },
  { id: "all_good", label: "Nothing got in the way – on track!" },
  { id: "other", label: "Other / Personal reasons" },
];

export function WeeklyCheckInContent({
  initialStats,
  onCompleted,
}: {
  initialStats?: WeeklyStatsResult;
  onCompleted?: () => void;
}) {
  const [stats, setStats] = React.useState<WeeklyStatsResult | null>(initialStats || null);
  const [loading, setLoading] = React.useState(!initialStats);
  const [selectedReason, setSelectedReason] = React.useState<string>("work_commitments");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!initialStats) {
      fetch("/api/v1/check-ins/weekly")
        .then((r) => r.json())
        .then((res) => {
          if (res.data) setStats(res.data);
        })
        .catch(() => {
          // Fallback demo stats
          setStats({
            plannedMinutes: 300,
            doneMinutes: 180,
            plannedHours: 5.0,
            doneHours: 3.0,
            completionRate: 0.6,
            missedCount: 1,
            adaptTriggered: false,
            startDate: "2026-10-13",
            endDate: "2026-10-19",
          });
        })
        .finally(() => setLoading(false));
    }
  }, [initialStats]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/check-ins/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: selectedReason,
          note: note.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to submit check-in");
      }

      setSubmitted(true);
      toast.success("Weekly reflection saved. Keep going!");
      if (onCompleted) onCompleted();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit reflection");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading weekly study summary...
      </div>
    );
  }

  const completionPercent = Math.min(
    100,
    Math.round((stats?.completionRate ?? (stats?.plannedMinutes ? (stats.doneMinutes / stats.plannedMinutes) : 1)) * 100)
  );

  return (
    <div className="space-y-6" data-testid="weekly-checkin-view">
      {/* 1. Planned vs Done Hours Header Card */}
      <Card className="border-border/60 bg-card/50 overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/30 bg-muted/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <CardTitle className="text-base font-semibold">Weekly Study Overview</CardTitle>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {stats?.startDate} &rarr; {stats?.endDate}
            </span>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            A calm look at planned versus completed study time over the last 7 days.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-center">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Planned
              </span>
              <span
                className="text-2xl font-bold font-mono text-foreground mt-0.5 block"
                data-testid="planned-hours-stat"
              >
                {stats?.plannedHours ?? 0}
                <span className="text-xs font-normal text-muted-foreground ml-1">hrs</span>
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">
                {stats?.plannedMinutes ?? 0} minutes
              </span>
            </div>

            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-center">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                Completed
              </span>
              <span
                className="text-2xl font-bold font-mono text-foreground mt-0.5 block"
                data-testid="done-hours-stat"
              >
                {stats?.doneHours ?? 0}
                <span className="text-xs font-normal text-muted-foreground ml-1">hrs</span>
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">
                {stats?.doneMinutes ?? 0} minutes
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-medium text-muted-foreground">Cadence Completion</span>
              <span className="font-mono font-medium text-foreground">{completionPercent}%</span>
            </div>
            <Progress value={completionPercent} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* 2. Adapt Prompt (if triggered) */}
      {stats?.adaptTriggered && (
        <Alert
          className="border-amber-500/30 bg-amber-500/10 text-foreground"
          data-testid="adapt-prompt-alert"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="space-y-2">
            <AlertTitle className="text-sm font-semibold text-amber-500">
              Adapt Prompt Triggered
            </AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
              {stats.adaptReason ||
                `You missed ${stats.missedCount} sessions or completed under 60% of planned minutes this week. Learnitt can gently adapt your schedule, extend your deadline, or reduce weekly volume.`}
            </AlertDescription>
            <div className="pt-1">
              <Link href="/plan?adapt=true">
                <Button
                  size="sm"
                  className="h-7 text-xs bg-amber-500 text-black hover:bg-amber-400 font-medium gap-1"
                  data-testid="adapt-schedule-btn"
                >
                  <Sparkles className="h-3 w-3" />
                  Adapt My Schedule
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </div>
        </Alert>
      )}

      {/* 3. Question: What got in the way? */}
      <Card className="border-border/60 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            One question: What got in the way this week?
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            No judgment or guilt copy. Identifying friction helps keep your schedule sustainable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-1">
          <div className="space-y-2" data-testid="checkin-reasons-group">
            {REASON_OPTIONS.map((opt) => {
              const selected = selectedReason === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedReason(opt.id)}
                  className={`w-full text-left p-3 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                    selected
                      ? "border-primary bg-primary/10 text-foreground font-medium"
                      : "border-border/40 bg-muted/10 text-muted-foreground hover:bg-muted/20"
                  }`}
                  data-testid={`reason-opt-${opt.id}`}
                >
                  <span>{opt.label}</span>
                  {selected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-foreground">
              Personal Reflection Note (optional)
            </label>
            <Textarea
              placeholder="What worked well? What could make next week easier?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[80px] text-xs bg-background"
              data-testid="reflection-note-input"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSubmit}
              disabled={submitting || submitted}
              className="h-9 px-5 text-xs font-medium gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              data-testid="submit-weekly-checkin-btn"
            >
              <Send className="h-3.5 w-3.5" />
              {submitted ? "Reflection Saved" : submitting ? "Saving..." : "Save Reflection"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
