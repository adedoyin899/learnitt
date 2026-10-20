"use client";

import * as React from "react";
import { ReviewQueueView } from "@/components/review/review-queue-view";
import { ReviewItem } from "@/lib/review/scheduler";
import { Skeleton } from "@/components/ui/skeleton";
import { StateCard } from "@/components/ui/state-card";

export default function ReviewPage() {
  const [loading, setLoading] = React.useState(true);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<ReviewItem[]>([]);
  const [dueSkillsCount, setDueSkillsCount] = React.useState(0);
  const [totalEstimatedMinutes, setTotalEstimatedMinutes] = React.useState(0);

  const loadDueItems = React.useCallback(async () => {
    try {
      setLoading(true);
      setErrorStatus(null);
      setErrorMsg(null);
      const res = await fetch("/api/v1/review/due");
      if (res.status === 401) {
        setErrorStatus(401);
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load spaced review queue");
      }
      const data = await res.json();
      setItems(data.items || []);
      setDueSkillsCount(data.due_skills_count || 0);
      setTotalEstimatedMinutes(data.total_estimated_minutes || 0);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadDueItems();
  }, [loadDueItems]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6 pt-12">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (errorStatus === 401) {
    return (
      <StateCard
        type="unauthorized"
        title="Sign In for Spaced Review"
        description="Daily spaced repetition reinforces your long-term memory with short recall checks capped at 15 minutes."
        actionText="Sign In"
        actionHref="/login?redirect=/review"
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  if (errorMsg) {
    return (
      <StateCard
        type="error"
        title="Review Queue Unavailable"
        description={errorMsg}
        actionText="Try Again"
        onRetry={loadDueItems}
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-6 sm:py-8 px-4">
      <ReviewQueueView
        initialItems={items}
        dueSkillsCount={dueSkillsCount}
        totalEstimatedMinutes={totalEstimatedMinutes}
      />
    </div>
  );
}
