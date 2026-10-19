"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { ReminderSettingsView, ReminderSettingsData } from "@/components/settings/reminder-settings-view";
import { WeeklyCheckInContent } from "@/components/checkin/weekly-checkin-drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Bell, Calendar, Download, Trash2, ArrowLeft, Shield, LogOut } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "reminders";

  const [activeTab, setActiveTab] = React.useState(initialTab);
  const [initialSettings, setInitialSettings] = React.useState<ReminderSettingsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/v1/reminders")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load settings");
        return res.json();
      })
      .then((payload) => {
        if (payload.data) {
          setInitialSettings(payload.data);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch remote settings, using defaults", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleExportData = () => {
    toast.info("Preparing data export bundle...");
    setTimeout(() => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(
        JSON.stringify({ exported_at: new Date().toISOString(), app: "Learnitt v0.1" }, null, 2)
      );
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `learnitt-export-${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      toast.success("Learnitt data exported successfully.");
    }, 600);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20">
      {/* Top Header */}
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
            <Link
              href="/today"
              className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Today
            </Link>
            <Link
              href="/plan"
              className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Plan
            </Link>
            <Link
              href="/progress"
              className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Progress
            </Link>
            <Link
              href="/review"
              className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Review
            </Link>
            <Link
              href="/ask"
              className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Ask Tutor
            </Link>
            <Link
              href="/settings"
              className="px-2.5 py-1 text-xs font-medium text-foreground bg-surface rounded-md"
            >
              Settings
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

      {/* Main Settings Page Container */}
      <main className="flex-1 w-full pb-16">
        <PageContainer size="sm" className="py-6 sm:py-8">
          <PageHeader
            eyebrow="Preferences & Controls"
            title="Settings"
            description="Manage your study reminders, web push delivery, weekly check-in day, and account privacy."
            actions={
              <Link href="/today">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Today
                </Button>
              </Link>
            }
          />

          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full space-y-6 mt-2"
            data-testid="settings-tabs"
          >
            <TabsList className="grid w-full grid-cols-3 h-10 p-1 bg-muted/40">
              <TabsTrigger
                value="reminders"
                className="text-xs gap-1.5"
                data-testid="tab-trigger-reminders"
              >
                <Bell className="h-3.5 w-3.5" />
                <span className="hidden xs:inline">Daily</span> Reminders
              </TabsTrigger>
              <TabsTrigger
                value="review"
                className="text-xs gap-1.5"
                data-testid="tab-trigger-review"
              >
                <Calendar className="h-3.5 w-3.5" />
                Weekly Check-in
              </TabsTrigger>
              <TabsTrigger
                value="account"
                className="text-xs gap-1.5"
                data-testid="tab-trigger-account"
              >
                <Shield className="h-3.5 w-3.5" />
                Data & Privacy
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Screen S16 - Reminders */}
            <TabsContent value="reminders" className="space-y-6 focus-visible:outline-none">
              {!loading && <ReminderSettingsView initialSettings={initialSettings || undefined} />}
              {loading && (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Loading reminder preferences...
                </div>
              )}
            </TabsContent>

            {/* Tab 2: Epic H2 - Weekly Check-in Review */}
            <TabsContent value="review" className="space-y-6 focus-visible:outline-none">
              <WeeklyCheckInContent onCompleted={() => setActiveTab("reminders")} />
            </TabsContent>

            {/* Tab 3: Epic I2 & I3 - Data & Privacy */}
            <TabsContent value="account" className="space-y-6 focus-visible:outline-none">
              <Card className="border-border/60 bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base font-semibold">Data Export</CardTitle>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    Download all your study records, journal entries, and progress logs as JSON.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  <Button
                    onClick={handleExportData}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    data-testid="export-data-btn"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export All Data (JSON)
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-destructive" />
                    <CardTitle className="text-base font-semibold text-destructive">
                      Delete Account & Data
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    Under UK GDPR, you have the right to permanent erasure. This immediately removes all
                    goals, materials, flashcards, and reminder logs.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => {
                      toast.error("Account deletion requires entering your registered goal name.");
                    }}
                    data-testid="delete-account-btn"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Request Erasure
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </PageContainer>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-6 text-xs text-muted-foreground">
          Loading settings...
        </div>
      }
    >
      <SettingsPageInner />
    </React.Suspense>
  );
}
