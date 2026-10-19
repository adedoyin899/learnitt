"use client";

import * as React from "react";
import { Drawer } from "@/components/motion/drawer";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { queueOfflineAction } from "@/lib/offline/outbox";
import { syncOutbox } from "@/lib/offline/sync";
import { DexieCheckIn } from "@/lib/offline/db";
import { CheckCircle2, Clock, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type OutcomeType = "done" | "partial" | "missed" | "mvd_only";
export type ReasonType =
  | "no_time"
  | "unwell"
  | "client_work"
  | "too_hard"
  | "too_easy"
  | "other";

interface ReasonOption {
  value: ReasonType;
  label: string;
}

const REASON_OPTIONS: ReasonOption[] = [
  { value: "no_time", label: "No time" },
  { value: "unwell", label: "Unwell" },
  { value: "client_work", label: "Client work" },
  { value: "too_hard", label: "Too hard" },
  { value: "too_easy", label: "Too easy" },
  { value: "other", label: "Other" },
];

export interface CheckInItem {
  id: string;
  skill_name: string;
  planned_minutes: number;
  mvd_minutes: number;
  mvd_task: string;
  kind?: string;
}

export interface CheckInDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CheckInItem | null;
  initialOutcome?: OutcomeType;
  onCheckInSaved?: (checkIn: DexieCheckIn) => void;
}

