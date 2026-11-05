"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Slider } from "@/components/ui/slider";
import { Stepper } from "@/components/ui/stepper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, Loader2, Sparkles, UploadCloud } from "lucide-react";

const DOMAIN_SUGGESTIONS = [
  "Piano & Music Theory",
  "Visual Arts & Painting",
  "Culinary & Pastry Arts",
  "Data Engineering",
  "Health & Biostatistics",
  "Language Fluency",
  "Cloud Architecture",
  "Machine Learning",
  "Product Design & UX",
];

interface GoalTemplatePreset {
  id: string;
  badge: string;
  title: string;
  domain: string;
  level: "beginner" | "intermediate" | "advanced";
  weeklyHours: number;
  summary: string;
}

const GOAL_TEMPLATE_PRESETS: GoalTemplatePreset[] = [
  {
    id: "piano",
    badge: "Music & Instrument",
    title: "Classical & Contemporary Piano Mastery",
    domain: "Piano & Music Theory",
    level: "beginner",
    weeklyHours: 5,
    summary: "12 modules: bench ergonomics, grand staff sight-reading, rhythmic subdivisions, scales, and two-hand repertoire.",
  },
  {
    id: "arts",
    badge: "Visual Arts",
    title: "Visual Arts, Drawing & Painting Foundations",
    domain: "Visual Arts & Painting",
    level: "beginner",
    weeklyHours: 6,
    summary: "12 modules: line weight, 1/2/3-point perspective, 5-value chiaroscuro, color harmony, and figure proportion.",
  },
  {
    id: "data",
    badge: "Software & Data",
    title: "Modern Data Engineering",
    domain: "Data Engineering",
    level: "intermediate",
    weeklyHours: 8,
    summary: "12 modules: SQL window functions, dimensional modeling, Python ETL, Spark, Airflow, and dbt.",
  },
  {
    id: "culinary",
    badge: "Culinary Arts",
    title: "Professional Culinary & Pastry Technique",
    domain: "Culinary & Pastry Arts",
    level: "beginner",
    weeklyHours: 5,
    summary: "12 modules: knife precision, mother sauces, Maillard reaction, emulsions, fermentation, and plating.",
  },
  {
    id: "health",
    badge: "Health & Science",
    title: "Biostatistics & Clinical Data Analysis",
    domain: "Health & Biostatistics",
    level: "intermediate",
    weeklyHours: 7,
    summary: "12 modules: probability distributions, hypothesis testing, survival analysis, and regression modeling.",
  },
  {
    id: "language",
    badge: "Languages",
    title: "Conversational & Written Language Fluency",
    domain: "Language Fluency",
    level: "beginner",
    weeklyHours: 6,
    summary: "12 modules: phonetics, high-frequency vocabulary, verb tenses, listening comprehension, and dialogue.",
  },
];

const WEEKDAY_NAMES = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
  { id: 7, label: "Sun" },
];

