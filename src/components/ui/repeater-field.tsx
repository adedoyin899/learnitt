"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { cn } from "@/lib/utils"
import { transition } from "@/lib/motion"
import { Button } from "@/components/ui/button"

// Stable keys for rows without ids: each row object gets an id on first sight
// and `update` hands it on to the replacement object.
const rowIds = new WeakMap<object, string>()
let rowSeq = 0

function rowId(item: unknown, index: number) {
  if (typeof item !== "object" || item === null) return `i-${index}`
  let id = rowIds.get(item)
  if (!id) {
    id = `r-${++rowSeq}`
    rowIds.set(item, id)
  }
  return id
}

type RepeaterRowContext<T> = {
  item: T
  index: number
  /** Merge a partial change into this row. */
  update: (patch: Partial<T>) => void
  remove: () => void
}

type RepeaterFieldProps<T extends object> = Omit<
  React.ComponentProps<"div">,
  "children" | "onChange" | "defaultValue"
> & {
  value: T[]
  onValueChange: (value: T[]) => void
  renderRow: (ctx: RepeaterRowContext<T>) => React.ReactNode
  createItem: () => T
  /** Group heading, also the accessible name. */
  label?: string
  addLabel?: string
  /** Rows that cannot be removed below. Defaults to 0. */
  min?: number
  /** Add is disabled at this many rows. */
  max?: number
  emptyLabel?: string
  /** Show move up / move down buttons. */
  reorderable?: boolean
  /** Stable key per row. Defaults to an internal id map. */
  getKey?: (item: T, index: number) => React.Key
  /** Noun used in screen reader announcements and button names. */
  itemLabel?: string
}

function RepeaterField<T extends object>({
  className,
  value,
  onValueChange,
  renderRow,
  createItem,
  label,
  addLabel = "Add row",
  min = 0,
  max = Infinity,
  emptyLabel = "Nothing added yet.",
  reorderable = false,
  getKey,
  itemLabel = "Row",
  ...props
}: RepeaterFieldProps<T>) {
  const reduce = useReducedMotion()
  const [announcement, setAnnouncement] = React.useState("")
  const headingId = React.useId()

  const canAdd = value.length < max
  const canRemove = value.length > min

  function add() {
    if (!canAdd) return
    const item = createItem()
    rowId(item, value.length)
    onValueChange([...value, item])
    setAnnouncement(`${itemLabel} ${value.length + 1} added.`)
  }

  function remove(index: number) {
    if (!canRemove) return
    onValueChange(value.filter((_, i) => i !== index))
    setAnnouncement(`${itemLabel} ${index + 1} removed.`)
  }

  function update(index: number, patch: Partial<T>) {
    const prev = value[index]
    const next = { ...prev, ...patch }
    const id = rowIds.get(prev)
    if (id) rowIds.set(next, id)
    onValueChange(value.map((it, i) => (i === index ? next : it)))
  }

  function move(index: number, to: number) {
    if (to < 0 || to >= value.length) return
    const next = value.slice()
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item)
    onValueChange(next)
    setAnnouncement(`${itemLabel} moved to position ${to + 1}.`)
  }

  const rowMotion = reduce
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, height: 0 },
        animate: { opacity: 1, height: "auto" },
        exit: { opacity: 0, height: 0 },
      }

  return (
    <div
      data-slot="repeater-field"
      role="group"
      aria-labelledby={label ? headingId : undefined}
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      {label && (
        <div className="flex items-baseline justify-between gap-3">
          <span id={headingId} className="eyebrow">
            {label}
          </span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {value.length}
            {Number.isFinite(max) ? ` / ${max}` : ""}
          </span>
        </div>
      )}

      <div className="rounded-md border">
        {value.length === 0 ? (
          <p
            data-slot="repeater-field-empty"
            className="px-4 py-6 text-center text-sm text-muted-foreground"
          >
            {emptyLabel}
          </p>
        ) : (
          <ul className="divide-y">
            <AnimatePresence initial={false}>
              {value.map((item, index) => (
                <motion.li
                  key={getKey ? getKey(item, index) : rowId(item, index)}
                  data-slot="repeater-field-row"
                  {...rowMotion}
                  transition={transition.base}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-3 p-3 sm:p-4">
                    <span
                      aria-hidden
                      className="mt-2.5 w-5 shrink-0 eyebrow tabular-nums"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      {renderRow({
                        item,
                        index,
                        update: (patch) => update(index, patch),
                        remove: () => remove(index),
                      })}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {reorderable && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Move ${itemLabel.toLowerCase()} ${index + 1} up`}
                            disabled={index === 0}
                            onClick={() => move(index, index - 1)}
                          >
                            <ArrowUpIcon />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Move ${itemLabel.toLowerCase()} ${index + 1} down`}
                            disabled={index === value.length - 1}
                            onClick={() => move(index, index + 1)}
                          >
                            <ArrowDownIcon />
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
                        disabled={!canRemove}
                        onClick={() => remove(index)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canAdd}
          onClick={add}
        >
          <PlusIcon />
          {addLabel}
        </Button>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  )
}

export { RepeaterField }
export type { RepeaterFieldProps, RepeaterRowContext }
