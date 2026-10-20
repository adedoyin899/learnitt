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

export default function QuizzesPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [quizzes, setQuizzes] = React.useState<QuizListItem[]>([]);
  const [availableSkills, setAvailableSkills] = React.useState<AvailableSkillItem[]>([]);
  const [stats, setStats] = React.useState({
    total_quizzes: 0,
    passed_quizzes: 0,
    pass_rate_percent: 0,
  });

  // Filter & search states
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "passed" | "needs_review" | "in_progress">("all");

  // Generate quiz modal
  const [isGenerateOpen, setIsGenerateOpen] = React.useState(false);
  const [selectedSkillId, setSelectedSkillId] = React.useState<string>("");
  const [isGenerating, setIsGenerating] = React.useState(false);

  const fetchQuizzes = React.useCallback(async () => {
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
      setQuizzes(data.quizzes || []);
      setAvailableSkills(data.available_skills || []);
      if (data.stats) {
        setStats(data.stats);
      }
      if (data.available_skills && data.available_skills.length > 0 && !selectedSkillId) {
        setSelectedSkillId(data.available_skills[0].id);
      }
    } catch {
      toast.error("Unable to load quizzes. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [selectedSkillId]);

  React.useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  // Handle on-demand quiz generation for selected skill
  const handleGenerateQuiz = async () => {
    if (!selectedSkillId) {
      toast.error("Please select a skill to quiz.");
      return;
    }

    try {
      setIsGenerating(true);
      const res = await fetch(`/api/v1/skills/${selectedSkillId}/quizzes?sync=true`, {
        method: "POST",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to generate quiz.");
      }

      const data = await res.json();
      toast.success("Quiz generated successfully!");
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
    }
  };

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

  // Filter quizzes
  const filteredQuizzes = quizzes.filter((q) => {
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

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-border/70 bg-card/60 shadow-xs">
            <CardHeader className="pb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="size-4 text-primary" />
                <span>Quizzes Completed</span>
              </span>
              <CardTitle className="text-3xl font-mono font-bold pt-1">
                {stats.passed_quizzes} <span className="text-sm font-normal text-muted-foreground">/ {stats.total_quizzes}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {stats.total_quizzes > 0
                  ? `${stats.passed_quizzes} assessments successfully cleared`
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
                {stats.pass_rate_percent}%
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
                {availableSkills.length}
              </CardTitle>
              <CardDescription className="text-xs">
                Competencies eligible for assessment
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
          <div className="rounded-2xl border border-border/80 bg-card p-10 text-center">
            <EmptyState
              icon={<CheckCircle2 className="size-6 text-primary" />}
              title={quizzes.length === 0 ? "No Quizzes Generated Yet" : "No Quizzes Match Your Filter"}
              description={
                quizzes.length === 0
                  ? "Generate your first interactive assessment to test active recall and elevate your skills."
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
      </main>

      {/* Generate Quiz Dialog */}
      <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Skill Quiz</DialogTitle>
            <DialogDescription>
              Select any skill from your curriculum. Learnitt will generate 3 to 5 targeted questions with an evaluation rubric.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {availableSkills.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                <p>No skills found. Create a goal first to generate quizzes.</p>
                <Link href="/goals/new" className="mt-3 inline-block">
                  <Button size="sm" variant="outline" className="text-xs">
                    Create Goal
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Choose Skill to Test
                </label>
                <select
                  value={selectedSkillId}
                  onChange={(e) => setSelectedSkillId(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                >
                  {availableSkills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.goal_title})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Includes multiple-choice, true/false, and applied questions grounded in your learning plan.
                </p>
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
              disabled={isGenerating || availableSkills.length === 0}
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
