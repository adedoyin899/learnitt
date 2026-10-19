"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { spring } from "@/lib/motion"

type TabsContextValue = { value?: string; id: string; variant: TabsVariant }
type TabsVariant = "pill" | "underline"

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabs() {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error("Tabs components must be used inside <Tabs>")
  return ctx
}

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  variant = "pill",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & {
  variant?: TabsVariant
}) {
  const [internal, setInternal] = React.useState(defaultValue)
  const current = value ?? internal
  const id = React.useId()

  return (
    <TabsContext.Provider value={{ value: current, id, variant }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        value={current}
        onValueChange={(v) => {
          setInternal(v)
          onValueChange?.(v)
        }}
        className={cn("flex flex-col gap-3", className)}
        {...props}
      />
    </TabsContext.Provider>
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const { variant } = useTabs()
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        "relative inline-flex w-fit items-center text-muted-foreground",
        variant === "pill" && "h-9 rounded-lg bg-muted p-[3px]",
        variant === "underline" && "h-9 gap-4 border-b",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { value: active, id, variant } = useTabs()
  const isActive = active === value

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative inline-flex min-h-7 items-center justify-center gap-1.5 self-stretch text-sm font-medium whitespace-nowrap outline-none",
        "transition-colors duration-150 ease-out hover:text-foreground data-[state=active]:text-foreground",
        "focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variant === "pill" && "flex-1 rounded-md px-3",
        variant === "underline" && "px-0.5",
        className
      )}
      {...props}
    >
      {isActive && (
        <motion.span
          layoutId={`${id}-indicator`}
          transition={spring.smooth}
          aria-hidden
          className={cn(
            "absolute",
            variant === "pill" &&
              "inset-0 rounded-md bg-background shadow-sm dark:bg-input/40",
            variant === "underline" &&
              "inset-x-0 -bottom-px h-0.5 bg-foreground"
          )}
        />
      )}
      <span className="relative z-10 inline-flex items-center gap-1.5">
        {children}
      </span>
    </TabsPrimitive.Trigger>
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "flex-1 outline-none [--pop-y:4px] data-[state=active]:animate-pop-in",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
