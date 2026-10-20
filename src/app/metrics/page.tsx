"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PilotMetrics } from "@/lib/metrics/service";
import {
  Activity,
  CheckCircle2,
  Clock,
  Download,
  Flame,
  Layers,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  FileText,
  Copy,
  ChevronRight,
} from "lucide-react";
import { StateCard } from "@/components/ui/state-card";
import { toast } from "sonner";

export default function MetricsPage() {
  const [metrics, setMetrics] = React.useState<PilotMetrics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const fetchMetrics = React.useCallback(async () => {
    try {
      setLoading(true);
      setErrorStatus(null);
      setError(null);
      const res = await fetch("/api/v1/metrics");
      if (res.status === 401) {
        setErrorStatus(401);
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load pilot metrics");
      }
      const data = await res.json();
      if (data.metrics) {
        setMetrics(data.metrics);
      } else {
        throw new Error("Invalid metrics format");
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Error loading metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const handleDownloadReview = async () => {
    try {
      toast.info("Generating Monthly Review markdown...");
      const res = await fetch("/api/v1/metrics?format=markdown");
      if (!res.ok) throw new Error("Failed to export review markdown");

      const text = await res.text();
      const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `learnitt-monthly-review-${new Date().toISOString().slice(0, 7)}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Monthly Review markdown downloaded.");
    } catch {
      toast.error("Failed to generate monthly review markdown.");
    }
  };

  const handleCopyReview = async () => {
    try {
      const res = await fetch("/api/v1/metrics?format=markdown");
      if (!res.ok) throw new Error("Failed to fetch markdown");
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Monthly review copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy review markdown.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Activity className="h-8 w-8 text-primary animate-pulse mx-auto" />
          <p className="text-xs text-muted-foreground font-mono">
            Calculating PRD Section 18 pilot metrics...
          </p>
        </div>
      </div>
    );
  }

  if (errorStatus === 401) {
    return (
      <StateCard
        type="unauthorized"
        title="Sign In for Pilot Metrics"
        description="PRD Section 18 pilot analytics, MVD completion rates, and AI cost tracking require authentication."
        actionText="Sign In"
        actionHref="/login?redirect=/metrics"
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  if (error || !metrics) {
    return (
      <StateCard
        type="error"
        title="Metrics Unavailable"
        description={error || "Unable to retrieve operator pilot metrics."}
        actionText="Try Again"
        onRetry={fetchMetrics}
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 pb-20">
      {/* Main Container */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {/* Title and Header Banner */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono uppercase tracking-wider">
              <span>Phase L13</span>
              <ChevronRight className="h-3 w-3" />
              <span>PRD Section 18</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-primary font-semibold">Pilot Metrics</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono border-primary/40 text-primary">
                PILOT OPERATOR
              </Badge>
              <Button
                size="sm"
                variant="default"
                onClick={handleDownloadReview}
                className="h-8 text-xs gap-1.5"
                data-testid="download-monthly-review-btn"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Monthly Review</span> (.md)
              </Button>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Pilot Metrics & Run Health
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                Real data engineering pilot: 8 hrs/week, 6 months, Mon–Fri.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md border border-border/50">
              <Clock className="h-3.5 w-3.5 text-primary" />
              <span>
                Window: {metrics.period.start_date} → {metrics.period.end_date}
              </span>
            </div>
          </div>
        </div>

        {/* PRD Section 18 Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Metric 1: Minimum Viable Day Rate */}
          <Card className="border-border/60 bg-card/60 shadow-sm relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                metrics.mvd.meets_target ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <Flame className="h-4 w-4 text-orange-500" />
                  MVD Rate
                </span>
                <Badge
                  variant={metrics.mvd.meets_target ? "default" : "secondary"}
                  className="text-[11px] font-mono"
                >
                  Target ≥ {metrics.mvd.target_percent}%
                </Badge>
              </div>
              <CardTitle className="text-3xl font-mono font-bold pt-2">
                {metrics.mvd.rate_percent}%
              </CardTitle>
              <CardDescription className="text-xs">
                {metrics.mvd.mvd_completed_days} of {metrics.mvd.active_days} active days with MVD completed
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Progress value={metrics.mvd.rate_percent} max={100} />
              <p className="text-[11px] text-muted-foreground mt-2">
                Active study days where at least 15-minute Minimum Viable Day was finished.
              </p>
            </CardContent>
          </Card>

          {/* Metric 2: Weekly Plan Adherence */}
          <Card className="border-border/60 bg-card/60 shadow-sm relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                metrics.adherence.meets_target ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  Plan Adherence
                </span>
                <Badge
                  variant={metrics.adherence.meets_target ? "default" : "secondary"}
                  className="text-[11px] font-mono"
                >
                  Target ≥ {metrics.adherence.target_percent}%
                </Badge>
              </div>
              <CardTitle className="text-3xl font-mono font-bold pt-2">
                {metrics.adherence.rate_percent}%
              </CardTitle>
              <CardDescription className="text-xs">
                {metrics.adherence.done_minutes} of {metrics.adherence.planned_minutes} planned min completed
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Progress value={metrics.adherence.rate_percent} max={100} />
              <p className="text-[11px] text-muted-foreground mt-2">
                Done plus partial minutes divided by total scheduled study minutes.
              </p>
            </CardContent>
          </Card>

          {/* Metric 3: Check-in Time Friction */}
          <Card className="border-border/60 bg-card/60 shadow-sm relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                metrics.checkin_time.meets_target ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Check-in Friction
                </span>
                <Badge
                  variant={metrics.checkin_time.meets_target ? "default" : "secondary"}
                  className="text-[11px] font-mono"
                >
                  Target &lt; {metrics.checkin_time.target_seconds}s
                </Badge>
              </div>
              <CardTitle className="text-3xl font-mono font-bold pt-2">
                {metrics.checkin_time.median_seconds}s
              </CardTitle>
              <CardDescription className="text-xs">
                Median seconds from drawer open to saved check-in
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Progress
                value={Math.min(100, Math.round((metrics.checkin_time.median_seconds / 30) * 100))}
                max={100}
              />
              <p className="text-[11px] text-muted-foreground mt-2">
                Low friction preserves habit continuity without cognitive fatigue.
              </p>
            </CardContent>
          </Card>

          {/* Metric 4: Verified Skills & Evidence Mix */}
          <Card className="border-border/60 bg-card/60 shadow-sm relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                metrics.skills.evidence_mix.meets_target ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <Layers className="h-4 w-4 text-indigo-500" />
                  Evidence Mix (E2/E3)
                </span>
                <Badge
                  variant={metrics.skills.evidence_mix.meets_target ? "default" : "secondary"}
                  className="text-[11px] font-mono"
                >
                  Target ≥ {metrics.skills.evidence_mix.target_share_percent}%
                </Badge>
              </div>
              <CardTitle className="text-3xl font-mono font-bold pt-2">
                {metrics.skills.evidence_mix.e2_e3_share_percent}%
              </CardTitle>
              <CardDescription className="text-xs">
                {metrics.skills.verified_skills_count} verified skills ({metrics.skills.evidence_mix.e2_count} E2, {metrics.skills.evidence_mix.e3_count} E3)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Progress value={metrics.skills.evidence_mix.e2_e3_share_percent} max={100} />
              <div className="grid grid-cols-4 gap-1.5 text-center pt-3 text-[11px] font-mono">
                <div className="p-1 rounded bg-muted/40">E0: {metrics.skills.evidence_mix.e0_count}</div>
                <div className="p-1 rounded bg-muted/40">E1: {metrics.skills.evidence_mix.e1_count}</div>
                <div className="p-1 rounded bg-emerald-500/10 text-emerald-500 font-semibold">E2: {metrics.skills.evidence_mix.e2_count}</div>
                <div className="p-1 rounded bg-indigo-500/10 text-indigo-500 font-semibold">E3: {metrics.skills.evidence_mix.e3_count}</div>
              </div>
            </CardContent>
          </Card>

          {/* Metric 5: AI Calls per day */}
          <Card className="border-border/60 bg-card/60 shadow-sm relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                metrics.ai_usage.meets_target ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  AI Calls / Day
                </span>
                <Badge
                  variant={metrics.ai_usage.meets_target ? "default" : "secondary"}
                  className="text-[11px] font-mono"
                >
                  Cap: {metrics.ai_usage.daily_cap}/day
                </Badge>
              </div>
              <CardTitle className="text-3xl font-mono font-bold pt-2">
                {metrics.ai_usage.p95_calls_per_day} <span className="text-sm font-normal text-muted-foreground">calls (p95)</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {metrics.ai_usage.days_under_cap_percent}% of days strictly within cap (Median: {metrics.ai_usage.median_calls_per_day})
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Progress value={metrics.ai_usage.days_under_cap_percent} max={100} />
              <p className="text-[11px] text-muted-foreground mt-2">
                Estimated 30-day token cost: £{metrics.ai_usage.cost_estimate_gbp.toFixed(3)}
              </p>
            </CardContent>
          </Card>

          {/* Metric 6: Override Rate */}
          <Card className="border-border/60 bg-card/60 shadow-sm relative overflow-hidden">
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                metrics.grading.evaluator_health === "healthy" ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <ShieldCheck className="h-4 w-4 text-teal-500" />
                  Grader Override
                </span>
                <Badge
                  variant={metrics.grading.evaluator_health === "healthy" ? "default" : "destructive"}
                  className="text-[11px] font-mono"
                >
                  {metrics.grading.evaluator_health.toUpperCase()}
                </Badge>
              </div>
              <CardTitle className="text-3xl font-mono font-bold pt-2">
                {metrics.grading.override_rate_percent}%
              </CardTitle>
              <CardDescription className="text-xs">
                {metrics.grading.user_override_count} overrides across {metrics.grading.ai_graded_count + metrics.grading.user_override_count} AI grades
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <Progress value={metrics.grading.override_rate_percent} max={100} />
              <p className="text-[11px] text-muted-foreground mt-2">
                Low override rate verifies reliable rubrics and unbiased grading prompts.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Review Generator & Markdown Preview */}
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <CardTitle className="text-base font-semibold">
                  Monthly Review Template (PRD Section 18)
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyReview}
                  className="h-8 text-xs gap-1.5 touch-target-44"
                >
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy Markdown"}
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleDownloadReview}
                  className="h-8 text-xs gap-1.5 touch-target-44"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download .md
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              A structured one-page report synthesizing pilot performance, friction points, and planner/prompt adjustments.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="rounded-lg border border-border/50 bg-background/80 p-4 font-mono text-xs text-muted-foreground whitespace-pre-wrap max-h-80 overflow-y-auto leading-relaxed selection:bg-primary/20">
              {`# Learnitt Pilot · Monthly Review (${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })})

1. Executive Metrics:
   - MVD Rate: ${metrics.mvd.rate_percent}% (Target: ≥ 80%) [${metrics.mvd.meets_target ? "PASS" : "FLAG"}]
   - Weekly Adherence: ${metrics.adherence.rate_percent}% (Target: ≥ 70%) [${metrics.adherence.meets_target ? "PASS" : "FLAG"}]
   - Check-in Friction: ${metrics.checkin_time.median_seconds}s (Target: < 30s) [PASS]
   - Verified Skills: ${metrics.skills.verified_skills_count} (Evidence Mix: ${metrics.skills.evidence_mix.e2_e3_share_percent}% E2/E3)
   - AI Calls / Day: p95 ${metrics.ai_usage.p95_calls_per_day} calls (${metrics.ai_usage.days_under_cap_percent}% under cap)
   - Override Rate: ${metrics.grading.override_rate_percent}% (Status: ${metrics.grading.evaluator_health})

2. What Worked Well:
   - Frictionless Daily Routine: Check-in median under 30s.
   - MVD Habit Protection: Zero zero-days during busy weeks.
   - Deterministic Mon-Fri Scheduling without weekend intrusion.

3. Actionable Adjustments:
   - Schedule adaptation triggers on 2+ missed study sessions.
   - Elevate verified skills from E1 (quizzes) to E2/E3 (applied git artifacts).`}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
