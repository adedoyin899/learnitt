"use client"

import * as React from "react"
import { FileIcon, UploadIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"

type DropzoneRejectionReason =
  "file-too-large" | "file-invalid-type" | "too-many-files"

type DropzoneRejection = { file: File; reason: DropzoneRejectionReason }

type DropzoneFile = {
  id: string
  name: string
  size: number
  /** Upload progress, 0-100. Omit to hide the bar. */
  progress?: number
  /** Per-file error text. */
  error?: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let n = bytes / 1024
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n >= 10 ? Math.round(n) : n.toFixed(1)} ${units[i]}`
}

function matchesAccept(file: File, accept?: string) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  return accept
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .some((t) => {
      if (t.startsWith(".")) return name.endsWith(t)
      if (t.endsWith("/*"))
        return file.type.toLowerCase().startsWith(t.slice(0, -1))
      return file.type.toLowerCase() === t
    })
}

const reasonText = (
  r: DropzoneRejection,
  maxSize?: number,
  maxFiles?: number
) => {
  if (r.reason === "file-too-large")
    return `${r.file.name} is larger than ${formatBytes(maxSize ?? 0)}.`
  if (r.reason === "file-invalid-type")
    return `${r.file.name} is not an accepted file type.`
  return `Only ${maxFiles} file${maxFiles === 1 ? "" : "s"} allowed.`
}

type DropzoneProps = Omit<
  React.ComponentProps<"div">,
  "onDrop" | "children"
> & {
  /** Same syntax as the input `accept` attribute. */
  accept?: string
  multiple?: boolean
  /** Maximum size per file, in bytes. */
  maxSize?: number
  maxFiles?: number
  /** Passes through to the input for phone camera capture. */
  capture?: boolean | "user" | "environment"
  disabled?: boolean
  onFiles?: (files: File[]) => void
  onReject?: (rejections: DropzoneRejection[]) => void
  /** Controlled list of files to render under the area. */
  files?: DropzoneFile[]
  onRemove?: (file: DropzoneFile) => void
  /** Custom prompt. Defaults to a generic drag or browse message. */
  children?: React.ReactNode
  /** Accessible name for the file input. */
  "aria-label"?: string
}

function Dropzone({
  className,
  accept,
  multiple = false,
  maxSize,
  maxFiles,
  capture,
  disabled = false,
  onFiles,
  onReject,
  files,
  onRemove,
  children,
  "aria-label": ariaLabel,
  ...props
}: DropzoneProps) {
  const inputId = React.useId()
  const errorId = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const depth = React.useRef(0)
  const [dragging, setDragging] = React.useState(false)
  const [errors, setErrors] = React.useState<string[]>([])

  const handle = (list: FileList | File[] | null) => {
    if (!list || disabled) return
    let incoming = Array.from(list)
    const rejections: DropzoneRejection[] = []
    if (!multiple && incoming.length > 1) {
      incoming
        .slice(1)
        .forEach((file) => rejections.push({ file, reason: "too-many-files" }))
      incoming = incoming.slice(0, 1)
    }
    const valid: File[] = []
    for (const file of incoming) {
      if (!matchesAccept(file, accept))
        rejections.push({ file, reason: "file-invalid-type" })
      else if (maxSize != null && file.size > maxSize)
        rejections.push({ file, reason: "file-too-large" })
      else valid.push(file)
    }
    const room =
      maxFiles != null ? Math.max(maxFiles - (files?.length ?? 0), 0) : Infinity
    const accepted = valid.slice(0, room)
    valid
      .slice(room)
      .forEach((file) => rejections.push({ file, reason: "too-many-files" }))
    setErrors(
      rejections.map((r) => reasonText(r, maxSize, multiple ? maxFiles : 1))
    )
    if (rejections.length) onReject?.(rejections)
    if (accepted.length) onFiles?.(accepted)
  }

  const invalid = errors.length > 0
  const state = disabled ? "disabled" : dragging ? "dragging" : "idle"

  return (
    <div
      data-slot="dropzone"
      className={cn("flex w-full flex-col gap-3", className)}
      {...props}
    >
      <label
        htmlFor={inputId}
        data-slot="dropzone-area"
        data-state={state}
        data-invalid={invalid || undefined}
        onDragEnter={(e) => {
          e.preventDefault()
          depth.current++
          if (!disabled) setDragging(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          depth.current = Math.max(depth.current - 1, 0)
          if (depth.current === 0) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          depth.current = 0
          setDragging(false)
          handle(e.dataTransfer.files)
        }}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-background px-4 py-8 text-center",
          "transition-[border-color,background-color,box-shadow] duration-150 ease-out",
          "hover:border-brand/60 hover:bg-muted/50",
          "has-[:focus-visible]:border-brand/60 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring",
          "data-[state=dragging]:border-brand data-[state=dragging]:bg-brand/5",
          "data-[invalid]:border-destructive",
          "data-[state=disabled]:cursor-not-allowed data-[state=disabled]:opacity-50 data-[state=disabled]:hover:border-input data-[state=disabled]:hover:bg-background"
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          capture={capture}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => {
            handle(e.target.files)
            e.target.value = ""
          }}
        />
        {children ?? (
          <>
            <UploadIcon aria-hidden className="size-5 text-muted-foreground" />
            <span className="text-sm font-medium">
              Drag files here or <span className="text-brand">browse</span>
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {[
                accept?.replace(/,\s*/g, ", "),
                maxSize != null && `up to ${formatBytes(maxSize)}`,
              ]
                .filter(Boolean)
                .join(" · ") || "Any file type"}
            </span>
          </>
        )}
      </label>
      <div id={errorId} role="alert" className="empty:hidden">
        {errors.map((msg, i) => (
          <p key={i} className="text-sm text-destructive">
            {msg}
          </p>
        ))}
      </div>
      {files && files.length > 0 && (
        <ul data-slot="dropzone-files" className="flex flex-col gap-2">
          {files.map((f) => (
            <DropzoneFileList.Item key={f.id} file={f} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </div>
  )
}

function FileListItem({
  file,
  onRemove,
  className,
}: {
  file: DropzoneFile
  onRemove?: (file: DropzoneFile) => void
  className?: string
}) {
  return (
    <li
      data-slot="file-list-item"
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-background p-3",
        file.error && "border-destructive",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <FileIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {formatBytes(file.size)}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={() => onRemove(file)}
            aria-label={`Remove ${file.name}`}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            <XIcon aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {file.progress != null && !file.error && (
        <Progress
          value={file.progress}
          size="sm"
          tone={file.progress >= 100 ? "success" : "brand"}
          aria-label={`Upload progress for ${file.name}`}
        />
      )}
      {file.error && <p className="text-xs text-destructive">{file.error}</p>}
    </li>
  )
}

const DropzoneFileList = { Item: FileListItem }

export { Dropzone, DropzoneFileList, FileListItem, formatBytes }
export type {
  DropzoneProps,
  DropzoneFile,
  DropzoneRejection,
  DropzoneRejectionReason,
}