export function CheckInDrawer({
  open,
  onOpenChange,
  item,
  initialOutcome = "done",
  onCheckInSaved,
}: CheckInDrawerProps) {
  const [outcome, setOutcome] = React.useState<OutcomeType>(initialOutcome);
  const [minutes, setMinutes] = React.useState<number>(item?.planned_minutes ?? 45);
  const [reason, setReason] = React.useState<ReasonType | null>(null);
  const [note, setNote] = React.useState<string>("");
  const [isSaving, setIsSaving] = React.useState<boolean>(false);

  // Sync state when drawer opens or item changes
  React.useEffect(() => {
    if (open && item) {
      setOutcome(initialOutcome);
      if (initialOutcome === "done") {
        setMinutes(item.planned_minutes);
      } else if (initialOutcome === "mvd_only") {
        setMinutes(item.mvd_minutes);
      } else if (initialOutcome === "partial") {
        setMinutes(Math.round(item.planned_minutes / 2));
      } else if (initialOutcome === "missed") {
        setMinutes(0);
      }
      setReason(null);
      setNote("");
      setIsSaving(false);
    }
  }, [open, item, initialOutcome]);

  const handleOutcomeChange = (newOutcome: OutcomeType) => {
    setOutcome(newOutcome);
    if (!item) return;

    if (newOutcome === "done") {
      setMinutes(item.planned_minutes);
    } else if (newOutcome === "mvd_only") {
      setMinutes(item.mvd_minutes);
    } else if (newOutcome === "partial") {
      setMinutes(Math.round(item.planned_minutes / 2));
    } else if (newOutcome === "missed") {
      setMinutes(0);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!item || isSaving) return;

    setIsSaving(true);
    const clientId = crypto.randomUUID();

    const checkInData: DexieCheckIn = {
      client_id: clientId,
      plan_item_id: item.id,
      outcome,
      minutes_actual: minutes,
      reason: reason ?? null,
      note: note.trim() || null,
      created_at: new Date().toISOString(),
      synced: false,
    };

    try {
      // 1. Optimistic write to local Dexie & Outbox (<100ms)
      await queueOfflineAction({
        client_id: clientId,
        operation: "check_in",
        payload: {
          plan_item_id: item.id,
          outcome,
          minutes_actual: minutes,
          reason: reason ?? null,
          note: note.trim() || null,
        },
      });

      // 2. Notify parent immediately for optimistic UI
      if (onCheckInSaved) {
        onCheckInSaved(checkInData);
      }

      // Close drawer immediately
      onOpenChange(false);

      // 3. Background sync if online
      syncOutbox().catch(() => {
        // Will sync on reconnect
      });
    } catch (err) {
      console.error("Check-in save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!item) return null;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="bottom"
      ariaLabel="Daily Session Check-in Sheet"
      className="max-w-xl mx-auto border-t border-border bg-card p-0 overflow-hidden"
    >
      <div className="flex flex-col max-h-[85vh]">
        {/* Drag handle / top bar */}
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-primary" />
            <span className="text-xs font-mono tracking-wider uppercase text-muted-foreground">
              Session Check-in
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close check-in drawer"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-5">
          {/* Item overview */}
          <div className="rounded-lg border border-border/60 bg-surface/50 p-3 space-y-1">
            <h2 className="text-sm font-semibold text-foreground tracking-tight">
              {item.skill_name}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="size-3 text-primary" />
                Planned: {item.planned_minutes} min
              </span>
              <span className="flex items-center gap-1 font-mono text-brand">
                <Sparkles className="size-3" />
                MVD: {item.mvd_minutes} min
              </span>
            </div>
            {item.mvd_task && (
              <p className="text-[11px] text-muted-foreground/90 italic pt-0.5 border-t border-border/40 mt-1">
                MVD dose: {item.mvd_task}
              </p>
            )}
          </div>

          {/* Outcome Radio Group */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-foreground tracking-wide">
              How did today go?
            </Label>
            <RadioGroup
              value={outcome}
              onValueChange={(val) => handleOutcomeChange(val as OutcomeType)}
              className="grid grid-cols-2 gap-2"
            >
              {/* Done */}
              <label
                htmlFor="outcome-done"
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-all min-h-[48px]",
                  outcome === "done"
                    ? "border-success bg-success/10 text-foreground ring-1 ring-success/30"
                    : "border-border/80 bg-background hover:bg-surface/60 text-muted-foreground"
                )}
              >
                <RadioGroupItem value="done" id="outcome-done" />
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-foreground">Done</span>
                  <span className="text-[10px] text-muted-foreground">Full planned session</span>
                </div>
              </label>

              {/* MVD Only */}
              <label
                htmlFor="outcome-mvd"
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-all min-h-[48px]",
                  outcome === "mvd_only"
                    ? "border-brand bg-brand/10 text-foreground ring-1 ring-brand/30"
                    : "border-border/80 bg-background hover:bg-surface/60 text-muted-foreground"
                )}
              >
                <RadioGroupItem value="mvd_only" id="outcome-mvd" />
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-foreground">MVD only</span>
                  <span className="text-[10px] text-muted-foreground">Minimum viable dose</span>
                </div>
              </label>

              {/* Partial */}
              <label
                htmlFor="outcome-partial"
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-all min-h-[48px]",
                  outcome === "partial"
                    ? "border-warning bg-warning/10 text-foreground ring-1 ring-warning/30"
                    : "border-border/80 bg-background hover:bg-surface/60 text-muted-foreground"
                )}
              >
                <RadioGroupItem value="partial" id="outcome-partial" />
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-foreground">Partial</span>
                  <span className="text-[10px] text-muted-foreground">Made some progress</span>
                </div>
              </label>

              {/* Missed */}
              <label
                htmlFor="outcome-missed"
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-3 cursor-pointer transition-all min-h-[48px]",
                  outcome === "missed"
                    ? "border-destructive bg-destructive/10 text-foreground ring-1 ring-destructive/30"
                    : "border-border/80 bg-background hover:bg-surface/60 text-muted-foreground"
                )}
              >
                <RadioGroupItem value="missed" id="outcome-missed" />
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-foreground">Missed</span>
                  <span className="text-[10px] text-muted-foreground">Could not study today</span>
                </div>
              </label>
            </RadioGroup>
          </div>

          {/* Actual Minutes */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="minutes-input" className="text-xs font-medium text-foreground">
                Actual Minutes
              </Label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMinutes(item.mvd_minutes)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono border border-border bg-surface text-muted-foreground hover:text-foreground"
                >
                  MVD ({item.mvd_minutes}m)
                </button>
                <button
                  type="button"
                  onClick={() => setMinutes(item.planned_minutes)}
                  className="px-2 py-0.5 rounded text-[10px] font-mono border border-border bg-surface text-muted-foreground hover:text-foreground"
                >
                  Plan ({item.planned_minutes}m)
                </button>
              </div>
            </div>
            <Input
              id="minutes-input"
              type="number"
              min={0}
              max={480}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(0, parseInt(e.target.value) || 0))}
              className="font-mono text-sm h-10"
            />
          </div>

          {/* Reason Chips (shown for missed, partial, mvd_only, or available optionally) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">
              Reason chip {outcome === "done" ? "(optional)" : ""}
            </Label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reason for check-in outcome">
              {REASON_OPTIONS.map((opt) => {
                const isSelected = reason === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setReason(isSelected ? null : opt.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors min-h-[36px] flex items-center justify-center",
                      isSelected
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border/80 bg-background text-muted-foreground hover:bg-surface/70 hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Note */}
          <div className="space-y-1.5">
            <Label htmlFor="note-input" className="text-xs font-medium text-foreground">
              Quick Note (optional)
            </Label>
            <textarea
              id="note-input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="E.g. Completed through section 3, need to revisit theorem proof..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Action button */}
          <div className="pt-2">
            <Button
              type="submit"
              disabled={isSaving}
              className="w-full h-11 text-xs font-semibold gap-2"
            >
              <CheckCircle2 className="size-4" />
              <span>{isSaving ? "Saving..." : "Save Check-in (<30s)"}</span>
            </Button>
          </div>
        </form>
      </div>
    </Drawer>
  );
}
