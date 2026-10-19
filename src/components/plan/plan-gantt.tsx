"use client";

import * as React from "react";
import { Gantt, GanttTask } from "@/components/ui/gantt";
import { PlannedItem } from "@/lib/planner/types";

interface PlanGanttProps {
  items: PlannedItem[];
}

export default function PlanGantt({ items }: PlanGanttProps) {
  const tasks: GanttTask[] = React.useMemo(() => {
    return items
      .filter((it) => it.status !== "unscheduled")
      .map((it, idx) => {
        const start = it.scheduled_date;
        // In Gantt component, start and end dates define the span
        const end = it.scheduled_date;

        return {
          id: it.id || `item-${idx}`,
          label: `${it.skill_name || (it.kind === "review" ? "Review" : "Learn")} (${it.planned_minutes}m)`,
          start,
          end,
          group: it.scheduled_date,
          progress: it.status === "done" ? 100 : it.status === "partial" ? 50 : 0,
          tone:
            it.kind === "review"
              ? "warning"
              : it.status === "done"
              ? "success"
              : "brand",
        };
      });
  }, [items]);

  if (tasks.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground border rounded-lg bg-card/40">
        No scheduled sessions in this time range.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 overflow-x-auto shadow-sm">
      <Gantt
        tasks={tasks}
        zoom="week"
        className="min-w-[600px]"
      />
    </div>
  );
}
