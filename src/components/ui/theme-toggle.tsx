"use client"

import * as React from "react"
import { Monitor, Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type ThemePreference = "system" | "light" | "dark"

const STORAGE_KEY = "theme"

/**
 * Inline script for `<head>` that applies the saved theme before first paint
 * (no flash). Render it with `dangerouslySetInnerHTML={{ __html: themeScript }}`.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");var d=t==="dark"||((t!=="light")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`

const listeners = new Set<() => void>()

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === "light" || value === "dark" ? value : "system"
  } catch {
    return "system"
  }
}

function applyPreference(pref: ThemePreference) {
  const dark =
    pref === "dark" ||
    (pref === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  const onMedia = () => {
    if (readPreference() === "system") applyPreference("system")
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === null) {
      applyPreference(readPreference())
      onChange()
    }
  }
  media.addEventListener("change", onMedia)
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(onChange)
    media.removeEventListener("change", onMedia)
    window.removeEventListener("storage", onStorage)
  }
}

function setPreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, pref)
  } catch {}
  applyPreference(pref)
  listeners.forEach((l) => l())
}

/** Current theme preference (`system` | `light` | `dark`) and a setter. */
function useThemePreference() {
  const preference = React.useSyncExternalStore(
    subscribe,
    readPreference,
    () => "system" as const
  )
  return [preference, setPreference] as const
}

const options: {
  value: ThemePreference
  label: string
  icon: React.ElementType
}[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
]

type ThemeToggleProps = Omit<
  React.ComponentProps<typeof Button>,
  "children" | "onClick"
>

function ThemeToggle({ className, ...props }: ThemeToggleProps) {
  const [preference, set] = useThemePreference()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-slot="theme-toggle"
          variant="ghost"
          size="icon-sm"
          aria-label="Change theme"
          className={className}
          {...props}
        >
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(v) => set(v as ThemePreference)}
        >
          {options.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className={cn("size-4")} />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { ThemeToggle, themeScript, useThemePreference }
export type { ThemePreference, ThemeToggleProps }
