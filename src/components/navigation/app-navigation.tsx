"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  Bot,
  Calendar,
  CheckCircle2,
  FolderOpen,
  Grid2X2,
  Layers,
  LogOut,
  Menu,
  RotateCcw,
  Settings,
  TrendingUp,
  X,
  WifiOff,
  Target,
  HelpCircle,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openProductTour } from "@/components/onboarding/product-tour-modal";
import { db } from "@/lib/offline/db";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  match: (path: string) => boolean;
}

export const MAIN_NAV_ITEMS: NavItem[] = [
  {
    label: "Today",
    href: "/today",
    icon: Calendar,
    description: "Daily learning loop & focus session",
    match: (path: string) => path === "/today" || path === "/",
  },
  {
    label: "Goals",
    href: "/goals",
    icon: Target,
    description: "Curriculum tracks & competency graphs",
    match: (path: string) => path.startsWith("/goals"),
  },
  {
    label: "Plan",
    href: "/plan",
    icon: Layers,
    description: "Adaptive schedule & milestones",
    match: (path: string) => path.startsWith("/plan"),
  },
  {
    label: "Progress",
    href: "/progress",
    icon: TrendingUp,
    description: "Skill mastery & velocity",
    match: (path: string) => path.startsWith("/progress"),
  },
  {
    label: "Review",
    href: "/review",
    icon: RotateCcw,
    description: "Spaced repetition queue",
    match: (path: string) => path.startsWith("/review"),
  },
  {
    label: "Quizzes",
    href: "/quizzes",
    icon: CheckCircle2,
    description: "Interactive skill tests & assessments",
    match: (path: string) => path.startsWith("/quizzes"),
  },
  {
    label: "Materials",
    href: "/materials",
    icon: FolderOpen,
    description: "Library, PDFs & reference links",
    match: (path: string) => path.startsWith("/materials"),
  },
  {
    label: "Ask Tutor",
    href: "/ask",
    icon: Bot,
    description: "Interactive AI tutor grounded in materials",
    match: (path: string) => path.startsWith("/ask"),
  },
  {
    label: "Journal",
    href: "/journal",
    icon: BookOpen,
    description: "Session logs & daily reflections",
    match: (path: string) => path.startsWith("/journal"),
  },
  {
    label: "Metrics",
    href: "/metrics",
    icon: Activity,
    description: "Pilot analytics & system stats",
    match: (path: string) => path.startsWith("/metrics"),
  },
];

const MOBILE_PRIMARY_HREFS = ["/today", "/plan", "/progress", "/review"];

