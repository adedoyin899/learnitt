"use client";

import * as React from "react";
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
import { RepeaterField } from "@/components/ui/repeater-field";
import { StepNav } from "@/components/ui/step-nav";
import { FeasibilityResult } from "@/lib/planner/feasibility";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  Plus,
  Scissors,
  ShieldAlert,
  Trash2,
} from "lucide-react";

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
  const [feasibility, setFeasibility] = React.useState<FeasibilityResult | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Skill delete confirmation dialog
  const [skillToDelete, setSkillToDelete] = React.useState<SkillItem | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Goal activation conflict dialog
  const [activeGoalConflict, setActiveGoalConflict] = React.useState<{ id: string; title: string } | null>(null);
  const [isActivating, setIsActivating] = React.useState(false);

  // Scope reduction ticks
  const [selectedReductionSkills, setSelectedReductionSkills] = React.useState<string[]>([]);
  const [isApplyingRemedy, setIsApplyingRemedy] = React.useState(false);

  // Load goal and skills
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
      setGoal(data.goal);
      setSkills(data.skills || []);
      setFeasibility(data.feasibility);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  React.useEffect(() => {
    if (goalId) {
      loadGoalData();
    }
  }, [goalId, loadGoalData]);

  // Update a single skill (rename, estimate, priority)
  async function handleSkillPatch(skillId: string, patch: Partial<SkillItem>) {
    try {
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
        prev.map((s) => (s.id === skillId ? { ...s, ...data.skill } : s))
      );
      if (data.feasibility) {
        setFeasibility(data.feasibility);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
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
          name: `New Skill ${nextIdx}`,
          description: `Custom applied topic ${nextIdx}.`,
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
      setSkills((prev) => [...prev, data.skill]);
      if (data.feasibility) {
        setFeasibility(data.feasibility);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    }
  }

  // Reorder skills
  async function handleReorder(newSkills: SkillItem[]) {
    setSkills(newSkills);
    try {
      await fetch(`/api/v1/goals/${goalId}/skills/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill_ids: newSkills.map((s) => s.id) }),
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

  // Activate Goal
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
        // Prompt to archive
        setActiveGoalConflict(data.activeGoal);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to activate goal.");
      }

      setGoal(data.goal);
      setActiveGoalConflict(null);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsActivating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="font-mono text-xs text-muted-foreground">Loading skill graph and feasibility...</p>
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

  const stepNavItems = skills.map((s, idx) => ({
    id: s.id,
    label: `Skill ${idx + 1}`,
    description: s.name,
    status: (s.priority === 1 ? "current" : "available") as "current" | "available",
  }));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/40 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/goals/new")}
            className="h-8 gap-1.5 text-xs text-muted-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Wizard</span>
          </Button>
          <div className="h-4 w-px bg-border" />
          <span className="font-mono text-xs tracking-wider uppercase font-semibold">
            Skill Graph Editor (S03)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {goal.status === "active" ? (
            <Badge variant="success" className="gap-1 text-[11px]">
              <Check className="size-3" />
              <span>Active Goal</span>
            </Badge>
          ) : (
            <Button
              size="sm"
              variant="default"
              onClick={() => handleActivateGoal(false)}
              disabled={isActivating}
              className="h-8 text-xs font-semibold gap-1.5"
            >
              {isActivating ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              <span>Activate Goal</span>
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Goal Overview */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">{goal.title}</h1>
              {goal.health_flag && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-semibold">
                  Health Content
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Domain: <span className="text-foreground">{goal.domain}</span> · Target:{" "}
              <span className="font-mono text-foreground">{goal.target_date}</span> ·{" "}
              <span className="font-mono text-foreground">{goal.weekly_hours} hrs/week</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground px-2 py-1 rounded bg-surface border border-border">
              {skills.length} Skills · Version {goal.graph_version}
            </span>
          </div>
        </div>

        {errorMsg && (
          <Alert variant="destructive">
            <AlertTitle>Action required</AlertTitle>
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        {/* Feasibility Gauge & Band Information (PRD Section 5.2 & A3) */}
        {feasibility && (
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="size-4 text-primary" />
                  <span>Feasibility & Schedule Capacity</span>
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
              <div className="flex flex-col sm:flex-row items-center gap-6 justify-around pt-2 pb-1">
                <div className="flex flex-col items-center">
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

                <div className="space-y-2 text-xs w-full max-w-xs">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Estimated Work</span>
                    <span className="font-mono text-foreground">
                      {Math.round(feasibility.remainingMinutes / 60)} hrs ({feasibility.remainingMinutes} min)
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Available Capacity</span>
                    <span className="font-mono text-foreground">
                      {Math.round(feasibility.capacityMinutes / 60)} hrs ({feasibility.capacityMinutes} min)
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Study Days Remaining</span>
                    <span className="font-mono text-foreground">{feasibility.studyDaysCount} days</span>
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

        {/* Step Navigation Overview (PRD Screen S03) */}
        {stepNavItems.length > 0 && (
          <div className="overflow-x-auto pb-2">
            <StepNav
              steps={stepNavItems}
              orientation="horizontal"
              showProgress={false}
              className="py-1"
            />
          </div>
        )}

        {/* Skill Graph Editor using RepeaterField (PRD Screen S03) */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                <span>Skills & Prerequisites</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Rename, adjust time estimates, update priority, and reorder. Every change is recorded to goal_changes and recalculates feasibility.
              </CardDescription>
            </div>
            <Button size="sm" onClick={handleAddSkill} className="gap-1.5 text-xs h-8">
              <Plus className="size-3.5" />
              <span>Add Skill</span>
            </Button>
          </CardHeader>
          <CardContent>
            <RepeaterField<SkillItem>
              value={skills}
              onValueChange={handleReorder}
              createItem={() => ({
                id: crypto.randomUUID(),
                name: `New Skill ${skills.length + 1}`,
                estimated_min_minutes: 60,
                estimated_max_minutes: 120,
                difficulty: 2,
                priority: 2,
                verification_type: "applied",
                mvd_minutes: 15,
                position: skills.length,
              })}
              reorderable
              renderRow={({ item, index, remove: _remove }) => (
                <div className="p-3.5 rounded-lg border border-border bg-surface/40 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="font-mono text-xs font-semibold text-muted-foreground w-6">
                        #{index + 1}
                      </span>
                      <Input
                        value={item.name}
                        onChange={(e) => handleSkillPatch(item.id, { name: e.target.value })}
                        className="h-8 text-xs font-medium"
                        placeholder="Skill title"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {item.verification_type}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSkillToDelete(item)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Sub-row: Estimates, Priority, Difficulty */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-0.5">Min Est (min)</span>
                      <Input
                        type="number"
                        min={5}
                        max={item.estimated_max_minutes}
                        value={item.estimated_min_minutes}
                        onChange={(e) =>
                          handleSkillPatch(item.id, {
                            estimated_min_minutes: parseInt(e.target.value, 10) || 15,
                          })
                        }
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-0.5">Max Est (min)</span>
                      <Input
                        type="number"
                        min={item.estimated_min_minutes}
                        max={600}
                        value={item.estimated_max_minutes}
                        onChange={(e) =>
                          handleSkillPatch(item.id, {
                            estimated_max_minutes: parseInt(e.target.value, 10) || 60,
                          })
                        }
                        className="h-7 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-0.5">Priority (1-3)</span>
                      <select
                        value={item.priority}
                        onChange={(e) =>
                          handleSkillPatch(item.id, {
                            priority: parseInt(e.target.value, 10) as 1 | 2 | 3,
                          })
                        }
                        className="w-full h-7 rounded-md border border-input bg-card px-2 text-xs"
                      >
                        <option value={1}>1 - Highest</option>
                        <option value={2}>2 - Medium</option>
                        <option value={3}>3 - Lowest</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground block mb-0.5">Prerequisites</span>
                      <span className="text-[11px] font-mono text-muted-foreground leading-7">
                        {(item.prereq_ids || []).length} linked
                      </span>
                    </div>
                  </div>
                </div>
              )}
            />
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
