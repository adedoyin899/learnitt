"use client"

import * as React from "react"
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock,
  Route,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type GanttDate = string | Date
export type GanttZoom = "day" | "week" | "month"
export type GanttTone = "default" | "brand" | "success" | "warning"

export type GanttTask = {
  id: string
  label: string
  start: GanttDate
  end: GanttDate
  /** 0-100. Leave out when progress is not tracked (then a task is never "overdue"). */
  progress?: number
  /** Ids of tasks that must finish before this one starts. */
  dependsOn?: string[]
  /** Tasks sharing a group value are listed under one collapsible header. */
  group?: string
  tone?: GanttTone
}

/** Fixed copy. Placeholders in braces: {value} {count} {label} {names}. */
export type GanttLabels = {
  chart: string
  task: string
  zoom: string
  day: string
  week: string
  month: string
  today: string
  critical: string
  overdue: string
  complete: string
  /** Uses {value}. */
  progress: string
  /** Uses {names}. */
  dependsOn: string
  /** Uses {label}. */
  collapse: string
  /** Uses {label}. */
  expand: string
  /** Uses {count}. */
  tasks: string
  noTasks: string
}

export const DEFAULT_GANTT_LABELS: GanttLabels = {
  chart: "Timeline",
  task: "Task",
  zoom: "Zoom",
  day: "Day",
  week: "Week",
  month: "Month",
  today: "Today",
  critical: "Critical",
  overdue: "Overdue",
  complete: "Complete",
  progress: "{value}% complete",
  dependsOn: "Depends on {names}",
  collapse: "Collapse {label}",
  expand: "Expand {label}",
  tasks: "{count} tasks",
  noTasks: "No tasks to show.",
}

export type GanttProps = {
  tasks?: GanttTask[]
  zoom?: GanttZoom
  defaultZoom?: GanttZoom
  onZoomChange?: (zoom: GanttZoom) => void
  /** Group values that are collapsed. */
  collapsed?: string[]
  defaultCollapsed?: string[]
  onCollapsedChange?: (collapsed: string[]) => void
  /** Current time for the today marker and overdue checks. Passed in, never read from the clock. */
  now?: GanttDate
  /**
   * Task ids drawn as critical. Defaults to the chain of driving dependencies that
   * ends at the latest finishing task.
   */
  criticalIds?: string[]
  /** IANA zone for day boundaries and labels. Default "UTC". */
  timeZone?: string
  locale?: string
  onTaskClick?: (task: GanttTask) => void
  labels?: Partial<GanttLabels>
  className?: string
}

/* -------------------------------------------------------------------------- */
/* Sample data                                                                */
/* -------------------------------------------------------------------------- */

export const SAMPLE_GANTT_TASKS: GanttTask[] = [
  {
    id: "t1",
    label: "Task 1",
    group: "Phase A",
    start: "2026-03-02",
    end: "2026-03-09",
    progress: 100,
  },
  {
    id: "t2",
    label: "Task 2",
    group: "Phase A",
    start: "2026-03-09",
    end: "2026-03-18",
    progress: 60,
    dependsOn: ["t1"],
  },
  {
    id: "t3",
    label: "Task 3",
    group: "Phase B",
    start: "2026-03-18",
    end: "2026-03-30",
    progress: 0,
    dependsOn: ["t2"],
  },
  {
    id: "t4",
    label: "Task 4",
    group: "Phase B",
    start: "2026-03-11",
    end: "2026-03-20",
    progress: 25,
    dependsOn: ["t1"],
    tone: "success",
  },
]

export const SAMPLE_GANTT_NOW = "2026-03-16T12:00:00Z"

/* -------------------------------------------------------------------------- */
/* Time helpers                                                               */
/* -------------------------------------------------------------------------- */

const DAY = 86_400_000
const MIN = 60_000

/** Pixels per day for each zoom level. */
const PX_PER_DAY: Record<GanttZoom, number> = { day: 40, week: 16, month: 5 }

const ROW_H = 44
const GROUP_H = 36
const BAR_H = 22
const LABEL_W = 240

function validZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return timeZone
  } catch {
    return "UTC"
  }
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>()

