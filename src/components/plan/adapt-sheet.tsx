"use client";

import * as React from "react";
import { AlertCircle, Clock, ShieldAlert, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AdaptProposal } from "@/lib/planner/types";

interface AdaptSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalId: string;
  reason?: string;
  proposals?: AdaptProposal[];
  onAdapted?: () => void;
}

export function AdaptSheet({
  open,
  onOpenChange,
  goalId,
  reason = "You missed 2 sessions this week. Pick how to catch up.",
  proposals = [],
  onAdapted,
}: AdaptSheetProps) {
  const [selectedOption, setSelectedOption] = React.useState<
    "compress" | "extend" | "add_time" | "reduce_scope"
  >("compress");
  const [confirmedSkillIds, setConfirmedSkillIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Fallback default proposals if none passed
  const activeProposals: AdaptProposal[] =
    proposals.length > 0
      ? proposals
      : [
          {
            type: "compress",
            title: "Compress sessions",
            description:
              "Shorten remaining sessions proportionally to fit your original target date. Never falls below your 15-minute Minimum Viable Day (MVD).",
            before: { note: "Full planned sessions" },
            after: { note: "25% shorter sessions (min 15m)" },
          },
          {
            type: "extend",
            title: "Extend target date",
            description:
              "Push back the goal completion date to keep a comfortable pace and preserve full depth.",
            before: { target_date: "Current target" },
            after: { proposed_target_date: "Extended by 3 weeks" },
          },
          {
            type: "add_time",
            title: "Add study time temporarily",
            description:
              "Temporarily add 4 hours per week for 3 weeks to catch up on missed sessions, then revert automatically.",
            before: { weekly_hours: "Current weekly commitment" },
            after: { temporary_weekly_hours: "+4 hours/week for 3 weeks" },
          },
          {
            type: "reduce_scope",
            title: "Reduce scope",
            description:
              "Drop optional, lower-priority skills that do not block any prerequisites. Requires explicit per-skill confirmation.",
            requiresConfirmation: true,
            before: { candidates_count: "Selected low-priority skills" },
            after: { removed_count: "Only confirmed skills removed" },
          },
        ];

  const currentProposal = activeProposals.find((p) => p.type === selectedOption);

  // Scope reduction candidates from proposal
  const candidates =
    (currentProposal?.before?.candidates as Array<{
      id: string;
      name: string;
      priority: number;
      estimatedMinutes: number;
    }>) || [];

  const handleToggleCandidate = (id: string) => {
    setConfirmedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleApply = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/v1/plan/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_id: goalId,
          option: selectedOption,
          confirmed_skill_ids:
            selectedOption === "reduce_scope" ? confirmedSkillIds : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to adapt plan");
      }

      if (data.no_op) {
        setErrorMsg("Reduce scope without confirmation changes nothing. Please select at least one skill to drop.");
        setLoading(false);
        return;
      }

      onOpenChange(false);
      onAdapted?.();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error applying adaptation");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider">
            <Sparkles className="size-4" />
            <span>Schedule Adaptation</span>
          </div>
          <DialogTitle className="text-xl">Adapt your plan</DialogTitle>
          <DialogDescription>
            {reason}
          </DialogDescription>
        </DialogHeader>

        {/* Adapt Alert */}
        <Alert variant="warning" className="my-2">
          <AlertCircle className="size-4" />
          <AlertTitle>Schedule adjustment recommended</AlertTitle>
          <AlertDescription>
            Pick how to recover your schedule. Learnitt never silently drops skills or shifts prerequisites after their dependents.
          </AlertDescription>
        </Alert>

        {errorMsg && (
          <Alert variant="destructive" className="my-2">
            <ShieldAlert className="size-4" />
            <AlertTitle>Adaptation Notice</AlertTitle>
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        {/* Radio Group of 4 Options */}
        <div className="py-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-3">
            Choose recovery strategy
          </label>
          <RadioGroup
            value={selectedOption}
            onValueChange={(v) => setSelectedOption(v as typeof selectedOption)}
            className="space-y-3"
          >
            {activeProposals.map((prop) => (
              <label
                key={prop.type}
                htmlFor={`adapt-${prop.type}`}
                className={`flex items-start gap-3.5 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                  selectedOption === prop.type
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <RadioGroupItem value={prop.type} id={`adapt-${prop.type}`} className="mt-1" />
                <div className="flex-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{prop.title}</span>
                    <Badge variant={selectedOption === prop.type ? "default" : "secondary"} className="text-[10px]">
                      {prop.type}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
                    {prop.description}
                  </p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>

        {/* Before and After Preview Card */}
        {currentProposal && (
          <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-3.5" />
              <span>Before &amp; After Comparison</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded bg-background p-3 border border-border/60">
                <span className="font-mono text-muted-foreground block mb-1">Before:</span>
                <div className="space-y-1 font-mono text-foreground">
                  {Object.entries(currentProposal.before).map(([k, v]) => {
                    if (k === "candidates") return null;
                    return (
                      <div key={k} className="truncate">
                        <span className="text-muted-foreground">{k}:</span> {String(v)}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded bg-primary/10 p-3 border border-primary/20">
                <span className="font-mono text-primary font-medium block mb-1">After:</span>
                <div className="space-y-1 font-mono text-foreground">
                  {Object.entries(currentProposal.after).map(([k, v]) => (
                    <div key={k} className="truncate">
                      <span className="text-primary font-medium">{k}:</span> {String(v)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reduce Scope Specific Checkboxes */}
            {selectedOption === "reduce_scope" && candidates.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    Confirm skills to remove:
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {confirmedSkillIds.length} of {candidates.length} selected
                  </span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {candidates.map((cand) => (
                    <div
                      key={cand.id}
                      onClick={() => handleToggleCandidate(cand.id)}
                      className="flex items-center justify-between p-2 rounded border border-border/50 bg-background hover:bg-muted/30 cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={confirmedSkillIds.includes(cand.id)}
                          onCheckedChange={() => handleToggleCandidate(cand.id)}
                        />
                        <span className="font-medium">{cand.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                        <Badge variant="outline" className="text-[9px]">
                          P{cand.priority}
                        </Badge>
                        <span>{cand.estimatedMinutes}m</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground italic">
                  Note: reduce scope without confirmation changes nothing.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Dismiss
          </Button>
          <Button
            onClick={handleApply}
            disabled={loading || (selectedOption === "reduce_scope" && confirmedSkillIds.length === 0)}
          >
            {loading ? "Applying..." : "Confirm & Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
