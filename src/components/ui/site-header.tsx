"use client"

import * as React from "react"
import { Menu, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SiteHeaderLink = {
  label: string
  href: string
  active?: boolean
}

type RenderLinkProps = {
  href: string
  className?: string
  children: React.ReactNode
  onClick?: () => void
  "aria-current"?: "page"
}

type SiteHeaderProps = Omit<React.ComponentProps<"header">, "children"> & {
  /** Logo / wordmark, usually wrapped in a link. */
  brand: React.ReactNode
  nav?: SiteHeaderLink[]
  /** Inject a router link (e.g. Next's `Link`). Defaults to a plain `<a>`. */
  renderLink?: (props: RenderLinkProps) => React.ReactNode
  /** Right-hand slot: theme toggle, buttons, avatar. */
  actions?: React.ReactNode
}

const defaultRenderLink = ({ children, ...props }: RenderLinkProps) => (
  <a {...props}>{children}</a>
)

function SiteHeader({
  brand,
  nav = [],
  renderLink = defaultRenderLink,
  actions,
  className,
  ...props
}: SiteHeaderProps) {
  const [open, setOpen] = React.useState(false)
  const panelId = React.useId()

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  const linkClass = (active?: boolean) =>
    cn(
      "rounded-md text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
      active
        ? "font-medium text-foreground"
        : "text-muted-foreground hover:text-foreground"
    )

  return (
    <header
      data-slot="site-header"
      className={cn(
        "sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/80",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 shrink-0 items-center">{brand}</div>

        {nav.length > 0 && (
          <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
            {nav.map((item) => (
              <React.Fragment key={item.href + item.label}>
                {renderLink({
                  href: item.href,
                  className: cn(linkClass(item.active), "px-1 py-1"),
                  "aria-current": item.active ? "page" : undefined,
                  children: item.label,
                })}
              </React.Fragment>
            ))}
          </nav>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {actions}
          {nav.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X /> : <Menu />}
            </Button>
          )}
        </div>
      </div>

      {nav.length > 0 && open && (
        <nav
          id={panelId}
          aria-label="Mobile"
          data-slot="site-header-panel"
          className="border-t md:hidden"
        >
          <ul className="mx-auto flex max-w-6xl flex-col px-4 py-2 sm:px-6">
            {nav.map((item) => (
              <li key={item.href + item.label}>
                {renderLink({
                  href: item.href,
                  className: cn(linkClass(item.active), "block py-2.5"),
                  "aria-current": item.active ? "page" : undefined,
                  onClick: () => setOpen(false),
                  children: item.label,
                })}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}

export { SiteHeader }
export type { SiteHeaderProps, SiteHeaderLink, RenderLinkProps }
