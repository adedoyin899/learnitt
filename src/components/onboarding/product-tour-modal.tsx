"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  GitFork,
  Calendar,
  RotateCcw,
  Layers,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Brain,
  Target,
} from "lucide-react";

const TOUR_STORAGE_KEY = "learnitt_product_tour_completed_v1";

interface TourStep {
  title: string;
  badge: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  tips: string[];
}

const TOUR_STEPS: TourStep[] = [
  {
    title: "Master Anything with Learnitt",
    badge: "Welcome",
    subtitle: "Evidence-backed mastery, not passive scrolling",
    description:
      "Learnitt decomposes complex subjects into structured skill graphs, calibrates daily 15-minute learning sessions, and proves your competence with verifiable evidence.",
    icon: Sparkles,
    accentColor: "from-primary/20 via-primary/5 to-transparent text-primary",
    tips: [
      "No generic lectures: your curriculum adapts dynamically to your speed.",
      "Evidence levels E0 to E3 track real mastery, not vanity metrics.",
    ],
  },
  {
    title: "Prerequisite Skill Graphs",
    badge: "Step 1",
    subtitle: "Know exactly what to learn and when",
    description:
      "Every learning goal generates a directed prerequisite graph. You unlock advanced concepts only after cementing the foundational skills, eliminating knowledge gaps.",
    icon: GitFork,
    accentColor: "from-blue-500/20 via-blue-500/5 to-transparent text-blue-500",
    tips: [
      "View the interactive Skill Graph anytime from the top navigation.",
      "Import existing outlines or let AI synthesize your complete roadmap.",
    ],
  },
  {
    title: "The 15-Minute Daily Loop",
    badge: "Step 2",
    subtitle: "Built around your Minimum Viable Day (MVD)",
    description:
      "Consistency beats cramming. Your dashboard schedules a daily focused loop: concept review, interactive quizzes, and grounding tutor conversations.",
    icon: Calendar,
    accentColor: "from-emerald-500/20 via-emerald-500/5 to-transparent text-emerald-500",
    tips: [
      "Complete at least 15 minutes to keep your MVD streak active.",
      "Life got busy? Use the 1-tap Check-In drawer to pause guilt-free.",
    ],
  },
  {
    title: "Spaced Repetition & Retention",
    badge: "Step 3",
    subtitle: "Say goodbye to forgetting curves",
    description:
      "Learnitt schedules recall questions and saved flashcards at optimal mathematical intervals. Reviews are strictly capped at 15 minutes to prevent burnout.",
    icon: RotateCcw,
    accentColor: "from-amber-500/20 via-amber-500/5 to-transparent text-amber-500",
    tips: [
      "Short self-graded recall checks preserve long-term memory.",
      "Target retention is configurable in your Settings (80% to 95%).",
    ],
  },
  {
    title: "Multi-Goal Learning Ecosystem",
    badge: "Step 4",
    subtitle: "Learn multiple topics simultaneously",
    description:
      "Learn French and Data Engineering at the same time! Switch your primary daily focus with a single tap on the dashboard or manage all plans in Settings.",
    icon: Layers,
    accentColor: "from-violet-500/20 via-violet-500/5 to-transparent text-violet-500",
    tips: [
      "Use the goal switcher at the top of Today and Plan pages.",
      "Toggle between Light, Dark, and System appearance in Settings.",
    ],
  },
];

export function ProductTourModal() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(0);

  // Check if user has already seen the tour
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      // Auto-open on first visit after a slight delay
      const timer = setTimeout(() => setIsOpen(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for manual tour launch events from nav or settings
  React.useEffect(() => {
    const handleOpenTour = () => {
      setCurrentStep(0);
      setIsOpen(true);
    };
    window.addEventListener("open-product-tour", handleOpenTour);
    return () => window.removeEventListener("open-product-tour", handleOpenTour);
  }, []);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
    }
    setIsOpen(false);
  };

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border/80 bg-card shadow-2xl">
        {/* Accent Banner */}
        <div
          className={`relative p-6 bg-gradient-to-b ${step.accentColor} border-b border-border/50 flex flex-col items-center text-center`}
        >
          <div className="absolute top-4 left-4">
            <Badge variant="outline" className="text-[10px] font-mono uppercase bg-background/80 backdrop-blur-xs">
              {step.badge}
            </Badge>
          </div>

          <div className="size-14 rounded-2xl bg-card border border-border/80 shadow-md flex items-center justify-center mt-2 mb-3">
            <Icon className="size-7" />
          </div>

          <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
            {step.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1 font-medium">
            {step.subtitle}
          </DialogDescription>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-foreground/90 leading-relaxed">
            {step.description}
          </p>

          {/* Quick Tips */}
          <div className="rounded-xl bg-muted/50 p-3.5 space-y-2 border border-border/40">
            {step.tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-primary shrink-0 mt-0.5" />
                <span>{tip}</span>
              </div>
            ))}
          </div>

          {/* Progress Dots */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1.5" aria-label={`Step ${currentStep + 1} of ${TOUR_STEPS.length}`}>
              {TOUR_STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentStep(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === currentStep
                      ? "w-6 bg-primary"
                      : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            <span className="text-[11px] font-mono text-muted-foreground">
              {currentStep + 1} / {TOUR_STEPS.length}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2">
            {currentStep > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="text-xs text-muted-foreground"
              >
                <ArrowLeft className="size-3.5 mr-1.5" />
                Back
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleComplete}
                className="text-xs text-muted-foreground"
              >
                Skip Tour
              </Button>
            )}

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleNext}
              className="text-xs font-semibold gap-1.5"
            >
              {isLast ? (
                <>
                  Get Started
                  <Sparkles className="size-3.5 ml-1" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="size-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Utility to trigger the product tour from any component
 */
export function openProductTour() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-product-tour"));
  }
}
