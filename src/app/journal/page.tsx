"use client";

import * as React from "react";
import { JournalView, JournalEntryItem } from "@/components/journal/journal-view";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function JournalPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [entries, setEntries] = React.useState<JournalEntryItem[]>([]);
  const [skills, setSkills] = React.useState<Array<{ id: string; name: string }>>([]);

  React.useEffect(() => {
    let mounted = true;

    async function loadJournal() {
      try {
        setLoading(true);

        // Fetch journal entries
        const res = await fetch("/api/v1/journal");
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
            const activeGoal = (goalsData.goals || []).find((g: any) => g.status === "active") || goalsData.goals?.[0];
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
          // Optional skills fetch
        }

        if (mounted) {
          setEntries(data.entries || []);
          setSkills(loadedSkills);
          setError(null);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to load journal");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadJournal();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 text-center space-y-4 pt-20">
        <Alert variant="destructive">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle>Journal Unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push("/today")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Return to Today
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-6 px-4">
      <JournalView initialEntries={entries} skills={skills} />
    </div>
  );
}
