"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import { Eye, EyeOff, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import { duration, ease } from "@/lib/motion"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PixelField } from "@/components/motion/pixel-field"

export type AuthMode = "sign-in" | "sign-up"

export type AuthValues = {
  mode: AuthMode
  email: string
  password: string
  remember: boolean
}

export type AuthProvider = {
  id: string
  label: string
  icon?: React.ReactNode
}

export type AuthBrand = {
  name: string
  quote: string
  author: string
  role?: string
}

export type AuthScreenProps = {
  /** Async. Throw (or reject) to show the error message above the button. */
  onSubmit?: (values: AuthValues) => void | Promise<void>
  /** Called when a "Continue with" button is pressed. */
  onProvider?: (providerId: string) => void
  onForgotPassword?: () => void
  providers?: AuthProvider[]
  brand?: AuthBrand
  defaultMode?: AuthMode
  /** Replaces the default monogram mark. */
  logo?: React.ReactNode
  /** Show `brand.name` next to the logo. Set false when `logo` already contains the name. Default true. */
  showBrandName?: boolean
  /** Text before the provider label on each button. Default "Continue with". */
  providerPrefix?: string
  /** Full control of the provider button text (overrides `providerPrefix`), e.g. to shorten long labels. */
  providerLabel?: (provider: AuthProvider) => string
  className?: string
  /** Extra classes for inner parts. `providers` targets the provider button grid. */
  classNames?: { providers?: string }
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9v2.81c0 .27.18.59.69.49A10.25 10.25 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.6 4.1-5.35 4.1a5.9 5.9 0 0 1 0-11.8c1.87 0 3.12.8 3.83 1.48l2.6-2.5A9.4 9.4 0 0 0 12 3.4a9.6 9.6 0 1 0 0 19.2c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.1-.15-1.58Z" />
    </svg>
  )
}

export const SAMPLE_AUTH_PROVIDERS: AuthProvider[] = [
  { id: "github", label: "GitHub", icon: <GithubIcon /> },
  { id: "google", label: "Google", icon: <GoogleIcon /> },
]

export const SAMPLE_AUTH_BRAND: AuthBrand = {
  name: "Your product",
  quote:
    "Setting up took an afternoon. Everything finally lives in one calm, fast place.",
  author: "Alex Morgan",
  role: "Head of Operations",
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validateEmail(value: string) {
  if (!value.trim()) return "Enter your email address."
  if (!EMAIL_RE.test(value.trim())) return "Enter a valid email address."
  return ""
}

function validatePassword(value: string) {
  if (!value) return "Enter your password."
  if (value.length < 8) return "Use at least 8 characters."
  return ""
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message ? (
        <motion.p
          key={message}
          id={id}
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: duration.fast, ease: ease.out }}
          className="text-xs text-destructive"
        >
          {message}
        </motion.p>
      ) : null}
    </AnimatePresence>
  )
}

