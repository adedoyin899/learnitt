"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ProgressView } from "@/components/progress/progress-view";
import { ProgressDataPayload } from "@/lib/progress/stats";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

function ProgressPageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 pt-8">
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const goalIdParam = searchParams.get("goal_id");

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<ProgressDataPayload | null>(null);

  React.useEffect(() => {
    let mounted = true;

    async function loadProgress() {
      try {
        setLoading(true);
        const url = `/api/v1/progress${goalIdParam ? `?goal_id=${goalIdParam}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error("Failed to load progress data");
        }
        const payload = await res.json();
        if (mounted) {
          setData(payload);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to load progress");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadProgress();

    return () => {
      mounted = false;
    };
  }, [goalIdParam]);

  if (loading) {
    return <ProgressPageSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4 pt-20">
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Progress Unavailable</AlertTitle>
          <AlertDescription>{error || "Unable to load progress records."}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push("/today")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Return to Today
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4">
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
