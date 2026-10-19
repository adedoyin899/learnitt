"use client";

import * as React from "react";
import { EvidenceMixCounts } from "@/lib/progress/stats";
import { ShieldCheck, Award, FileCheck2, UserCheck } from "lucide-react";

export interface EvidenceGaugeProps {
  evidenceMix: EvidenceMixCounts;
  totalSkills: number;
}

export function EvidenceGauge({ evidenceMix, totalSkills }: EvidenceGaugeProps) {
  const total = Math.max(
    1,
    evidenceMix.e0 + evidenceMix.e1 + evidenceMix.e2 + evidenceMix.e3
  );

  const levels = [
    {
      level: "E3",
      title: "Artifact checked",
      description: "Code or project verified running and correct",
      count: evidenceMix.e3,
      pct: (evidenceMix.e3 / total) * 100,
      color: "bg-emerald-500",
      textColor: "text-emerald-500",
      icon: Award,
    },
    {
      level: "E2",
      title: "Applied, graded",
      description: "Complex problem scored against multi-criteria rubric",
      count: evidenceMix.e2,
      pct: (evidenceMix.e2 / total) * 100,
      color: "bg-sky-500",
      textColor: "text-sky-500",
      icon: FileCheck2,
    },
    {
      level: "E1",
      title: "Quiz passed",
      description: "Deterministic multiple choice / recall verification",
      count: evidenceMix.e1,
      pct: (evidenceMix.e1 / total) * 100,
      color: "bg-indigo-500",
      textColor: "text-indigo-500",
      icon: ShieldCheck,
    },
    {
      level: "E0",
      title: "Self-rated",
      description: "Flashcards and subjective recall (does not count as verified)",
      count: evidenceMix.e0,
      pct: (evidenceMix.e0 / total) * 100,
      color: "bg-muted-foreground/40",
      textColor: "text-muted-foreground",
      icon: UserCheck,
    },
  ];

  return (
    <div className="bg-card border border-border/80 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between pb-3">
        <div>
          <h3 className="font-semibold text-lg text-foreground">Evidence Strength Mix</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Breakdown of competency proof across all {totalSkills} skills
          </p>
        </div>
      </div>

      {/* Multi-segment visual bar gauge */}
      <div className="w-full h-3.5 bg-muted rounded-full overflow-hidden flex my-4 p-0.5 gap-0.5">
        {levels.map((item) =>
          item.count > 0 ? (
            <div
              key={item.level}
              style={{ width: `${item.pct}%` }}
              className={`h-full ${item.color} rounded-xs transition-all duration-500`}
              title={`${item.level}: ${item.count} skills (${Math.round(item.pct)}%)`}
            />
          ) : null
        )}
      </div>

      {/* Level details grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        {levels.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.level}
              className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/40 hover:bg-muted/50 transition-colors"
            >
              <div
                className={`p-2 rounded-md bg-background border border-border/60 ${item.textColor} shrink-0`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {item.level} · {item.title}
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {item.count}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {item.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