function zoneOffset(ms: number, timeZone: string) {
  let f = zoneFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    })
    zoneFormatters.set(timeZone, f)
  }
  const o = { y: 0, m: 0, d: 0, h: 0, min: 0 }
  for (const p of f.formatToParts(new Date(ms))) {
    const v = Number(p.value)
    if (p.type === "year") o.y = v
    else if (p.type === "month") o.m = v
    else if (p.type === "day") o.d = v
    else if (p.type === "hour") o.h = v % 24
    else if (p.type === "minute") o.min = v
  }
  return Date.UTC(o.y, o.m - 1, o.d, o.h, o.min) - Math.floor(ms / MIN) * MIN
}

/** The instant read as wall-clock time in the zone, expressed as a UTC-style number. */
function toLocal(ms: number, timeZone: string) {
  return ms + zoneOffset(ms, timeZone)
}

function toMs(value: GanttDate | undefined) {
  if (value === undefined) return NaN
  return value instanceof Date ? value.getTime() : Date.parse(value)
}

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m
  )
}

function useControllable<T>(
  value: T | undefined,
  initial: T,
  onChange?: (v: T) => void
) {
  const [internal, setInternal] = React.useState(initial)
  const current = value !== undefined ? value : internal
  const set = (v: T) => {
    if (value === undefined) setInternal(v)
    onChange?.(v)
  }
  return [current, set] as const
}

const barTone: Record<GanttTone | "destructive", string> = {
  default: "border-foreground/40 bg-muted",
  brand: "border-brand/50 bg-brand/10",
  success: "border-success/50 bg-success/10",
  warning: "border-warning/60 bg-warning/12",
  destructive: "border-destructive/60 bg-destructive/10",
}

