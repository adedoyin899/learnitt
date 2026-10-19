"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { EvidenceBadge } from "@/components/evidence/evidence-badge";
import { GradeData, GradeReview } from "@/components/quiz/grade-review";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

export interface QuestionData {
  id: string;
  quiz_id: string;
  position: number;
  type: "recall_mc" | "recall_tf" | "applied" | "artifact";
  prompt: string;
  options?: string[] | null;
  rubric?: Array<{ criterion: string; weight: number; description: string }> | null;
  source_chunk_ids?: string[];
}

export interface QuizData {
  id: string;
  skill_id: string;
  model_version?: string | null;
  created_at: string;
  skill?: {
    id: string;
    name: string;
    verification_type: "recall" | "applied" | "artifact" | "self";
    evidence_level?: number;
  } | null;
}

interface QuizViewProps {
  quiz: QuizData;
  questions: QuestionData[];
}

export function QuizView({ quiz, questions }: QuizViewProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [confirmedTicks, setConfirmedTicks] = React.useState<Record<string, boolean>>({});
  const [expectedOutputs, setExpectedOutputs] = React.useState<Record<string, string>>({});
  const [clientIds, setClientIds] = React.useState<Record<string, string>>({});
  const [results, setResults] = React.useState<
    Record<
      string,
      {
        attempt: any;
        grade?: GradeData | null;
        message?: string;
      }
    >
  >({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const currentQ = questions[currentIndex];
  const progressPercent =
    questions.length > 0 ? Math.round(((currentIndex + 1) / questions.length) * 100) : 0;

  // Generate or retrieve idempotency client_id per question
  function getClientId(questionId: string) {
    if (!clientIds[questionId]) {
      const id = crypto.randomUUID();
      setClientIds((prev) => ({ ...prev, [questionId]: id }));
      return id;
    }
    return clientIds[questionId];
  }

  // Submit Answer
  async function handleSubmitCurrent() {
    if (!currentQ) return;
    const answer = answers[currentQ.id];
    if (!answer && currentQ.type !== "artifact") {
      setSubmitError("Please select or enter an answer.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const clientId = getClientId(currentQ.id);

    try {
      const res = await fetch(`/api/v1/questions/${currentQ.id}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          answer_text: answer || "",
          user_confirmed_run: confirmedTicks[currentQ.id] || false,
          expected_output: expectedOutputs[currentQ.id] || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit answer");
      }

      setResults((prev) => ({
        ...prev,
        [currentQ.id]: {
          attempt: data.attempt,
          grade: data.grade,
          message: data.message,
        },
      }));
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit answer");
    } finally {
      setIsSubmitting(false);
    }
  }

  const currentResult = currentQ ? results[currentQ.id] : null;
  const isAnswered = !!currentResult;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* Top Header & Skill evidence strength */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>
          {quiz.skill && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Current evidence:</span>
              <EvidenceBadge level={(quiz.skill.evidence_level as any) || 0} />
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {quiz.skill?.name ? `${quiz.skill.name} Assessment` : "Mastery Assessment"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Demonstrate your mastery with recall and applied questions.
          </p>
        </div>
      </div>

      {/* Progress Indicator (PRD S10: Progress) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
          <span>
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span>{progressPercent}% Complete</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Main Question Card (PRD S10: Question Card) */}
      {currentQ && (
        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <Badge variant="outline" className="capitalize text-xs">
                {currentQ.type === "recall_mc" && "Recall · Multiple Choice"}
                {currentQ.type === "recall_tf" && "Recall · True / False"}
                {currentQ.type === "applied" && "Applied · Practical Task"}
                {currentQ.type === "artifact" && "Artifact · Code / Project Capstone"}
              </Badge>
              {currentQ.source_chunk_ids && currentQ.source_chunk_ids.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  Citing {currentQ.source_chunk_ids.length} material chunk(s)
                </Badge>
              )}
            </div>
            <CardTitle className="text-lg leading-relaxed pt-2">
              {currentQ.prompt}
            </CardTitle>
            <CardDescription className="text-xs">
              {currentQ.type.startsWith("recall")
                ? "Marked deterministically against verified source materials."
                : "Graded objectively by AI against the structured rubric criteria below."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* PRD S10 Requirement 2: The rubric is shown BEFORE the user answers an applied or artifact question */}
            {(currentQ.type === "applied" || currentQ.type === "artifact") &&
              currentQ.rubric &&
              currentQ.rubric.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <span>Evaluation Rubric (Review before answering)</span>
                  </div>
                  <div className="space-y-2">
                    {currentQ.rubric.map((r, idx) => (
                      <div
                        key={idx}
                        className="rounded-md border bg-card p-2.5 text-xs text-card-foreground shadow-2xs"
                      >
                        <div className="flex items-center justify-between font-medium">
                          <span>{r.criterion}</span>
                          <span className="font-mono text-muted-foreground font-semibold">
                            {r.weight}%
                          </span>
                        </div>
                        <p className="mt-1 text-muted-foreground">{r.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Question Inputs */}
            {!isAnswered ? (
              <div className="space-y-4">
                {/* 1. Recall Multiple Choice or True/False (PRD S10: Radio Group) */}
                {currentQ.type.startsWith("recall") && currentQ.options && (
                  <RadioGroup
                    value={answers[currentQ.id] || ""}
                    onValueChange={(val) => {
                      setAnswers((prev) => ({ ...prev, [currentQ.id]: val }));
                    }}
                    className="space-y-2.5"
                  >
                    {currentQ.options.map((opt, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [currentQ.id]: String(idx) }))
                        }
                      >
                        <RadioGroupItem value={String(idx)} id={`opt-${idx}`} />
                        <label
                          htmlFor={`opt-${idx}`}
                          className="flex-1 text-sm font-medium cursor-pointer"
                        >
                          {opt}
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {/* 2. Applied Answer (PRD S10: Textarea) */}
                {currentQ.type === "applied" && (
                  <Field label="Your Applied Answer">
                    <Textarea
                      placeholder="Write your explanation or code application here..."
                      value={answers[currentQ.id] || ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                      }
                      rows={6}
                      className="text-sm leading-relaxed"
                    />
                  </Field>
                )}

                {/* 3. Artifact Answer (PRD Section 6, 7 & Prompt 7) */}
                {currentQ.type === "artifact" && (
                  <div className="space-y-4">
                    <Field label="Artifact Code, Query or Solution">
                      <Textarea
                        placeholder="Paste your query, script, or solution details..."
                        value={answers[currentQ.id] || ""}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [currentQ.id]: e.target.value }))
                        }
                        rows={6}
                        className="text-sm font-mono"
                      />
                    </Field>

                    <Field label="Expected Output (optional)">
                      <Input
                        placeholder="State expected output from running your code..."
                        value={expectedOutputs[currentQ.id] || ""}
                        onChange={(e) =>
                          setExpectedOutputs((prev) => ({
                            ...prev,
                            [currentQ.id]: e.target.value,
                          }))
                        }
                      />
                    </Field>

                    {/* Critical requirement 7: 'Confirm you ran it and it matched' tick */}
                    <div className="flex items-start gap-3 rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3.5">
                      <Checkbox
                        id="confirm-run-tick"
                        checked={confirmedTicks[currentQ.id] || false}
                        onCheckedChange={(checked) =>
                          setConfirmedTicks((prev) => ({
                            ...prev,
                            [currentQ.id]: !!checked,
                          }))
                        }
                      />
                      <label
                        htmlFor="confirm-run-tick"
                        className="text-xs leading-normal cursor-pointer text-foreground"
                      >
                        <strong>Confirm you ran it and it matched</strong>
                        <p className="text-muted-foreground mt-0.5">
                          Only ticking this verification grants Evidence Level E3 (&ldquo;Artifact checked&rdquo;).
                        </p>
                      </label>
                    </div>
                  </div>
                )}

                {submitError && (
                  <div className="rounded-md bg-destructive/15 p-3 text-xs text-destructive">
                    {submitError}
                  </div>
                )}

                <Button
                  onClick={handleSubmitCurrent}
                  disabled={isSubmitting}
                  className="w-full gap-2 font-medium"
                >
                  {isSubmitting ? "Submitting..." : "Submit Answer"}
                </Button>
              </div>
            ) : (
              /* Already answered: Show Results & S11 Grade Review */
              <div className="space-y-4">
                {currentResult.grade ? (
                  <GradeReview
                    grade={currentResult.grade}
                    rubric={currentQ.rubric}
                    attemptStatus={currentResult.attempt.status}
                    onOverrideSuccess={(newGrade) => {
                      setResults((prev) => ({
                        ...prev,
                        [currentQ.id]: {
                          ...prev[currentQ.id],
                          grade: newGrade,
                        },
                      }));
                    }}
                    onConfirmReviewSuccess={() => {
                      setResults((prev) => ({
                        ...prev,
                        [currentQ.id]: {
                          ...prev[currentQ.id],
                          attempt: { ...prev[currentQ.id].attempt, status: "graded" },
                        },
                      }));
                    }}
                    onSelfGradeSuccess={(grade) => {
                      setResults((prev) => ({
                        ...prev,
                        [currentQ.id]: {
                          ...prev[currentQ.id],
                          grade,
                          attempt: { ...prev[currentQ.id].attempt, status: "graded" },
                        },
                      }));
                    }}
                  />
                ) : (
                  <Alert className="bg-muted">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Submitted</AlertTitle>
                    <AlertDescription className="text-xs mt-1">
                      {currentResult.message || "Your answer has been recorded."}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>

          {/* Navigation Footer */}
          <CardFooter className="flex items-center justify-between border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" /> Previous
            </Button>

            {currentIndex < questions.length - 1 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                className="gap-1.5"
              >
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => router.push("/today")}
                className="gap-1.5 bg-primary text-primary-foreground"
              >
                Done <CheckCircle2 className="h-4 w-4" />
              </Button>
            )}
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
