"use client";

import * as React from "react";
import { Award, CheckCircle2, FileCheck2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EvidenceLevel } from "@/lib/evidence/types";
import { cn } from "@/lib/utils";

interface EvidenceBadgeProps {
  level: EvidenceLevel;
  className?: string;
  showIcon?: boolean;
}

export function EvidenceBadge({ level, className, showIcon = true }: EvidenceBadgeProps) {
  switch (level) {
    case 3:
      return (
        <Badge
          variant="outline"
          className={cn(
            "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1.5 font-medium",
            className
          )}
        >
          {showIcon && <Award className="h-3.5 w-3.5 text-emerald-500" />}
          <span>Artifact checked</span>
        </Badge>
      );
    case 2:
      return (
        <Badge
          variant="outline"
          className={cn(
            "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1.5 font-medium",
            className
          )}
        >
          {showIcon && <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />}
          <span>Applied, graded</span>
        </Badge>
      );
    case 1:
      return (
        <Badge
          variant="outline"
          className={cn(
            "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 gap-1.5 font-medium",
            className
          )}
        >
          {showIcon && <FileCheck2 className="h-3.5 w-3.5 text-indigo-500" />}
          <span>Quiz passed</span>
        </Badge>
      );
    case 0:
    default:
      return (
        <Badge
          variant="outline"
          className={cn(
            "bg-muted/60 text-muted-foreground border-border/60 gap-1.5 font-normal",
            className
          )}
        >
          {showIcon && <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />}
          <span>Self-rated</span>
        </Badge>
      );
  }
}