export function AppNavigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(true);

  // Close mobile menu whenever pathname changes
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Track online/offline status
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Close on escape key
  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  // Do not render navigation on authentication routes
  if (pathname === "/login" || pathname?.startsWith("/auth")) {
    return null;
  }

  const isSettingsActive = pathname.startsWith("/settings");
  const isMoreActive =
    !MOBILE_PRIMARY_HREFS.some((href) => pathname.startsWith(href)) &&
    pathname !== "/" &&
    !pathname.startsWith("/goals");

  const handleSignOutSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await Promise.all([
        db.today_payload.clear(),
        db.goals.clear(),
        db.skills.clear(),
        db.plan_items.clear(),
        db.skill_reviews.clear(),
      ]);
    } catch {
      // Ignore Dexie errors
    }
    e.currentTarget.submit();
  };

  return (
    <>
      {/* =========================================================================
          1. STATIC TOP HEADER (Desktop & Mobile)
         ========================================================================= */}
      <header
        data-slot="app-navigation-header"
        className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 transition-colors"
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6 gap-2">
          {/* Brand Logo & Offline Indicator */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/today"
              className="flex items-center gap-2.5 group rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Learnitt Home"
            >
              <div className="size-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-mono text-xs font-bold shadow-xs transition-transform duration-200 group-hover:scale-105">
                L
              </div>
              <span className="font-mono text-sm tracking-wider uppercase font-semibold text-foreground">
                Learnitt
              </span>
            </Link>

            {!isOnline && (
              <span
                role="status"
                aria-label="Offline Mode"
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-amber-500/15 text-amber-500 border border-amber-500/30"
              >
                <WifiOff className="size-3" />
                <span className="hidden sm:inline">Offline</span>
              </span>
            )}
          </div>

          {/* Desktop Navigation Links (>= md) - Icon only for unselected, Icon+Label for selected */}
          <nav
            aria-label="Main Navigation"
            className="hidden md:flex items-center gap-1 py-1"
          >
            {MAIN_NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-lg text-xs font-medium transition-all duration-200 select-none",
                    active
                      ? "bg-primary/15 text-primary border border-primary/25 shadow-xs font-semibold px-3 py-1.5"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/70 p-2"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 transition-transform duration-150 group-hover:scale-110",
                      active ? "text-primary size-3.5" : "text-muted-foreground group-hover:text-foreground"
                    )}
                  />
                  {active ? (
                    <span className="whitespace-nowrap tracking-tight animate-fade-in">{item.label}</span>
                  ) : (
                    <span className="sr-only">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right Actions: Settings, ThemeToggle, SignOut, Mobile Menu Button */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Product Tour Button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={openProductTour}
              className="hidden md:flex items-center gap-1.5 p-2 h-8 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 rounded-lg"
              aria-label="Start product tour"
              title="Interactive Product Tour"
            >
              <HelpCircle className="size-4 text-primary" />
              <span className="sr-only">Tour</span>
            </Button>

            {/* Desktop Settings Link (Icon only if unselected, Icon+Label if selected) */}
            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              aria-current={isSettingsActive ? "page" : undefined}
              className={cn(
                "hidden md:flex items-center gap-1.5 rounded-lg text-xs font-medium transition-all duration-200 select-none",
                isSettingsActive
                  ? "bg-primary/15 text-primary border border-primary/25 shadow-xs font-semibold px-3 py-1.5"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/70 p-2"
              )}
            >
              <Settings className={cn("size-4", isSettingsActive && "size-3.5")} />
              {isSettingsActive ? (
                <span className="whitespace-nowrap tracking-tight animate-fade-in">Settings</span>
              ) : (
                <span className="sr-only">Settings</span>
              )}
            </Link>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Desktop Sign Out Form */}
            <form action="/api/v1/auth/signout" method="POST" onSubmit={handleSignOutSubmit} className="hidden sm:inline-block">
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Sign out"
              >
                <LogOut className="size-3.5" />
                <span className="hidden lg:inline">Sign out</span>
              </Button>
            </form>

            {/* Mobile Drawer Button (< md) */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="size-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          2. FIXED MOBILE BOTTOM DOCK (< md)
         ========================================================================= */}
      <nav
        aria-label="Mobile Navigation Dock"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-background/95 backdrop-blur-lg px-2 py-1 flex items-center justify-around pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        {MAIN_NAV_ITEMS.filter((it) => MOBILE_PRIMARY_HREFS.includes(it.href)).map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center py-1 px-2.5 rounded-lg text-[10px] font-medium transition-colors select-none min-w-[54px] min-h-[44px]",
                active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div
                className={cn(
                  "p-1 rounded-md transition-all",
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="size-4" />
              </div>
              <span className="mt-0.5 tracking-tight">{item.label}</span>
            </Link>
          );
        })}

        {/* More Button on Mobile */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center py-1 px-2.5 rounded-lg text-[10px] font-medium transition-colors select-none min-w-[54px] min-h-[44px]",
            isMoreActive || mobileMenuOpen
              ? "text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground"
          )}
          aria-label="More navigation links"
          aria-expanded={mobileMenuOpen}
        >
          <div
            className={cn(
              "p-1 rounded-md transition-all",
              isMoreActive || mobileMenuOpen
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground"
            )}
          >
            <Grid2X2 className="size-4" />
          </div>
          <span className="mt-0.5 tracking-tight">More</span>
        </button>
      </nav>

      {/* =========================================================================
          3. MOBILE NAVIGATION DRAWER (< md)
         ========================================================================= */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site Navigation"
          className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-background/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-5 shadow-2xl flex flex-col gap-4 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border/70">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-mono text-xs font-bold">
                  L
                </div>
                <span className="font-mono text-sm tracking-wider uppercase font-semibold">
                  Navigation
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* All Navigation Links */}
            <div className="grid grid-cols-1 gap-1.5">
              {MAIN_NAV_ITEMS.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors",
                      active
                        ? "bg-primary/15 text-primary font-semibold border border-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <div
                      className={cn(
                        "p-1.5 rounded-lg",
                        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                      {item.description && (
                        <span className="text-[11px] text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}

              {/* Product Tour link */}
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openProductTour();
                }}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50 w-full text-left"
              >
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <HelpCircle className="size-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">Product Tour &amp; Guide</span>
                  <span className="text-[11px] text-muted-foreground">
                    Interactive walkthrough of how Learnitt works
                  </span>
                </div>
              </button>

              {/* Settings link */}
              <Link
                href="/settings"
                aria-current={isSettingsActive ? "page" : undefined}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors",
                  isSettingsActive
                    ? "bg-primary/15 text-primary font-semibold border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "p-1.5 rounded-lg",
                    isSettingsActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Settings className="size-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">Settings</span>
                  <span className="text-[11px] text-muted-foreground">
                    Preferences, reminders, AI usage & data
                  </span>
                </div>
              </Link>
            </div>

            {/* Bottom Controls inside Drawer */}
            <div className="pt-3 border-t border-border/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <span className="text-xs text-muted-foreground">Toggle Theme</span>
              </div>

              <form action="/api/v1/auth/signout" method="POST" onSubmit={handleSignOutSubmit}>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <LogOut className="size-3.5" />
                  <span>Sign out</span>
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
