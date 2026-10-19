"use client";

import * as React from "react";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Edit3,
  Sparkles,
  UserCheck,
  XCircle,
} from "lucide-react";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export interface CriterionGrade {
  criterion: string;
  score: number; // 0 to 2
  max_score?: number;
  feedback?: string;
  weight?: number;
  description?: string;
}

export interface GradeData {
  id: string;
  attempt_id: string;
  source: "ai" | "user_override" | "self" | "mc_auto";
  criterion_scores?: CriterionGrade[] | null;
  total: number;
  verdict: "pass" | "fail";
  feedback?: any;
  confidence?: number | null;
  model_version?: string | null;
  override_reason?: string | null;
  is_current: boolean;
  created_at?: string;
}

interface GradeReviewProps {
  grade: GradeData;
  rubric?: Array<{ criterion: string; weight: number; description: string }> | null;
  attemptStatus: "submitted" | "pending_grade" | "graded" | "needs_your_review";
  onOverrideSuccess?: (newGrade: GradeData) => void;
  onConfirmReviewSuccess?: () => void;
  onSelfGradeSuccess?: (grade: GradeData) => void;
}

export function GradeReview({
  grade,
  rubric = [],
  attemptStatus,
  onOverrideSuccess,
  onConfirmReviewSuccess,
  onSelfGradeSuccess,
}: GradeReviewProps) {
  const [isOverrideOpen, setIsOverrideOpen] = React.useState(false);
  const [isSelfGradeOpen, setIsSelfGradeOpen] = React.useState(false);
  const [overrideReason, setOverrideReason] = React.useState("");
  const [overrideVerdict, setOverrideVerdict] = React.useState<"pass" | "fail">(grade.verdict);
  const [overrideScores, setOverrideScores] = React.useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    (grade.criterion_scores || []).forEach((c) => {
      initial[c.criterion] = c.score;
    });
    return initial;
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Merge rubric criteria with criterion_scores
  const combinedCriteria = React.useMemo(() => {
    const map = new Map<string, CriterionGrade>();

    (rubric || []).forEach((r) => {
      map.set(r.criterion, {
        criterion: r.criterion,
        weight: r.weight,
        description: r.description,
        score: 0,
        max_score: 2,
      });
    });

    (grade.criterion_scores || []).forEach((c) => {
      const existing = map.get(c.criterion) || {
        criterion: c.criterion,
        max_score: c.max_score || 2,
      };
      map.set(c.criterion, {
        ...existing,
        score: c.score,
        max_score: c.max_score || 2,
        feedback: c.feedback,
      });
    });

    return Array.from(map.values());
  }, [rubric, grade.criterion_scores]);

  // Handle Override submission
  async function handleOverrideSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!overrideReason.trim()) {
      setErrorMsg("Override reason is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const scoresPayload = Object.entries(overrideScores).map(([crit, score]) => ({
        criterion: crit,
        score,
        max_score: 2,
      }));

      // Calculate total if applicable
      let calculatedTotal = 0;
      if (rubric && rubric.length > 0) {
        calculatedTotal = Math.round(
          rubric.reduce((acc, r) => {
            const sc = overrideScores[r.criterion] ?? 0;
            return acc + (sc / 2) * r.weight;
          }, 0)
        );
      } else {
        calculatedTotal = overrideVerdict === "pass" ? Math.max(grade.total, 70) : 40;
      }

      const res = await fetch(`/api/v1/attempts/${grade.attempt_id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          override_reason: overrideReason.trim(),
          verdict: overrideVerdict,
          total: calculatedTotal,
          criterion_scores: scoresPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save override");
      }

      setIsOverrideOpen(false);
      setOverrideReason("");
      if (onOverrideSuccess && data.grade) {
        onOverrideSuccess(data.grade);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to override grade");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle Confirm Review (for low confidence)
  async function handleConfirmReview() {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/attempts/${grade.attempt_id}/confirm-review`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to confirm review");
      }
      if (onConfirmReviewSuccess) {
        onConfirmReviewSuccess();
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to confirm review");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle Self-Grade submission (when AI paused)
  async function handleSelfGrade(verdict: "pass" | "fail") {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/v1/attempts/${grade.attempt_id}/self-grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verdict,
          total: verdict === "pass" ? 80 : 40,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to self-grade");
      setIsSelfGradeOpen(false);
      if (onSelfGradeSuccess && data.grade) {
        onSelfGradeSuccess(data.grade);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLowConfidence = typeof grade.confidence === "number" && grade.confidence < 0.6;
  const isPendingGrade = attemptStatus === "pending_grade";
  const needsReview = attemptStatus === "needs_your_review" || isLowConfidence;

  // Extract feedback string/object
  const summaryFeedback =
    typeof grade.feedback === "string"
      ? grade.feedback
      : grade.feedback?.summary || "Evaluation completed.";
  const strengths: string[] = grade.feedback?.strengths || [];
  const improvements: string[] = grade.feedback?.improvements || [];

  return (
    <div className="space-y-5 rounded-xl border bg-card p-5 text-card-foreground shadow-sm">
      {/* S11 Header: Badges & Overview */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Verdict Badge */}
          {grade.verdict === "pass" ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600/90 text-white gap-1.5 px-3 py-1 font-semibold text-sm">
              <CheckCircle2 className="h-4 w-4" />
              <span>Pass (Score: {grade.total}/100)</span>
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1.5 px-3 py-1 font-semibold text-sm">
              <XCircle className="h-4 w-4" />
              <span>Needs Improvement (Score: {grade.total}/100)</span>
            </Badge>
          )}

          {/* Source Badge */}
          <Badge variant="outline" className="text-xs capitalize font-normal">
            {grade.source === "ai" && <Sparkles className="mr-1 h-3 w-3 text-purple-500" />}
            {grade.source === "user_override" && <Edit3 className="mr-1 h-3 w-3 text-blue-500" />}
            {grade.source === "self" && <UserCheck className="mr-1 h-3 w-3 text-amber-500" />}
            Source: {grade.source.replace("_", " ")}
          </Badge>

          {/* Model Version Badge */}
          {grade.model_version && (
            <Badge variant="secondary" className="text-xs font-mono font-normal">
              Model: {grade.model_version}
            </Badge>
          )}
        </div>

        {/* Confidence Badge */}
        {grade.confidence !== null && grade.confidence !== undefined && (
          <Badge
            variant={isLowConfidence ? "destructive" : "outline"}
            className="text-xs font-medium"
          >
            {isLowConfidence ? (
              <AlertTriangle className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Award className="mr-1 h-3.5 w-3.5 text-blue-500" />
            )}
            Confidence: {Math.round(grade.confidence * 100)}%
          </Badge>
        )}
      </div>

      {/* Low-confidence alert */}
      {needsReview && (
        <Alert variant="destructive" className="bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="font-semibold">Review Required (Confidence &lt; 60%)</AlertTitle>
          <AlertDescription className="text-sm mt-1">
            The AI grader has low confidence in this assessment. Evidence has not been awarded yet.
            Please inspect the criteria below, confirm the evaluation, or override if appropriate.
          </AlertDescription>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={handleConfirmReview}
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Confirm Grade
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsOverrideOpen(true)}
              className="border-amber-600/40 text-amber-800 dark:text-amber-200"
            >
              Override Grade
            </Button>
          </div>
        </Alert>
      )}

      {/* Pending grade copy (PRD requirement 5) */}
      {isPendingGrade && (
        <Alert className="bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-200">
          <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle className="font-semibold">AI is paused until tomorrow</AlertTitle>
          <AlertDescription className="text-sm mt-1">
            AI is paused until tomorrow. Your answer is saved and will be graded then.
          </AlertDescription>
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsSelfGradeOpen(true)}
              className="border-blue-500/40 text-blue-800 dark:text-blue-200"
            >
              Self-grade in the meantime
            </Button>
          </div>
        </Alert>
      )}

      {/* Override Reason Note (if overridden) */}
      {grade.source === "user_override" && grade.override_reason && (
        <div className="rounded-lg bg-muted/60 p-3 text-sm border">
          <div className="font-medium text-xs text-muted-foreground uppercase tracking-wider mb-1">
            User Override Reason:
          </div>
          <div>&ldquo;{grade.override_reason}&rdquo;</div>
        </div>
      )}

      {/* Summary feedback */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">Feedback Summary</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">{summaryFeedback}</p>

        {strengths.length > 0 && (
          <div className="mt-2 space-y-1">
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Strengths:
            </span>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
              {strengths.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {improvements.length > 0 && (
          <div className="mt-2 space-y-1">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
              Areas for Improvement:
            </span>
            <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
              {improvements.map((imp, idx) => (
                <li key={idx}>{imp}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* S11 Accordion: Rubric Criteria & Scores */}
      {combinedCriteria.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Criteria Breakdown</h4>
          <Accordion className="w-full">
            {combinedCriteria.map((crit, idx) => (
              <AccordionItem
                key={idx}
                value={`item-${idx}`}
                title={
                  <div className="flex items-center justify-between w-full pr-4 text-sm">
                    <span className="font-medium">{crit.criterion}</span>
                    <div className="flex items-center gap-2">
                      {crit.weight !== undefined && (
                        <span className="text-xs text-muted-foreground">({crit.weight}%)</span>
                      )}
                      <Badge
                        variant={crit.score === 2 ? "default" : crit.score === 1 ? "secondary" : "destructive"}
                        className="text-xs font-mono"
                      >
                        {crit.score} / {crit.max_score || 2} pts
                      </Badge>
                    </div>
                  </div>
                }
              >
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {crit.description && <p><strong className="text-foreground">Expectation:</strong> {crit.description}</p>}
                  {crit.feedback && <p><strong className="text-foreground">Feedback:</strong> {crit.feedback}</p>}
                </div>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      {/* Action: Override Button */}
      {!isPendingGrade && (
        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsOverrideOpen(true)}
            className="gap-1.5"
          >
            <Edit3 className="h-4 w-4" />
            <span>Override Grade</span>
          </Button>
        </div>
      )}

      {/* S11 Dialog: Override Grade Modal */}
      <Dialog open={isOverrideOpen} onOpenChange={setIsOverrideOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override Assessment Grade</DialogTitle>
            <DialogDescription>
              Adjust criteria scores or verdict. A required short reason will be stored for audit.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleOverrideSubmit} className="space-y-4 py-2">
            {errorMsg && (
              <div className="rounded-md bg-destructive/15 p-2 text-xs text-destructive">
                {errorMsg}
              </div>
            )}

            {/* Verdict selector */}
            <Field label="Overall Verdict">
              <div className="flex gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant={overrideVerdict === "pass" ? "default" : "outline"}
                  onClick={() => setOverrideVerdict("pass")}
                  className={overrideVerdict === "pass" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Pass
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={overrideVerdict === "fail" ? "destructive" : "outline"}
                  onClick={() => setOverrideVerdict("fail")}
                >
                  <XCircle className="mr-1.5 h-4 w-4" /> Fail
                </Button>
              </div>
            </Field>

            {/* Criteria Scores override */}
            {combinedCriteria.length > 0 && (
              <div className="space-y-2 border-y py-3">
                <span className="text-xs font-semibold text-foreground">Criterion Scores (0 - 2):</span>
                {combinedCriteria.map((c) => (
                  <div key={c.criterion} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[200px]">{c.criterion}</span>
                    <div className="flex items-center gap-1">
                      {[0, 1, 2].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() =>
                            setOverrideScores((prev) => ({ ...prev, [c.criterion]: val }))
                          }
                          className={`h-7 w-7 rounded border text-xs font-semibold transition-colors ${
                            (overrideScores[c.criterion] ?? c.score) === val
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/40 hover:bg-muted"
                          }`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Required Short Reason */}
            <Field label="Required Short Reason *">
              <Textarea
                placeholder="Explain why this grade is being adjusted..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                required
                className="text-sm"
              />
            </Field>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsOverrideOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Override"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Self-Grade Modal when AI paused */}
      <Dialog open={isSelfGradeOpen} onOpenChange={setIsSelfGradeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Self-Grade Your Answer</DialogTitle>
            <DialogDescription>
              Mark your own answer while AI grading is paused. Note: Self-grading remains E0 (&ldquo;Self-rated&rdquo;) and never counts toward verified mastery.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 py-3">
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleSelfGrade("pass")}
              disabled={isSubmitting}
            >
              I Mastered This (Pass)
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleSelfGrade("fail")}
              disabled={isSubmitting}
            >
              Need More Practice (Fail)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
