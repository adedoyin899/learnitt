"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { QuizView, QuizData, QuestionData } from "@/components/quiz/quiz-view";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function QuizPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [quizData, setQuizData] = React.useState<{ quiz: QuizData; questions: QuestionData[] } | null>(null);

  React.useEffect(() => {
    if (!id) return;

    let mounted = true;
    async function loadQuiz() {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/quizzes/${id}`);
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Quiz not found" : "Failed to load quiz");
        }
        const data = await res.json();
        if (mounted) {
          setQuizData(data);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to load quiz");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadQuiz();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !quizData) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 max-w-xl mx-auto flex flex-col justify-center items-center text-center pt-24">
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Quiz Unavailable</AlertTitle>
          <AlertDescription>{error || "Unable to display this quiz."}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  return <QuizView quiz={quizData.quiz} questions={quizData.questions} />;
}
