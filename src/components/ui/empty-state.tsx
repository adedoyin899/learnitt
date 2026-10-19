import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const emptyStateVariants = cva(
  "mx-auto flex w-full flex-col items-center justify-center text-center text-balance",
  {
    variants: {
      size: {
        sm: "gap-3 px-4 py-8",
        default: "gap-4 px-6 py-12",
        lg: "gap-5 px-6 py-20",
      },
      bordered: {
        true: "rounded-lg border border-dashed",
        false: "",
      },
    },
    defaultVariants: { size: "default", bordered: false },
  }
)

const iconBox = {
  sm: "size-9 [&>svg]:size-4",
  default: "size-11 [&>svg]:size-5",
  lg: "size-14 [&>svg]:size-6",
} as const

const titleSize = {
  sm: "text-lg",
  default: "text-xl",
  lg: "text-3xl",
} as const

type EmptyStateProps = Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof emptyStateVariants> & {
    icon?: React.ReactNode
    title: React.ReactNode
    description?: React.ReactNode
    action?: React.ReactNode
    secondaryAction?: React.ReactNode
    /** Announce to assistive tech (role="status"), e.g. for empty search results. */
    live?: boolean
  }

function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  live = false,
  size,
  bordered,
  className,
  children,
  ...props
}: EmptyStateProps) {
  const s = size ?? "default"

  return (
    <div
      data-slot="empty-state"
      role={live ? "status" : undefined}
      className={cn(emptyStateVariants({ size, bordered }), className)}
      {...props}
    >
      {icon && (
        <div
          data-slot="empty-state-icon"
          aria-hidden
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border bg-surface text-muted-foreground",
            iconBox[s]
          )}
        >
          {icon}
        </div>
      )}
      <div className="flex max-w-sm flex-col gap-1.5">
        <h3
          data-slot="empty-state-title"
          className={cn("heading", titleSize[s])}
        >
          {title}
        </h3>
        {description && (
          <p
            data-slot="empty-state-description"
            className="text-sm text-muted-foreground"
          >
            {description}
          </p>
        )}
      </div>
      {children}
      {(action || secondaryAction) && (
        <div
          data-slot="empty-state-actions"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}

export { EmptyState, emptyStateVariants }
export type { EmptyStateProps }
