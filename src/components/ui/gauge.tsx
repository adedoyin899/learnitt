"use client"

import * as React from "react"
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { spring } from "@/lib/motion"

type GaugeTone = "neutral" | "brand" | "success" | "warning" | "destructive"

type GaugeThreshold = {
  /** The band starts at this value and runs to the next threshold's `at`. */
  at: number
  tone: GaugeTone
  /** Status word shown beside the number, so state never relies on color. */
  label: string
}

type GaugeLabels = {
  /** Screen-reader prefix for the status, e.g. "Status". */
  status: string
}

const defaultLabels: GaugeLabels = { status: "Status" }

const strokeClass: Record<GaugeTone, string> = {
  neutral: "stroke-muted-foreground",
  brand: "stroke-brand",
  success: "stroke-success",
  warning: "stroke-warning",
  destructive: "stroke-destructive",
}

const badgeVariant = {
  neutral: "secondary",
  brand: "brand",
  success: "success",
  warning: "warning",
  destructive: "destructive",
} as const

const toneIcon = {
  neutral: Info,
  brand: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: OctagonAlert,
} as const

const sizeClass = {
  sm: "w-28",
  default: "w-40",
  lg: "w-56",
} as const

type GaugeProps = Omit<React.ComponentProps<"div">, "children"> & {
  value: number
  /** Scale start. Defaults to 0. */
  min?: number
  /** Scale end. Defaults to 100. */
  max?: number
  /**
   * Bands of the scale, in any order. The band whose `at` is the highest one
   * not above `value` is the current status. Defaults to low / medium / high
   * thirds-ish bands (0, 50%, 80% of the scale).
   */
  thresholds?: GaugeThreshold[]
  /** `ring` is a full circle, `arc` an open 240 degree dial. */
  variant?: "ring" | "arc"
  size?: keyof typeof sizeClass
  /** What the gauge measures. Also its accessible name. */
  label: string
  /** Small text under the status, e.g. a timestamp or a target. */
  hint?: React.ReactNode
  /** Unit shown next to the number, e.g. "%", "bpm", "kW". */
  unit?: React.ReactNode
  /** Format the number in the center and in the accessible value text. */
  formatValue?: (value: number) => string
  /** Replace the center content entirely. */
  center?: React.ReactNode
  /** Draw thin ticks where the bands change. Defaults to true. */
  showTicks?: boolean
  labels?: Partial<GaugeLabels>
}

const START_ANGLE = 150
const ARC_SWEEP = 240
const R = 42
const STROKE = 9

function polar(angleDeg: number, radius = R) {
  const a = (angleDeg * Math.PI) / 180
  return { x: 50 + radius * Math.cos(a), y: 50 + radius * Math.sin(a) }
}

function arcPath() {
  const s = polar(START_ANGLE)
  const e = polar(START_ANGLE + ARC_SWEEP)
  return `M ${s.x} ${s.y} A ${R} ${R} 0 1 1 ${e.x} ${e.y}`
}

function resolveThresholds(
  thresholds: GaugeThreshold[] | undefined,
  min: number,
  max: number
): GaugeThreshold[] {
  const list =
    thresholds && thresholds.length > 0
      ? thresholds
      : [
          { at: min, tone: "success" as const, label: "Low" },
          {
            at: min + (max - min) * 0.5,
            tone: "warning" as const,
            label: "Medium",
          },
          {
            at: min + (max - min) * 0.8,
            tone: "destructive" as const,
            label: "High",
          },
        ]
  return [...list].sort((a, b) => a.at - b.at)
}

function Gauge({
  value,
  min = 0,
  max = 100,
  thresholds,
  variant = "ring",
  size = "default",
  label,
  hint,
  unit,
  formatValue,
  center,
  showTicks = true,
  labels: labelsProp,
  className,
  ...props
}: GaugeProps) {
  const labels = { ...defaultLabels, ...labelsProp }
  const reduceMotion = useReducedMotion()
  const span = max - min || 1
  const clamped = Math.min(Math.max(value, min), max)
  const fraction = (clamped - min) / span

  const bands = resolveThresholds(thresholds, min, max)
  const current = [...bands].reverse().find((b) => b.at <= clamped) ?? bands[0]
  const Icon = toneIcon[current.tone]

  const format = formatValue ?? ((v: number) => String(Math.round(v * 10) / 10))
  const text = format(value)
  const sweep = variant === "arc" ? ARC_SWEEP : 360
  const angleAt = (f: number) => START_ANGLE + sweep * f
  const ticks = showTicks
    ? bands
        .map((b) => (b.at - min) / span)
        .filter((f) => f > 0.001 && f < 0.999)
    : []

  const transition = reduceMotion ? { duration: 0 } : spring.smooth

  const track =
    variant === "arc" ? (
      <path
        d={arcPath()}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-muted"
        pathLength={1}
      />
    ) : (
      <circle
        cx={50}
        cy={50}
        r={R}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-muted"
      />
    )

  const fillProps = {
    fill: "none",
    strokeWidth: STROKE,
    className: cn(
      "transition-[stroke] duration-200 motion-reduce:transition-none",
      strokeClass[current.tone]
    ),
    initial: { pathLength: reduceMotion ? fraction : 0 },
    animate: { pathLength: fraction },
    transition,
  }

  return (
    <div
      data-slot="gauge"
      data-tone={current.tone}
      className={cn(
        "inline-flex flex-col items-center gap-3 text-center",
        className
      )}
      {...props}
    >
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={`${text}${typeof unit === "string" ? ` ${unit}` : ""}, ${current.label}`}
        className={cn("@container relative aspect-square", sizeClass[size])}
      >
        <svg
          viewBox="0 0 100 100"
          aria-hidden
          className="absolute inset-0 size-full overflow-visible"
        >
          {track}
          {variant === "arc" ? (
            <motion.path d={arcPath()} {...fillProps} />
          ) : (
            <motion.circle
              cx={50}
              cy={50}
              r={R}
              transform="rotate(150 50 50)"
              {...fillProps}
            />
          )}
          {ticks.map((f) => {
            const a = polar(angleAt(f), R - STROKE / 2 - 1)
            const b = polar(angleAt(f), R + STROKE / 2 + 1)
            return (
              <line
                key={f}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={1.25}
                className="stroke-background"
              />
            )
          })}
        </svg>
        <div
          className={cn(
            "absolute inset-0 flex flex-col items-center justify-center px-[18%]",
            variant === "arc" && "pt-[14%]"
          )}
        >
          {center ?? (
            <span className="flex max-w-full items-baseline justify-center gap-[0.15em]">
              <span className="truncate heading text-[22cqw] leading-none tabular-nums">
                {text}
              </span>
              {unit && (
                <span className="font-mono text-[9cqw] text-muted-foreground">
                  {unit}
                </span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <span className="eyebrow text-muted-foreground">{label}</span>
        <Badge variant={badgeVariant[current.tone]} data-slot="gauge-status">
          <Icon aria-hidden />
          <span className="sr-only">{labels.status}: </span>
          <span aria-live="polite">{current.label}</span>
        </Badge>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  )
}

export { Gauge }
export type { GaugeProps, GaugeThreshold, GaugeTone, GaugeLabels }
