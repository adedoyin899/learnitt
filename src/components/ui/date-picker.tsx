"use client"

import * as React from "react"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

/* -------------------------------- ISO helpers ------------------------------- */
// All date math is done on UTC parts parsed by hand, so there are no timezone
// shifts and no `new Date("YYYY-MM-DD")`.

type Parts = { y: number; m: number; d: number; hh?: number; mm?: number }

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/

const pad = (n: number, len = 2) => String(n).padStart(len, "0")

function parseIso(value: string | undefined): Parts | null {
  if (!value) return null
  const m = ISO_RE.exec(value)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo - 1)) return null
  return {
    y,
    m: mo - 1,
    d,
    hh: m[4] === undefined ? undefined : Number(m[4]),
    mm: m[5] === undefined ? undefined : Number(m[5]),
  }
}

const daysInMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

const toDay = (y: number, m: number, d: number) =>
  `${pad(y, 4)}-${pad(m + 1)}-${pad(d)}`

function addDays(day: string, n: number) {
  const p = parseIso(day)!
  const t = new Date(Date.UTC(p.y, p.m, p.d + n))
  return toDay(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}

function addMonths(day: string, n: number) {
  const p = parseIso(day)!
  const total = p.y * 12 + p.m + n
  const y = Math.floor(total / 12)
  const m = total - y * 12
  return toDay(y, m, Math.min(p.d, daysInMonth(y, m)))
}

const utcDate = (y: number, m: number, d: number, hh = 0, mm = 0) =>
  new Date(Date.UTC(y, m, d, hh, mm))

function subscribeNever() {
  return () => {}
}

function getLocalToday() {
  const t = new Date()
  return toDay(t.getFullYear(), t.getMonth(), t.getDate())
}

/** Today's local date as YYYY-MM-DD ("" during SSR / hydration). */
function useToday() {
  return React.useSyncExternalStore(subscribeNever, getLocalToday, () => "")
}

/* --------------------------------- Calendar --------------------------------- */

type CalendarProps = {
  /** Selected day, YYYY-MM-DD. */
  value?: string
  onSelect: (day: string) => void
  today: string
  min?: string
  max?: string
  isDateDisabled?: (day: string) => boolean
  locale?: string
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  initialFocus: string
}

function Calendar({
  value,
  onSelect,
  today,
  min,
  max,
  isDateDisabled,
  locale,
  weekStartsOn = 0,
  initialFocus,
}: CalendarProps) {
  const [focused, setFocused] = React.useState(initialFocus)
  const gridRef = React.useRef<HTMLDivElement>(null)
  const moveFocus = React.useRef(false)

  const fp = parseIso(focused)!
  const first = toDay(fp.y, fp.m, 1)
  const offset = (utcDate(fp.y, fp.m, 1).getUTCDay() - weekStartsOn + 7) % 7

  const fmt = React.useMemo(
    () => ({
      month: new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
      weekdayShort: new Intl.DateTimeFormat(locale, {
        weekday: "short",
        timeZone: "UTC",
      }),
      weekdayLong: new Intl.DateTimeFormat(locale, {
        weekday: "long",
        timeZone: "UTC",
      }),
      full: new Intl.DateTimeFormat(locale, {
        dateStyle: "full",
        timeZone: "UTC",
      }),
    }),
    [locale]
  )

  const weekdays = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const dow = (weekStartsOn + i) % 7
        // 2023-01-01 was a Sunday.
        const d = utcDate(2023, 0, 1 + dow)
        return {
          short: fmt.weekdayShort.format(d),
          long: fmt.weekdayLong.format(d),
        }
      }),
    [fmt, weekStartsOn]
  )

  const disabledDay = React.useCallback(
    (day: string) =>
      (!!min && day < min.slice(0, 10)) ||
      (!!max && day > max.slice(0, 10)) ||
      !!isDateDisabled?.(day),
    [min, max, isDateDisabled]
  )

  React.useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)
      ?.focus()
  }, [focused])

  function go(next: string, focus = true) {
    moveFocus.current = focus
    setFocused(next)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const map: Record<string, string | undefined> = {
      ArrowLeft: addDays(focused, -1),
      ArrowRight: addDays(focused, 1),
      ArrowUp: addDays(focused, -7),
      ArrowDown: addDays(focused, 7),
      PageUp: addMonths(focused, e.shiftKey ? -12 : -1),
      PageDown: addMonths(focused, e.shiftKey ? 12 : 1),
      Home: addDays(focused, -((offset + fp.d - 1) % 7)),
      End: addDays(focused, 6 - ((offset + fp.d - 1) % 7)),
    }
    const next = map[e.key]
    if (!next) return
    e.preventDefault()
    go(next)
  }

  const navButton =
    "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"

  return (
    <div data-slot="date-picker-calendar" className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className={navButton}
          aria-label="Previous month"
          onClick={() => go(addMonths(focused, -1), false)}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <div
          aria-live="polite"
          className="heading text-sm font-medium tabular-nums"
        >
          {fmt.month.format(utcDate(fp.y, fp.m, 1))}
        </div>
        <button
          type="button"
          className={navButton}
          aria-label="Next month"
          onClick={() => go(addMonths(focused, 1), false)}
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={fmt.month.format(utcDate(fp.y, fp.m, 1))}
        onKeyDown={onKeyDown}
      >
        <div role="row" className="grid grid-cols-7">
          {weekdays.map((w) => (
            <div
              key={w.long}
              role="columnheader"
              aria-label={w.long}
              className="py-1 text-center eyebrow"
            >
              {w.short.slice(0, 2)}
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} role="row" className="grid grid-cols-7">
            {Array.from({ length: 7 }, (_, col) => {
              const day = addDays(first, row * 7 + col - offset)
              const dp = parseIso(day)!
              const outside = dp.m !== fp.m
              const selected = value === day
              const disabled = disabledDay(day)
              const isToday = today === day
              return (
                <div
                  key={day}
                  role="gridcell"
                  aria-selected={selected || undefined}
                  className="flex justify-center p-px"
                >
                  <button
                    type="button"
                    data-day={day}
                    data-today={isToday || undefined}
                    data-selected={selected || undefined}
                    data-outside={outside || undefined}
                    tabIndex={day === focused ? 0 : -1}
                    aria-disabled={disabled || undefined}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={fmt.full.format(utcDate(dp.y, dp.m, dp.d))}
                    onClick={() => {
                      if (disabled) return
                      onSelect(day)
                    }}
                    onFocus={() => {
                      if (day !== focused) setFocused(day)
                    }}
                    className={cn(
                      "relative inline-flex size-8 items-center justify-center rounded-md font-mono text-xs tabular-nums transition-colors outline-none",
                      "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring",
                      "data-[outside]:text-muted-foreground/60",
                      "data-[today]:font-semibold data-[today]:text-brand",
                      "data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:hover:bg-primary",
                      "aria-disabled:pointer-events-none aria-disabled:opacity-35"
                    )}
                  >
                    {dp.d}
                    {isToday && !selected && (
                      <span
                        aria-hidden
                        className="absolute bottom-0.5 size-[3px] rounded-full bg-brand"
                      />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------- Time field -------------------------------- */

type HourCycle = 12 | 24

function TimeField({
  hh,
  mm,
  hourCycle,
  onChange,
  disabled,
}: {
  hh: number
  mm: number
  hourCycle: HourCycle
  onChange: (hh: number, mm: number) => void
  disabled?: boolean
}) {
  const shownHour = hourCycle === 12 ? hh % 12 || 12 : hh
  const [hourDraft, setHourDraft] = React.useState(pad(shownHour))
  const [minDraft, setMinDraft] = React.useState(pad(mm))
  const pm = hh >= 12

  // Re-sync drafts when the committed value changes from outside.
  const [prev, setPrev] = React.useState({ hh, mm, hourCycle })
  if (prev.hh !== hh || prev.mm !== mm || prev.hourCycle !== hourCycle) {
    setPrev({ hh, mm, hourCycle })
    setHourDraft(pad(shownHour))
    setMinDraft(pad(mm))
  }

  function commit(hourText: string, minText: string, nextPm = pm) {
    const mmNum = Math.min(59, Math.max(0, Number.parseInt(minText, 10) || 0))
    let hNum = Number.parseInt(hourText, 10)
    if (Number.isNaN(hNum)) hNum = shownHour
    let h24: number
    if (hourCycle === 12) {
      const h12 = Math.min(12, Math.max(1, hNum))
      h24 = (h12 % 12) + (nextPm ? 12 : 0)
    } else {
      h24 = Math.min(23, Math.max(0, hNum))
    }
    setHourDraft(pad(hourCycle === 12 ? h24 % 12 || 12 : h24))
    setMinDraft(pad(mmNum))
    onChange(h24, mmNum)
  }

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      commit(hourDraft, minDraft)
    }
  }

  const field = "w-12 px-0 text-center font-mono tabular-nums"

  return (
    <div
      role="group"
      aria-label="Time"
      className="flex items-center gap-1.5"
      data-slot="date-picker-time"
    >
      <span className="mr-auto eyebrow">Time</span>
      <Input
        inputMode="numeric"
        maxLength={2}
        aria-label="Hours"
        disabled={disabled}
        className={field}
        value={hourDraft}
        onChange={(e) => setHourDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={() => commit(hourDraft, minDraft)}
        onKeyDown={onEnter}
        onFocus={(e) => e.currentTarget.select()}
      />
      <span aria-hidden className="font-mono text-muted-foreground">
        :
      </span>
      <Input
        inputMode="numeric"
        maxLength={2}
        aria-label="Minutes"
        disabled={disabled}
        className={field}
        value={minDraft}
        onChange={(e) => setMinDraft(e.target.value.replace(/\D/g, ""))}
        onBlur={() => commit(hourDraft, minDraft)}
        onKeyDown={onEnter}
        onFocus={(e) => e.currentTarget.select()}
      />
      {hourCycle === 12 && (
        <div
          role="group"
          aria-label="AM or PM"
          className="ml-1 inline-flex h-9 overflow-hidden rounded-md border border-input"
        >
          {(["AM", "PM"] as const).map((half) => {
            const active = (half === "PM") === pm
            return (
              <button
                key={half}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => commit(hourDraft, minDraft, half === "PM")}
                className={cn(
                  "px-2 font-mono text-xs transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {half}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* -------------------------------- DatePicker -------------------------------- */

type DatePickerProps = Omit<
  React.ComponentProps<"button">,
  "value" | "defaultValue" | "onChange" | "type"
> & {
  /** Controlled ISO value: `2026-11-21` or `2026-11-21T19:30`. */
  value?: string
  /** Initial ISO value when uncontrolled. */
  defaultValue?: string
  /** Called with an ISO string, or `undefined` when cleared. */
  onValueChange?: (value: string | undefined) => void
  /** Adds an HH:MM field; value becomes `YYYY-MM-DDTHH:MM`. */
  time?: boolean
  /** 12 or 24 hour display and entry for the time field. */
  hourCycle?: HourCycle
  placeholder?: string
  /** BCP 47 locale for formatting. Defaults to the runtime locale. */
  locale?: string
  /** Earliest selectable day (ISO). */
  min?: string
  /** Latest selectable day (ISO). */
  max?: string
  /** Extra per-day rule; receives `YYYY-MM-DD`. */
  isDateDisabled?: (day: string) => boolean
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  disabled?: boolean
  invalid?: boolean
  /** Time used when a day is picked and no time is set yet. */
  defaultTime?: string
  align?: "start" | "center" | "end"
}

function DatePicker({
  className,
  value,
  defaultValue,
  onValueChange,
  time = false,
  hourCycle = 24,
  placeholder = "Pick a date",
  locale,
  min,
  max,
  isDateDisabled,
  weekStartsOn = 0,
  disabled = false,
  invalid = false,
  defaultTime = "09:00",
  align = "start",
  ...props
}: DatePickerProps) {
  const [internal, setInternal] = React.useState(defaultValue)
  const [open, setOpen] = React.useState(false)
  const [session, setSession] = React.useState(0)
  const today = useToday()

  const current = value !== undefined ? value : internal
  const parts = parseIso(current)

  function emit(next: string | undefined) {
    if (value === undefined) setInternal(next)
    onValueChange?.(next)
  }

  const timeOf = React.useMemo(() => {
    const [dh, dm] = defaultTime.split(":").map(Number)
    return {
      hh: parts?.hh ?? (Number.isFinite(dh) ? dh : 9),
      mm: parts?.mm ?? (Number.isFinite(dm) ? dm : 0),
    }
  }, [parts?.hh, parts?.mm, defaultTime])

  const label = React.useMemo(() => {
    if (!parts) return null
    const d = utcDate(parts.y, parts.m, parts.d, parts.hh, parts.mm)
    const date = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(d)
    if (!time || parts.hh === undefined) return date
    const t = new Intl.DateTimeFormat(locale, {
      timeStyle: "short",
      hour12: hourCycle === 12,
      timeZone: "UTC",
    }).format(d)
    return `${date}, ${t}`
  }, [parts, locale, time, hourCycle])

  const withTime = (day: string, hh: number, mm: number) =>
    time ? `${day}T${pad(hh)}:${pad(mm)}` : day

  const selectedDay = parts ? toDay(parts.y, parts.m, parts.d) : undefined
  const initialFocus = selectedDay ?? (today || toDay(2000, 0, 1))

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setSession((s) => s + 1)
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="date-picker"
          disabled={disabled}
          data-invalid={invalid || undefined}
          aria-haspopup="dialog"
          data-empty={!label || undefined}
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-left text-sm shadow-xs dark:bg-input/20",
            "transition-[border-color,box-shadow] duration-150 ease-out outline-none",
            "focus-visible:border-brand/60 focus-visible:ring-[3px] focus-visible:ring-ring",
            "data-[invalid]:border-destructive data-[invalid]:ring-destructive/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "data-[empty]:text-muted-foreground",
            className
          )}
          {...props}
        >
          <span className="truncate tabular-nums">{label ?? placeholder}</span>
          <CalendarIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[min(18.5rem,calc(100vw-2rem))] p-3"
        aria-label="Choose date"
      >
        <Calendar
          key={session}
          value={selectedDay}
          today={today}
          min={min}
          max={max}
          isDateDisabled={isDateDisabled}
          locale={locale}
          weekStartsOn={weekStartsOn}
          initialFocus={initialFocus}
          onSelect={(day) => {
            emit(withTime(day, timeOf.hh, timeOf.mm))
            if (!time) setOpen(false)
          }}
        />
        {time && (
          <div className="mt-3 border-t pt-3">
            <TimeField
              hh={timeOf.hh}
              mm={timeOf.mm}
              hourCycle={hourCycle}
              disabled={!selectedDay}
              onChange={(hh, mm) => {
                if (selectedDay) emit(withTime(selectedDay, hh, mm))
              }}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
export type { DatePickerProps, HourCycle }
