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

  // Fetch user profile from database
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone")
    .eq("id", user.id)
    .single();

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
                  L0 FOUNDATION
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

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" />
                <span>Next Milestone</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Milestone M1 / L1: Database schema and complete RLS test suite.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-2">
              <p>
                Foundation phase L0 provides the protected layout, authenticated session state, mock
                provider harness, PWA precaching shell, and secret bundle leak protection.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