const fillTone: Record<GanttTone | "destructive", string> = {
  default: "bg-foreground/25",
  brand: "bg-brand/40",
  success: "bg-success/45",
  warning: "bg-warning/50",
  destructive: "bg-destructive/40",
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

type Norm = GanttTask & {
  s: number
  t: number
  critical: boolean
  overdue: boolean
  done: boolean
}

type Row =
  | {
      kind: "group"
      key: string
      group: string
      count: number
      s: number
      t: number
      open: boolean
    }
  | { kind: "task"; key: string; task: Norm }

function Gantt({
  tasks = SAMPLE_GANTT_TASKS,
  zoom: zoomProp,
  defaultZoom = "week",
  onZoomChange,
  collapsed: collapsedProp,
  defaultCollapsed = [],
  onCollapsedChange,
  now,
  criticalIds,
  timeZone = "UTC",
  locale,
  onTaskClick,
  labels: labelsProp,
  className,
}: GanttProps) {
  const labels = React.useMemo(
    () => ({ ...DEFAULT_GANTT_LABELS, ...labelsProp }),
    [labelsProp]
  )
  const zone = React.useMemo(() => validZone(timeZone), [timeZone])
  const [zoom, setZoom] = useControllable(zoomProp, defaultZoom, onZoomChange)
  const [collapsed, setCollapsed] = useControllable(
    collapsedProp,
    defaultCollapsed,
    onCollapsedChange
  )
  const markerId = React.useId().replace(/[^a-zA-Z0-9]/g, "")
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const ppd = PX_PER_DAY[zoom]
  const nowMs = toMs(now)

  /* Normalise tasks, derive critical path and overdue --------------------- */
  const norm = React.useMemo<Norm[]>(() => {
    const base = tasks.flatMap((task) => {
      const s = toMs(task.start)
      const t = toMs(task.end)
      if (!Number.isFinite(s) || !Number.isFinite(t) || t < s) return []
      return [{ ...task, s, t }]
    })
    const byId = new Map(base.map((b) => [b.id, b]))
    let critical = new Set<string>(criticalIds ?? [])
    if (!criticalIds && base.length) {
      critical = new Set()
      let cursor: (typeof base)[number] | undefined = base.reduce((a, b) =>
        b.t > a.t ? b : a
      )
      while (cursor && !critical.has(cursor.id)) {
        critical.add(cursor.id)
        const deps: (typeof base)[number][] = (cursor.dependsOn ?? [])
          .map((id) => byId.get(id))
          .filter((d): d is (typeof base)[number] => Boolean(d))
        cursor = deps.length
          ? deps.reduce((a, b) => (b.t > a.t ? b : a))
          : undefined
      }
      // A chain of one is not a path worth flagging.
      if (critical.size < 2) critical = new Set()
    }
    return base.map((b) => {
      const done = (b.progress ?? 0) >= 100
      return {
        ...b,
        done,
        critical: critical.has(b.id) && !done,
        overdue:
          Number.isFinite(nowMs) &&
          b.progress !== undefined &&
          !done &&
          b.t < nowMs,
      }
    })
  }, [tasks, criticalIds, nowMs])

  /* Chart range, in wall-clock days ---------------------------------------- */
  const { origin, days } = React.useMemo(() => {
    const points = norm.flatMap((n) => [toLocal(n.s, zone), toLocal(n.t, zone)])
    if (Number.isFinite(nowMs)) points.push(toLocal(nowMs, zone))
    if (!points.length) {
      const fallback = Math.floor(Date.UTC(2026, 0, 5) / DAY) * DAY
      return { origin: fallback, days: 28 }
    }
    let lo = Math.floor(Math.min(...points) / DAY) * DAY - 2 * DAY
    let hi = Math.ceil(Math.max(...points) / DAY) * DAY + 3 * DAY
    if (zoom === "week") {
      const dow = new Date(lo).getUTCDay()
      lo -= ((dow + 6) % 7) * DAY // back to Monday
    } else if (zoom === "month") {
      const d = new Date(lo)
      lo = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
      const e = new Date(hi)
      hi = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 1)
    }
    return { origin: lo, days: Math.max(7, Math.round((hi - lo) / DAY)) }
  }, [norm, zone, nowMs, zoom])

  const width = days * ppd
  const xOf = (localMs: number) => ((localMs - origin) / DAY) * ppd

  /* Axis ticks --------------------------------------------------------------- */
  const fmt = React.useMemo(() => {
    const make = (o: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...o })
    return {
      month: make({ month: "long", year: "numeric" }),
      monthShort: make({ month: "short" }),
      year: make({ year: "numeric" }),
      day: make({ day: "numeric" }),
      weekday: make({ weekday: "narrow" }),
      date: make({ month: "short", day: "numeric" }),
    }
  }, [locale])

  const axis = React.useMemo(() => {
    const top: { key: string; label: string; x: number; w: number }[] = []
    const bottom: {
      key: string
      label: string
      sub?: string
      x: number
      w: number
    }[] = []
    for (let i = 0; i < days; i++) {
      const ms = origin + i * DAY
      const d = new Date(ms)
      const isMonthStart = d.getUTCDate() === 1
      const topKey =
        zoom === "month"
          ? String(d.getUTCFullYear())
          : `${d.getUTCFullYear()}-${d.getUTCMonth()}`
      const last = top[top.length - 1]
      if (!last || last.key !== topKey) {
        top.push({
          key: topKey,
          label: (zoom === "month" ? fmt.year : fmt.month).format(ms),
          x: i * ppd,
          w: ppd,
        })
      } else last.w += ppd
      if (zoom === "day") {
        bottom.push({
          key: String(ms),
          label: fmt.day.format(ms),
          sub: fmt.weekday.format(ms),
          x: i * ppd,
          w: ppd,
        })
      } else if (zoom === "week" && d.getUTCDay() === 1) {
        bottom.push({
          key: String(ms),
          label: fmt.day.format(ms),
          x: i * ppd,
          w: 7 * ppd,
        })
      } else if (zoom === "month" && isMonthStart) {
        const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
        bottom.push({
          key: String(ms),
          label: fmt.monthShort.format(ms),
          x: i * ppd,
          w: ((next - ms) / DAY) * ppd,
        })
      }
    }
    return { top, bottom }
  }, [days, origin, ppd, zoom, fmt])

  /* Rows --------------------------------------------------------------------- */
  const rows = React.useMemo<Row[]>(() => {
    const order: string[] = []
    const byGroup = new Map<string, Norm[]>()
    for (const n of norm) {
      const g = n.group ?? ""
      if (!byGroup.has(g)) {
        byGroup.set(g, [])
        order.push(g)
      }
      byGroup.get(g)!.push(n)
    }
    const out: Row[] = []
    for (const g of order) {
      const list = byGroup.get(g)!
      if (g === "") {
        for (const task of list) out.push({ kind: "task", key: task.id, task })
        continue
      }
      const open = !collapsed.includes(g)
      out.push({
        kind: "group",
        key: `group:${g}`,
        group: g,
        count: list.length,
        s: Math.min(...list.map((l) => l.s)),
        t: Math.max(...list.map((l) => l.t)),
        open,
      })
      if (open)
        for (const task of list) out.push({ kind: "task", key: task.id, task })
    }
    return out
  }, [norm, collapsed])

  /* Vertical layout of visible rows (for the dependency arrows) --------------- */
  const layout = React.useMemo(() => {
    let y = 0
    const centers = new Map<string, number>()
    const tops: number[] = []
    for (const r of rows) {
      const h = r.kind === "group" ? GROUP_H : ROW_H
      tops.push(y)
      if (r.kind === "task") centers.set(r.task.id, y + h / 2)
      y += h
    }
    return { centers, tops, height: y }
  }, [rows])

  const nowX = Number.isFinite(nowMs) ? xOf(toLocal(nowMs, zone)) : null

  const edges = React.useMemo(() => {
    const byId = new Map(norm.map((n) => [n.id, n]))
    const out: { key: string; d: string; critical: boolean }[] = []
    for (const n of norm) {
      for (const depId of n.dependsOn ?? []) {
        const dep = byId.get(depId)
        const y1 = layout.centers.get(depId)
        const y2 = layout.centers.get(n.id)
        if (!dep || y1 === undefined || y2 === undefined) continue
        const x1 = ((toLocal(dep.t, zone) - origin) / DAY) * ppd
        const x2 = ((toLocal(n.s, zone) - origin) / DAY) * ppd
        const gap = 10
        let d: string
        if (x2 >= x1 + gap * 2) {
          d = `M${x1} ${y1} H${x1 + gap} V${y2} H${x2 - 1}`
        } else {
          const mid = y2 > y1 ? y1 + ROW_H / 2 : y1 - ROW_H / 2
          d = `M${x1} ${y1} H${x1 + gap} V${mid} H${x2 - gap} V${y2} H${x2 - 1}`
        }
        out.push({
          key: `${depId}>${n.id}`,
          d,
          critical: dep.critical && n.critical,
        })
      }
    }
    return out
  }, [norm, layout, origin, ppd, zone])

  /* Handlers ------------------------------------------------------------------ */
  const toggleGroup = (group: string) =>
    setCollapsed(
      collapsed.includes(group)
        ? collapsed.filter((g) => g !== group)
        : [...collapsed, group]
    )

  const scrollToToday = () => {
    if (nowX === null || !scrollRef.current) return
    scrollRef.current.scrollTo({
      left: Math.max(0, nowX - scrollRef.current.clientWidth / 2 + LABEL_W),
      behavior: "smooth",
    })
  }

  const onBarKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const bars = Array.from(
      scrollRef.current?.querySelectorAll<HTMLElement>(
        "[data-slot='gantt-bar']"
      ) ?? []
    )
    const next =
      bars[bars.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1)]
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  const dateRange = (t: Norm) =>
    `${fmt.date.format(toLocal(t.s, zone))} - ${fmt.date.format(toLocal(t.t, zone))}`

  const labelOf = (t: Norm) =>
    [
      t.label,
      dateRange(t),
      t.progress !== undefined
        ? fill(labels.progress, { value: Math.round(t.progress) })
        : undefined,
      t.done ? labels.complete : undefined,
      t.critical ? labels.critical : undefined,
      t.overdue ? labels.overdue : undefined,
      t.dependsOn?.length
        ? fill(labels.dependsOn, {
            names: t.dependsOn
              .map((id) => norm.find((n) => n.id === id)?.label ?? id)
              .join(", "),
          })
        : undefined,
    ]
      .filter(Boolean)
      .join(", ")

  return (
    <div
      data-slot="gantt"
      className={cn(
        "flex min-h-0 w-full max-w-full min-w-0 flex-col overflow-hidden border bg-background text-foreground",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div
          role="group"
          aria-label={labels.zoom}
          className="inline-flex items-center gap-0.5 rounded-md border p-0.5"
        >
          {(["day", "week", "month"] as const).map((z) => (
            <Button
              key={z}
              size="xs"
              variant={zoom === z ? "secondary" : "ghost"}
              aria-pressed={zoom === z}
              onClick={() => setZoom(z)}
            >
              {labels[z]}
            </Button>
          ))}
        </div>
        {nowX !== null && (
          <Button size="xs" variant="outline" onClick={scrollToToday}>
            {labels.today}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">{labels.noTasks}</p>
      ) : (
        <div
          ref={scrollRef}
          role="group"
          aria-label={labels.chart}
          className="min-h-0 flex-1 overflow-auto"
        >
          <div style={{ width: LABEL_W + width }}>
            {/* Axis */}
            <div className="sticky top-0 z-30 flex border-b bg-background">
              <div
                className="sticky left-0 z-40 flex shrink-0 items-end border-r bg-background px-3 pb-1.5 eyebrow text-muted-foreground"
                style={{ width: LABEL_W }}
              >
                {labels.task}
              </div>
              <div className="relative h-14" style={{ width }}>
                {axis.top.map((t) => (
                  <div
                    key={t.key}
                    className="absolute top-0 flex h-7 items-center overflow-hidden border-b border-l px-2 text-xs font-medium whitespace-nowrap"
                    style={{ left: t.x, width: t.w }}
                  >
                    {t.label}
                  </div>
                ))}
                {axis.bottom.map((b) => (
                  <div
                    key={b.key}
                    className="absolute bottom-0 flex h-7 items-center justify-between gap-1 overflow-hidden border-l px-1.5 font-mono text-[11px] text-muted-foreground"
                    style={{ left: b.x, width: b.w }}
                  >
                    <span>{b.label}</span>
                    {b.sub && <span aria-hidden>{b.sub}</span>}
                  </div>
                ))}
                {nowX !== null && (
                  <span
                    className="absolute bottom-7 -translate-x-1/2 bg-brand px-1 eyebrow text-brand-foreground"
                    style={{ left: nowX }}
                  >
                    {labels.today}
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="relative">
              {rows.map((row) =>
                row.kind === "group" ? (
                  <div
                    key={row.key}
                    data-slot="gantt-group"
                    className="flex border-b bg-muted/40"
                    style={{ height: GROUP_H }}
                  >
                    <div
                      className="sticky left-0 z-20 flex shrink-0 items-center border-r bg-muted px-1.5"
                      style={{ width: LABEL_W }}
                    >
                      <button
                        type="button"
                        aria-expanded={row.open}
                        aria-label={fill(
                          row.open ? labels.collapse : labels.expand,
                          { label: row.group }
                        )}
                        onClick={() => toggleGroup(row.group)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
                      >
                        {row.open ? (
                          <ChevronDown
                            className="size-4 shrink-0"
                            aria-hidden
                          />
                        ) : (
                          <ChevronRight
                            className="size-4 shrink-0"
                            aria-hidden
                          />
                        )}
                        <span className="truncate">{row.group}</span>
                        <span className="ml-auto shrink-0 eyebrow text-muted-foreground">
                          {fill(labels.tasks, { count: row.count })}
                        </span>
                      </button>
                    </div>
                    <div className="relative" style={{ width }}>
                      <div
                        aria-hidden
                        className="absolute top-1/2 h-1.5 -translate-y-1/2 border border-foreground/50 bg-foreground/30"
                        style={{
                          left: xOf(toLocal(row.s, zone)),
                          width: Math.max(
                            4,
                            xOf(toLocal(row.t, zone)) -
                              xOf(toLocal(row.s, zone))
                          ),
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div
                    key={row.key}
                    data-slot="gantt-row"
                    className="flex border-b"
                    style={{ height: ROW_H }}
                  >
                    <div
                      className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-0.5 border-r bg-background px-3"
                      style={{ width: LABEL_W }}
                    >
                      <div className="flex items-center gap-1.5">
                        {row.task.done && (
                          <CircleCheck
                            className="size-3.5 shrink-0 text-success"
                            aria-hidden
                          />
                        )}
                        <span className="truncate text-sm">
                          {row.task.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                          {dateRange(row.task)}
                        </span>
                        {row.task.critical && (
                          <Badge
                            variant="outline"
                            className="h-4 gap-0.5 px-1 py-0 text-[10px] [&>svg]:size-2.5"
                          >
                            <Route aria-hidden />
                            {labels.critical}
                          </Badge>
                        )}
                        {row.task.overdue && (
                          <Badge
                            variant="destructive"
                            className="h-4 gap-0.5 px-1 py-0 text-[10px] [&>svg]:size-2.5"
                          >
                            <Clock aria-hidden />
                            {labels.overdue}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="relative" style={{ width }}>
                      <TaskBar
                        task={row.task}
                        x={xOf(toLocal(row.task.s, zone))}
                        w={Math.max(
                          8,
                          xOf(toLocal(row.task.t, zone)) -
                            xOf(toLocal(row.task.s, zone))
                        )}
                        ariaLabel={labelOf(row.task)}
                        progressText={
                          row.task.progress !== undefined
                            ? `${Math.round(row.task.progress)}%`
                            : undefined
                        }
                        onKeyDown={onBarKeyDown}
                        onClick={() =>
                          onTaskClick?.(
                            tasks.find((t) => t.id === row.task.id) ?? row.task
                          )
                        }
                      />
                    </div>
                  </div>
                )
              )}

              {/* Vertical gridlines, dependency arrows, today marker */}
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 z-[5]"
                style={{ left: LABEL_W, width, height: layout.height }}
              >
                {axis.bottom.map((b) => (
                  <div
                    key={b.key}
                    className="absolute inset-y-0 border-l border-border/60"
                    style={{ left: b.x }}
                  />
                ))}
                <svg
                  width={width}
                  height={layout.height}
                  className="absolute inset-0 overflow-visible"
                >
                  <defs>
                    <marker
                      id={`${markerId}-m`}
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto"
                    >
                      <path
                        d="M0 0 L8 4 L0 8 Z"
                        className="fill-muted-foreground"
                      />
                    </marker>
                    <marker
                      id={`${markerId}-c`}
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto"
                    >
                      <path d="M0 0 L8 4 L0 8 Z" className="fill-foreground" />
                    </marker>
                  </defs>
                  {edges.map((e) => (
                    <path
                      key={e.key}
                      d={e.d}
                      fill="none"
                      strokeWidth={e.critical ? 1.5 : 1}
                      strokeLinejoin="round"
                      className={
                        e.critical
                          ? "stroke-foreground"
                          : "stroke-muted-foreground"
                      }
                      markerEnd={`url(#${markerId}-${e.critical ? "c" : "m"})`}
                    />
                  ))}
                </svg>
                {nowX !== null && (
                  <div
                    className="absolute inset-y-0 w-px bg-brand"
                    style={{ left: nowX }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskBar({
  task,
  x,
  w,
  ariaLabel,
  progressText,
  onKeyDown,
  onClick,
}: {
  task: Norm
  x: number
  w: number
  ariaLabel: string
  progressText?: string
  onKeyDown: React.KeyboardEventHandler<HTMLElement>
  onClick: () => void
}) {
  const tone: GanttTone | "destructive" = task.overdue
    ? "destructive"
    : (task.tone ?? "brand")
  return (
    <button
      type="button"
      data-slot="gantt-bar"
      data-critical={task.critical || undefined}
      data-overdue={task.overdue || undefined}
      aria-label={ariaLabel}
      title={ariaLabel}
      onKeyDown={onKeyDown}
      onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 -translate-y-1/2 border text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        barTone[tone],
        task.critical && "border-2 border-foreground"
      )}
      style={{ left: x, width: w, height: BAR_H }}
    >
      {task.progress !== undefined && (
        <span
          aria-hidden
          className={cn("absolute inset-y-0 left-0", fillTone[tone])}
          style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
        />
      )}
      {progressText && (
        <span
          aria-hidden
          className="absolute top-1/2 left-full ml-1.5 -translate-y-1/2 font-mono text-[11px] whitespace-nowrap text-muted-foreground"
        >
          {progressText}
        </span>
      )}
    </button>
  )
}

export { Gantt }
