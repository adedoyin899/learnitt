"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { spring } from "@/lib/motion"

function Switch({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  const [internal, setInternal] = React.useState(defaultChecked ?? false)
  const isOn = checked ?? internal

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      checked={isOn}
      onCheckedChange={(value) => {
        setInternal(value)
        onCheckedChange?.(value)
      }}
      className={cn(
        "peer group inline-flex h-5 w-9 shrink-0 items-center rounded-sm border border-transparent p-0.5 outline-none",
        "transition-colors duration-200 ease-out",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        "focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        isOn ? "justify-end" : "justify-start",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb asChild>
        <motion.span
          data-slot="switch-thumb"
          layout
          transition={spring.snappy}
          className="pointer-events-none block size-4 rounded-xs bg-white shadow-sm ring-0 group-active:w-5"
        />
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
