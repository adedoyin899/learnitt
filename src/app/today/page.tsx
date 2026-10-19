import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { TodayClient } from "@/components/today/today-client";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import Link from "next/link";

export default async function TodayPage() {
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore
    .getAll()
    .some((c) => c.name.includes("auth-token") || c.name === "sb-mock-auth");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !hasAuthCookie) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/70 backdrop-blur-md px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/today" className="flex items-center gap-2">
            <div className="size-6 rounded bg-primary flex items-center justify-center text-primary-foreground font-mono text-xs font-bold">
              L
            </div>
            <span className="font-mono text-sm tracking-wider uppercase font-semibold">
              Learnitt
            </span>
          </Link>
          <div className="hidden sm:flex items-center gap-1 border-l border-border pl-3">
            <Link href="/today" className="px-2.5 py-1 text-xs font-medium text-foreground bg-surface rounded-md">
              Today
            </Link>
            <Link href="/plan" className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              Plan
            </Link>
          </div>
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
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </form>
        </div>
      </header>

      {/* Main Today Screen (S08 & S09) */}
      <main className="flex-1 w-full pb-16">
        <TodayClient />
      </main>
    </div>
  );
}
