"use client"

import * as React from "react"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  PanelLeft,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type DocumentViewerLabels = {
  document: string
  toolbar: string
  previousPage: string
  nextPage: string
  pageNumber: string
  /** Visible "of N" text and the spoken page status. */
  pageOf: (page: number, pageCount: number | undefined) => string
  zoomIn: string
  zoomOut: string
  resetZoom: string
  download: string
  thumbnails: string
  toggleThumbnails: string
  fallback: string
  fallbackLink: string
  emptyPage: string
}

const DEFAULT_LABELS: DocumentViewerLabels = {
  document: "Document",
  toolbar: "Document toolbar",
  previousPage: "Previous page",
  nextPage: "Next page",
  pageNumber: "Page number",
  pageOf: (page, pageCount) =>
    pageCount ? `Page ${page} of ${pageCount}` : `Page ${page}`,
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Reset zoom",
  download: "Download",
  thumbnails: "Pages",
  toggleThumbnails: "Show or hide page thumbnails",
  fallback: "This document cannot be shown here.",
  fallbackLink: "Open it in a new tab",
  emptyPage: "No document to show.",
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/** Controlled when `value` is given, otherwise internal state. */
function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (next: T) => void
) {
  const [internal, setInternal] = React.useState(defaultValue)
  const current = value !== undefined ? value : internal
  const set = (next: T) => {
    if (value === undefined) setInternal(next)
    onChange?.(next)
  }
  return [current, set] as const
}

type DocumentViewerProps = Omit<
  React.ComponentProps<"div">,
  "children" | "title"
> & {
  /** Name of the document, shown in the toolbar and used for the accessible name. */
  title?: React.ReactNode
  /**
   * URL of a PDF. Used by the default renderer (an `<object>` with a fallback
   * link) and as the default download link. Not needed when `renderPage` is given.
   */
  src?: string
  /**
   * Draws one page. Receives the 1-based page number and the current scale
   * (1 = 100%). Use it to plug in pdf.js, page images, or generated pages.
   *
   * pdf.js through react-pdf is the recommended renderer for real PDFs: it
   * gives text selection, search and per-page rendering, and keeps the viewer
   * free of a PDF dependency. See the docs example for the wiring.
   */
  renderPage?: (pageNumber: number, scale: number) => React.ReactNode
  /** Total pages. Required with `renderPage`; optional with `src`. */
  pageCount?: number
  /** Current page, 1-based. Controlled. */
  page?: number
  defaultPage?: number
  onPageChange?: (page: number) => void
  /** Current scale, 1 = 100%. Controlled. */
  zoom?: number
  defaultZoom?: number
  onZoomChange?: (zoom: number) => void
  minZoom?: number
  maxZoom?: number
  zoomStep?: number
  /** Download link. Defaults to `src`. Pass `false` to hide the button. */
  downloadHref?: string | false
  /** File name suggested for the download. */
  downloadName?: string
  /** Search UI, rendered in the toolbar. Bring your own input and results. */
  search?: React.ReactNode
  /** Extra toolbar actions, rendered after the download button. */
  actions?: React.ReactNode
  /**
   * Sidebar content, usually `DocumentThumbnails` or `DocumentOutline`. A
   * toggle appears in the toolbar when this is given.
   */
  thumbnails?: React.ReactNode
  /** Whether the sidebar starts open. Defaults to true. */
  defaultThumbnailsOpen?: boolean
  /** Fixed copy. Merged over neutral English defaults. */
  labels?: Partial<DocumentViewerLabels>
}

/**
 * A shell for reading paged documents: toolbar with page navigation, zoom,
 * download and a search slot, an optional sidebar, and a page area. It does
 * not parse files. Callers draw pages through `renderPage`, or pass a PDF `src`
 * for a browser-native fallback.
 *
 * Keys while the page area has focus: PageUp and PageDown change page, Home
 * and End jump to the first and last page, plus and minus zoom.
 */
