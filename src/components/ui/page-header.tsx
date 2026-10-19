import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const pageContainerVariants = cva("mx-auto w-full px-4 sm:px-6", {
  variants: {
    size: {
      sm: "max-w-3xl",
      default: "max-w-5xl",
      lg: "max-w-6xl",
      full: "max-w-none",
    },
  },
  defaultVariants: { size: "default" },
})

type PageContainerProps = React.ComponentProps<"div"> &
  VariantProps<typeof pageContainerVariants>

/** Shared max-width and gutters so every route lines up on the same left edge. */
function PageContainer({ className, size, ...props }: PageContainerProps) {
  return (
    <div
      data-slot="page-container"
      className={cn(pageContainerVariants({ size }), className)}
      {...props}
    />
  )
}

type PageHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Buttons or menus aligned to the right (stacked below on narrow screens). */
  actions?: React.ReactNode
  /** Breadcrumb or back link rendered above the eyebrow. */
  breadcrumb?: React.ReactNode
  /** Draw a hairline under the header. */
  bordered?: boolean
  /** Heading level for the title. Defaults to h1. */
  as?: "h1" | "h2" | "h3"
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumb,
  bordered = false,
  as: Title = "h1",
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-4 py-6 sm:py-8",
        bordered && "border-b",
        className
      )}
      {...props}
    >
      {breadcrumb && (
        <div data-slot="page-header-breadcrumb" className="text-sm">
          {breadcrumb}
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-2">
          {eyebrow && (
            <span
              data-slot="page-header-eyebrow"
              className="eyebrow text-muted-foreground"
            >
              {eyebrow}
            </span>
          )}
          <Title
            data-slot="page-header-title"
            className="heading text-3xl text-balance sm:text-4xl"
          >
            {title}
          </Title>
          {description && (
            <p
              data-slot="page-header-description"
              className="max-w-2xl text-sm text-pretty text-muted-foreground sm:text-base"
            >
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div
            data-slot="page-header-actions"
            className="flex shrink-0 flex-wrap items-center gap-2"
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}

export { PageHeader, PageContainer, pageContainerVariants }
export type { PageHeaderProps, PageContainerProps }
