"use client";

import * as React from "react";
import { ReviewQueueView } from "@/components/review/review-queue-view";
import { ReviewItem } from "@/lib/review/scheduler";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ReviewPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<ReviewItem[]>([]);
  const [dueSkillsCount, setDueSkillsCount] = React.useState(0);
  const [totalEstimatedMinutes, setTotalEstimatedMinutes] = React.useState(0);

  React.useEffect(() => {
    let mounted = true;

    async function loadDueItems() {
      try {
        setLoading(true);
        const res = await fetch("/api/v1/review/due");
        if (!res.ok) {
          throw new Error("Failed to load spaced review queue");
        }
        const data = await res.json();
        if (mounted) {
          setItems(data.items || []);
          setDueSkillsCount(data.due_skills_count || 0);
          setTotalEstimatedMinutes(data.total_estimated_minutes || 0);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to load review queue");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDueItems();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6 pt-12">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4 pt-20">
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Review Queue Unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push("/today")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Return to Today
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4">
      <ReviewQueueView
        initialItems={items}
        dueSkillsCount={dueSkillsCount}
        totalEstimatedMinutes={totalEstimatedMinutes}
      />
    </div>
  );
}
