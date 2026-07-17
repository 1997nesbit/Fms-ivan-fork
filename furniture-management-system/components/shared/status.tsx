import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

// ---------------------------------------------------------------------------
// Status tone palette — single source of truth for status color across the
// app. Every screen that shows a status badge or a status-tinted row should
// map its own status enum to one of these tones instead of hardcoding
// Tailwind color classes, so the same semantic state always looks the same
// everywhere (e.g. "pending" is always amber, never amber in one screen and
// yellow in another).
// ---------------------------------------------------------------------------

export type StatusTone =
  | "neutral"
  | "warning"
  | "info"
  | "success"
  | "danger"
  | "accent"
  | "attention"
  | "active"

const TONE_BADGE: Record<StatusTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  warning:
    "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  info: "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  success:
    "border-green-300 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  danger: "border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  accent:
    "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200",
  attention:
    "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200",
  active: "border-transparent bg-primary text-primary-foreground",
}

// Full border + background tint, used to replace the border-l-4 "side-stripe"
// pattern on cards/rows. Always a complete border, never a single-side accent.
const TONE_ROW: Record<StatusTone, string> = {
  neutral: "border-border bg-muted/40",
  warning: "border-amber-300 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20",
  info: "border-blue-300 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20",
  success: "border-green-300 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20",
  danger: "border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20",
  accent: "border-violet-300 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/20",
  attention: "border-orange-300 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/20",
  active: "border-primary/40 bg-primary/5",
}

export function statusBadgeTone(tone: StatusTone): string {
  return TONE_BADGE[tone]
}

export function statusRowTone(tone: StatusTone): string {
  return TONE_ROW[tone]
}

export function StatusBadge({
  tone,
  label,
  icon: Icon,
  className,
}: {
  tone: StatusTone
  label: string
  icon?: LucideIcon
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", TONE_BADGE[tone], className)}>
      {Icon && <Icon className="size-3" />}
      {label}
    </Badge>
  )
}

// Replaces the border-l-4 side-stripe pattern with a full border + tint,
// matching the treatment already used correctly in the Operations pipeline
// board. Use for list rows / compact cards that need a status color cue.
export function StatusRow({
  tone,
  className,
  children,
}: {
  tone: StatusTone
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
        TONE_ROW[tone],
        className,
      )}
    >
      {children}
    </div>
  )
}
