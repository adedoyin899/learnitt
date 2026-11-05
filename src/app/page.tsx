"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Flame,
  Layers,
  LogIn,
  Music,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  UserPlus,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface DomainPreview {
  id: string;
  label: string;
  title: string;
  domain: string;
  tagline: string;
  weeklyHours: number;
  skills: Array<{
    step: number;
    name: string;
    time: string;
    type: "recall" | "applied" | "artifact";
    mvd: string;
    guideTitle: string;
    guideDomain: string;
  }>;
  sampleQuestion: string;
}

const DOMAIN_PREVIEWS: DomainPreview[] = [
  {
    id: "piano",
    label: "Piano & Music",
    title: "Piano Performance & Music Theory",
    domain: "Piano & Music Theory",
    tagline: "From keyboard posture and grand staff reading to chord progressions, pedaling, and full repertoire.",
    weeklyHours: 5,
    skills: [
      {
        step: 1,
        name: "Keyboard Posture, Hand Shape & Finger Numbering",
        time: "45-90m",
        type: "applied",
        mvd: "Practice five-finger C position warmups with relaxed wrists for both hands (15m).",
        guideTitle: "Piano Keyboard Layout & Playing Posture",
        guideDomain: "en.wikipedia.org",
      },
      {
        step: 2,
        name: "Staff Notation: Treble & Bass Clef Reading",
        time: "60-120m",
        type: "recall",
        mvd: "Sight-identify 20 grand staff landmark notes across treble and bass clefs (15m).",
        guideTitle: "Musical Notation & Grand Staff Landmarks",
        guideDomain: "en.wikipedia.org",
      },
      {
        step: 3,
        name: "Major Scales & Thumb-Under Technique",
        time: "90-150m",
        type: "applied",
        mvd: "Play C and G Major scales two octaves hands separately at 72 BPM (15m).",
        guideTitle: "Major Scales & Tetrachord Finger Crossings",
        guideDomain: "en.wikipedia.org",
      },
      {
        step: 4,
        name: "Triads, Inversions & Common Chord Progressions",
        time: "90-150m",
        type: "applied",
        mvd: "Play I-V-vi-IV progressions in C and G Major with smooth voice leading (15m).",
        guideTitle: "Diatonic Triads, Inversions & Cadences",
        guideDomain: "en.wikipedia.org",
      },
    ],
    sampleQuestion: "How do I coordinate left-hand Alberti bass with a right-hand melody without tensing my wrists?",
  },
  {
    id: "arts",
    label: "Visual Arts & Painting",
    title: "Master Oil Painting & Visual Arts",
    domain: "Visual Arts & Painting",
    tagline: "Build mastery across color theory, chiaroscuro value studies, perspective, brushwork, and glazing.",
    weeklyHours: 6,
    skills: [
      {
        step: 1,
        name: "Color Theory & Chromatic Harmonies",
        time: "60-120m",
        type: "recall",
        mvd: "Mix a 12-step color wheel and 3 complementary neutral grays using primary pigments (15m).",
        guideTitle: "Color Theory, Hue, Value & Chroma",
        guideDomain: "en.wikipedia.org",
      },
      {
        step: 2,
        name: "Value Scales, Chiaroscuro & Light Logic",
        time: "90-180m",
        type: "applied",
        mvd: "Paint a 5-value monochrome sphere study separating light family from shadow family (15m).",
        guideTitle: "Chiaroscuro & Form Shadow Modelling",
        guideDomain: "en.wikipedia.org",
      },
      {
        step: 3,
        name: "Linear & Atmospheric Perspective",
        time: "90-180m",
        type: "applied",
        mvd: "Sketch a 2-point perspective architectural study with horizon line and vanishing points (15m).",
        guideTitle: "Graphical Perspective & Depth Cues",
        guideDomain: "en.wikipedia.org",
      },
      {
        step: 4,
        name: "Alla Prima & Indirect Glazing Workflows",
        time: "120-210m",
        type: "artifact",
        mvd: "Block in the underpainting (imprimatura) and big shadow shapes of a still life (15m).",
        guideTitle: "Oil Painting Mediums, Fat-over-Lean & Glazing",
        guideDomain: "en.wikipedia.org",
      },
    ],
    sampleQuestion: "Why do my mixed shadow colors look muddy instead of luminous in oil painting?",
  },
  {
    id: "data",
    label: "Data Engineering",
    title: "Modern Data Engineering & Pipelines",
    domain: "Data Engineering",
    tagline: "Relational modeling, dimensional star schemas, PySpark, Airflow orchestration, dbt, and streaming.",
    weeklyHours: 8,
    skills: [
      {
        step: 1,
        name: "SQL & Relational Modeling Fundamentals",
        time: "60-120m",
        type: "recall",
        mvd: "Write a query using CTEs and window functions (`ROW_NUMBER`, `LAG`) on sample orders (15m).",
        guideTitle: "PostgreSQL Tutorial & Query Planner",
        guideDomain: "postgresql.org",
      },
      {
        step: 2,
        name: "Data Warehousing & Dimensional Star Schemas",
        time: "90-180m",
        type: "applied",
        mvd: "Design fact_orders and dim_customer tables with SCD Type 2 grain definitions (15m).",
        guideTitle: "Star Schema & Dimensional Fact Modeling",
        guideDomain: "en.wikipedia.org",
      },
      {
        step: 3,
        name: "Distributed Computing with PySpark",
        time: "120-240m",
        type: "applied",
        mvd: "Compare narrow vs. wide transformations and partition pruning on Parquet files (20m).",
        guideTitle: "Apache Spark Quick Start & DataFrame API",
        guideDomain: "spark.apache.org",
      },
      {
        step: 4,
        name: "Workflow Orchestration with Airflow & dbt",
        time: "90-180m",
        type: "artifact",
        mvd: "Write an idempotent 3-task Airflow DAG and dbt schema test block (15m).",
        guideTitle: "Airflow Core Concepts & dbt Models",
        guideDomain: "airflow.apache.org",
      },
    ],
    sampleQuestion: "When should I use a broadcast join in PySpark instead of a standard sort-merge shuffle join?",
  },
  {
    id: "culinary",
    label: "Culinary & Pastry",
    title: "French Pastry & Culinary Foundations",
    domain: "Culinary Arts",
    tagline: "Master knife skills, mother sauces, laminated doughs, emulsions, and temperature precision.",
    weeklyHours: 5,
    skills: [
      {
        step: 1,
        name: "French Pastry & Baking: Core Concepts & Foundations",
        time: "60-120m",
        type: "recall",
        mvd: "Measure flour, fat, and liquid ratios by weight (baker's percentages) for pâte brisée (15m).",
        guideTitle: "Pastry Doughs, Gluten Control & Baking Ratios",
        guideDomain: "en.wikipedia.org",
      },
      {
        step: 2,
        name: "Laminated Doughs, Butter Block & Turn Folds",
        time: "90-180m",
        type: "applied",
        mvd: "Complete one single turn fold with cold butter block and rest dough at 4°C (15m).",
        guideTitle: "Viennoiserie & Laminated Pastry Technique",
        guideDomain: "en.wikipedia.org",
      },
      {
        step: 3,
        name: "Custards, Crème Pâtissière & Emulsions",
        time: "60-120m",
        type: "applied",
        mvd: "Temper egg yolks with hot milk to 82°C without curdling (15m).",
        guideTitle: "French Culinary Custards & Sauces",
        guideDomain: "en.wikipedia.org",
      },
      {
        step: 4,
        name: "Meringues, Choux Pastry & Patisserie Assembly",
        time: "90-180m",
        type: "artifact",
        mvd: "Pipe uniform choux éclairs and test panade hydration consistency (15m).",
        guideTitle: "Choux Pastry & Classic French Patisserie",
        guideDomain: "en.wikipedia.org",
      },
    ],
    sampleQuestion: "How do I prevent butter from shattering or leaking during croissant lamination turns?",
  },
];

