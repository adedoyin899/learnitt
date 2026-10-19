import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  OctagonAlertIcon,
  XIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative grid w-full grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-1 border px-4 py-3 text-sm",
  {
    variants: {
      variant: {
        default: "border-border bg-foreground/5 text-foreground",
        info: "border-brand/25 bg-brand/10 text-foreground [&>[data-slot=alert-icon]]:text-brand",
        success:
          "border-success/25 bg-success/10 text-foreground [&>[data-slot=alert-icon]]:text-success",
        warning:
          "border-warning/30 bg-warning/10 text-foreground [&>[data-slot=alert-icon]]:text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]",
        destructive:
          "border-destructive/25 bg-destructive/10 text-foreground [&>[data-slot=alert-icon]]:text-destructive",
      },
      banner: {
        false: "rounded-lg",
        true: "rounded-none border-x-0",
      },
    },
    defaultVariants: { variant: "default", banner: false },
  }
)

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>

const alertIcons: Record<AlertVariant, React.ElementType> = {
  default: InfoIcon,
  info: InfoIcon,
  success: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  destructive: OctagonAlertIcon,
}

type AlertProps = Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof alertVariants> & {
    /** Replace the default per-variant icon. */
    icon?: React.ReactNode
    /** Show a close button. */
    dismissible?: boolean
    onDismiss?: () => void
    dismissLabel?: string
  }

function Alert({
  className,
  variant = "default",
  banner = false,
  icon,
  dismissible = false,
  onDismiss,
  dismissLabel = "Dismiss",
  role,
  children,
  ...props
}: AlertProps) {
  const v = variant ?? "default"
  const Icon = alertIcons[v]
  const assertive = v === "destructive" || v === "warning"

  return (
    <div
      data-slot="alert"
      data-variant={v}
      data-banner={banner ? "" : undefined}
      role={role ?? (assertive ? "alert" : "status")}
      className={cn(alertVariants({ variant, banner }), className)}
      {...props}
    >
      <span
        data-slot="alert-icon"
        aria-hidden
        className="row-span-2 mt-0.5 flex size-4 items-center justify-center [&>svg]:size-4"
      >
        {icon ?? <Icon />}
      </span>
      {children}
      {dismissible && (
        <button
          type="button"
          data-slot="alert-dismiss"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="col-start-3 row-start-1 -mt-1 -mr-2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4"
        >
          <XIcon aria-hidden />
        </button>
      )}
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 font-medium tracking-tight [overflow-wrap:anywhere]",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 text-sm [overflow-wrap:anywhere] text-muted-foreground [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn(
        "col-start-2 mt-2 flex flex-wrap items-center gap-2",
        className
      )}
      {...props}
    />
  )
}

export {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertAction,
  alertVariants,
  type AlertProps,
  type AlertVariant,
}
