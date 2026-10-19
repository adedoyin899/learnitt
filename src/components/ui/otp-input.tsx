"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type OtpInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "maxLength" | "pattern" | "type"
> & {
  /** Number of cells. Defaults to 6. */
  length?: number
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Called once when every cell is filled. */
  onComplete?: (value: string) => void
  /** Accepted characters. Digits only by default. */
  pattern?: "numeric" | "alphanumeric"
  invalid?: boolean
  /** Render a dash after the middle cell. */
  separator?: boolean
  /** Focus the field on mount. */
  autoFocus?: boolean
}

function OtpInput({
  className,
  length = 6,
  value,
  defaultValue = "",
  onValueChange,
  onComplete,
  pattern = "numeric",
  invalid = false,
  separator = false,
  disabled,
  autoFocus,
  "aria-label": ariaLabel = "One-time code",
  ...props
}: OtpInputProps) {
  const [internal, setInternal] = React.useState(defaultValue)
  const [focused, setFocused] = React.useState(false)
  const [caret, setCaret] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const numeric = pattern === "numeric"

  const sanitize = React.useCallback(
    (raw: string) =>
      raw.replace(numeric ? /\D/g : /[^a-zA-Z0-9]/g, "").slice(0, length),
    [numeric, length]
  )
  const current = sanitize(value ?? internal)

  const commit = (next: string) => {
    const clean = sanitize(next)
    if (clean === current) return
    setInternal(clean)
    onValueChange?.(clean)
    if (clean.length === length) onComplete?.(clean)
  }

  const syncCaret = () => {
    const el = inputRef.current
    if (el) setCaret(el.selectionStart ?? current.length)
  }

  const activeIndex = Math.min(caret, length - 1)
  const half = Math.floor(length / 2)

  return (
    <div
      data-slot="otp-input"
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      className={cn("relative inline-flex items-center gap-2", className)}
    >
      <input
        ref={inputRef}
        data-slot="otp-input-field"
        type="text"
        autoComplete="one-time-code"
        inputMode={numeric ? "numeric" : "text"}
        autoCapitalize="off"
        spellCheck={false}
        pattern={numeric ? "[0-9]*" : "[a-zA-Z0-9]*"}
        maxLength={length}
        value={current}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          commit(e.target.value)
          syncCaret()
        }}
        onKeyUp={syncCaret}
        onSelect={syncCaret}
        onClick={syncCaret}
        onFocus={(e) => {
          setFocused(true)
          setCaret(e.currentTarget.selectionStart ?? current.length)
        }}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 z-10 size-full cursor-text opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      {Array.from({ length }, (_, i) => {
        const char = current[i]
        const active = focused && !disabled && i === activeIndex
        return (
          <React.Fragment key={i}>
            {separator && i === half && i > 0 && (
              <span
                aria-hidden
                className="h-px w-3 bg-border"
                data-slot="otp-input-separator"
              />
            )}
            <div
              aria-hidden
              data-slot="otp-input-cell"
              data-active={active || undefined}
              data-filled={char ? "" : undefined}
              className={cn(
                "relative flex h-11 w-8 items-center justify-center rounded-md border border-input bg-background font-mono text-lg tabular-nums sm:w-10 dark:bg-input/20",
                "transition-[border-color,box-shadow] duration-150 ease-out",
                active && "border-brand/60 ring-[3px] ring-ring",
                invalid && "border-destructive",
                invalid && active && "ring-destructive/20",
                disabled && "opacity-50"
              )}
            >
              {char}
              {active && !char && (
                <span className="h-5 w-px animate-pulse bg-foreground" />
              )}
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

export { OtpInput }
export type { OtpInputProps }
