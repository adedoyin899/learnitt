"use client"

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, type ReactNode } from "react"
import { ease, spring } from "@/lib/motion"
import { PresenceGate } from "@/lib/presence-gate"
import { cn } from "@/lib/utils"

export interface DrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  side?: "left" | "right" | "bottom"
  children: ReactNode
  /** Class for the panel surface. */
  className?: string
  /** Class for the backdrop. */
  backdropClassName?: string
  ariaLabel?: string
  /** Close when the backdrop is clicked. Default true. */
  dismissable?: boolean
}

export function Drawer({
  open,
  onOpenChange,
  side = "right",
  children,
  className,
  backdropClassName,
  ariaLabel,
  dismissable = true,
}: DrawerProps) {
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    window.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onOpenChange])

  const initialMotion = reduce
    ? { opacity: 0 }
    : side === "bottom"
      ? { y: "100%" }
      : { x: side === "right" ? "100%" : "-100%" }

  const animateMotion = reduce
    ? { opacity: 1 }
    : side === "bottom"
      ? { y: 0 }
      : { x: 0 }

  const exitMotion = reduce
    ? { opacity: 0 }
    : side === "bottom"
      ? { y: "100%" }
      : { x: side === "right" ? "100%" : "-100%" }

  // Two fixed siblings, no wrapper: the backdrop spans the viewport edges but
  // paints the scrim, and the panel is inset off one side and paints its own
  // surface, so neither is a transparent edge-spanning layer. Both hang off
  // `PresenceGate`, so interaction releases in the same commit that starts the
  // exit rather than when it ends.
  return (
    <AnimatePresence>
      {open ? (
        <PresenceGate key="backdrop">
          {({ gate }) => (
            <motion.button
              type="button"
              aria-label="Close"
              tabIndex={dismissable ? 0 : -1}
              onClick={() => dismissable && onOpenChange(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: ease.out }}
              {...gate}
              className={cn(
                "fixed inset-0 z-50 h-full w-full cursor-default bg-foreground/40 backdrop-blur-sm",
                backdropClassName
              )}
            />
          )}
        </PresenceGate>
      ) : null}
      {open ? (
        <PresenceGate key="panel">
          {({ gate }) => (
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              initial={initialMotion}
              animate={animateMotion}
              exit={exitMotion}
              transition={
                reduce ? { duration: 0.2, ease: ease.out } : spring.smooth
              }
              {...gate}
              className={cn(
                "fixed z-50 flex flex-col bg-background shadow-md",
                side === "bottom"
                  ? "inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl border-t border-border shadow-2xl"
                  : "inset-y-0 w-80 max-w-[85vw]",
                side === "right" && "right-0 border-l border-border",
                side === "left" && "left-0 border-r border-border",
                className
              )}
            >
              {children}
            </motion.aside>
          )}
        </PresenceGate>
      ) : null}
    </AnimatePresence>
  )
}
