"use client";

import * as React from "react";
import { VerifiedSkillPoint, WeeklyStudyMinutes } from "@/lib/progress/stats";

export interface TimeSeriesChartProps {
  skillsTimeline: VerifiedSkillPoint[];
  weeklyMinutes: WeeklyStudyMinutes[];
}

export default function TimeSeriesChart({
  skillsTimeline,
  weeklyMinutes,
}: TimeSeriesChartProps) {
  const [activeTab, setActiveTab] = React.useState<"skills" | "time">("skills");

  // Chart dimensions
  const width = 600;
  const height = 240;
  const padding = { top: 20, right: 30, bottom: 40, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // 1. Skills Timeline Calculations
  const maxSkills = Math.max(5, ...skillsTimeline.map((p) => p.cumulative_count));
  const skillsPoints = skillsTimeline.map((p, idx) => {
    const x =
      skillsTimeline.length === 1
        ? innerWidth / 2
        : (idx / (skillsTimeline.length - 1)) * innerWidth;
    const y = innerHeight - (p.cumulative_count / maxSkills) * innerHeight;
    return { ...p, x: x + padding.left, y: y + padding.top };
  });

  const skillsLinePath = skillsPoints.reduce(
    (acc, p, idx) => (idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
    ""
  );

  const skillsAreaPath = skillsPoints.length > 0
    ? `${skillsLinePath} L ${skillsPoints[skillsPoints.length - 1].x} ${height - padding.bottom} L ${skillsPoints[0].x} ${height - padding.bottom} Z`
    : "";

  // 2. Weekly Time Calculations
  const maxWeeklyMins = Math.max(
    60,
    ...weeklyMinutes.map((w) => Math.max(w.planned_minutes, w.done_minutes))
  );

  return (
    <div className="w-full bg-card border border-border/80 rounded-xl p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-border/50 gap-4">
        <div>
          <h3 className="font-semibold text-lg text-foreground">Learning Trends Over Time</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track your verified competencies and weekly focus minutes
          </p>
        </div>
        <div className="inline-flex items-center rounded-lg bg-muted/60 p-1 text-xs font-medium">
          <button
            onClick={() => setActiveTab("skills")}
            className={`px-3 py-1 rounded-md transition-all ${
              activeTab === "skills"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Verified Skills
          </button>
          <button
            onClick={() => setActiveTab("time")}
            className={`px-3 py-1 rounded-md transition-all ${
              activeTab === "time"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Study Time (Weekly)
          </button>
        </div>
      </div>

      <div className="pt-6">
        {activeTab === "skills" ? (
          skillsTimeline.length === 0 ? (
            <div className="h-60 flex flex-col items-center justify-center text-center text-muted-foreground">
              <p className="text-sm font-medium">No verified skills recorded yet.</p>
              <p className="text-xs text-muted-foreground/80 mt-1">
                Pass a quiz or artifact evaluation to see your curve rise!
              </p>
            </div>
          ) : (
            <div className="relative w-full overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-60 overflow-visible">
                <defs>
                  <linearGradient id="skillsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                  const y = padding.top + innerHeight * (1 - pct);
                  const val = Math.round(maxSkills * pct);
                  return (
                    <g key={i}>
                      <line
                        x1={padding.left}
                        y1={y}
                        x2={width - padding.right}
                        y2={y}
                        stroke="currentColor"
                        strokeDasharray="4 4"
                        className="text-border/60"
                      />
                      <text
                        x={padding.left - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="text-[10px] fill-muted-foreground"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Area and Line */}
                <path d={skillsAreaPath} fill="url(#skillsGradient)" />
                <path
                  d={skillsLinePath}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data point dots */}
                {skillsPoints.map((p, i) => (
                  <g key={i} className="group cursor-pointer">
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      className="fill-background stroke-primary stroke-[2.5] hover:r-6 transition-all"
                    />
                    <text
                      x={p.x}
                      y={height - padding.bottom + 18}
                      textAnchor="middle"
                      className="text-[10px] fill-muted-foreground font-mono"
                    >
                      {p.date.slice(5)}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )
        ) : (
          <div className="relative w-full overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-60 overflow-visible">
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y = padding.top + innerHeight * (1 - pct);
                const mins = Math.round(maxWeeklyMins * pct);
                return (
                  <g key={i}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={width - padding.right}
                      y2={y}
                      stroke="currentColor"
                      strokeDasharray="4 4"
                      className="text-border/60"
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="text-[10px] fill-muted-foreground"
                    >
                      {mins}m
                    </text>
                  </g>
                );
              })}

              {/* Weekly bar groups */}
              {weeklyMinutes.map((w, idx) => {
                const groupWidth = innerWidth / weeklyMinutes.length;
                const groupCenterX = padding.left + groupWidth * idx + groupWidth / 2;
                const barWidth = Math.min(22, groupWidth * 0.35);

                const plannedHeight = (w.planned_minutes / maxWeeklyMins) * innerHeight;
                const doneHeight = (w.done_minutes / maxWeeklyMins) * innerHeight;

                const plannedY = height - padding.bottom - plannedHeight;
                const doneY = height - padding.bottom - doneHeight;

                return (
                  <g key={w.week}>
                    {/* Planned bar */}
                    <rect
                      x={groupCenterX - barWidth - 2}
                      y={plannedY}
                      width={barWidth}
                      height={Math.max(2, plannedHeight)}
                      rx="3"
                      className="fill-muted-foreground/30 hover:fill-muted-foreground/45 transition-colors"
                    />
                    {/* Done bar */}
                    <rect
                      x={groupCenterX + 2}
                      y={doneY}
                      width={barWidth}
                      height={Math.max(2, doneHeight)}
                      rx="3"
                      className="fill-primary/80 hover:fill-primary transition-colors"
                    />
                    {/* Label */}
                    <text
                      x={groupCenterX}
                      y={height - padding.bottom + 18}
                      textAnchor="middle"
                      className="text-[10px] fill-muted-foreground font-medium"
                    >
                      {w.week_label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-xs bg-muted-foreground/30 inline-block" />
                <span>Planned Minutes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-xs bg-primary/80 inline-block" />
                <span>Completed Minutes</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