export default function LandingPage() {
  const [selectedDomainId, setSelectedDomainId] = React.useState<string>("piano");
  const [authInfo, setAuthInfo] = React.useState<{
    checked: boolean;
    authenticated: boolean;
    activeGoalTitle?: string | null;
    activeGoalId?: string | null;
    goalsCount: number;
  }>({
    checked: false,
    authenticated: false,
    goalsCount: 0,
  });

  React.useEffect(() => {
    let mounted = true;
    async function checkSession() {
      try {
        const res = await fetch("/api/v1/goals");
        if (!mounted) return;
        if (res.ok) {
          const data = await res.json();
          const goals = data.goals || [];
          const active = goals.find((g: any) => g.status === "active") || goals[0];
          setAuthInfo({
            checked: true,
            authenticated: true,
            activeGoalTitle: active?.title || null,
            activeGoalId: active?.id || null,
            goalsCount: goals.length,
          });
        } else {
          setAuthInfo({ checked: true, authenticated: false, goalsCount: 0 });
        }
      } catch {
        if (mounted) {
          setAuthInfo({ checked: true, authenticated: false, goalsCount: 0 });
        }
      }
    }
    checkSession();
    return () => {
      mounted = false;
    };
  }, []);

  const activePreview =
    DOMAIN_PREVIEWS.find((d) => d.id === selectedDomainId) || DOMAIN_PREVIEWS[0];

  const startTemplateHref = authInfo.authenticated
    ? `/goals/new?template=${encodeURIComponent(activePreview.id)}`
    : `/login?mode=signup&redirect=${encodeURIComponent(`/goals/new?template=${activePreview.id}`)}`;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/20">
      {/* Sticky Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="size-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-mono text-sm font-bold shadow-xs group-hover:scale-105 transition-transform">
              L
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-sm tracking-wider uppercase font-bold text-foreground leading-none">
                Learnitt
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                Universal Learning OS
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />

            {authInfo.authenticated ? (
              <>
                <Button variant="outline" size="sm" asChild className="h-9 text-xs gap-1.5">
                  <Link href="/goals/new">
                    <Plus className="size-3.5" />
                    <span className="hidden sm:inline">New Goal</span>
                  </Link>
                </Button>
                <Button size="sm" asChild className="h-9 text-xs font-semibold gap-1.5">
                  <Link href="/today">
                    <span>
                      {authInfo.activeGoalTitle
                        ? `Continue: ${authInfo.activeGoalTitle}`
                        : "Open Workspace"}
                    </span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild className="h-9 text-xs gap-1.5">
                  <Link href="/login?mode=signin&redirect=/today">
                    <LogIn className="size-3.5" />
                    <span>Log In</span>
                  </Link>
                </Button>
                <Button size="sm" asChild className="h-9 text-xs font-semibold gap-1.5">
                  <Link href="/login?mode=signup&redirect=/goals/new">
                    <UserPlus className="size-3.5" />
                    <span>Get Started Free</span>
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border/60 py-14 sm:py-20 px-4 sm:px-6">
          <div className="max-w-5xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-mono font-medium">
              <Sparkles className="size-3.5" />
              <span>Goal-Agnostic Skill Graphs · Vetted Study Guides · 15-Min Daily Loop</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground max-w-4xl mx-auto leading-[1.12]">
              Master any field with a{" "}
              <span className="text-primary">living curriculum</span> built around your life.
            </h1>

            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Whether you are learning <strong className="text-foreground">Piano &amp; Music Theory</strong>,{" "}
              <strong className="text-foreground">Visual Arts</strong>,{" "}
              <strong className="text-foreground">Data Engineering</strong>, or{" "}
              <strong className="text-foreground">Culinary Arts</strong>, Learnitt decomposes your goal into a prerequisite skill graph, attaches real study guides, and adapts to your schedule.
            </p>

            {/* Primary CTAs for New & Existing Users */}
            <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3">
              {authInfo.authenticated ? (
                <>
                  <Button size="lg" asChild className="w-full sm:w-auto h-12 px-6 text-sm font-semibold gap-2 shadow-lg">
                    <Link href="/today">
                      <Calendar className="size-4" />
                      <span>
                        {authInfo.activeGoalTitle
                          ? `Continue "${authInfo.activeGoalTitle}"`
                          : "Go to Today's Study Loop"}
                      </span>
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="w-full sm:w-auto h-12 px-6 text-sm font-medium gap-2"
                  >
                    <Link href="/goals/new">
                      <Plus className="size-4 text-primary" />
                      <span>Start a New Learning Goal</span>
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="ghost"
                    asChild
                    className="w-full sm:w-auto h-12 px-4 text-xs font-mono text-muted-foreground hover:text-foreground"
                  >
                    <Link href="/goals">View All Goals ({authInfo.goalsCount})</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" asChild className="w-full sm:w-auto h-12 px-6 text-sm font-semibold gap-2 shadow-lg">
                    <Link href="/login?mode=signup&redirect=/goals/new">
                      <Sparkles className="size-4" />
                      <span>New User · Start a Learning Goal</span>
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    asChild
                    className="w-full sm:w-auto h-12 px-6 text-sm font-medium gap-2"
                  >
                    <Link href="/login?mode=signin&redirect=/today">
                      <LogIn className="size-4 text-primary" />
                      <span>Existing User · Log In to Continue</span>
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Interactive Dynamic Domain Preview Section */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-primary font-semibold">
                100% Dynamic Curriculum Engine
              </span>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mt-1">
                Preview How Learnitt Adapts to Any Field
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Select a domain below to inspect the generated skill graph, daily 15-minute MVD tasks, and vetted study guides.
              </p>
            </div>

            {/* Domain Switcher Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {DOMAIN_PREVIEWS.map((dom) => {
                const isSelected = dom.id === selectedDomainId;
                return (
                  <button
                    key={dom.id}
                    type="button"
                    onClick={() => setSelectedDomainId(dom.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all shrink-0 ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-card text-muted-foreground border-border hover:text-foreground hover:border-foreground/40"
                    }`}
                  >
                    {dom.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Domain Preview Card */}
          <Card className="border-border bg-card/80 shadow-xl overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-surface/40 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/30">
                      {activePreview.domain}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">
                      {activePreview.weeklyHours} hrs/week · 12 Verified Modules · Vetted Guides Attached
                    </span>
                  </div>
                  <CardTitle className="text-lg sm:text-xl font-bold text-foreground">
                    {activePreview.title}
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {activePreview.tagline}
                  </CardDescription>
                </div>

                <Button size="sm" asChild className="h-9 text-xs font-semibold gap-1.5 shrink-0">
                  <Link href={startTemplateHref}>
                    <span>Launch This Goal Track</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activePreview.skills.map((sk) => (
                  <div
                    key={sk.step}
                    className="rounded-xl border border-border/80 bg-surface/30 p-4 space-y-2.5 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center size-5 rounded bg-primary/15 text-primary font-mono text-[11px] font-bold">
                            {sk.step}
                          </span>
                          <h3 className="text-xs sm:text-sm font-semibold text-foreground leading-snug">
                            {sk.name}
                          </h3>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-mono uppercase shrink-0">
                          {sk.type} · {sk.time}
                        </Badge>
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-relaxed pl-7">
                        <span className="font-mono text-amber-400 font-semibold">15m MVD: </span>
                        {sk.mvd}
                      </p>
                    </div>

                    <div className="pl-7 pt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
                      <span className="text-primary font-medium flex items-center gap-1 truncate">
                        <BookOpen className="size-3 shrink-0" />
                        <span className="truncate">Guide: {sk.guideTitle}</span>
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                        {sk.guideDomain}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Tutor & Quiz Preview Bar */}
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-2.5">
                  <Bot className="size-4 text-primary shrink-0 mt-0.5 sm:mt-0" />
                  <div className="text-xs">
                    <span className="font-semibold text-foreground">Sample AI Tutor Prompt: </span>
                    <span className="text-muted-foreground italic">&ldquo;{activePreview.sampleQuestion}&rdquo;</span>
                  </div>
                </div>
                <Badge variant="secondary" className="font-mono text-[10px] shrink-0 self-start sm:self-auto">
                  Simpler · Technical · With Example
                </Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Core System Architecture & Interrelated Workflow */}
        <section className="border-t border-border/60 bg-card/30 py-12 sm:py-16 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto space-y-8">
            <div className="text-center max-w-2xl mx-auto space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-primary font-semibold">
                Cohesive Learning Loop
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Every Part of Your Workspace Is Connected
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Switch goals once and your daily schedule, study guides, quizzes, spaced review, and AI tutor automatically synchronize.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-border/70 bg-card">
                <CardHeader className="pb-2">
                  <div className="size-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center mb-2">
                    <Compass className="size-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold">1. Goal &amp; Skill Graph</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    Define any learning goal. Learnitt builds a 12-skill prerequisite DAG, checks schedule feasibility, and attaches vetted study guides.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-border/70 bg-card">
                <CardHeader className="pb-2">
                  <div className="size-9 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center mb-2">
                    <Calendar className="size-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold">2. Today &amp; 15m MVD</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    Open Today for your focused study block, direct reading links, and a 15-minute Minimum Viable Day fallback so busy days never break your habit.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-border/70 bg-card">
                <CardHeader className="pb-2">
                  <div className="size-9 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center mb-2">
                    <CheckCircle2 className="size-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold">3. Quizzes &amp; Spaced Review</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    Verify mastery with active recall and rubric-graded applied prompts that elevate your skill evidence from E0 to E3.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="border-border/70 bg-card">
                <CardHeader className="pb-2">
                  <div className="size-9 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center mb-2">
                    <Bot className="size-4" />
                  </div>
                  <CardTitle className="text-sm font-semibold">4. Grounded AI Tutor</CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    Ask questions scoped to any skill in your curriculum, switch explanation depth on the fly, and save insights directly to flashcards or your journal.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-6 px-4 sm:px-6 text-center text-xs text-muted-foreground font-mono">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Learnitt · Goal-Agnostic Learning Companion</span>
          <div className="flex items-center gap-4">
            <Link href="/today" className="hover:text-foreground transition-colors">
              Workspace
            </Link>
            <Link href="/goals" className="hover:text-foreground transition-colors">
              Goals
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
