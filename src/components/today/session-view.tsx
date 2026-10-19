"use client";

import * as React from "react";
import { Drawer } from "@/components/motion/drawer";
import { Button } from "@/components/ui/button";
import { EvidenceBadge } from "@/components/evidence/evidence-badge";
import { CheckInItem } from "./check-in-drawer";
import { Play, Pause, RotateCcw, ExternalLink, FileText, CheckCircle2, X, Clock, AlertCircle, HelpCircle } from "lucide-react";

export interface SessionViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CheckInItem | null;
  material?: { id: string; filename: string; type: string } | null;
  resourceUrl?: string | null;
  onOpenCheckIn: () => void;
}

export function SessionView({
  open,
  onOpenChange,
  item,
  material,
  resourceUrl,
  onOpenCheckIn,
}: SessionViewProps) {
  const [secondsElapsed, setSecondsElapsed] = React.useState<number>(0);
  const [isRunning, setIsRunning] = React.useState<boolean>(false);

  // Timer interval
  React.useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning) {
      interval = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  // Reset when item changes or modal closed
  React.useEffect(() => {
    if (!open) {
      setIsRunning(false);
      setSecondsElapsed(0);
    }
  }, [open]);

  if (!item) return null;

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${String(remMins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleStartMaterial = () => {
    if (material) {
      window.open(`/materials/${material.id}`, "_blank");
    } else if (resourceUrl) {
      window.open(resourceUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      ariaLabel="Active Learning Session"
      className="max-w-xl mx-auto border-t border-border bg-card p-0 overflow-hidden"
    >
      <div className="flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-mono tracking-wider uppercase text-muted-foreground">
              Study Session
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close session view"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto">
          {/* Skill Title & Info */}
          <div className="space-y-1">
            <span className="text-[11px] font-mono uppercase text-primary tracking-wider">
              {item.kind || "Learning"} Session
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
                {item.skill_name}
              </h2>
              <EvidenceBadge level={((item as any).evidence_level as any) || 0} />
            </div>
            <p className="text-xs text-muted-foreground">
              Planned target: <strong className="font-mono text-foreground">{item.planned_minutes} minutes</strong>. Or minimum dose: <strong className="font-mono text-brand">{item.mvd_minutes} minutes</strong>.
            </p>
          </div>

          {/* Linked Resource / Material Action (Requirement 4: One tap opens linked material or external resource) */}
          <div className="rounded-xl border border-border/70 bg-surface/50 p-4 space-y-3">
            <span className="text-xs font-medium text-foreground">Linked Learning Material</span>
            {material ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleStartMaterial}
                className="w-full justify-between h-12 text-xs border-primary/30 hover:border-primary bg-primary/5 hover:bg-primary/10"
              >
                <span className="flex items-center gap-2 truncate">
                  <FileText className="size-4 text-primary shrink-0" />
                  <span className="font-medium truncate">{material.filename}</span>
                </span>
                <ExternalLink className="size-3.5 text-muted-foreground shrink-0 ml-2" />
              </Button>
            ) : resourceUrl ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleStartMaterial}
                className="w-full justify-between h-12 text-xs border-primary/30 hover:border-primary bg-primary/5 hover:bg-primary/10"
              >
                <span className="flex items-center gap-2 truncate">
                  <ExternalLink className="size-4 text-primary shrink-0" />
                  <span className="font-medium truncate">Open External Resource</span>
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">New tab</span>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Follow your study guide and practice exercises for this skill.
              </p>
            )}
          </div>

          {/* Optional Session Timer */}
          <div className="rounded-xl border border-border/70 bg-background p-4 text-center space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center justify-center gap-1.5">
              <Clock className="size-3.5" />
              Optional Timer
            </span>

            <div className="font-mono text-4xl sm:text-5xl font-bold tracking-tight text-foreground py-1">
              {formatTimer(secondsElapsed)}
            </div>

            <div className="flex items-center justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={isRunning ? "outline" : "default"}
                onClick={() => setIsRunning(!isRunning)}
                className="gap-1.5 min-w-[90px] text-xs h-9"
              >
                {isRunning ? (
                  <>
                    <Pause className="size-3.5" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="size-3.5" />
                    <span>Start</span>
                  </>
                )}
              </Button>

              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsRunning(false);
                  setSecondsElapsed(0);
                }}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground h-9"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset</span>
              </Button>
            </div>

            {/* Prompt Requirement 4 Invariant Alert */}
            <p className="text-[11px] text-muted-foreground/80 flex items-center justify-center gap-1 pt-1 border-t border-border/30">
              <AlertCircle className="size-3 text-muted-foreground shrink-0" />
              <span>Passive timer. Never auto-marks an item done because time passed.</span>
            </p>
          </div>

          {/* Ready to check in button */}
          <div className="pt-1">
            <Button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onOpenCheckIn();
              }}
              className="w-full h-11 text-xs font-semibold gap-2"
            >
              <CheckCircle2 className="size-4" />
              <span>Session Done — Check In Now</span>
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