function DocumentViewer({
  title,
  src,
  renderPage,
  pageCount,
  page: pageProp,
  defaultPage = 1,
  onPageChange,
  zoom: zoomProp,
  defaultZoom = 1,
  onZoomChange,
  minZoom = MIN_ZOOM,
  maxZoom = MAX_ZOOM,
  zoomStep = ZOOM_STEP,
  downloadHref,
  downloadName,
  search,
  actions,
  thumbnails,
  defaultThumbnailsOpen = true,
  labels: labelsProp,
  className,
  ...props
}: DocumentViewerProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp }
  const [page, setPageState] = useControllable(
    pageProp,
    defaultPage,
    onPageChange
  )
  const [zoom, setZoomState] = useControllable(
    zoomProp,
    defaultZoom,
    onZoomChange
  )
  const [sidebarOpen, setSidebarOpen] = React.useState(defaultThumbnailsOpen)
  const titleId = React.useId()
  const sidebarId = React.useId()

  const lastPage = pageCount && pageCount > 0 ? pageCount : undefined
  const setPage = (next: number) => {
    const target = clamp(
      Math.round(next),
      1,
      lastPage ?? Number.MAX_SAFE_INTEGER
    )
    if (target !== page) setPageState(target)
  }
  const setZoom = (next: number) => {
    const target = Math.round(clamp(next, minZoom, maxZoom) * 100) / 100
    if (target !== zoom) setZoomState(target)
  }

  const href = downloadHref === undefined ? src : downloadHref
  const hasSidebar = thumbnails != null
  const pageLabel = labels.pageOf(page, lastPage)

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    switch (event.key) {
      case "PageDown":
        event.preventDefault()
        setPage(page + 1)
        break
      case "PageUp":
        event.preventDefault()
        setPage(page - 1)
        break
      case "Home":
        event.preventDefault()
        setPage(1)
        break
      case "End":
        if (!lastPage) return
        event.preventDefault()
        setPage(lastPage)
        break
      case "+":
      case "=":
        event.preventDefault()
        setZoom(zoom + zoomStep)
        break
      case "-":
        event.preventDefault()
        setZoom(zoom - zoomStep)
        break
    }
  }

  return (
    <div
      data-slot="document-viewer"
      className={cn(
        "@container/document-viewer flex h-full min-h-0 w-full flex-col border bg-card text-card-foreground",
        className
      )}
      {...props}
    >
      <div
        data-slot="document-viewer-toolbar"
        role="toolbar"
        aria-label={labels.toolbar}
        className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-2 py-1.5"
      >
        {hasSidebar && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={labels.toggleThumbnails}
            aria-expanded={sidebarOpen}
            aria-controls={sidebarId}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <PanelLeft aria-hidden />
          </Button>
        )}
        {title && (
          <p
            id={titleId}
            className="min-w-0 flex-1 truncate text-sm font-medium @md/document-viewer:max-w-[16rem] @md/document-viewer:flex-none"
          >
            {title}
          </p>
        )}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={labels.previousPage}
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <input
            type="number"
            inputMode="numeric"
            aria-label={labels.pageNumber}
            min={1}
            max={lastPage}
            value={page}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber
              if (Number.isFinite(next)) setPage(next)
            }}
            className="h-8 w-12 border bg-background px-1 text-center font-mono text-xs tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          />
          {lastPage && (
            <span
              aria-hidden
              className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums"
            >
              / {lastPage}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={labels.nextPage}
            disabled={lastPage !== undefined && page >= lastPage}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={labels.zoomOut}
            disabled={zoom <= minZoom}
            onClick={() => setZoom(zoom - zoomStep)}
          >
            <ZoomOut aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${labels.resetZoom}, ${Math.round(zoom * 100)}%`}
            onClick={() => setZoom(1)}
            className="min-w-14 font-mono text-xs tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={labels.zoomIn}
            disabled={zoom >= maxZoom}
            onClick={() => setZoom(zoom + zoomStep)}
          >
            <ZoomIn aria-hidden />
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {search}
          {href && (
            <Button variant="ghost" size="sm" asChild>
              <a href={href} download={downloadName ?? ""}>
                <Download aria-hidden />
                <span className="hidden @md/document-viewer:inline">
                  {labels.download}
                </span>
                <span className="sr-only @md/document-viewer:hidden">
                  {labels.download}
                </span>
              </a>
            </Button>
          )}
          {actions}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {hasSidebar && sidebarOpen && (
          <aside
            id={sidebarId}
            data-slot="document-viewer-sidebar"
            aria-label={labels.thumbnails}
            className={cn(
              "absolute inset-y-0 left-0 z-10 w-44 overflow-y-auto border-r bg-background",
              "@2xl/document-viewer:static @2xl/document-viewer:z-auto @2xl/document-viewer:w-52 @2xl/document-viewer:shrink-0"
            )}
          >
            {thumbnails}
          </aside>
        )}
        <div
          data-slot="document-viewer-page"
          tabIndex={0}
          role="region"
          aria-label={title ? undefined : labels.document}
          aria-labelledby={title ? titleId : undefined}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 overflow-auto bg-surface outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset"
        >
          <p role="status" aria-live="polite" className="sr-only">
            {pageLabel}
          </p>
          {renderPage ? (
            <div className="flex min-h-full w-max min-w-full justify-center p-4">
              <div key={page} className="h-fit border bg-background">
                {renderPage(page, zoom)}
              </div>
            </div>
          ) : src ? (
            <object
              key={`${src}#${page}-${zoom}`}
              data={`${src}#page=${page}&zoom=${Math.round(zoom * 100)}`}
              type="application/pdf"
              aria-label={title ? undefined : labels.document}
              className="block size-full min-h-[24rem]"
            >
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {labels.fallback}
                </p>
                <a
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-brand underline-offset-4 hover:underline"
                >
                  {labels.fallbackLink}
                </a>
              </div>
            </object>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {labels.emptyPage}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

type DocumentThumbnailsProps = Omit<
  React.ComponentProps<"ol">,
  "children" | "onChange"
> & {
  pageCount: number
  page: number
  onPageChange: (page: number) => void
  /** Draws a small preview of one page. Defaults to an empty sheet with its number. */
  renderThumbnail?: (pageNumber: number) => React.ReactNode
  /** Builds the accessible name of each button. */
  pageLabel?: (pageNumber: number) => string
}

/** A list of page buttons for the `thumbnails` slot of `DocumentViewer`. */
function DocumentThumbnails({
  pageCount,
  page,
  onPageChange,
  renderThumbnail,
  pageLabel = (n) => `Page ${n}`,
  className,
  ...props
}: DocumentThumbnailsProps) {
  return (
    <ol
      data-slot="document-thumbnails"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    >
      {Array.from({ length: pageCount }, (_, index) => {
        const n = index + 1
        const active = n === page
        return (
          <li key={n}>
            <button
              type="button"
              aria-label={pageLabel(n)}
              aria-current={active ? "page" : undefined}
              onClick={() => onPageChange(n)}
              className={cn(
                "flex w-full flex-col items-center gap-1 border p-1.5 outline-none",
                "transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring",
                active && "border-brand bg-accent"
              )}
            >
              <span className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden border bg-background">
                {renderThumbnail ? (
                  renderThumbnail(n)
                ) : (
                  <span aria-hidden className="h-1/2 w-2/3 bg-dots" />
                )}
              </span>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {n}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

type OutlineItem = {
  id: string
  label: React.ReactNode
  /** Page this section starts on, shown on the right. */
  page?: number
  children?: OutlineItem[]
}

/** Neutral sample outline for docs and tests. */
const SAMPLE_OUTLINE: OutlineItem[] = [
  {
    id: "s1",
    label: "Section 1",
    page: 1,
    children: [
      { id: "s1-1", label: "Section 1.1", page: 1 },
      { id: "s1-2", label: "Section 1.2", page: 2 },
    ],
  },
  {
    id: "s2",
    label: "Section 2",
    page: 3,
    children: [{ id: "s2-1", label: "Section 2.1", page: 4 }],
  },
  { id: "s3", label: "Section 3", page: 5 },
]

type DocumentOutlineProps = Omit<
  React.ComponentProps<"nav">,
  "children" | "onSelect"
> & {
  items: OutlineItem[]
  /** Id of the current section. Marked with `aria-current`. */
  activeId?: string
  onSelect?: (item: OutlineItem) => void
  /** Whether sections with children start open. Defaults to true. */
  defaultExpanded?: boolean
  /** Heading above the list. Pass `false` to hide. */
  heading?: React.ReactNode | false
  labels?: Partial<{ expand: string; collapse: string }>
}

/**
 * A collapsible list of a document's headings or sections. Selecting an entry
 * calls `onSelect`; the caller decides whether to change page or scroll.
 */
function DocumentOutline({
  items,
  activeId,
  onSelect,
  defaultExpanded = true,
  heading = "Outline",
  labels: labelsProp,
  className,
  ...props
}: DocumentOutlineProps) {
  const labels = { expand: "Expand", collapse: "Collapse", ...labelsProp }
  // Ids whose state differs from the default.
  const [toggled, setToggled] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )
  const isOpen = (id: string) =>
    toggled.has(id) ? !defaultExpanded : defaultExpanded
  const toggle = (id: string) =>
    setToggled((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const renderItems = (list: OutlineItem[], depth: number): React.ReactNode => (
    <ul className={cn("flex flex-col", depth > 0 && "ml-3 border-l pl-1")}>
      {list.map((item) => {
        const hasChildren = !!item.children?.length
        const open = hasChildren && isOpen(item.id)
        const active = item.id === activeId
        return (
          <li key={item.id}>
            <div className="flex items-center">
              {hasChildren ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-expanded={open}
                  aria-label={`${open ? labels.collapse : labels.expand}: ${typeof item.label === "string" ? item.label : item.id}`}
                  onClick={() => toggle(item.id)}
                >
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "transition-transform motion-reduce:transition-none",
                      !open && "-rotate-90"
                    )}
                  />
                </Button>
              ) : (
                <span aria-hidden className="size-7 shrink-0" />
              )}
              <button
                type="button"
                aria-current={active ? "location" : undefined}
                onClick={() => onSelect?.(item)}
                className={cn(
                  "flex min-w-0 flex-1 items-baseline gap-2 px-2 py-1.5 text-left text-sm outline-none",
                  "transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring",
                  active
                    ? "border-l-2 border-l-brand font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.page !== undefined && (
                  <span className="shrink-0 font-mono text-xs tabular-nums">
                    {item.page}
                  </span>
                )}
              </button>
            </div>
            {open && renderItems(item.children!, depth + 1)}
          </li>
        )
      })}
    </ul>
  )

  return (
    <nav
      data-slot="document-outline"
      aria-label={typeof heading === "string" ? heading : "Outline"}
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    >
      {heading !== false && <p className="px-2 eyebrow">{heading}</p>}
      {renderItems(items, 0)}
    </nav>
  )
}

export { DocumentViewer, DocumentThumbnails, DocumentOutline, SAMPLE_OUTLINE }
export type {
  DocumentViewerProps,
  DocumentViewerLabels,
  DocumentThumbnailsProps,
  DocumentOutlineProps,
  OutlineItem,
}
