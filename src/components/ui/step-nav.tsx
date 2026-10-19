import * as React from "react"
import { Check, Lock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"

type StepNavStatus = "complete" | "current" | "locked" | "available"

type StepNavStep = {
  id: string
  label: string
  description?: string
  /** Defaults to "current" for the `current` id and "available" otherwise. */
  status?: StepNavStatus
  /** Why the step is locked. Shown as text and announced. */
  lockedReason?: string
}

type StepNavLabels = {
  navigation: string
  /** Template for the summary. `{done}` and `{total}` are replaced. */
  summary: string
  complete: string
  current: string
  available: string
  locked: string
  /** Fallback reason when a locked step has none. */
  lockedReason: string
}

type StepNavProps = Omit<
  React.ComponentProps<"nav">,
  "children" | "onSelect"
> & {
  steps: StepNavStep[]
  /** Id of the current step. Used for steps without an explicit status. */
  current?: string
  onSelect?: (step: StepNavStep, index: number) => void
  /** `auto` is vertical in narrow containers and horizontal from 42rem up. */
  orientation?: "auto" | "vertical" | "horizontal"
  /** Show the "n of m" summary and bar. */
  showProgress?: boolean
  labels?: Partial<StepNavLabels>
}

const DEFAULT_LABELS: StepNavLabels = {
  navigation: "Steps",
  summary: "{done} of {total} complete",
  complete: "Complete",
  current: "Current",
  available: "Available",
  locked: "Locked",
  lockedReason: "Not available yet",
}

const SAMPLE_STEP_NAV_STEPS: StepNavStep[] = [
  {
    id: "step-1",
    label: "Step 1",
    description: "Introduction",
    status: "complete",
  },
  {
    id: "step-2",
    label: "Step 2",
    description: "Core concepts",
    status: "current",
  },
  {
    id: "step-3",
    label: "Step 3",
    description: "Practice",
    status: "available",
  },
  {
    id: "step-4",
    label: "Step 4",
    description: "Final review",
    status: "locked",
    lockedReason: "Finish step 3 first",
  },
]

function StepNav({
  steps,
  current,
  onSelect,
  orientation = "auto",
  showProgress = true,
  labels: labelsProp,
  className,
  ...props
}: StepNavProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp }
  const baseId = React.useId()
  const resolved = steps.map((s) => ({
    ...s,
    status: s.status ?? (s.id === current ? "current" : "available"),
  })) as (StepNavStep & { status: StepNavStatus })[]
  const done = resolved.filter((s) => s.status === "complete").length
  const summary = labels.summary
    .replace("{done}", String(done))
    .replace("{total}", String(steps.length))

  const statusText: Record<StepNavStatus, string> = {
    complete: labels.complete,
    current: labels.current,
    available: labels.available,
    locked: labels.locked,
  }

  return (
    <nav
      data-slot="step-nav"
      aria-label={labels.navigation}
      className={cn("@container/step-nav w-full", className)}
      {...props}
    >
      {showProgress && (
        <div data-slot="step-nav-progress" className="mb-4 flex flex-col gap-2">
          <span
            aria-live="polite"
            className="eyebrow text-muted-foreground tabular-nums"
          >
            {summary}
          </span>
          <Progress
            value={done}
            max={Math.max(steps.length, 1)}
            size="sm"
            tone="brand"
            aria-label={summary}
          />
        </div>
      )}
      <ol
        className={cn(
          "flex gap-2",
          orientation === "vertical" && "flex-col",
          orientation === "horizontal" && "flex-row",
          orientation === "auto" && "flex-col @2xl/step-nav:flex-row"
        )}
      >
        {resolved.map((step, i) => {
          const locked = step.status === "locked"
          const reasonId = `${baseId}-${step.id}-reason`
          const reason = locked
            ? (step.lockedReason ?? labels.lockedReason)
            : undefined
          return (
            <li
              key={step.id}
              data-slot="step-nav-item"
              data-status={step.status}
              className="min-w-0 flex-1"
            >
              <button
                type="button"
                aria-current={step.status === "current" ? "step" : undefined}
                aria-disabled={locked || undefined}
                aria-describedby={locked ? reasonId : undefined}
                onClick={() => {
                  if (!locked) onSelect?.(step, i)
                }}
                className={cn(
                  "flex h-full w-full items-start gap-3 rounded-md border p-3 text-left outline-none",
                  "transition-colors duration-150 ease-out focus-visible:ring-[3px] focus-visible:ring-ring",
                  step.status === "current" && "border-brand bg-brand/5",
                  step.status === "complete" && "bg-card hover:bg-muted",
                  step.status === "available" && "bg-card hover:bg-muted",
                  locked &&
                    "cursor-not-allowed border-dashed bg-muted/40 text-muted-foreground"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-sm border font-mono text-xs tabular-nums",
                    step.status === "complete" &&
                      "border-transparent bg-ink text-ink-foreground",
                    step.status === "current" && "border-brand text-brand",
                    locked && "border-dashed"
                  )}
                >
                  {step.status === "complete" ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : locked ? (
                    <Lock className="size-3.5" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                    <span className="min-w-0">{step.label}</span>
                    <span className="eyebrow text-muted-foreground">
                      {statusText[step.status]}
                    </span>
                  </span>
                  {step.description && (
                    <span className="text-xs text-muted-foreground">
                      {step.description}
                    </span>
                  )}
                  {locked && (
                    <span
                      id={reasonId}
                      className="flex items-center gap-1 text-xs"
                    >
                      <Lock aria-hidden className="size-3 shrink-0" />
                      {reason}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { StepNav, DEFAULT_LABELS as STEP_NAV_LABELS, SAMPLE_STEP_NAV_STEPS }
export type { StepNavProps, StepNavStep, StepNavStatus, StepNavLabels }