export default function GoalSetupWizardPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = React.useState(0);
  const [activeTab, setActiveTab] = React.useState<"wizard" | "import">("wizard");

  // Form state
  const [title, setTitle] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [startingLevel, setStartingLevel] = React.useState<"beginner" | "intermediate" | "advanced">("beginner");
  const [selectedPresetId, setSelectedPresetId] = React.useState<string | null>(null);

  // Default target date 120 days in the future
  const defaultFutureDate = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 120);
    return d.toISOString().split("T")[0];
  }, []);

  const [targetDate, setTargetDate] = React.useState<string>(defaultFutureDate);
  const [weeklyHours, setWeeklyHours] = React.useState<number[]>([6]);
  const [studyDays, setStudyDays] = React.useState<number[]>([1, 2, 3, 4, 5]);

  // Apply ?template= query param if navigated from Landing Page
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tpl = params.get("template")?.toLowerCase();
    if (tpl) {
      const preset = GOAL_TEMPLATE_PRESETS.find((p) => p.id === tpl);
      if (preset) {
        setSelectedPresetId(preset.id);
        setTitle(preset.title);
        setDomain(preset.domain);
        setStartingLevel(preset.level);
        setWeeklyHours([preset.weeklyHours]);
      }
    }
  }, []);

  function applyPreset(preset: GoalTemplatePreset) {
    setSelectedPresetId(preset.id);
    setTitle(preset.title);
    setDomain(preset.domain);
    setStartingLevel(preset.level);
    setWeeklyHours([preset.weeklyHours]);
  }

  // Async & Generation state
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [generationStatus, setGenerationStatus] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Import state
  const [importContent, setImportContent] = React.useState("");
  const [importFilename, setImportFilename] = React.useState("plan.md");
  const [importPreview, setImportPreview] = React.useState<Array<{ id: string; name: string; estimated_min_minutes: number; estimated_max_minutes: number }> | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);

  const tomorrowStr = React.useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }, []);

  const steps = [
    { id: "step-goal", label: "Goal Details", description: "Title and domain" },
    { id: "step-schedule", label: "Schedule", description: "Target date and hours" },
    { id: "step-generate", label: "Skill Graph", description: "Generation" },
  ];

  function toggleStudyDay(day: number) {
    if (studyDays.includes(day)) {
      if (studyDays.length > 1) {
        setStudyDays(studyDays.filter((d) => d !== day));
      }
    } else {
      setStudyDays([...studyDays, day].sort());
    }
  }

  // Handle Wizard Submit and Skill Graph Generation
  async function handleCreateAndGenerate() {
    setIsSubmitting(true);
    setErrorMessage(null);
    setGenerationStatus("Saving draft goal...");

    try {
      // 1. Create draft goal
      const createRes = await fetch("/api/v1/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          domain: domain.trim(),
          starting_level: startingLevel,
          target_date: targetDate,
          weekly_hours: weeklyHours[0],
          study_days: studyDays,
        }),
      });

      if (!createRes.ok) {
        const errJson = await createRes.json();
        throw new Error(errJson.error || "Failed to create goal.");
      }

      const { goal } = await createRes.json();

      // 2. Enqueue skill_graph job
      setGenerationStatus("Enqueuing skill graph AI generation job...");
      const graphRes = await fetch(`/api/v1/goals/${goal.id}/skill-graph`, {
        method: "POST",
      });

      if (!graphRes.ok) {
        const errJson = await graphRes.json();
        throw new Error(errJson.error || "Failed to start skill graph generation.");
      }

      const { jobId } = await graphRes.json();

      // 3. Poll for completion or trigger local dev tick
      setGenerationStatus("Generating 12 to 20 skill graph nodes...");
      try {
        await fetch("/api/v1/dev/worker-tick", { method: "POST" });
      } catch {
        // worker-tick may be automated in background
      }

      let attempts = 0;
      let completed = false;
      while (attempts < 30 && !completed) {
        await new Promise((r) => setTimeout(r, 1000));
        const statusRes = await fetch(`/api/v1/jobs/${jobId}`);
        if (statusRes.status === 401) {
          throw new Error("Your session expired. Please sign in again.");
        }
        if (statusRes.ok) {
          const jobData = await statusRes.json();
          const job = jobData.job || jobData.data;
          if (job?.status === "succeeded") {
            completed = true;
            break;
          } else if (job?.status === "failed") {
            throw new Error(job.last_error || "Skill graph generation failed. Retry.");
          }
        }
        attempts++;
      }

      if (!completed) {
        throw new Error("Skill graph generation is still processing. Please check back in a moment.");
      }

      setGenerationStatus("Generating initial 14-day study schedule & linked guides...");
      await fetch(`/api/v1/goals/${goal.id}/plan/generate`, { method: "POST" }).catch(() => null);

      setGenerationStatus("Graph & plan ready. Redirecting to curriculum roadmap...");
      router.push(`/goals/${goal.id}/graph`);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
      setIsSubmitting(false);
      setGenerationStatus(null);
    }
  }

  // Handle Plan Import
  async function handleImportPreview() {
    if (!importContent.trim()) {
      setErrorMessage("Please paste plan content or upload a .md / .txt file.");
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/goals/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: importContent,
          filename: importFilename,
          saveAsDraftGoal: false,
          targetDate,
          weeklyHours: weeklyHours[0],
          studyDays,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to parse imported plan.");
      }

      setTitle(data.title || title);
      setDomain(data.domain || domain);
      setImportPreview(data.skills);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsImporting(false);
    }
  }

  async function handleSaveImportedGoal() {
    if (!importContent.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/v1/goals/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: importContent,
          filename: importFilename,
          saveAsDraftGoal: true,
          targetDate,
          weeklyHours: weeklyHours[0],
          studyDays,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save imported plan as goal.");
      }

      router.push(`/goals/${data.goal.id}/graph`);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
      setIsSubmitting(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "md" && ext !== "txt") {
      setErrorMessage("Only .md and .txt files are supported for plan import.");
      return;
    }

    setImportFilename(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportContent(text);
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border bg-card/40 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/today")}
            className="h-8 gap-1.5 text-xs text-muted-foreground"
          >
            <ArrowLeft className="size-3.5" />
            <span>Today</span>
          </Button>
          <div className="h-4 w-px bg-border" />
          <span className="font-mono text-xs tracking-wider uppercase font-semibold">
            Goal Setup (S02)
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-6">
        <PageHeader
          title="Create New Learning Goal"
          description="Define your target outcome, schedule, and study capacity. Learnitt generates a verified prerequisite skill graph."
        />

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "wizard" | "import")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wizard">Goal Wizard</TabsTrigger>
            <TabsTrigger value="import">Import Existing Plan</TabsTrigger>
          </TabsList>

          {/* TAB 1: GOAL WIZARD */}
          <TabsContent value="wizard" className="space-y-6 mt-4">
            <Stepper
              steps={steps}
              current={currentStep}
              onStepClick={(_s, idx) => setCurrentStep(idx)}
            />

            {errorMessage && (
              <Alert variant="destructive">
                <AlertTitle>Action required</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {/* STEP 0: GOAL DETAILS */}
            {currentStep === 0 && (
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-base">Goal Information</CardTitle>
                  <CardDescription>
                    Pick a curated discipline template below or type any custom learning goal in any field.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* 1-Click Starter Templates */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="size-3.5 text-primary" />
                        <span>Quick-Start Goal Tracks (or type your own below)</span>
                      </span>
                      {selectedPresetId && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPresetId(null);
                            setTitle("");
                            setDomain("");
                          }}
                          className="text-[11px] font-mono text-primary hover:underline"
                        >
                          Clear &amp; Write Custom Goal
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {GOAL_TEMPLATE_PRESETS.map((preset) => {
                        const isSelected = selectedPresetId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyPreset(preset)}
                            className={`text-left rounded-xl border p-3 transition-all flex flex-col justify-between gap-1.5 ${
                              isSelected
                                ? "bg-primary/15 border-primary/50 shadow-xs"
                                : "bg-surface/40 border-border/80 hover:border-primary/40 hover:bg-surface/80"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-primary font-semibold">
                                {preset.badge}
                              </span>
                              <span className="text-[10px] font-mono text-muted-foreground capitalize">
                                {preset.level} · {preset.weeklyHours}h/wk
                              </span>
                            </div>
                            <p className="text-xs font-bold text-foreground">
                              {preset.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                              {preset.summary}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-border/60 pt-4 space-y-5">
                    <Field label="Goal Title" hint="What specific capability, instrument, craft, or subject are you mastering?">
                      <Input
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setSelectedPresetId(null);
                        }}
                        placeholder="e.g. Classical Piano Mastery, Oil Painting Foundations, or Modern Data Engineering"
                      />
                    </Field>

                    <Field label="Domain / Field" hint="Pick a suggested domain or type any discipline.">
                      <Input
                        value={domain}
                        onChange={(e) => {
                          setDomain(e.target.value);
                          setSelectedPresetId(null);
                        }}
                        placeholder="e.g. Piano & Music Theory, Visual Arts, Culinary Arts, Data Engineering"
                      />
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {DOMAIN_SUGGESTIONS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDomain(d)}
                            className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                              domain === d
                                ? "bg-primary text-primary-foreground border-primary font-semibold"
                                : "bg-surface text-muted-foreground border-border hover:border-foreground"
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field label="Starting Level" hint="Calibrates the depth of the initial skill prerequisites and study guides.">
                      <div className="grid grid-cols-3 gap-2">
                        {(["beginner", "intermediate", "advanced"] as const).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setStartingLevel(lvl)}
                            className={`py-2 px-3 rounded-lg text-xs font-medium capitalize border transition-all ${
                              startingLevel === lvl
                                ? "bg-primary/15 border-primary text-primary font-semibold"
                                : "bg-card border-border text-muted-foreground hover:border-foreground/50"
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={() => {
                          if (!domain.trim() && title.trim()) {
                            setDomain(title.trim());
                          }
                          setCurrentStep(1);
                        }}
                        disabled={!title.trim()}
                        className="gap-2"
                      >
                        <span>Continue to Schedule</span>
                        <ArrowRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* STEP 1: SCHEDULE & AVAILABILITY */}
            {currentStep === 1 && (
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-base">Schedule & Time Commitment</CardTitle>
                  <CardDescription>
                    Configure your target completion date, study days, and weekly capacity.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Field label="Target Date" hint="Must be a future date. Used to compute planning capacity.">
                    <DatePicker
                      value={targetDate}
                      onValueChange={(d) => d && setTargetDate(d)}
                      min={tomorrowStr}
                      placeholder="Pick target completion date"
                    />
                  </Field>

                  <Field
                    label="Weekly Study Hours"
                    hint={`${weeklyHours[0]} hours per week (choose between 1 and 20 hours).`}
                  >
                    <div className="py-2">
                      <Slider
                        value={weeklyHours}
                        onValueChange={setWeeklyHours}
                        min={1}
                        max={20}
                        step={0.5}
                        label="Weekly hours"
                        formatValue={(v) => `${v} hrs`}
                      />
                    </div>
                  </Field>

                  <Field label="Study Days" hint="Days of the week you plan to study. Default is Monday to Friday.">
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAY_NAMES.map((day) => {
                        const isSelected = studyDays.includes(day.id);
                        return (
                          <button
                            key={day.id}
                            type="button"
                            onClick={() => toggleStudyDay(day.id)}
                            className={`size-10 rounded-md text-xs font-semibold border flex items-center justify-center transition-all ${
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-card border-border text-muted-foreground hover:border-foreground/50"
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <div className="flex justify-between pt-2">
                    <Button variant="ghost" onClick={() => setCurrentStep(0)} className="gap-2">
                      <ArrowLeft className="size-4" />
                      <span>Back</span>
                    </Button>
                    <Button onClick={() => setCurrentStep(2)} className="gap-2">
                      <span>Review & Generate</span>
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* STEP 2: REVIEW & GENERATE */}
            {currentStep === 2 && (
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-base">Review & Generate Skill Graph</CardTitle>
                  <CardDescription>
                    Verify your setup before enqueuing the skill_graph generation job.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-border p-4 bg-surface/50 space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Title</span>
                      <span className="font-semibold text-foreground">{title}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Domain</span>
                      <span className="text-foreground">{domain}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Starting Level</span>
                      <span className="capitalize text-foreground">{startingLevel}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Target Date</span>
                      <span className="font-mono text-foreground">{targetDate}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Weekly Hours</span>
                      <span className="font-mono text-foreground">{weeklyHours[0]} hrs/week</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-foreground">Study Days</span>
                      <span className="font-mono text-foreground">
                        {studyDays.map((d) => WEEKDAY_NAMES.find((w) => w.id === d)?.label).join(", ")}
                      </span>
                    </div>
                  </div>

                  {generationStatus && (
                    <Alert variant="default" className="border-primary/50 bg-primary/5">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      <AlertTitle>Generating Skill Graph</AlertTitle>
                      <AlertDescription>{generationStatus}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-between pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => setCurrentStep(1)}
                      disabled={isSubmitting}
                      className="gap-2"
                    >
                      <ArrowLeft className="size-4" />
                      <span>Back</span>
                    </Button>
                    <Button
                      onClick={handleCreateAndGenerate}
                      disabled={isSubmitting}
                      className="gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          <span>Processing...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-4" />
                          <span>Generate Skill Graph</span>
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* TAB 2: IMPORT PLAN (A4) */}
          <TabsContent value="import" className="space-y-6 mt-4">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="size-4 text-primary" />
                  <span>Import Existing Plan (.md or .txt)</span>
                </CardTitle>
                <CardDescription>
                  Paste or upload your syllabus, curriculum, or 20-week study outline. Phases and weeks will be parsed into a reviewable skill graph.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {errorMessage && (
                  <Alert variant="destructive">
                    <AlertTitle>Import Error</AlertTitle>
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <UploadCloud className="size-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs text-foreground font-medium">
                    Upload a .md or .txt document
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Other file extensions are strictly ignored.
                  </p>
                  <input
                    type="file"
                    accept=".md,.txt"
                    onChange={handleFileUpload}
                    className="mt-3 block mx-auto text-xs text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
                  />
                </div>

                <Field label="Or Paste Markdown / Text Plan">
                  <textarea
                    rows={8}
                    value={importContent}
                    onChange={(e) => setImportContent(e.target.value)}
                    placeholder="# MSc Health Analytics Preparation Plan&#10;&#10;## Phase 1: Biostatistics Foundations (Weeks 1 to 4)&#10;### Week 1: Probability Distributions&#10;Core distributions and expectations..."
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </Field>

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={handleImportPreview}
                    disabled={isImporting || !importContent.trim()}
                    className="gap-2"
                  >
                    {isImporting ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                    <span>Preview Parsed Graph</span>
                  </Button>
                </div>

                {importPreview && (
                  <div className="space-y-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="size-3.5 text-success" />
                        <span>Parsed {importPreview.length} Skills for Review</span>
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {title} · {domain}
                      </span>
                    </div>

                    <div className="max-h-48 overflow-y-auto rounded border border-border p-2 space-y-1 bg-surface/50 text-xs">
                      {importPreview.map((s, idx) => (
                        <div key={s.id} className="flex justify-between py-1 px-2 border-b border-border/30 last:border-none">
                          <span className="font-medium text-foreground">
                            {idx + 1}. {s.name}
                          </span>
                          <span className="font-mono text-muted-foreground text-[11px]">
                            {s.estimated_min_minutes}m to {s.estimated_max_minutes}m
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={handleSaveImportedGoal}
                        disabled={isSubmitting}
                        className="gap-2"
                      >
                        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        <span>Save as Draft Goal</span>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
