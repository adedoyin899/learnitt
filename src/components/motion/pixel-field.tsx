"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type PixelFieldVariant = "mosaic" | "matrix" | "equalizer"

type PixelFieldProps = Omit<React.ComponentProps<"div">, "children"> & {
  /**
   * mosaic: drifting blue pixel gradient (hero panels).
   * matrix: faint dot grid with a few cells blinking on (section texture).
   * equalizer: dot columns rising and falling like a level meter (bands).
   */
  variant?: PixelFieldVariant
  /** Cell pitch in CSS px. Defaults per variant. */
  cell?: number
  /** Animation speed multiplier. 0 renders a still frame. */
  speed?: number
  children?: React.ReactNode
}

const DEFAULT_CELL: Record<PixelFieldVariant, number> = {
  mosaic: 32,
  matrix: 9,
  equalizer: 9,
}

// Dark to light, read from the theme so the field follows token changes.
const MOSAIC_STOPS = [
  "--blue-700",
  "--blue-600",
  "--blue-500",
  "--blue-400",
  "--blue-300",
  "--blue-200",
  "--blue-100",
  "--blue-50",
]

function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}

function noise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

type Palette = { mosaic: string[]; ink: string; accent: string }

function readPalette(el: Element): Palette {
  const style = getComputedStyle(el)
  const get = (name: string) => style.getPropertyValue(name).trim()
  return {
    mosaic: MOSAIC_STOPS.map(get),
    ink: get("--foreground") || "#0e0e10",
    accent: get("--blue-400") || "#7b8cfa",
  }
}

/** Canvas pixel textures in the blue scale and ink. Pauses offscreen. */
function PixelField({
  variant = "mosaic",
  cell,
  speed = 1,
  className,
  children,
  ...props
}: PixelFieldProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const pitch = cell ?? DEFAULT_CELL[variant]

  React.useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
    const animated = speed > 0 && !reduce
    let palette = readPalette(canvas)
    let width = 0
    let height = 0
    let frame = 0
    let visible = true
    const start = performance.now()

    const draw = (now: number) => {
      const t = ((now - start) / 1000) * speed
      ctx.clearRect(0, 0, width, height)
      const cols = Math.ceil(width / pitch)
      const rows = Math.ceil(height / pitch)

      if (variant === "mosaic") {
        const stops = palette.mosaic
        // Cells are taller than wide, and the noise stretches vertically, so
        // the field reads as soft vertical streaks rather than blocks.
        const cellH = pitch * 1.6
        const mRows = Math.ceil(height / cellH)
        for (let i = 0; i < cols; i++) {
          // Lightest just right of center, deepening toward both edges.
          const cx = (i + 0.5) / cols
          const band = 1 - Math.min(1, Math.abs(cx - 0.55) * 1.55)
          for (let j = 0; j < mRows; j++) {
            const n =
              noise(i * 0.34 + t * 0.1, j * 0.09 - t * 0.04) * 0.7 +
              noise(i * 0.9 - t * 0.16, j * 0.35 + t * 0.08) * 0.3
            const v = Math.min(
              0.999,
              Math.max(0, band * 0.72 + n * 0.42 - 0.04)
            )
            ctx.fillStyle = stops[Math.floor(v * stops.length)]
            // Snap to whole pixels so neighbouring cells meet without seams.
            const x0 = Math.round(i * pitch)
            const y0 = Math.round(j * cellH)
            ctx.fillRect(
              x0,
              y0,
              Math.round((i + 1) * pitch) - x0,
              Math.round((j + 1) * cellH) - y0
            )
          }
        }
      } else {
        const size = Math.max(2, Math.round(pitch * 0.38))
        const offset = (pitch - size) / 2
        for (let i = 0; i < cols; i++) {
          // Equalizer: tall at both edges, quiet in the middle, swaying.
          const edge = Math.abs((i + 0.5) / cols - 0.5) * 2
          const level =
            variant === "equalizer"
              ? rows *
                (0.12 + edge * edge * 0.62) *
                (0.65 + noise(i * 0.35, t * 0.8) * 0.6)
              : 0
          for (let j = 0; j < rows; j++) {
            const fromBottom = rows - j
            let alpha = 0.08
            let color = palette.ink
            if (variant === "equalizer") {
              if (fromBottom <= level) {
                alpha = 0.18 + 0.5 * (1 - fromBottom / Math.max(level, 1))
              } else {
                alpha = 0.04
              }
              if (fromBottom > level - 1 && fromBottom <= level) alpha = 0.85
            }
            // A sparse set of cells blink on, a few of them in blue.
            const seed = hash(i, j)
            if (seed > 0.965) {
              const pulse = 0.5 + 0.5 * Math.sin(t * (1 + seed * 2) + seed * 40)
              alpha = Math.max(alpha, 0.25 + pulse * 0.7)
              if (seed > 0.992) color = palette.accent
            }
            ctx.globalAlpha = alpha
            ctx.fillStyle = color
            ctx.fillRect(i * pitch + offset, j * pitch + offset, size, size)
          }
        }
        ctx.globalAlpha = 1
      }

      if (animated && visible) frame = requestAnimationFrame(draw)
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true
      cancelAnimationFrame(frame)
      if (visible) frame = requestAnimationFrame(draw)
    })
    intersection.observe(canvas)
    // Re-read colors when the theme flips.
    const themeObserver = new MutationObserver(() => {
      palette = readPalette(canvas)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    })

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersection.disconnect()
      themeObserver.disconnect()
    }
  }, [variant, pitch, speed])

  return (
    <div
      data-slot="pixel-field"
      data-variant={variant}
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 block size-full"
      />
      {children ? <div className="relative w-full">{children}</div> : null}
    </div>
  )
}

export { PixelField, type PixelFieldProps, type PixelFieldVariant }
