"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Filter,
  Flame,
  HelpCircle,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  ArrowRight,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StateCard } from "@/components/ui/state-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { QuizListItem, AvailableSkillItem } from "@/app/api/v1/quizzes/route";

interface GoalSummaryItem {
  id: string;
  title: string;
  domain: string;
  status: string;
}

export default function QuizzesPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [goals, setGoals] = React.useState<GoalSummaryItem[]>([]);
  const [selectedGoalId, setSelectedGoalId] = React.useState<string>("all");
  const [quizzes, setQuizzes] = React.useState<QuizListItem[]>([]);
  const [availableSkills, setAvailableSkills] = React.useState<AvailableSkillItem[]>([]);

  // Filter & search states
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "passed" | "needs_review" | "in_progress">("all");

  // Generate quiz modal & inline generation
  const [isGenerateOpen, setIsGenerateOpen] = React.useState(false);
  const [selectedSkillId, setSelectedSkillId] = React.useState<string>("");
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [inlineGeneratingSkillId, setInlineGeneratingSkillId] = React.useState<string | null>(null);

  const fetchQuizzes = React.useCallback(async (forceGoalId?: string) => {
    try {
      setLoading(true);
      setErrorStatus(null);
      const res = await fetch("/api/v1/quizzes");
      if (res.status === 401) {
        setErrorStatus(401);
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load quizzes");
      }
      const data = await res.json();
      const loadedGoals: GoalSummaryItem[] = data.goals || [];
      const loadedSkills: AvailableSkillItem[] = data.available_skills || [];
      setGoals(loadedGoals);
      setQuizzes(data.quizzes || []);
      setAvailableSkills(loadedSkills);

      const defaultGoal =
        forceGoalId ||
        data.active_goal_id ||
        loadedGoals.find((g) => g.status === "active")?.id ||
        loadedGoals[0]?.id ||
        "all";

      setSelectedGoalId((prev) => {
        if (forceGoalId) return forceGoalId;
        if (prev !== "all" && loadedGoals.some((g) => g.id === prev)) return prev;
        return defaultGoal;
      });

      const targetGoalId = forceGoalId || defaultGoal;
      const goalSkills =
        targetGoalId === "all"
          ? loadedSkills
          : loadedSkills.filter((s) => s.goal_id === targetGoalId);
      const firstSkill = goalSkills[0] || loadedSkills[0];
      if (firstSkill) {
        setSelectedSkillId(firstSkill.id);
      }
    } catch {
      toast.error("Unable to load quizzes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchQuizzes();
  }, [fetchQuizzes]);

  // Listen to global goal switch events from top navigation
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onGoalChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ goalId?: string }>).detail;
      void fetchQuizzes(detail?.goalId);
    };
    window.addEventListener("learnitt:goal-changed", onGoalChanged);
    return () => window.removeEventListener("learnitt:goal-changed", onGoalChanged);
  }, [fetchQuizzes]);

  // Keep selectedSkillId synced when switching goal tabs
  React.useEffect(() => {
    const matchingSkills =
      selectedGoalId === "all"
        ? availableSkills
        : availableSkills.filter((s) => s.goal_id === selectedGoalId);
    if (matchingSkills.length > 0 && !matchingSkills.some((s) => s.id === selectedSkillId)) {
      setSelectedSkillId(matchingSkills[0].id);
    }
  }, [selectedGoalId, availableSkills, selectedSkillId]);

  // Handle on-demand quiz generation for a skill
  const generateQuizForSkill = async (skillIdToGenerate: string, fromInline = false) => {
    if (!skillIdToGenerate) {
      toast.error("Please select a skill to quiz.");
      return;
    }

    try {
      if (fromInline) {
        setInlineGeneratingSkillId(skillIdToGenerate);
      } else {
        setIsGenerating(true);
      }
      const res = await fetch(`/api/v1/skills/${skillIdToGenerate}/quizzes?sync=true`, {
        method: "POST",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate quiz.");
      }

      const data = await res.json();
      toast.success("Quiz generated! Launching assessment...");
      setIsGenerateOpen(false);

      if (data.quiz?.id) {
        router.push(`/quizzes/${data.quiz.id}`);
      } else {
        await fetchQuizzes();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to generate quiz";
      toast.error(message);
    } finally {
      setIsGenerating(false);
      setInlineGeneratingSkillId(null);
    }
  };

  const handleGenerateQuiz = () => generateQuizForSkill(selectedSkillId, false);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (errorStatus === 401) {
    return (
      <StateCard
        type="unauthorized"
        title="Sign In for Quizzes"
        description="Verify your competency and track evidence scores across your goals."
        actionText="Sign In"
        actionHref="/login?redirect=/quizzes"
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  const selectedGoalObj = goals.find((g) => g.id === selectedGoalId) || null;

  // Scope available skills & quizzes to selected goal (or all goals)
  const scopedSkills =
    selectedGoalId === "all"
      ? availableSkills
      : availableSkills.filter((s) => s.goal_id === selectedGoalId);

  const scopedQuizzes =
    selectedGoalId === "all"
      ? quizzes
      : quizzes.filter((q) => q.goal_id === selectedGoalId);

  const scopedTotalCount = scopedQuizzes.length;
  const scopedPassedCount = scopedQuizzes.filter((q) => q.status === "passed").length;
  const scopedPassRate =
    scopedTotalCount > 0 ? Math.round((scopedPassedCount / scopedTotalCount) * 100) : 0;

  // Filter quizzes by search & status
  const filteredQuizzes = scopedQuizzes.filter((q) => {
    const matchesQuery =
      searchQuery === "" ||
      q.skill_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.goal_title.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "passed" && q.status === "passed") ||
      (statusFilter === "needs_review" && q.status === "needs_review") ||
      (statusFilter === "in_progress" && (q.status === "in_progress" || q.status === "not_started"));

    return matchesQuery && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20 pb-20">
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Skill Quizzes &amp; Assessments
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Verify your competencies, test applied problem-solving, and elevate evidence scores from E0 to E1/E2.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setIsGenerateOpen(true)}
              className="h-9 gap-1.5 text-xs font-semibold shadow-xs"
            >
              <Plus className="size-3.5" />
              <span>Practice Any Skill</span>
            </Button>
          </div>
        </div>

        {/* Goal Context Selector Bar */}
        {goals.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-surface/40 p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground font-semibold px-1 flex items-center gap-1.5">
                <Target className="size-3.5 text-primary" />
                <span>Goal Track:</span>
              </span>
              {goals.map((g) => {
                const isSelected = selectedGoalId === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGoalId(g.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? "bg-primary/15 text-primary border-primary/40 font-semibold shadow-xs"
                        : "bg-background/80 text-muted-foreground border-border/70 hover:text-foreground hover:border-border"
                    }`}
                  >
                    <span>{g.title}</span>
                    {g.status === "active" && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
              {goals.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSelectedGoalId("all")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    selectedGoalId === "all"
                      ? "bg-primary/15 text-primary border-primary/40 font-semibold shadow-xs"
                      : "bg-background/80 text-muted-foreground border-border/70 hover:text-foreground hover:border-border"
                  }`}
                >
                  All Goals ({availableSkills.length} skills)
                </button>
              )}
            </div>

            {selectedGoalObj && (
              <Link
                href={`/goals/${selectedGoalObj.id}/graph`}
                className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
              >
                <span>View {selectedGoalObj.title} Curriculum</span>
                <ArrowRight className="size-3" />
              </Link>
            )}
          </div>
        )}

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-border/70 bg-card/60 shadow-xs">
            <CardHeader className="pb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="size-4 text-primary" />
                <span>Quizzes Completed</span>
              </span>
              <CardTitle className="text-3xl font-mono font-bold pt-1">
                {scopedPassedCount} <span className="text-sm font-normal text-muted-foreground">/ {scopedTotalCount}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {scopedTotalCount > 0
                  ? `${scopedPassedCount} assessments successfully cleared`
                  : selectedGoalObj
                  ? `No quizzes taken yet for ${selectedGoalObj.title}`
                  : "No quizzes taken yet"}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/70 bg-card/60 shadow-xs">
            <CardHeader className="pb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Flame className="size-4 text-orange-500" />
                <span>Pass Rate</span>
              </span>
              <CardTitle className="text-3xl font-mono font-bold pt-1">
                {scopedPassRate}%
              </CardTitle>
              <CardDescription className="text-xs">
                Target ≥ 70% for verification criteria
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-border/70 bg-card/60 shadow-xs">
            <CardHeader className="pb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="size-4 text-indigo-400" />
                <span>Available Skills</span>
              </span>
              <CardTitle className="text-3xl font-mono font-bold pt-1">
                {scopedSkills.length}
              </CardTitle>
              <CardDescription className="text-xs">
                {selectedGoalObj
                  ? `Competencies in ${selectedGoalObj.title}`
                  : "Competencies eligible for assessment"}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search skills or goals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-background"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {(["all", "passed", "in_progress", "needs_review"] as const).map((filter) => (
              <Button
                key={filter}
                size="sm"
                variant={statusFilter === filter ? "default" : "outline"}
                onClick={() => setStatusFilter(filter)}
                className="h-8 text-xs capitalize shrink-0"
              >
                {filter.replace("_", " ")}
              </Button>
            ))}
          </div>
        </div>

        {/* Quizzes List */}
        {filteredQuizzes.length === 0 ? (
          <div className="rounded-2xl border border-border/80 bg-card p-8 text-center">
            <EmptyState
              icon={<CheckCircle2 className="size-6 text-primary" />}
              title={
                scopedQuizzes.length === 0
                  ? selectedGoalObj
                    ? `No Quizzes Generated Yet for "${selectedGoalObj.title}"`
                    : "No Quizzes Generated Yet"
                  : "No Quizzes Match Your Filter"
              }
              description={
                scopedQuizzes.length === 0
                  ? "Select any skill below to generate a 3-question interactive assessment with active recall and rubric grading."
                  : "Try adjusting your search query or filter selection."
              }
              action={
                <Button
                  size="default"
                  onClick={() => setIsGenerateOpen(true)}
                  className="text-xs font-semibold gap-1.5"
                >
                  <Plus className="size-3.5" />
                  <span>Practice a Skill</span>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredQuizzes.map((quiz) => (
              <Card
                key={quiz.id}
                className="border-border/80 bg-card/70 hover:border-border transition-all flex flex-col justify-between shadow-xs"
              >
                <CardHeader className="pb-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                      {quiz.goal_title}
                    </Badge>
                    {quiz.status === "passed" ? (
                      <Badge variant="default" className="text-[10px] font-mono bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 gap-1">
                        <CheckCircle2 className="size-3" />
                        <span>Passed · {quiz.latest_score}%</span>
                      </Badge>
                    ) : quiz.status === "needs_review" ? (
                      <Badge variant="outline" className="text-[10px] font-mono text-amber-500 border-amber-500/30">
                        Needs Review
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        Ready to Take
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-base font-semibold pt-1 line-clamp-1">
                    {quiz.skill_name}
                  </CardTitle>
                  <CardDescription className="text-xs flex items-center gap-3 pt-0.5">
                    <span className="flex items-center gap-1 font-mono">
                      <HelpCircle className="size-3" />
                      {quiz.question_count} questions
                    </span>
                    <span>·</span>
                    <span className="text-[11px] font-mono">
                      {quiz.question_types.map((t) => t.replace("recall_", "")).join(", ") || "recall"}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Created: {quiz.created_at.slice(0, 10)}
                    </span>
                    <Link href={`/quizzes/${quiz.id}`}>
                      <Button size="sm" className="h-8 text-xs gap-1.5 font-medium">
                        <span>{quiz.status === "passed" ? "Retake" : "Start Quiz"}</span>
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Quick-Launch Curriculum Skill Assessments Grid */}
        {scopedSkills.length > 0 && (
          <section className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span>
                    {selectedGoalObj
                      ? `${selectedGoalObj.title}: Curriculum Skills Ready to Test`
                      : "Curriculum Skills Ready to Test"}
                  </span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Click any skill below to immediately generate a tailored 3-question quiz (multiple-choice, true/false, and applied rubric).
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-[11px] w-fit">
                {scopedSkills.length} Skills
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {scopedSkills.map((skill, idx) => {
                const isGeneratingThis = inlineGeneratingSkillId === skill.id;
                const existingQuiz = quizzes.find((q) => q.skill_id === skill.id);
                return (
                  <div
                    key={skill.id}
                    className="rounded-xl border border-border/80 bg-card/60 hover:border-primary/40 p-4 flex flex-col justify-between gap-3 transition-all"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Module {idx + 1} · E{skill.evidence_level}
                        </span>
                        <Badge variant="outline" className="text-[10px] font-mono uppercase">
                          {skill.verification_type}
                        </Badge>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-foreground leading-snug">
                        {skill.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {skill.goal_title}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                      {existingQuiz ? (
                        <Link href={`/quizzes/${existingQuiz.id}`} className="w-full">
                          <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5">
                            <span>{existingQuiz.status === "passed" ? "Retake Quiz" : "Open Quiz"}</span>
                            <ArrowRight className="size-3.5" />
                          </Button>
                        </Link>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={isGeneratingThis || isGenerating}
                          onClick={() => generateQuizForSkill(skill.id, true)}
                          className="w-full h-8 text-xs gap-1.5 font-semibold"
                        >
                          {isGeneratingThis ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="size-3.5 text-primary" />
                              <span>Generate &amp; Start Quiz</span>
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Generate Quiz Dialog */}
      <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Skill Quiz</DialogTitle>
            <DialogDescription>
              {selectedGoalObj
                ? `Select a competency from "${selectedGoalObj.title}". Learnitt will generate 3 targeted questions with an evaluation rubric.`
                : "Select any skill from your curriculum. Learnitt will generate 3 targeted questions with an evaluation rubric."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {scopedSkills.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                <p>No skills found. Create a goal first to generate quizzes.</p>
                <Link href="/goals/new" className="mt-3 inline-block">
                  <Button size="sm" variant="outline" className="text-xs">
                    Create Goal
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {goals.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Goal Track
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {goals.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setSelectedGoalId(g.id)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                            selectedGoalId === g.id
                              ? "bg-primary/15 text-primary border-primary/40 font-semibold"
                              : "bg-surface text-muted-foreground border-border hover:text-foreground"
                          }`}
                        >
                          {g.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Choose Skill to Test
                  </label>
                  <select
                    value={selectedSkillId}
                    onChange={(e) => setSelectedSkillId(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                  >
                    {scopedSkills.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.goal_title})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Includes multiple-choice, true/false, and applied questions grounded in your learning plan.
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsGenerateOpen(false)}
              disabled={isGenerating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isGenerating || scopedSkills.length === 0}
              onClick={handleGenerateQuiz}
              className="gap-1.5"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Generating Quiz...</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  <span>Generate &amp; Launch</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
