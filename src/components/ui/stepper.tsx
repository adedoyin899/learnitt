import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

type StepperStep = {
  id: string
  label: string
  description?: string
}

type StepperProps = Omit<React.ComponentProps<"nav">, "children"> & {
  steps: StepperStep[]
  /** Index or id of the current step. */
  current: number | string
  /** Called when a completed step is clicked. Only completed steps are interactive. */
  onStepClick?: (step: StepperStep, index: number) => void
  orientation?: "horizontal" | "vertical"
  /**
   * Every step is done: all show a check and none is current. Also implied when
   * `current` is a number >= steps.length.
   */
  complete?: boolean
}

function Stepper({
  steps,
  current,
  onStepClick,
  orientation = "horizontal",
  complete: completeProp = false,
  className,
  "aria-label": ariaLabel = "Progress",
  ...props
}: StepperProps) {
  const found =
    typeof current === "number"
      ? current
      : steps.findIndex((s) => s.id === current)
  const complete =
    completeProp || (typeof current === "number" && current >= steps.length)
  const currentIndex = complete
    ? steps.length
    : Math.min(Math.max(found, 0), steps.length - 1)
  const currentStep = steps[currentIndex]
  const vertical = orientation === "vertical"

  return (
    <nav
      data-slot="stepper"
      data-orientation={orientation}
      aria-label={ariaLabel}
      className={cn("w-full", className)}
      {...props}
    >
      <ol className={cn("flex", vertical ? "flex-col" : "items-start")}>
        {steps.map((step, i) => {
          const status =
            i < currentIndex
              ? "complete"
              : i === currentIndex
                ? "current"
                : "upcoming"
          const last = i === steps.length - 1
          const clickable = status === "complete" && !!onStepClick

          const marker = (
            <span
              data-slot="stepper-marker"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums transition-colors",
                status === "complete" &&
                  "border-transparent bg-ink text-ink-foreground",
                status === "current" && "border-brand bg-brand/10 text-brand",
                status === "upcoming" && "bg-background text-muted-foreground"
              )}
            >
              {status === "complete" ? (
                <Check aria-hidden className="size-3.5" />
              ) : (
                i + 1
              )}
            </span>
          )

          const text = (
            <span
              className={cn(
                "min-w-0 text-left",
                vertical ? "block" : "hidden sm:block"
              )}
            >
              <span
                className={cn(
                  "block truncate text-sm font-medium",
                  status === "upcoming"
                    ? "text-muted-foreground"
                    : "text-foreground"
                )}
              >
                {step.label}
                <span className="sr-only">
                  {status === "complete"
                    ? " (completed)"
                    : status === "upcoming"
                      ? " (upcoming)"
                      : ""}
                </span>
              </span>
              {step.description && (
                <span className="block text-xs text-muted-foreground">
                  {step.description}
                </span>
              )}
            </span>
          )

          const inner = (
            <>
              {marker}
              {text}
            </>
          )

          const innerClass = cn(
            "flex min-w-0 items-start gap-3 rounded-md text-left",
            vertical ? "w-full" : "items-center"
          )

          return (
            <li
              key={step.id}
              data-slot="stepper-step"
              data-status={status}
              aria-current={status === "current" ? "step" : undefined}
              className={cn(
                "relative flex min-w-0",
                vertical
                  ? "gap-3 pb-6 last:pb-0"
                  : cn("items-center", last ? "flex-none" : "flex-1")
              )}
            >
              {vertical && !last && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-8 bottom-1 left-3.5 w-px -translate-x-1/2",
                    status === "complete" ? "bg-ink" : "bg-border"
                  )}
                />
              )}
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick(step, i)}
                  className={cn(
                    innerClass,
                    "cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                  )}
                >
                  {inner}
                </button>
              ) : (
                <div className={innerClass}>{inner}</div>
              )}
              {!vertical && !last && (
                <span
                  aria-hidden
                  className={cn(
                    "mx-2 h-px min-w-3 flex-1 sm:mx-3",
                    status === "complete" ? "bg-ink" : "bg-border"
                  )}
                />
              )}
            </li>
          )
        })}
      </ol>
      {complete && <span className="sr-only">All steps complete</span>}
      {!vertical && (complete || currentStep) && (
        <p
          data-slot="stepper-summary"
          aria-live="polite"
          className="mt-3 text-sm sm:hidden"
        >
          <span className="eyebrow text-muted-foreground">
            {complete
              ? "All steps complete"
              : `Step ${currentIndex + 1} of ${steps.length}`}
          </span>
          {!complete && (
            <span className="mt-0.5 block font-medium">
              {currentStep.label}
            </span>
          )}
        </p>
      )}
    </nav>
  )
}

export { Stepper }
export type { StepperProps, StepperStep }
