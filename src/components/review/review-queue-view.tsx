"use client";

import * as React from "react";
import Link from "next/link";
import { ReviewItem, ReviewVerdict } from "@/lib/review/scheduler";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  HelpCircle,
  Eye,
  Check,
  CalendarCheck,
} from "lucide-react";

export interface ReviewQueueViewProps {
  initialItems: ReviewItem[];
  dueSkillsCount: number;
  totalEstimatedMinutes: number;
}

export function ReviewQueueView({
  initialItems,
  dueSkillsCount: _dueSkillsCount,
  totalEstimatedMinutes: _totalEstimatedMinutes,
}: ReviewQueueViewProps) {
  const [items] = React.useState<ReviewItem[]>(initialItems);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [selectedOption, setSelectedOption] = React.useState<string | null>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [results, setResults] = React.useState<Record<string, ReviewVerdict>>({});
  const [sessionFinished, setSessionFinished] = React.useState(false);

  const currentItem = items[currentIndex];

  // 1. Empty State: "Nothing due today."
  if (!items || items.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4 space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
          <CalendarCheck className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Nothing due today.
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You are completely caught up on your spaced reviews! Continue with your daily learning session or view your mastery progress.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link href="/today">
            <Button variant="default" className="w-full sm:w-auto">
              <ArrowLeft className="mr-2 h-4 w-4" /> Return to Today
            </Button>
          </Link>
          <Link href="/progress">
            <Button variant="outline" className="w-full sm:w-auto">
              View Progress
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // 2. Session Finished State
  if (sessionFinished || !currentItem) {
    const passedCount = Object.values(results).filter((v) => v === "pass").length;
    return (
      <div className="max-w-md mx-auto text-center py-16 px-4 space-y-6">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Sparkles className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Spaced Review Complete!
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You reviewed {items.length} item{items.length === 1 ? "" : "s"} ({passedCount} recalled successfully). Your next intervals and due dates have been scheduled.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link href="/today">
            <Button variant="default" className="w-full sm:w-auto">
              Return to Today
            </Button>
          </Link>
          <Link href="/progress">
            <Button variant="outline" className="w-full sm:w-auto">
              View Progress
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // 3. Handle Answering / Submitting Outcome
  const submitOutcome = async (verdict: ReviewVerdict) => {
    try {
      setIsSubmitting(true);
      setResults((prev) => ({ ...prev, [currentItem.id]: verdict }));

      // Call API
      await fetch("/api/v1/review/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skill_id: currentItem.skill_id,
          item_id: currentItem.id,
          item_type: currentItem.type,
          verdict,
        }),
      });

      // Move to next item or finish
      if (currentIndex + 1 < items.length) {
        setCurrentIndex((i) => i + 1);
        setSelectedOption(null);
        setIsAnswerRevealed(false);
      } else {
        setSessionFinished(true);
      }
    } catch (err) {
      console.error("Failed to submit review outcome:", err);
      if (currentIndex + 1 < items.length) {
        setCurrentIndex((i) => i + 1);
        setSelectedOption(null);
        setIsAnswerRevealed(false);
      } else {
        setSessionFinished(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecallSelect = (opt: string) => {
    if (selectedOption !== null) return;
    setSelectedOption(opt);
    const isCorrect =
      currentItem.answer_key &&
      (opt.trim().toLowerCase() === currentItem.answer_key.trim().toLowerCase() ||
        currentItem.answer_key.toLowerCase().includes(opt.trim().toLowerCase()));

    // Automatic evaluation for recall
    setTimeout(() => {
      submitOutcome(isCorrect ? "pass" : "fail");
    }, 1200);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      {/* Top Navigation & Queue Progress */}
      <div className="flex items-center justify-between">
        <Link href="/today" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Today
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {currentIndex + 1} of {items.length} due
          </Badge>
          <Badge variant="secondary" className="text-xs">
            Max 15 min
          </Badge>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
        <div
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
        />
      </div>

      {/* Question Card */}
      <div className="bg-card border border-border/80 rounded-xl p-6 sm:p-8 shadow-sm space-y-6">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-border/50">
          <div>
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              {currentItem.skill_name}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {currentItem.type === "recall_question" ? "Recall Review" : "Saved Flashcard"}
              </Badge>
              {currentItem.type === "saved_card" && (
                <span className="text-[11px] text-muted-foreground">
                  Self-rated · Evidence stays E0
                </span>
              )}
            </div>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            <span>~{currentItem.estimated_minutes}m</span>
          </div>
        </div>

        {/* Question Prompt */}
        <div className="space-y-2">
          <h3 className="text-lg sm:text-xl font-semibold text-foreground leading-snug">
            {currentItem.prompt}
          </h3>
        </div>

        {/* Question Body: Case 1: Recall Multiple Choice or True/False */}
        {currentItem.type === "recall_question" && currentItem.options && (
          <div className="space-y-3 pt-2">
            {currentItem.options.map((opt, i) => {
              const isSelected = selectedOption === opt;
              const isAnswer =
                currentItem.answer_key &&
                (opt.trim().toLowerCase() === currentItem.answer_key.trim().toLowerCase() ||
                  currentItem.answer_key.toLowerCase().includes(opt.trim().toLowerCase()));

              let btnClass = "border-border hover:bg-muted/50 text-foreground";
              if (selectedOption !== null) {
                if (isAnswer) {
                  btnClass = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 font-semibold";
                } else if (isSelected) {
                  btnClass = "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200";
                } else {
                  btnClass = "opacity-50 border-border text-muted-foreground";
                }
              }

              return (
                <button
                  key={i}
                  disabled={selectedOption !== null || isSubmitting}
                  onClick={() => handleRecallSelect(opt)}
                  className={`w-full text-left p-4 rounded-lg border text-sm transition-all flex items-center justify-between ${btnClass}`}
                >
                  <span>{opt}</span>
                  {selectedOption !== null && isAnswer && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 ml-2" />
                  )}
                  {selectedOption !== null && isSelected && !isAnswer && (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Question Body: Case 2: Saved Card (Self-rated) */}
        {currentItem.type === "saved_card" && (
          <div className="space-y-4 pt-2">
            {!isAnswerRevealed ? (
              <Button
                variant="outline"
                onClick={() => setIsAnswerRevealed(true)}
                className="w-full py-6 text-sm font-medium gap-2 border-dashed"
              >
                <Eye className="h-4 w-4" /> Show Answer
              </Button>
            ) : (
              <div className="p-4 rounded-lg bg-muted/40 border border-border/80 space-y-4 animate-in fade-in duration-200">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Answer
                  </span>
                  <p className="text-sm text-foreground leading-relaxed">
                    {currentItem.answer || "No answer text provided."}
                  </p>
                </div>

                <div className="pt-2 border-t border-border/40 space-y-2">
                  <span className="text-xs text-muted-foreground font-medium block">
                    How well did you recall this?
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => submitOutcome("fail")}
                      className="border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 gap-2"
                    >
                      <RotateCcw className="h-4 w-4" /> Need to review (1d)
                    </Button>
                    <Button
                      variant="default"
                      disabled={isSubmitting}
                      onClick={() => submitOutcome("pass")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                    >
                      <Check className="h-4 w-4" /> Knew it (Pass)
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
