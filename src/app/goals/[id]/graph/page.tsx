"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Gauge } from "@/components/ui/gauge";
import { Input } from "@/components/ui/input";
import { FeasibilityResult } from "@/lib/planner/feasibility";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Scissors,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";

interface ResourceItem {
  id: string;
  skill_id?: string | null;
  title: string;
  url: string;
  domain?: string;
  type: string;
  status?: string;
  estimated_minutes?: number | null;
  rationale?: string | null;
}

interface SkillItem {
  id: string;
  name: string;
  description?: string;
  estimated_min_minutes: number;
  estimated_max_minutes: number;
  difficulty: number;
  priority: number;
  verification_type: "recall" | "applied" | "artifact" | "self";
  mvd_minutes: number;
  mvd_task?: string;
  position: number;
  prereq_ids?: string[];
  resources?: ResourceItem[];
}

interface GoalData {
  id: string;
  title: string;
  domain: string;
  starting_level: string;
  target_date: string;
  weekly_hours: number;
  study_days: number[];
  status: "draft" | "active" | "paused" | "archived" | "completed";
  health_flag: boolean;
  graph_version: number;
}

export default function SkillGraphEditorPage() {
  const router = useRouter();
  const params = useParams();
  const goalId = params.id as string;

  const [loading, setLoading] = React.useState(true);
  const [goal, setGoal] = React.useState<GoalData | null>(null);
  const [skills, setSkills] = React.useState<SkillItem[]>([]);
  const [resources, setResources] = React.useState<ResourceItem[]>([]);
  const [feasibility, setFeasibility] = React.useState<FeasibilityResult | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [statusNotice, setStatusNotice] = React.useState<string | null>(null);

  // Local editable drafts so inputs don't fire network requests on every keystroke
  const [draftNames, setDraftNames] = React.useState<Record<string, string>>({});
  const [draftMinEst, setDraftMinEst] = React.useState<Record<string, string>>({});
  const [draftMaxEst, setDraftMaxEst] = React.useState<Record<string, string>>({});
  const [highlightedSkillId, setHighlightedSkillId] = React.useState<string | null>(null);

  // Skill delete confirmation dialog
  const [skillToDelete, setSkillToDelete] = React.useState<SkillItem | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Goal activation conflict dialog
  const [activeGoalConflict, setActiveGoalConflict] = React.useState<{ id: string; title: string } | null>(null);
  const [isActivating, setIsActivating] = React.useState(false);

  // Regenerating curriculum or discovering resources
  const [isRegeneratingGraph, setIsRegeneratingGraph] = React.useState(false);
  const [isDiscoveringResources, setIsDiscoveringResources] = React.useState(false);
  const [discoveringSkillId, setDiscoveringSkillId] = React.useState<string | null>(null);

  // Scope reduction ticks
  const [selectedReductionSkills, setSelectedReductionSkills] = React.useState<string[]>([]);
  const [isApplyingRemedy, setIsApplyingRemedy] = React.useState(false);

  const syncDraftsFromSkills = React.useCallback((skillList: SkillItem[]) => {
    const names: Record<string, string> = {};
    const mins: Record<string, string> = {};
    const maxs: Record<string, string> = {};
    for (const s of skillList) {
      names[s.id] = s.name;
      mins[s.id] = String(s.estimated_min_minutes);
      maxs[s.id] = String(s.estimated_max_minutes);
    }
    setDraftNames(names);
    setDraftMinEst(mins);
    setDraftMaxEst(maxs);
  }, []);

  // Load goal, skills, and complementary resources
  const loadGoalData = React.useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/v1/goals/${goalId}`);
      if (res.status === 401) {
        throw new Error("Your session expired. Please sign in to view this curriculum.");
      }
      if (!res.ok) {
        throw new Error("Goal not found. Please select an active goal from your dashboard.");
      }
      const data = await res.json();
      const loadedSkills: SkillItem[] = data.skills || [];
      setGoal(data.goal);
      setSkills(loadedSkills);
      setResources(data.resources || []);
      setFeasibility(data.feasibility);
      syncDraftsFromSkills(loadedSkills);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [goalId, syncDraftsFromSkills]);

  React.useEffect(() => {
    if (goalId) {
      loadGoalData();
    }
  }, [goalId, loadGoalData]);

  // Update a single skill (rename, estimate, priority)
  async function handleSkillPatch(skillId: string, patch: Partial<SkillItem>) {
    try {
      setErrorMsg(null);
      const res = await fetch(`/api/v1/goals/${goalId}/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to update skill.");
      }

      const data = await res.json();
      setSkills((prev) =>
        prev.map((s) => (s.id === skillId ? { ...s, ...data.skill, resources: s.resources } : s))
      );
      if (data.feasibility) {
        setFeasibility(data.feasibility);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    }
  }

  // Regenerate curriculum tailored to the goal's title & domain
  async function handleRegenerateCurriculum() {
    if (!goal) return;
    setIsRegeneratingGraph(true);
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      const res = await fetch(`/api/v1/goals/${goalId}/skill-graph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipCache: true }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to regenerate skill graph.");
      }
      await loadGoalData();
      setStatusNotice(`Updated curriculum and study guides for ${goal.title} (${goal.domain}).`);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsRegeneratingGraph(false);
    }
  }

  // Discover complementary resources for a specific skill or across the goal
  async function handleDiscoverForSkill(skill: SkillItem) {
    if (!goal) return;
    setDiscoveringSkillId(skill.id);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/resources/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalId: goal.id,
          skillId: skill.id,
          skillName: `${skill.name} ${goal.domain}`,
          startingLevel: goal.starting_level || "beginner",
        }),
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Could not discover additional resources.");
      }
      await loadGoalData();
      setStatusNotice(`Added vetted study guides for "${skill.name}".`);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setDiscoveringSkillId(null);
    }
  }

  async function handleRefreshAllResources() {
    if (!goal || skills.length === 0) return;
    setIsDiscoveringResources(true);
    setErrorMsg(null);
    setStatusNotice(null);
    try {
      const targetSkills = skills.filter((s) => !s.resources || s.resources.length === 0).slice(0, 4);
      const batch = targetSkills.length > 0 ? targetSkills : skills.slice(0, 3);
      for (const sk of batch) {
        await fetch(`/api/v1/resources/discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goalId: goal.id,
            skillId: sk.id,
            skillName: `${sk.name} ${goal.domain}`,
            startingLevel: goal.starting_level || "beginner",
          }),
        });
      }
      await loadGoalData();
      setStatusNotice(`Synced complementary study guides for ${goal.title}.`);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsDiscoveringResources(false);
    }
  }

  // Remove skill with confirmation
  async function confirmDeleteSkill() {
    if (!skillToDelete) return;
    setIsDeleting(true);

    try {
      const res = await fetch(
        `/api/v1/goals/${goalId}/skills/${skillToDelete.id}?confirmed=true`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to remove skill.");
      }

      const data = await res.json();
      setSkills((prev) => prev.filter((s) => s.id !== skillToDelete.id));
      if (data.feasibility) {
        setFeasibility(data.feasibility);
      }
      setSkillToDelete(null);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  }

  // Add new skill
  async function handleAddSkill() {
    try {
      const nextIdx = skills.length + 1;
      const res = await fetch(`/api/v1/goals/${goalId}/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${goal?.domain || "Core"} Practice Module ${nextIdx}`,
          description: `Applied practice and conceptual review for module ${nextIdx}.`,
          estimated_min_minutes: 60,
          estimated_max_minutes: 120,
          priority: 2,
          difficulty: 2,
          verification_type: "applied",
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to add skill.");
      }

      const data = await res.json();
      const added: SkillItem = data.skill;
      setSkills((prev) => [...prev, added]);
      setDraftNames((prev) => ({ ...prev, [added.id]: added.name }));
      setDraftMinEst((prev) => ({ ...prev, [added.id]: String(added.estimated_min_minutes) }));
      setDraftMaxEst((prev) => ({ ...prev, [added.id]: String(added.estimated_max_minutes) }));
      if (data.feasibility) {
        setFeasibility(data.feasibility);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    }
  }

  // Move skill up/down and persist order
  async function handleMoveSkill(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= skills.length) return;
    const next = [...skills];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    setSkills(next);

    try {
      await fetch(`/api/v1/goals/${goalId}/skills/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_ids: next.map((s) => s.id) }),
      });
    } catch {
      // Background save
    }
  }

  // Apply Feasibility Remedies (Extend, Add Time, Reduce Scope)
  async function handleApplyRemedy(remedyType: "extend_date" | "add_time" | "reduce_scope") {
    if (!feasibility?.options) return;
    setIsApplyingRemedy(true);
    setErrorMsg(null);

    const payload: Record<string, unknown> = { remedy: remedyType, confirmed: true };
    if (remedyType === "extend_date") {
      payload.proposed_target_date = feasibility.options.extendDate.proposedTargetDate;
    } else if (remedyType === "add_time") {
      payload.proposed_weekly_hours = feasibility.options.addHours.proposedWeeklyHours;
    } else if (remedyType === "reduce_scope") {
      payload.confirmed_skill_ids = selectedReductionSkills;
    }

    try {
      const res = await fetch(`/api/v1/goals/${goalId}/feasibility/apply-remedy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to apply remedy.");
      }

      const data = await res.json();
      setGoal(data.goal);
      setFeasibility(data.feasibility);
      setSelectedReductionSkills([]);
      await loadGoalData();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsApplyingRemedy(false);
    }
  }

  // Activate Goal and generate daily schedule
  async function handleActivateGoal(archiveExisting = false) {
    setIsActivating(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/v1/goals/${goalId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archiveExisting }),
      });

      const data = await res.json();
      if (res.status === 409) {
        setActiveGoalConflict(data.activeGoal);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to activate goal.");
      }

      setGoal(data.goal);
      setActiveGoalConflict(null);

      // Automatically generate the 14-day study plan and link resources
      await fetch(`/api/v1/goals/${goalId}/plan/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(() => null);

      setStatusNotice("Goal activated and daily study schedule generated with linked study guides.");
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsActivating(false);
    }
  }

  function scrollToSkill(skillId: string) {
    setHighlightedSkillId(skillId);
    const el = document.getElementById(`skill-card-${skillId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(() => {
      setHighlightedSkillId((prev) => (prev === skillId ? null : prev));
    }, 2200);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="font-mono text-xs text-muted-foreground">
            Loading curriculum, feasibility, and study resources...
          </p>
        </div>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="min-h-screen p-6 max-w-xl mx-auto flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Goal not found.</p>
        <Button onClick={() => router.push("/goals/new")}>Go to Goal Setup</Button>
      </div>
    );
  }

  const skillNameById = new Map(skills.map((s, idx) => [s.id, `${idx + 1}. ${s.name}`]));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/80 backdrop-blur px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/goals/new")}
            className="h-8 gap-1.5 text-xs text-muted-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Goal Setup</span>
          </Button>
          <div className="h-4 w-px bg-border" />
          <span className="font-mono text-xs tracking-wider uppercase font-semibold">
            Skill Graph &amp; Study Guides (S03)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRegenerateCurriculum}
            disabled={isRegeneratingGraph}
            className="h-8 text-xs gap-1.5"
          >
            {isRegeneratingGraph ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            <span>Regenerate Curriculum</span>
          </Button>

          {goal.status === "active" ? (
            <div className="flex items-center gap-2">
              <Badge variant="success" className="gap-1 text-[11px] h-7 px-2.5">
                <Check className="size-3" />
                <span>Active Goal</span>
              </Badge>
              <Button size="sm" variant="default" asChild className="h-8 text-xs font-semibold">
                <Link href="/today">Go to Today</Link>
              </Button>
              <Button size="sm" variant="outline" asChild className="h-8 text-xs">
                <Link href="/plan">View Plan</Link>
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={() => handleActivateGoal(false)}
              disabled={isActivating}
              className="h-8 text-xs font-semibold gap-1.5"
            >
              {isActivating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              <span>Activate Goal</span>
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Goal Overview Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card/60 p-4 sm:p-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {goal.title}
              </h1>
              <Badge variant="outline" className="font-mono text-[11px]">
                {goal.domain}
              </Badge>
              {goal.health_flag && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-semibold">
                  Health Content
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Starting Level:{" "}
              <span className="font-medium capitalize text-foreground">{goal.starting_level}</span> ·
              Target Date: <span className="font-mono text-foreground">{goal.target_date}</span> ·
              Weekly Commitment:{" "}
              <span className="font-mono text-foreground">{goal.weekly_hours} hrs/week</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground px-2.5 py-1 rounded-md bg-surface border border-border">
              {skills.length} Skills · {resources.length} Guides · v{goal.graph_version}
            </span>
          </div>
        </div>

        {errorMsg && (
          <Alert variant="destructive">
            <AlertTitle>Action required</AlertTitle>
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        {statusNotice && (
          <Alert className="border-primary/40 bg-primary/5">
            <Sparkles className="size-4 text-primary" />
            <AlertTitle className="text-xs font-semibold">Curriculum Updated</AlertTitle>
            <AlertDescription className="text-xs text-muted-foreground">
              {statusNotice}
            </AlertDescription>
          </Alert>
        )}

        {/* Feasibility Gauge & Schedule Capacity (PRD Section 5.2 & A3) */}
        {feasibility && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="size-4 text-primary" />
                  <span>Feasibility &amp; Schedule Capacity</span>
                </CardTitle>
                <Badge
                  variant={
                    feasibility.band === "feasible"
                      ? "success"
                      : feasibility.band === "tight"
                      ? "warning"
                      : "destructive"
                  }
                  className="capitalize font-mono text-xs"
                >
                  {feasibility.band.replace("_", " ")} ({feasibility.percentage}%)
                </Badge>
              </div>
              <CardDescription className="text-xs mt-1">
                {feasibility.summaryMessage}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 items-center gap-6 pt-2 pb-1">
                <div className="flex flex-col items-center justify-center">
                  <Gauge
                    value={Math.min(150, feasibility.percentage)}
                    min={0}
                    max={150}
                    label="Feasibility"
                    unit="%"
                    size="default"
                    thresholds={[
                      { at: 0, tone: "success", label: "Feasible" },
                      { at: 85, tone: "warning", label: "Tight" },
                      { at: 101, tone: "destructive", label: "Not feasible" },
                    ]}
                  />
                </div>

                <div className="space-y-2.5 text-xs w-full max-w-sm mx-auto">
                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">Estimated Work</span>
                    <span className="font-mono font-medium text-foreground">
                      {Math.round(feasibility.remainingMinutes / 60)} hrs ({feasibility.remainingMinutes} min)
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">Available Capacity</span>
                    <span className="font-mono font-medium text-foreground">
                      {Math.round(feasibility.capacityMinutes / 60)} hrs ({feasibility.capacityMinutes} min)
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border/50">
                    <span className="text-muted-foreground">Study Days Remaining</span>
                    <span className="font-mono font-medium text-foreground">
                      {feasibility.studyDaysCount} days
                    </span>
                  </div>
                  <div className="flex justify-between py-1.5">
                    <span className="text-muted-foreground">Complementary Guides Linked</span>
                    <span className="font-mono font-medium text-primary">
                      {resources.length} vetted resources
                    </span>
                  </div>
                </div>
              </div>

              {/* Remedy Options for Tight or Not Feasible Plans (PRD A3) */}
              {feasibility.options && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <AlertTriangle className="size-4 text-warning" />
                    <span>Adjustment Options to Reach Feasibility (&lt; 85%)</span>
                  </p>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {/* Option 1: Extend Target Date */}
                    <div className="rounded-lg border border-border p-3.5 bg-surface/50 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Calendar className="size-3.5 text-primary" />
                          <span>Option 1: Extend Date</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Extend target date to{" "}
                          <span className="font-mono text-foreground font-semibold">
                            {feasibility.options.extendDate.proposedTargetDate}
                          </span>{" "}
                          (+{feasibility.options.extendDate.additionalDays} days).
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApplyRemedy("extend_date")}
                        disabled={isApplyingRemedy}
                        className="text-xs h-7 w-full"
                      >
                        Apply New Date
                      </Button>
                    </div>

                    {/* Option 2: Add Weekly Hours */}
                    <div className="rounded-lg border border-border p-3.5 bg-surface/50 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Clock className="size-3.5 text-primary" />
                          <span>Option 2: Add Time</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Increase to{" "}
                          <span className="font-mono text-foreground font-semibold">
                            {feasibility.options.addHours.proposedWeeklyHours} hrs/wk
                          </span>{" "}
                          (+{feasibility.options.addHours.addedHours} hrs).
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApplyRemedy("add_time")}
                        disabled={isApplyingRemedy}
                        className="text-xs h-7 w-full"
                      >
                        Apply New Hours
                      </Button>
                    </div>

                    {/* Option 3: Reduce Scope */}
                    <div className="rounded-lg border border-border p-3.5 bg-surface/50 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Scissors className="size-3.5 text-primary" />
                          <span>Option 3: Reduce Scope</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Drop low-priority skills ({feasibility.options.reduceScope.candidateSkills.length}{" "}
                          proposed, lowest priority first). Never removes without a tick.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Reduce Scope Selection List */}
                  {feasibility.options.reduceScope.candidateSkills.length > 0 && (
                    <div className="rounded-lg border border-border p-3 bg-surface/30 space-y-2 mt-2">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                        Select skills to remove (Lowest priority first):
                      </span>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {feasibility.options.reduceScope.candidateSkills.map((c) => {
                          const isTicked = selectedReductionSkills.includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className="flex items-center justify-between p-2 rounded bg-card border border-border/50 text-xs cursor-pointer hover:border-primary/50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={isTicked}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedReductionSkills([...selectedReductionSkills, c.id]);
                                    } else {
                                      setSelectedReductionSkills(
                                        selectedReductionSkills.filter((id) => id !== c.id)
                                      );
                                    }
                                  }}
                                />
                                <span className="font-medium text-foreground">{c.name}</span>
                              </div>
                              <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                                <span>Priority {c.priority}</span>
                                <span>·</span>
                                <span>{c.estimatedMinutes}m</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      <div className="flex justify-end pt-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleApplyRemedy("reduce_scope")}
                          disabled={isApplyingRemedy || selectedReductionSkills.length === 0}
                          className="text-xs h-7 gap-1.5"
                        >
                          <Scissors className="size-3.5" />
                          <span>Remove Selected ({selectedReductionSkills.length})</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Responsive Curriculum Roadmap Grid (replaces squashed 12-item horizontal bar) */}
        {skills.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Compass className="size-4 text-primary" />
                    <span>Curriculum Roadmap ({skills.length} Modules)</span>
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Click any module below to jump to its skill configuration and linked study guides.
                  </CardDescription>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Ordered by dependency &amp; sequence
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {skills.map((skill, idx) => {
                  const linkedGuidesCount = (skill.resources || []).length;
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => scrollToSkill(skill.id)}
                      className="group text-left rounded-lg border border-border bg-surface/40 hover:bg-surface hover:border-primary/50 p-3 transition-all flex flex-col justify-between gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="inline-flex items-center justify-center size-5 rounded bg-primary/15 text-primary font-mono text-[11px] font-bold shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                            {skill.name}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
                        <span className="uppercase">{skill.verification_type}</span>
                        <span>
                          {skill.estimated_min_minutes}-{skill.estimated_max_minutes}m
                        </span>
                        <span className={linkedGuidesCount > 0 ? "text-primary font-medium" : ""}>
                          {linkedGuidesCount} {linkedGuidesCount === 1 ? "guide" : "guides"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Complementary Study Resources & Guides Section */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                <span>Complementary Study Guides &amp; External Resources</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Vetted study materials, references, and practical guides tailored to{" "}
                <span className="text-foreground font-medium">{goal.title}</span> ({goal.domain}).
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshAllResources}
              disabled={isDiscoveringResources}
              className="gap-1.5 text-xs h-8 shrink-0"
            >
              {isDiscoveringResources ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5 text-primary" />
              )}
              <span>Discover / Refresh Guides</span>
            </Button>
          </CardHeader>
          <CardContent>
            {resources.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-3">
                <p className="text-xs text-muted-foreground">
                  No complementary resources are linked to this goal yet. Click below to discover vetted study guides for your {goal.domain} skills.
                </p>
                <Button
                  size="sm"
                  onClick={handleRefreshAllResources}
                  disabled={isDiscoveringResources}
                  className="gap-1.5 text-xs"
                >
                  {isDiscoveringResources ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  <span>Discover Complementary Guides</span>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {resources.map((res) => {
                  const skillLabel = res.skill_id ? skillNameById.get(res.skill_id) : null;
                  return (
                    <a
                      key={res.id}
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group rounded-lg border border-border bg-surface/40 hover:bg-surface hover:border-primary/50 p-3.5 transition-all flex flex-col justify-between gap-2.5"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5 leading-snug">
                            <BookOpen className="size-3.5 text-primary shrink-0" />
                            <span>{res.title}</span>
                          </span>
                          <ExternalLink className="size-3.5 text-muted-foreground group-hover:text-primary shrink-0 mt-0.5" />
                        </div>
                        {res.rationale && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                            {res.rationale}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-[10px] font-mono text-muted-foreground">
                        <div className="flex items-center gap-1.5 truncate max-w-[65%]">
                          <Badge variant="outline" className="text-[9px] uppercase px-1.5 py-0">
                            {res.type || "article"}
                          </Badge>
                          {skillLabel && (
                            <span className="truncate text-foreground/80" title={skillLabel}>
                              {skillLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {res.domain && <span>{res.domain}</span>}
                          {res.estimated_minutes && <span>· {res.estimated_minutes}m</span>}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Skill Graph Editor Cards (PRD Screen S03) */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                <span>Skills, Prerequisites &amp; Linked Guides</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Rename skills, adjust time estimates, update priority, reorder modules, or open study guides. Changes recalculate schedule feasibility automatically.
              </CardDescription>
            </div>
            <Button size="sm" onClick={handleAddSkill} className="gap-1.5 text-xs h-8 shrink-0">
              <Plus className="size-3.5" />
              <span>Add Skill</span>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {skills.map((item, index) => {
              const skillResources = item.resources || [];
              const isHighlighted = highlightedSkillId === item.id;
              const nameDraft = draftNames[item.id] ?? item.name;
              const minDraft = draftMinEst[item.id] ?? String(item.estimated_min_minutes);
              const maxDraft = draftMaxEst[item.id] ?? String(item.estimated_max_minutes);

              return (
                <div
                  key={item.id}
                  id={`skill-card-${item.id}`}
                  className={`p-4 rounded-xl border transition-all space-y-3.5 ${
                    isHighlighted
                      ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                      : "border-border bg-surface/40"
                  }`}
                >
                  {/* Top Row: Step Number, Editable Skill Name, Verification Type, Reorder & Delete */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-1">
                      <span className="inline-flex items-center justify-center size-7 rounded-md bg-primary/15 text-primary font-mono text-xs font-bold shrink-0">
                        #{index + 1}
                      </span>
                      <Input
                        value={nameDraft}
                        onChange={(e) =>
                          setDraftNames((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onBlur={() => {
                          const trimmed = nameDraft.trim();
                          if (trimmed && trimmed !== item.name) {
                            handleSkillPatch(item.id, { name: trimmed });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                        className="h-9 text-sm font-semibold bg-card"
                        placeholder="Skill title"
                      />
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono px-2 py-0.5">
                        {item.verification_type}
                      </Badge>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveSkill(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move skill ${index + 1} up`}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMoveSkill(index, 1)}
                          disabled={index === skills.length - 1}
                          aria-label={`Move skill ${index + 1} down`}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSkillToDelete(item)}
                          aria-label={`Delete ${item.name}`}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Description & MVD Task */}
                  {(item.description || item.mvd_task) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs bg-card/60 rounded-lg p-3 border border-border/60">
                      {item.description && (
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-0.5">
                            Learning Objective
                          </span>
                          <p className="text-foreground/90 leading-relaxed">{item.description}</p>
                        </div>
                      )}
                      {item.mvd_task && (
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground block mb-0.5">
                            Minimum Viable Day ({item.mvd_minutes || 15}m Fallback)
                          </span>
                          <p className="text-muted-foreground leading-relaxed">{item.mvd_task}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-row: Estimates, Priority, Prerequisites */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground font-medium block mb-1">
                        Min Estimate (min)
                      </span>
                      <Input
                        type="number"
                        min={5}
                        max={item.estimated_max_minutes}
                        value={minDraft}
                        onChange={(e) =>
                          setDraftMinEst((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onBlur={() => {
                          const parsed = parseInt(minDraft, 10) || 15;
                          if (parsed !== item.estimated_min_minutes) {
                            handleSkillPatch(item.id, { estimated_min_minutes: parsed });
                          }
                        }}
                        className="h-8 text-xs font-mono bg-card"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-medium block mb-1">
                        Max Estimate (min)
                      </span>
                      <Input
                        type="number"
                        min={item.estimated_min_minutes}
                        max={600}
                        value={maxDraft}
                        onChange={(e) =>
                          setDraftMaxEst((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onBlur={() => {
                          const parsed = parseInt(maxDraft, 10) || 60;
                          if (parsed !== item.estimated_max_minutes) {
                            handleSkillPatch(item.id, { estimated_max_minutes: parsed });
                          }
                        }}
                        className="h-8 text-xs font-mono bg-card"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-medium block mb-1">
                        Priority (1-3)
                      </span>
                      <select
                        value={item.priority}
                        onChange={(e) =>
                          handleSkillPatch(item.id, {
                            priority: parseInt(e.target.value, 10) as 1 | 2 | 3,
                          })
                        }
                        className="w-full h-8 rounded-md border border-input bg-card px-2.5 text-xs"
                      >
                        <option value={1}>1 - Highest</option>
                        <option value={2}>2 - Medium</option>
                        <option value={3}>3 - Lowest</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground font-medium block mb-1">
                        Prerequisites
                      </span>
                      <div className="h-8 px-2.5 rounded-md border border-border/60 bg-card/50 flex items-center text-[11px] font-mono text-muted-foreground">
                        {(item.prereq_ids || []).length} linked · Diff {item.difficulty || 2}/5
                      </div>
                    </div>
                  </div>

                  {/* Per-Skill Complementary Study Guides */}
                  <div className="pt-2 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                        <BookOpen className="size-3 text-primary" />
                        <span>Study Guides:</span>
                      </span>
                      {skillResources.length > 0 ? (
                        skillResources.map((res) => (
                          <a
                            key={res.id}
                            href={res.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
                          >
                            <span className="truncate max-w-[220px]">{res.title}</span>
                            <ExternalLink className="size-3 shrink-0" />
                          </a>
                        ))
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">
                          No guide linked yet
                        </span>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDiscoverForSkill(item)}
                      disabled={discoveringSkillId === item.id}
                      className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-primary self-start sm:self-auto"
                    >
                      {discoveringSkillId === item.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Sparkles className="size-3" />
                      )}
                      <span>Find Guide</span>
                    </Button>
                  </div>
                </div>
              );
            })}

            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSkill}
                className="gap-1.5 text-xs"
              >
                <Plus className="size-3.5" />
                <span>Add Another Skill Module</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Confirmation Dialog for Skill Removal (PRD 4, S03) */}
      <Dialog open={!!skillToDelete} onOpenChange={(open) => !open && setSkillToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-destructive" />
              <span>Confirm Skill Removal</span>
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove &quot;{skillToDelete?.name}&quot;? Dependent skills and prerequisites will be disconnected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setSkillToDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteSkill} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              <span>Remove Skill</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Goal Conflict Dialog (PRD Epic A1, AC2) */}
      <Dialog open={!!activeGoalConflict} onOpenChange={(open) => !open && setActiveGoalConflict(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Another Active Goal Exists</DialogTitle>
            <DialogDescription>
              You currently have an active goal (&quot;{activeGoalConflict?.title}&quot;). Only one goal may be active at a time. Archive it to activate &quot;{goal.title}&quot;?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setActiveGoalConflict(null)} disabled={isActivating}>
              Keep Draft
            </Button>
            <Button variant="default" onClick={() => handleActivateGoal(true)} disabled={isActivating}>
              {isActivating ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              <span>Archive &amp; Activate</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
