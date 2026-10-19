"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"
import { spring } from "@/lib/motion"

type ProgressTone = "auto" | "brand" | "success" | "warning" | "destructive"

type ResolvedTone = Exclude<ProgressTone, "auto">

const trackVariants = cva(
  "relative w-full overflow-hidden rounded-sm bg-muted",
  {
    variants: {
      size: {
        sm: "h-1",
        default: "h-1.5",
        lg: "h-2.5",
      },
    },
    defaultVariants: { size: "default" },
  }
)

const toneClass: Record<ResolvedTone, string> = {
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
}

type ProgressProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Current value, clamped to 0..max. */
  value: number
  /** Value that represents a full bar. Defaults to 100. */
  max?: number
  /** Accessible name. Falls back to `label` when that is a string. */
  "aria-label"?: string
  /** Left text of the label row. */
  label?: React.ReactNode
  /**
   * Right text of the label row. Defaults to "n of max" when `label` is set.
   * Pass `false` to hide it.
   */
  valueLabel?: React.ReactNode | false
  size?: "sm" | "default" | "lg"
  /**
   * Fill color. `auto` picks by how much headroom is left: brand normally,
   * warning once the remaining fraction drops below `lowThreshold`, destructive
   * below `criticalThreshold`.
   */
  tone?: ProgressTone
  /**
   * For `tone="auto"`. By default the bar measures consumption (a full bar is
   * bad, like quota used). Set `invert` when the value is what remains
   * (stock, availability, battery) so a low value is bad.
   */
  invert?: boolean
  /** Remaining fraction (0..1) below which auto tone turns warning. */
  lowThreshold?: number
  /** Remaining fraction (0..1) at or below which auto tone turns destructive. */
  criticalThreshold?: number
}

function resolveTone({
  tone,
  fraction,
  invert,
  lowThreshold,
  criticalThreshold,
}: {
  tone: ProgressTone
  fraction: number
  invert: boolean
  lowThreshold: number
  criticalThreshold: number
}): ResolvedTone {
  if (tone !== "auto") return tone
  const remaining = invert ? fraction : 1 - fraction
  if (remaining <= criticalThreshold) return "destructive"
  if (remaining < lowThreshold) return "warning"
  return "brand"
}

function Progress({
  className,
  value,
  max = 100,
  label,
  valueLabel,
  size = "default",
  tone = "brand",
  invert = false,
  lowThreshold = 0.25,
  criticalThreshold = 0,
  "aria-label": ariaLabel,
  ...props
}: ProgressProps) {
  const reduce = useReducedMotion() ?? false
  const safeMax = max > 0 ? max : 1
  const clamped = Math.min(
    Math.max(Number.isFinite(value) ? value : 0, 0),
    safeMax
  )
  const fraction = clamped / safeMax
  const resolved = resolveTone({
    tone,
    fraction,
    invert,
    lowThreshold,
    criticalThreshold,
  })

  const name = ariaLabel ?? (typeof label === "string" ? label : undefined)
  const right =
    valueLabel === false
      ? null
      : (valueLabel ?? (label != null ? `${clamped} of ${safeMax}` : null))

  return (
    <div
      data-slot="progress"
      data-tone={resolved}
      className={cn("flex w-full flex-col gap-1.5", className)}
      {...props}
    >
      {(label != null || right != null) && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="eyebrow">{label}</span>
          {right != null && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {right}
            </span>
          )}
        </div>
      )}
      <div
        data-slot="progress-track"
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        className={trackVariants({ size })}
      >
        <motion.div
          data-slot="progress-indicator"
          className={cn(
            "h-full origin-left transition-colors duration-300",
            toneClass[resolved]
          )}
          initial={reduce ? false : { width: "0%" }}
          animate={{ width: `${fraction * 100}%` }}
          transition={reduce ? { duration: 0 } : spring.smooth}
        />
      </div>
    </div>
  )
}

export { Progress, trackVariants as progressVariants }
export type { ProgressProps, ProgressTone }
