"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { ReminderSettingsView, ReminderSettingsData } from "@/components/settings/reminder-settings-view";
import { WeeklyCheckInContent } from "@/components/checkin/weekly-checkin-drawer";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Bell,
  Calendar,
  Download,
  Trash2,
  ArrowLeft,
  Shield,
  LogOut,
  Cpu,
  AlertTriangle,
  Sparkles,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface UsageStats {
  today: { calls: number; tokens_in: number; tokens_out: number };
  week: { calls: number; tokens_in: number; tokens_out: number };
  budget: { daily_cap: number; remaining: number };
}

interface GoalSummary {
  id: string;
  title: string;
  status: string;
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "reminders";

  const [activeTab, setActiveTab] = React.useState(initialTab);
  const [initialSettings, setInitialSettings] = React.useState<ReminderSettingsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  // AI Usage & Consent states (Phase L12 Requirement 1)
  const [usageStats, setUsageStats] = React.useState<UsageStats | null>(null);
  const [aiConsent, setAiConsent] = React.useState<boolean>(false);
  const [consentLoading, setConsentLoading] = React.useState<boolean>(false);

  // Goal & Account Deletion states
  const [goals, setGoals] = React.useState<GoalSummary[]>([]);
  const [selectedGoalId, setSelectedGoalId] = React.useState<string>("");
  const [isDeleteGoalOpen, setIsDeleteGoalOpen] = React.useState<boolean>(false);
  const [deleteGoalInput, setDeleteGoalInput] = React.useState<string>("");
  const [isDeletingGoal, setIsDeletingGoal] = React.useState<boolean>(false);

  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = React.useState<boolean>(false);
  const [deleteAccountInput, setDeleteAccountInput] = React.useState<string>("");
  const [isDeletingAccount, setIsDeletingAccount] = React.useState<boolean>(false);

  const [isExporting, setIsExporting] = React.useState<boolean>(false);

