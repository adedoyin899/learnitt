"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target,
  Plus,
  GitFork,
  Calendar,
  Layers,
  ArrowRight,
  Clock,
  Sparkles,
  CheckCircle2,
  Settings,
  FolderOpen,
  BookOpen,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";

interface GoalItem {
  id: string;
  title: string;
  domain: string | null;
  starting_level: string;
  target_date: string | null;
  weekly_hours: number;
  study_days: number[];
  status: "draft" | "active" | "paused" | "archived";
  created_at: string;
}

export default function GoalsHubPage() {
  const router = useRouter();
  const [goals, setGoals] = React.useState<GoalItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isActivating, setIsActivating] = React.useState<string | null>(null);

  const fetchGoals = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/goals");
      if (res.ok) {
        const data = await res.json();
        setGoals(data.goals || []);
      }
    } catch (err) {
      console.error("Failed to load goals", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleActivateGoal = async (goalId: string) => {
    try {
      setIsActivating(goalId);
      const res = await fetch(`/api/v1/goals/${goalId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archiveExisting: true }),
      });
      if (res.ok) {
        await fetchGoals();
      }
    } catch (err) {
      console.error("Failed to activate goal", err);
    } finally {
      setIsActivating(null);
    }
  };

  const activeGoal = goals.find((g) => g.status === "active");
  const secondaryGoals = goals.filter((g) => g.status !== "active");

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-fade-in">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] font-mono tracking-wider uppercase text-primary border-primary/30">
              Curriculum Architecture
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Learning Goals &amp; Tracks
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-xl">
            Manage your active learning tracks, switch primary focus, and inspect verified competency graphs.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/settings?tab=goals">
            <Button variant="outline" size="sm" className="text-xs gap-1.5 h-9">
              <Settings className="size-3.5" />
              <span>Manage Goals</span>
            </Button>
          </Link>
          <Link href="/goals/new">
            <Button size="sm" className="text-xs font-semibold gap-1.5 h-9 shadow-xs">
              <Plus className="size-3.5" />
              <span>New Goal</span>
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : goals.length === 0 ? (
        /* Empty State */
        <Card className="border-dashed border-2 border-border/80 bg-muted/20 text-center p-8 sm:p-12">
          <CardContent className="max-w-md mx-auto space-y-4 p-0">
            <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Target className="size-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">No learning goals yet</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed">
                Decompose any domain into a structured prerequisite graph and calibrate your daily 15-minute study loop.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/goals/new" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto gap-1.5 text-xs font-semibold h-10 px-5">
                  <Sparkles className="size-3.5" />
                  Create Your First Goal
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Active Goal Highlight */}
          {activeGoal && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-xs font-mono tracking-wider uppercase font-semibold text-muted-foreground">
                  Active Primary Focus
                </h2>
              </div>

              <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-card to-card shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="success" className="text-[10px] gap-1 font-mono">
                          <CheckCircle2 className="size-2.5" /> Primary Active Goal
                        </Badge>
                        {activeGoal.domain && (
                          <Badge variant="secondary" className="text-[10px] font-mono">
                            {activeGoal.domain}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] capitalize font-mono">
                          {activeGoal.starting_level}
                        </Badge>
                      </div>
                      <CardTitle className="text-xl sm:text-2xl font-bold text-foreground mt-1">
                        {activeGoal.title}
                      </CardTitle>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link href={`/today?goal_id=${activeGoal.id}`}>
                        <Button size="sm" className="h-9 gap-1.5 text-xs font-semibold shadow-xs">
                          <Calendar className="size-3.5" />
                          <span>Study Today</span>
                          <ArrowRight className="size-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-muted-foreground font-mono pt-2 border-t border-border/50">
                    <div>
                      <span className="block text-[11px] text-muted-foreground/70 uppercase">Weekly Hours</span>
                      <span className="font-semibold text-foreground text-sm">{activeGoal.weekly_hours} hrs/wk</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-muted-foreground/70 uppercase">Target Date</span>
                      <span className="font-semibold text-foreground text-sm">{activeGoal.target_date || "Open-ended"}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-muted-foreground/70 uppercase">Cadence</span>
                      <span className="font-semibold text-foreground text-sm">{activeGoal.study_days.length} days/week</span>
                    </div>
                  </div>

                  {/* Goal Quick Links */}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <Link href={`/goals/${activeGoal.id}/graph`}>
                      <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                        <GitFork className="size-3.5 text-primary" />
                        <span>Skill Graph</span>
                      </Button>
                    </Link>
                    <Link href={`/plan?goal_id=${activeGoal.id}`}>
                      <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                        <BookOpen className="size-3.5 text-blue-500" />
                        <span>Full Plan</span>
                      </Button>
                    </Link>
                    <Link href={`/goals/${activeGoal.id}/resources`}>
                      <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                        <FolderOpen className="size-3.5 text-amber-500" />
                        <span>Curated Resources</span>
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Secondary / Alternate Goals */}
          {secondaryGoals.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-mono tracking-wider uppercase font-semibold text-muted-foreground">
                Secondary &amp; Paused Tracks ({secondaryGoals.length})
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {secondaryGoals.map((g) => (
                  <Card key={g.id} className="border-border/70 hover:border-border transition-all flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                              {g.status}
                            </Badge>
                            {g.domain && (
                              <Badge variant="secondary" className="text-[10px]">
                                {g.domain}
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-base font-semibold text-foreground pt-1">
                            {g.title}
                          </CardTitle>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleActivateGoal(g.id)}
                          disabled={isActivating === g.id}
                          className="h-8 text-xs font-mono shrink-0 hover:border-primary hover:text-primary"
                        >
                          {isActivating === g.id ? "Activating..." : "Set as Active"}
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-0 space-y-3">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                        <span>{g.weekly_hours} hrs/wk</span>
                        <span>·</span>
                        <span>Target: {g.target_date || "Open"}</span>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                        <Link href={`/goals/${g.id}/graph`} className="flex-1">
                          <Button variant="ghost" size="sm" className="w-full text-xs h-8 gap-1 text-muted-foreground hover:text-foreground">
                            <GitFork className="size-3" />
                            <span>Graph</span>
                          </Button>
                        </Link>
                        <Link href={`/plan?goal_id=${g.id}`} className="flex-1">
                          <Button variant="ghost" size="sm" className="w-full text-xs h-8 gap-1 text-muted-foreground hover:text-foreground">
                            <BookOpen className="size-3" />
                            <span>Plan</span>
                          </Button>
                        </Link>
                        <Link href={`/today?goal_id=${g.id}`} className="flex-1">
                          <Button variant="ghost" size="sm" className="w-full text-xs h-8 gap-1 text-primary hover:bg-primary/10">
                            <span>Inspect</span>
                            <ArrowRight className="size-3" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
