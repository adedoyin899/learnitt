"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ProgressView } from "@/components/progress/progress-view";
import { ProgressDataPayload } from "@/lib/progress/stats";
import { Skeleton } from "@/components/ui/skeleton";
import { StateCard } from "@/components/ui/state-card";

function ProgressPageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6 pt-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

function ProgressPageContent() {
  const searchParams = useSearchParams();
  const goalIdParam = searchParams.get("goal_id");

  const [loading, setLoading] = React.useState(true);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ProgressDataPayload | null>(null);

  const loadProgress = React.useCallback(async () => {
    try {
      setLoading(true);
      setErrorStatus(null);
      setErrorMsg(null);
      const url = `/api/v1/progress${goalIdParam ? `?goal_id=${goalIdParam}` : ""}`;
      const res = await fetch(url);
      if (res.status === 401) {
        setErrorStatus(401);
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load progress data");
      }
      const payload = await res.json();
      setData(payload);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to load progress records");
    } finally {
      setLoading(false);
    }
  }, [goalIdParam]);

  React.useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  if (loading) {
    return <ProgressPageSkeleton />;
  }

  if (errorStatus === 401) {
    return (
      <StateCard
        type="unauthorized"
        title="Sign In to Track Progress"
        description="View your verified skills timeline, MVD streaks, and mathematically calibrated retention curves."
        actionText="Sign In"
        actionHref="/login?redirect=/progress"
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  if (errorMsg || !data) {
    return (
      <StateCard
        type="error"
        title="Unable to Load Progress"
        description={errorMsg || "We encountered a temporary issue retrieving your progress history."}
        actionText="Try Again"
        onRetry={loadProgress}
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-6 sm:py-8 px-4">
      <ProgressView initialData={data} />
    </div>
  );
}

export default function ProgressPage() {
  return (
    <React.Suspense fallback={<ProgressPageSkeleton />}>
      <ProgressPageContent />
    </React.Suspense>
  );
}
