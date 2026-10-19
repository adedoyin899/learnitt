"use client"

import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

type FieldControlProps = {
  id: string
  "aria-describedby"?: string
  "aria-invalid"?: true
  "aria-required"?: true
}

type FieldContextValue = {
  controlProps: FieldControlProps
  labelId: string
}

const FieldContext = React.createContext<FieldContextValue | null>(null)

/** Props (id, aria-describedby, aria-invalid) for a control inside a Field. */
function useFieldControl(): FieldControlProps | null {
  return React.useContext(FieldContext)?.controlProps ?? null
}

type FieldProps = Omit<React.ComponentProps<"div">, "children"> & {
  label?: React.ReactNode
  hint?: React.ReactNode
  /** Error message. Marks the control invalid and replaces the hint. */
  error?: React.ReactNode
  required?: boolean
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean
  /** Override the generated control id. */
  controlId?: string
  /**
   * A render function receiving the control props to spread, or plain nodes
   * containing a `FieldControl` / any component using `useFieldControl`.
   */
  children: React.ReactNode | ((props: FieldControlProps) => React.ReactNode)
}

function Field({
  label,
  hint,
  error,
  required = false,
  hideLabel = false,
  controlId,
  children,
  className,
  ...props
}: FieldProps) {
  const generated = React.useId()
  const id = controlId ?? generated
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const hasError = !!error
  const describedBy = hasError ? errorId : hint ? hintId : undefined

  const controlProps: FieldControlProps = {
    id,
    "aria-describedby": describedBy,
    ...(hasError ? { "aria-invalid": true as const } : null),
    ...(required ? { "aria-required": true as const } : null),
  }
  const value = React.useMemo(
    () => ({ controlProps, labelId: `${id}-label` }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, describedBy, hasError, required]
  )

  return (
    <FieldContext.Provider value={value}>
      <div
        data-slot="field"
        data-invalid={hasError ? "" : undefined}
        className={cn("flex min-w-0 flex-col gap-2", className)}
        {...props}
      >
        {label && (
          <Label
            id={value.labelId}
            htmlFor={id}
            className={cn(hideLabel && "sr-only")}
          >
            {label}
            {required && (
              <span aria-hidden className="text-destructive">
                *
              </span>
            )}
          </Label>
        )}
        {typeof children === "function" ? children(controlProps) : children}
        {hasError ? (
          <p
            id={errorId}
            data-slot="field-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        ) : hint ? (
          <p
            id={hintId}
            data-slot="field-hint"
            className="text-sm text-muted-foreground"
          >
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  )
}

/**
 * Merges the Field's id and aria attributes onto its single child
 * (Input, Textarea, SelectTrigger, ...). No cloneElement needed.
 */
function FieldControl({ ...props }: React.ComponentProps<typeof Slot.Root>) {
  const control = useFieldControl()
  return <Slot.Root data-slot="field-control" {...control} {...props} />
}

type FieldGroupProps = React.ComponentProps<"div"> & {
  /** Max columns when the container is wide enough. */
  columns?: 1 | 2
}

/** Grid of fields: one column, two when the container is wide. */
function FieldGroup({ columns = 2, className, ...props }: FieldGroupProps) {
  return (
    <div className="@container/field-group w-full">
      <div
        data-slot="field-group"
        className={cn(
          "grid grid-cols-1 gap-x-4 gap-y-5",
          columns === 2 && "@md/field-group:grid-cols-2",
          "[&>[data-span=full]]:col-span-full",
          className
        )}
        {...props}
      />
    </div>
  )
}

type FieldSetProps = Omit<React.ComponentProps<"fieldset">, "title"> & {
  legend: React.ReactNode
  description?: React.ReactNode
}

function FieldSet({
  legend,
  description,
  className,
  children,
  ...props
}: FieldSetProps) {
  return (
    <fieldset
      data-slot="field-set"
      className={cn("flex min-w-0 flex-col gap-4", className)}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <legend className="p-0 heading text-xl">{legend}</legend>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </fieldset>
  )
}

export { Field, FieldControl, FieldGroup, FieldSet, useFieldControl }
export type { FieldProps, FieldControlProps, FieldGroupProps, FieldSetProps }