  React.useEffect(() => {
    // 1. Fetch reminders
    fetch("/api/v1/reminders")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload?.data) setInitialSettings(payload.data);
      })
      .catch((err) => console.warn("Failed to load reminders", err))
      .finally(() => setLoading(false));

    // 2. Fetch AI usage stats
    fetch("/api/v1/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload?.data) setUsageStats(payload.data);
      })
      .catch((err) => console.warn("Failed to load AI usage", err));

    // 3. Fetch materials consent
    fetch("/api/v1/user/consent")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload?.status) setAiConsent(Boolean(payload.status.consent));
      })
      .catch((err) => console.warn("Failed to load consent", err));

    // 4. Fetch user goals for goal deletion
    fetch("/api/v1/goals")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload?.goals) {
          setGoals(payload.goals);
          if (payload.goals.length > 0) {
            setSelectedGoalId(payload.goals[0].id);
          }
        }
      })
      .catch((err) => console.warn("Failed to load goals", err));
  }, []);

  const handleConsentToggle = async (newVal: boolean) => {
    setConsentLoading(true);
    setAiConsent(newVal);
    try {
      const res = await fetch("/api/v1/user/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: newVal }),
      });
      if (!res.ok) throw new Error("Failed to update AI consent");
      toast.success(newVal ? "AI materials consent granted." : "AI materials consent revoked.");
    } catch {
      setAiConsent(!newVal);
      toast.error("Could not update consent preference.");
    } finally {
      setConsentLoading(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    toast.info("Preparing data export bundle (JSON + original materials)...");
    try {
      const res = await fetch("/api/v1/export", {
        method: "POST",
        headers: { Accept: "application/zip" },
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `learnitt-export-${new Date().toISOString().split("T")[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Learnitt data and materials exported successfully.");
    } catch {
      toast.error("Failed to generate export file. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const activeGoal = goals.find((g) => g.id === selectedGoalId);

  const handleDeleteGoal = async () => {
    if (!activeGoal) return;
    if (deleteGoalInput.trim().toLowerCase() !== activeGoal.title.trim().toLowerCase()) {
      toast.error(`Confirmation text must match "${activeGoal.title}"`);
      return;
    }

    setIsDeletingGoal(true);
    try {
      const res = await fetch(`/api/v1/goals/${activeGoal.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation_title: activeGoal.title }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete goal");

      toast.success(data.message || `Goal "${activeGoal.title}" deleted.`);
      setGoals((prev) => prev.filter((g) => g.id !== activeGoal.id));
      setIsDeleteGoalOpen(false);
      setDeleteGoalInput("");
      if (goals.length > 1) {
        setSelectedGoalId(goals.find((g) => g.id !== activeGoal.id)?.id || "");
      } else {
        setSelectedGoalId("");
      }
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to delete goal");
    } finally {
      setIsDeletingGoal(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteAccountInput.trim() !== "DELETE") {
      toast.error("Please type DELETE to confirm account erasure");
      return;
    }

    setIsDeletingAccount(true);
    try {
      const res = await fetch("/api/v1/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account");

      toast.success("Account and all associated data permanently deleted.");
      setIsDeleteAccountOpen(false);
      setTimeout(() => {
        router.push("/login");
      }, 800);
    } catch (err: unknown) {
      toast.error((err as Error).message || "Failed to delete account");
      setIsDeletingAccount(false);
    }
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
            description="Manage your study reminders, AI usage and consent, data exports, and account privacy."
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
                Data & Controls
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

            {/* Tab 3: Epic I & Phase L12 - Data, AI Usage & Account Controls */}
            <TabsContent value="account" className="space-y-6 focus-visible:outline-none">
              {/* 1. AI Usage & Cap Controls (Phase L12 Requirement 1) */}
              <Card className="border-border/60 bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base font-semibold">AI Usage & Cap</CardTitle>
                    </div>
                    {usageStats && (
                      <Badge variant="outline" className="text-xs font-mono">
                        {usageStats.today.calls} / {usageStats.budget.daily_cap} calls today
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    Learnitt protects your budget with a daily AI generation cap and cost controls.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-1">
                  {usageStats ? (
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                          <span>Today&apos;s AI Generation Quota</span>
                          <span>
                            {Math.round(
                              (usageStats.today.calls / (usageStats.budget.daily_cap || 1)) * 100
                            )}
                            % used
                          </span>
                        </div>
                        <Progress
                          value={usageStats.today.calls}
                          max={usageStats.budget.daily_cap || 30}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="p-2.5 rounded-lg border border-border/50 bg-background/50">
                          <span className="text-[11px] text-muted-foreground block">
                            Tokens processed (7d)
                          </span>
                          <span className="text-sm font-mono font-semibold">
                            {(usageStats.week.tokens_in + usageStats.week.tokens_out).toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg border border-border/50 bg-background/50">
                          <span className="text-[11px] text-muted-foreground block">
                            Estimated AI Cost (7d)
                          </span>
                          <span className="text-sm font-mono font-semibold text-emerald-500">
                            £
                            {(
                              ((usageStats.week.tokens_in + usageStats.week.tokens_out) / 1000000) *
                              0.3
                            ).toFixed(3)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">Loading AI usage stats...</div>
                  )}
                </CardContent>
              </Card>

              {/* 2. AI Materials Consent Toggle (Phase L12 Requirement 1 & PRD Epic I3) */}
              <Card className="border-border/60 bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base font-semibold">
                      Study Materials AI Consent
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    When enabled, passages from your uploaded documents can be securely retrieved to
                    answer tutor questions and construct tailored quizzes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50">
                    <div className="space-y-0.5">
                      <Label htmlFor="ai-consent-toggle" className="text-xs font-medium cursor-pointer">
                        Allow AI processing of uploaded materials
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        Consent can be granted or revoked at any time.
                      </p>
                    </div>
                    <Switch
                      id="ai-consent-toggle"
                      checked={aiConsent}
                      disabled={consentLoading}
                      onCheckedChange={handleConsentToggle}
                      data-testid="ai-consent-switch"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* 3. Data Export (Epic I1 & Phase L12) */}
              <Card className="border-border/60 bg-card/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Download className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base font-semibold">Data Export</CardTitle>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    Export all your data as JSON plus original uploaded materials as a ZIP archive
                    (POST /export).
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-1">
                  <Button
                    onClick={handleExportData}
                    disabled={isExporting}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5"
                    data-testid="export-data-btn"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {isExporting ? "Bundling Export..." : "Export All Data & Materials (.zip)"}
                  </Button>
                </CardContent>
              </Card>

              {/* 4. Danger Zone: Delete Goal & Delete Account (Epic I1) */}
              <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <CardTitle className="text-base font-semibold text-destructive">
                      Danger Zone
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs text-muted-foreground">
                    Irreversible account and goal deletion controls. Requires typed confirmation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-1">
                  {/* Delete Goal */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-destructive/20 bg-background/50">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold block">Delete Goal</span>
                      <p className="text-[11px] text-muted-foreground">
                        Removes this goal, its skills, plan items, materials, and queued jobs.
                      </p>
                    </div>
                    {goals.length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                        onClick={() => {
                          setDeleteGoalInput("");
                          setIsDeleteGoalOpen(true);
                        }}
                        data-testid="delete-goal-btn"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Delete Goal...
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No goals found</span>
                    )}
                  </div>

                  {/* Delete Account */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/10">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-destructive block">
                        Delete Account (Permanent Erasure)
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        Under UK GDPR, immediately purges all database rows, storage objects, and jobs.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => {
                        setDeleteAccountInput("");
                        setIsDeleteAccountOpen(true);
                      }}
                      data-testid="delete-account-btn"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Account...
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </PageContainer>
      </main>

      {/* Modal: Delete Goal Confirmation */}
      <Dialog open={isDeleteGoalOpen} onOpenChange={setIsDeleteGoalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base text-destructive flex items-center gap-2">
              <Trash2 className="size-4" />
              Delete Goal
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This action cannot be undone. All plan items, skills, uploaded materials, and queued
              jobs for this goal will be permanently removed.
            </DialogDescription>
          </DialogHeader>

          {activeGoal && (
            <div className="space-y-3 py-2">
              {goals.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">Select goal to delete</Label>
                  <select
                    className="w-full text-xs rounded-md border border-input bg-background p-2"
                    value={selectedGoalId}
                    onChange={(e) => setSelectedGoalId(e.target.value)}
                  >
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title} ({g.status})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="confirm-goal-title" className="text-xs">
                  To confirm, type <span className="font-semibold text-foreground">&quot;{activeGoal.title}&quot;</span>:
                </Label>
                <Input
                  id="confirm-goal-title"
                  placeholder={activeGoal.title}
                  value={deleteGoalInput}
                  onChange={(e) => setDeleteGoalInput(e.target.value)}
                  className="text-xs h-8"
                  data-testid="delete-goal-input"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteGoalOpen(false)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={
                !activeGoal ||
                deleteGoalInput.trim().toLowerCase() !== activeGoal.title.trim().toLowerCase() ||
                isDeletingGoal
              }
              onClick={handleDeleteGoal}
              className="text-xs h-8"
              data-testid="confirm-delete-goal-btn"
            >
              {isDeletingGoal ? "Deleting..." : "Permanently Delete Goal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Delete Account Confirmation */}
      <Dialog open={isDeleteAccountOpen} onOpenChange={setIsDeleteAccountOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base text-destructive flex items-center gap-2">
              <AlertTriangle className="size-4" />
              Delete Account & Permanent Erasure
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This will permanently erase your user profile, study goals, quizzes, journal entries,
              uploaded materials, and storage files. This action cannot be reversed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-delete-account" className="text-xs">
              To confirm, type <span className="font-semibold text-destructive">DELETE</span>:
            </Label>
            <Input
              id="confirm-delete-account"
              placeholder="DELETE"
              value={deleteAccountInput}
              onChange={(e) => setDeleteAccountInput(e.target.value)}
              className="text-xs h-8 font-mono"
              data-testid="delete-account-input"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDeleteAccountOpen(false)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteAccountInput.trim() !== "DELETE" || isDeletingAccount}
              onClick={handleDeleteAccount}
              className="text-xs h-8"
              data-testid="confirm-delete-account-btn"
            >
              {isDeletingAccount ? "Purging..." : "Permanently Delete My Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