function AuthScreen({
  onSubmit,
  onProvider,
  onForgotPassword,
  providers = SAMPLE_AUTH_PROVIDERS,
  brand = SAMPLE_AUTH_BRAND,
  defaultMode = "sign-in",
  logo,
  showBrandName = true,
  providerPrefix = "Continue with",
  providerLabel,
  className,
  classNames,
}: AuthScreenProps) {
  const uid = React.useId()
  const [mode, setMode] = React.useState<AuthMode>(defaultMode)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [remember, setRemember] = React.useState(true)
  const [showPassword, setShowPassword] = React.useState(false)
  const [touched, setTouched] = React.useState({
    email: false,
    password: false,
    confirm: false,
  })
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const isSignUp = mode === "sign-up"
  const errors = {
    email: validateEmail(email),
    password: validatePassword(password),
    confirm: !isSignUp
      ? ""
      : !confirm
        ? "Confirm your password."
        : confirm !== password
          ? "Passwords do not match."
          : "",
  }
  const show = {
    email: touched.email ? errors.email : "",
    password: touched.password ? errors.password : "",
    confirm: touched.confirm ? errors.confirm : "",
  }

  const touch = (key: keyof typeof touched) =>
    setTouched((t) => ({ ...t, [key]: true }))

  const changeMode = (next: string) => {
    setMode(next as AuthMode)
    setError("")
    setConfirm("")
    setTouched({ email: false, password: false, confirm: false })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ email: true, password: true, confirm: true })
    if (errors.email || errors.password || errors.confirm) return
    setError("")
    setLoading(true)
    try {
      await onSubmit?.({ mode, email: email.trim(), password, remember })
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again."
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={cn("@container/auth h-full min-h-[600px] w-full", className)}
    >
      <div
        data-slot="auth-screen"
        className="grid h-full min-h-[600px] w-full bg-background text-foreground @3xl/auth:grid-cols-2"
      >
        <div className="flex min-h-0 flex-col overflow-y-auto px-5 py-8 @md/auth:px-10">
          <div className="flex items-center gap-2 text-sm font-medium">
            {logo ?? (
              <span
                aria-hidden
                className="grid size-6 place-items-center rounded-sm bg-ink font-mono text-xs text-ink-foreground"
              >
                {brand.name.charAt(0)}
              </span>
            )}
            {showBrandName && <span>{brand.name}</span>}
          </div>

          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 py-8">
            <div className="flex flex-col gap-1.5">
              <h1 className="heading text-3xl">
                {isSignUp ? "Create your account" : "Welcome back"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isSignUp
                  ? "Start in a minute. No credit card needed."
                  : "Sign in to pick up where you left off."}
              </p>
            </div>

            <Tabs value={mode} onValueChange={changeMode}>
              <TabsList className="w-full">
                <TabsTrigger value="sign-in">Sign in</TabsTrigger>
                <TabsTrigger value="sign-up">Sign up</TabsTrigger>
              </TabsList>
            </Tabs>

            {providers.length > 0 && (
              <>
                <div
                  className={cn(
                    "grid gap-2",
                    providers.length > 1 && "@md/auth:grid-cols-2",
                    classNames?.providers
                  )}
                >
                  {providers.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant="outline"
                      onClick={() => onProvider?.(p.id)}
                      disabled={loading}
                    >
                      {p.icon}
                      <span className="truncate">
                        {providerLabel
                          ? providerLabel(p)
                          : `${providerPrefix} ${p.label}`.trim()}
                      </span>
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="eyebrow">or with email</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            <form
              onSubmit={handleSubmit}
              noValidate
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${uid}-email`}>Email</Label>
                <Input
                  id={`${uid}-email`}
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => touch("email")}
                  aria-invalid={!!show.email}
                  aria-describedby={show.email ? `${uid}-email-err` : undefined}
                />
                <FieldError id={`${uid}-email-err`} message={show.email} />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`${uid}-password`}>Password</Label>
                  {!isSignUp && (
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-auto p-0"
                      onClick={onForgotPassword}
                    >
                      Forgot password?
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id={`${uid}-password`}
                    type={showPassword ? "text" : "password"}
                    autoComplete={
                      isSignUp ? "new-password" : "current-password"
                    }
                    placeholder={
                      isSignUp ? "At least 8 characters" : "Password"
                    }
                    className="pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => touch("password")}
                    aria-invalid={!!show.password}
                    aria-describedby={
                      show.password ? `${uid}-password-err` : undefined
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-1 right-1"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                <FieldError
                  id={`${uid}-password-err`}
                  message={show.password}
                />
              </div>

              {isSignUp && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${uid}-confirm`}>Confirm password</Label>
                  <Input
                    id={`${uid}-confirm`}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onBlur={() => touch("confirm")}
                    aria-invalid={!!show.confirm}
                    aria-describedby={
                      show.confirm ? `${uid}-confirm-err` : undefined
                    }
                  />
                  <FieldError
                    id={`${uid}-confirm-err`}
                    message={show.confirm}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${uid}-remember`}
                  checked={remember}
                  onCheckedChange={(c) => setRemember(c === true)}
                />
                <Label htmlFor={`${uid}-remember`} className="font-normal">
                  Remember me
                </Label>
              </div>

              <AnimatePresence initial={false}>
                {error && (
                  <motion.div
                    role="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: duration.fast, ease: ease.out }}
                    className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button type="submit" size="lg" loading={loading}>
                {isSignUp ? "Create account" : "Sign in"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {isSignUp ? "Already have an account?" : "New here?"}{" "}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => changeMode(isSignUp ? "sign-in" : "sign-up")}
              >
                {isSignUp ? "Sign in" : "Create an account"}
              </Button>
            </p>
          </div>
        </div>

        <aside className="dark relative hidden overflow-hidden border-l bg-background text-foreground @3xl/auth:flex">
          <PixelField
            variant="matrix"
            className="pointer-events-none absolute inset-0"
          />
          <div className="relative flex w-full flex-col justify-between p-10">
            <span className="eyebrow">{brand.name}</span>
            <figure className="flex max-w-md flex-col gap-5">
              <blockquote className="heading text-2xl leading-snug">
                &ldquo;{brand.quote}&rdquo;
              </blockquote>
              <figcaption className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium">{brand.author}</span>
                {brand.role && (
                  <span className="text-muted-foreground">{brand.role}</span>
                )}
              </figcaption>
            </figure>
          </div>
        </aside>
      </div>
    </div>
  )
}

export { AuthScreen }
