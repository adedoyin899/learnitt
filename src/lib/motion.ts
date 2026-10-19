import type { Transition, Variants } from "motion/react"

/**
 * opendraft motion tokens — the single source of "feel" for the library.
 * Every animated component pulls from here. When you bring in a component
 * from beUI or anywhere else, swap its hard-coded timings for these.
 * CSS-driven animation uses the matching --ease-* tokens in globals.css.
 */

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.55, 0, 1, 0.45],
  /** Sheets and sidebars sliding in from an edge (iOS-style). */
  drawer: [0.32, 0.72, 0, 1],
} as const satisfies Record<string, [number, number, number, number]>

export const duration = {
  instant: 0.1,
  fast: 0.16,
  base: 0.24,
  slow: 0.4,
  slower: 0.6,
} as const

export const spring = {
  /** Toggles, presses, indicators — fast and settled, no visible bounce. */
  snappy: { type: "spring", stiffness: 520, damping: 36, mass: 0.8 },
  /** Panels, dialogs, layout shifts. */
  smooth: { type: "spring", stiffness: 300, damping: 30 },
  /** Things that arrive: sent messages, new bubbles. One small overshoot. */
  pop: { type: "spring", stiffness: 500, damping: 30, mass: 0.58 },
  /** Large surfaces and page-level movement. */
  gentle: { type: "spring", stiffness: 150, damping: 22 },
  /** Values that track live input (audio level, slider drag). Critically damped. */
  glide: { type: "spring", stiffness: 700, damping: 50, mass: 0.5 },
  /** Playful moments only — success states, celebratory UI. */
  bouncy: { type: "spring", visualDuration: 0.45, bounce: 0.35 },
} as const satisfies Record<string, Transition>

export const transition = {
  fast: { duration: duration.fast, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
} as const satisfies Record<string, Transition>

export const variants = {
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  fadeUp: {
    hidden: { opacity: 0, y: 8 },
    visible: { opacity: 1, y: 0 },
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.96 },
    visible: { opacity: 1, scale: 1 },
  },
  blurIn: {
    hidden: { opacity: 0, filter: "blur(8px)", y: 6 },
    visible: { opacity: 1, filter: "blur(0px)", y: 0 },
  },
} as const satisfies Record<string, Variants>

/** Stagger children by this many seconds. */
export const stagger = {
  tight: 0.03,
  base: 0.06,
  loose: 0.1,
} as const
