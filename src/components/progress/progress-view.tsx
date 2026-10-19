"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ProgressDataPayload } from "@/lib/progress/stats";
import { EvidenceGauge } from "./evidence-gauge";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Flame,
  Clock,
  RotateCcw,
  Sparkles,
  ArrowRight,
  PauseCircle,
  PlayCircle,
} from "lucide-react";

// Lazy-load TimeSeriesChart for performance and bundle splitting
const TimeSeriesChart = dynamic(
  () => import("./charts/time-series-chart"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-72 bg-card border border-border/80 rounded-xl p-6 flex flex-col justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-44 w-full" />
      </div>
    ),
  }
);

export interface ProgressViewProps {
  initialData: ProgressDataPayload;
}

export function ProgressView({ initialData }: ProgressViewProps) {
  const [data, setData] = React.useState<ProgressDataPayload>(initialData);

  const {
    verified_skills_over_time,
    planned_vs_done_minutes_per_week,
    mvd_streak,
    evidence_mix,
    skills_due_for_review,
    total_skills,
    verified_skills_count,
    plain_summary,
  } = data;

  const verifiedPercent =
    total_skills > 0 ? Math.round((verified_skills_count / total_skills) * 100) : 0;

  const currentWeek =
    planned_vs_done_minutes_per_week[planned_vs_done_minutes_per_week.length - 1];

  const handleRestartStreak = () => {
    // Allows user to reset or resume paused streak without shame
    setData((prev) => ({
      ...prev,
      mvd_streak: {
        ...prev.mvd_streak,
        status: "active",
        message: "Streak resumed! Ready to crush today's MVD.",
      },
    }));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Progress & Competency Mastery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verified skills, spaced review health, and weekly momentum
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/review">
            <Button
              variant={skills_due_for_review > 0 ? "default" : "outline"}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Review Queue</span>
              {skills_due_for_review > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                  {skills_due_for_review}
                </Badge>
              )}
            </Button>
          </Link>
        </div>
      </div>

      {/* Code-Generated Plain Language Weekly Summary (NO AI) */}
      <div className="p-5 rounded-xl border border-primary/20 bg-primary/5 text-foreground space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Weekly Overview</span>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Generated from your study data
          </span>
        </div>
        <p className="text-sm leading-relaxed font-medium">
          {plain_summary}
        </p>
      </div>

      {/* Key Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Stat 1: Verified Skills */}
        <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Verified Skills
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-extrabold text-foreground">
              {verified_skills_count}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {total_skills}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {verifiedPercent}% of total curriculum mastered
            </div>
          </div>
          <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${verifiedPercent}%` }}
            />
          </div>
        </div>

        {/* Stat 2: MVD Streak (Supports paused state, zero guilt) */}
        <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              MVD Streak
            </span>
            {mvd_streak.status === "active" ? (
              <Flame className="h-4 w-4 text-orange-500" />
            ) : (
              <PauseCircle className="h-4 w-4 text-amber-500" />
            )}
          </div>
          <div className="my-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-extrabold text-foreground">
                {mvd_streak.current_streak}
              </span>
              <span className="text-sm font-medium text-muted-foreground">days</span>
              <Badge
                variant={mvd_streak.status === "active" ? "default" : "secondary"}
                className={`text-xs ml-auto ${
                  mvd_streak.status === "paused"
                    ? "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300"
                    : ""
                }`}
              >
                {mvd_streak.status === "active" ? "Active" : "Streak paused"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {mvd_streak.message}
            </p>
          </div>
          {mvd_streak.status === "paused" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestartStreak}
              className="w-full text-xs h-7 mt-1"
            >
              <PlayCircle className="h-3 w-3 mr-1" /> Resume streak
            </Button>
          )}
        </div>

        {/* Stat 3: Study Time This Week */}
        <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Time This Week
            </span>
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-extrabold text-foreground">
              {currentWeek ? currentWeek.done_minutes : 0}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                min
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Target: {currentWeek ? currentWeek.planned_minutes : 0} planned min
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {currentWeek && currentWeek.planned_minutes > 0
              ? `${Math.round((currentWeek.done_minutes / currentWeek.planned_minutes) * 100)}% of weekly planned target`
              : "No sessions planned this week"}
          </div>
        </div>

        {/* Stat 4: Skills Due For Review */}
        <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Reviews Due
            </span>
            <RotateCcw className="h-4 w-4 text-sky-500" />
          </div>
          <div className="my-3">
            <div className="text-3xl font-extrabold text-foreground">
              {skills_due_for_review}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {skills_due_for_review === 0
                ? "All reviews up to date"
                : `${skills_due_for_review} skill${skills_due_for_review === 1 ? "" : "s"} ready in queue`}
            </div>
          </div>
          <Link href="/review" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            <span>{skills_due_for_review > 0 ? "Start 15m review" : "View review queue"}</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Lazy-Loaded Time Series Trends Chart */}
      <TimeSeriesChart
        skillsTimeline={verified_skills_over_time}
        weeklyMinutes={planned_vs_done_minutes_per_week}
      />

      {/* Evidence Mix Breakdown & Gauge */}
      <EvidenceGauge
        evidenceMix={evidence_mix}
        totalSkills={total_skills}
      />
    </div>
  );
}
