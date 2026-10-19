"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

/** Mount once near the root. Call `toast()` from "sonner" anywhere. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-surface !border !border-border !bg-popover !text-popover-foreground !shadow-md !font-sans",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground !rounded-md",
          cancelButton: "!bg-muted !text-muted-foreground !rounded-md",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-destructive",
          warning: "[&_[data-icon]]:!text-warning",
          info: "[&_[data-icon]]:!text-brand",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
