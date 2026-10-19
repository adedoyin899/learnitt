"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

type SliderMark = { value: number; label?: React.ReactNode }

type SliderProps = Omit<
  React.ComponentProps<typeof SliderPrimitive.Root>,
  "value" | "defaultValue" | "onValueChange" | "onValueCommit" | "children"
> & {
  /** Controlled value. Two entries make a range slider. */
  value?: number[]
  defaultValue?: number[]
  onValueChange?: (value: number[]) => void
  onValueCommit?: (value: number[]) => void
  /** Left text of the label row. */
  label?: React.ReactNode
  /** Right text of the label row. Defaults to the formatted value. Pass `false` to hide. */
  valueLabel?: React.ReactNode | false
  /** Formats each value for the value label. Range values are joined with an en dash. */
  formatValue?: (value: number) => React.ReactNode
  /** Show min and max labels under the track. Pass `marks` for custom ticks. */
  showRange?: boolean
  marks?: SliderMark[]
  "aria-label"?: string
  "aria-labelledby"?: string
}

function Slider({
  className,
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  orientation = "horizontal",
  label,
  valueLabel,
  formatValue = (v) => String(v),
  showRange = false,
  marks,
  disabled,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: SliderProps) {
  const [internal, setInternal] = React.useState<number[]>(
    defaultValue ?? [min]
  )
  const current = value ?? internal
  const labelId = React.useId()
  const vertical = orientation === "vertical"

  const name =
    ariaLabel ??
    (ariaLabelledBy || label == null || typeof label !== "string"
      ? undefined
      : label)
  const labelledBy =
    ariaLabelledBy ?? (name == null && label != null ? labelId : undefined)

  const right =
    valueLabel === false
      ? null
      : (valueLabel ??
        (label != null
          ? current
              .map((v) => formatValue(v))
              .reduce<React.ReactNode[]>(
                (acc, node, i) => (i === 0 ? [node] : [...acc, " – ", node]),
                []
              )
          : null))

  const pct = (v: number) => ((v - min) / (max - min || 1)) * 100

  return (
    <div
      data-slot="slider-field"
      data-orientation={orientation}
      className={cn(
        "flex w-full flex-col gap-2.5",
        vertical && "h-full w-auto items-center",
        className
      )}
    >
      {(label != null || right != null) && (
        <div className="flex w-full items-baseline justify-between gap-3">
          <span id={labelId} className="eyebrow">
            {label}
          </span>
          {right != null && (
            <span
              aria-live="off"
              className="font-mono text-xs text-muted-foreground tabular-nums"
            >
              {right}
            </span>
          )}
        </div>
      )}
      <SliderPrimitive.Root
        data-slot="slider"
        value={value}
        defaultValue={value === undefined ? internal : undefined}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        orientation={orientation}
        onValueChange={(v) => {
          setInternal(v)
          onValueChange?.(v)
        }}
        onValueCommit={onValueCommit}
        className={cn(
          "relative flex touch-none items-center select-none",
          "data-[disabled]:opacity-50",
          vertical ? "h-full min-h-32 w-5 flex-col" : "h-5 w-full"
        )}
        {...props}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative grow overflow-hidden rounded-sm border bg-muted",
            vertical ? "h-full w-1.5" : "h-1.5 w-full"
          )}
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className={cn(
              "absolute bg-primary",
              vertical ? "w-full" : "h-full"
            )}
          />
        </SliderPrimitive.Track>
        {current.map((_, i) => (
          <SliderPrimitive.Thumb
            key={i}
            data-slot="slider-thumb"
            aria-label={
              current.length > 1
                ? `${name ?? "Value"} ${i === 0 ? "minimum" : "maximum"}`
                : name
            }
            aria-labelledby={current.length > 1 ? undefined : labelledBy}
            className={cn(
              "block size-4 rounded-sm border border-primary bg-background outline-none",
              "transition-[box-shadow,transform] duration-150 ease-out",
              "hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring",
              "disabled:pointer-events-none"
            )}
          />
        ))}
      </SliderPrimitive.Root>
      {!vertical && (marks || showRange) && (
        <div
          data-slot="slider-marks"
          className="relative h-4 w-full font-mono text-xs text-muted-foreground tabular-nums"
        >
          {marks ? (
            marks.map((m) => (
              <span
                key={m.value}
                style={{ left: `${pct(m.value)}%` }}
                className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              >
                {m.label ?? formatValue(m.value)}
              </span>
            ))
          ) : (
            <>
              <span className="absolute left-0">{formatValue(min)}</span>
              <span className="absolute right-0">{formatValue(max)}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export { Slider }
export type { SliderProps, SliderMark }
