"use client";

import * as React from "react";
import { JournalView, JournalEntryItem } from "@/components/journal/journal-view";
import { Skeleton } from "@/components/ui/skeleton";
import { StateCard } from "@/components/ui/state-card";

export default function JournalPage() {
  const [loading, setLoading] = React.useState(true);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<JournalEntryItem[]>([]);
  const [skills, setSkills] = React.useState<Array<{ id: string; name: string }>>([]);

  const loadJournal = React.useCallback(async () => {
    try {
      setLoading(true);
      setErrorStatus(null);
      setError(null);

      // Fetch journal entries
      const res = await fetch("/api/v1/journal");
      if (res.status === 401) {
        setErrorStatus(401);
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load journal timeline");
      }
      const data = await res.json();

      // Fetch active goal skills for optional linking
      let loadedSkills: Array<{ id: string; name: string }> = [];
      try {
        const goalsRes = await fetch("/api/v1/goals");
        if (goalsRes.ok) {
          const goalsData = await goalsRes.json();
          const activeGoal =
            (goalsData.goals || []).find((g: any) => g.status === "active") ||
            goalsData.goals?.[0];
          if (activeGoal) {
            const skillsRes = await fetch(`/api/v1/goals/${activeGoal.id}/skills`);
            if (skillsRes.ok) {
              const skillsData = await skillsRes.json();
              loadedSkills = (skillsData.skills || []).map((s: any) => ({
                id: s.id,
                name: s.name,
              }));
            }
          }
        }
      } catch {
        // Optional skills fetch fallback
      }

      setEntries(data.entries || []);
      setSkills(loadedSkills);
    } catch (err: any) {
      setError(err.message || "Failed to load journal");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadJournal();
  }, [loadJournal]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4 pt-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (errorStatus === 401) {
    return (
      <StateCard
        type="unauthorized"
        title="Sign In for Study Journal"
        description="Daily session reflections and learning notes are stored privately with full edit version histories."
        actionText="Sign In"
        actionHref="/login?redirect=/journal"
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  if (error) {
    return (
      <StateCard
        type="error"
        title="Journal Unavailable"
        description={error}
        actionText="Try Again"
        onRetry={loadJournal}
        secondaryText="Return to Today"
        secondaryHref="/today"
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-4 sm:py-6 px-3 sm:px-4">
      <JournalView initialEntries={entries} skills={skills} />
    </div>
  );
}
