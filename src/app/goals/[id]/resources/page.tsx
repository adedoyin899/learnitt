"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/ui/site-header";
import { PageHeader } from "@/components/ui/page-header";
import { ApprovalQueue, ResourceItem } from "@/components/resources/approval-queue";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function GoalResourcesPage() {
  const params = useParams();
  const goalId = params?.id as string;

  const [loading, setLoading] = React.useState(true);
  const [resources, setResources] = React.useState<ResourceItem[]>([]);
  const [activeJob, setActiveJob] = React.useState<{
    id: string;
    status: string;
    last_error: string | null;
  } | null>(null);

  React.useEffect(() => {
    if (!goalId) return;

    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/goals/${goalId}/resources`);
        if (res.ok) {
          const json = await res.json();
          if (mounted) {
            setResources(json.data.resources || []);
            setActiveJob(json.data.activeJob || null);
          }
        }
      } catch (err) {
        console.error("Failed to load goal resources:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();
    return () => {
      mounted = false;
    };
  }, [goalId]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <SiteHeader
        brand={
          <Link href="/" className="font-bold text-lg tracking-tight">
            <span className="text-primary font-mono">Learnitt</span>
          </Link>
        }
      />

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <Link
            href={`/goals/${goalId}/graph`}
            className="hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to Skill Graph
          </Link>
          <span>/</span>
          <span className="text-primary font-mono">Resources (S06)</span>
        </div>

        <PageHeader
          title="Resource Discovery & Approval"
          description="Vetted external learning resources matching your skills and materials gaps. Nothing is added to your daily schedule without approval."
        />

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : (
          <ApprovalQueue
            goalId={goalId}
            initialResources={resources}
            initialActiveJob={activeJob}
          />
        )}
      </main>
    </div>
  );
}
