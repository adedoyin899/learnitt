import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LogOut, Calendar, CheckCircle2 } from "lucide-react";

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user profile and active goal from database
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone")
    .eq("id", user.id)
    .single();

  const { data: activeGoals } = await supabase
    .from("goals")
    .select("id, title, domain, target_date, weekly_hours, status")
    .eq("owner_id", user.id)
    .eq("status", "active")
    .limit(1);

  const currentActiveGoal = activeGoals?.[0];

  const displayName =
    profile?.display_name ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Learner";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-border bg-card/50 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-6 rounded bg-primary flex items-center justify-center text-primary-foreground font-mono text-xs font-bold">
            L
          </div>
          <span className="font-mono text-sm tracking-wider uppercase font-semibold">
            Learnitt
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action="/api/v1/auth/signout" method="POST">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-3.5" />
              <span>Sign out</span>
            </Button>
          </form>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        <PageHeader
          title={`Hello, ${displayName}`}
          description="Your goal-agnostic learning companion. Today's execution dashboard is ready."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Calendar className="size-4 text-primary" />
                  <span>Session Status</span>
                </CardTitle>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface text-muted-foreground border border-border">
                  L3 ACTIVE
                </span>
              </div>
              <CardDescription className="text-xs">
                Connected to Supabase auth with active session.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs space-y-2 text-muted-foreground">
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>Account ID</span>
                <span className="font-mono text-foreground">{user.id.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>Email</span>
                <span className="font-mono text-foreground">{user.email}</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Timezone</span>
                <span className="font-mono text-foreground">{profile?.timezone ?? "Europe/London"}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-success" />
                  <span>Active Learning Goal</span>
                </CardTitle>
                {currentActiveGoal && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-success/10 text-success border border-success/20 font-semibold uppercase">
                    Active
                  </span>
                )}
              </div>
              <CardDescription className="text-xs">
                {currentActiveGoal
                  ? `${currentActiveGoal.title} (${currentActiveGoal.weekly_hours} hrs/week)`
                  : "No active goal committed yet. Use the setup wizard or import a plan."}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-3">
              {currentActiveGoal ? (
                <div className="space-y-1 text-xs">
                  <p>Target Date: <span className="font-mono text-foreground">{currentActiveGoal.target_date}</span></p>
                  <p>Domain: <span className="text-foreground">{currentActiveGoal.domain}</span></p>
                </div>
              ) : (
                <p>
                  Create your goal, set weekly hours, and let Learnitt generate or import a verified skill graph.
                </p>
              )}
              <div className="flex gap-2 pt-1">
                {currentActiveGoal ? (
                  <a href={`/goals/${currentActiveGoal.id}/graph`} className="w-full">
                    <Button size="sm" variant="outline" className="w-full text-xs">
                      View Skill Graph &amp; Feasibility
                    </Button>
                  </a>
                ) : null}
                <a href="/goals/new" className={currentActiveGoal ? "w-full" : "w-full"}>
                  <Button size="sm" variant={currentActiveGoal ? "secondary" : "default"} className="w-full text-xs">
                    Setup New Goal
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
