"use client"

import { cn } from "@/lib/utils"

export type WeekKey = "this" | "last"

export function WeekSelector({
  week,
  onWeekChange,
}: {
  week: WeekKey
  onWeekChange: (week: WeekKey) => void
}) {
  const opts: { key: WeekKey; label: string }[] = [
    { key: "this", label: "This week" },
    { key: "last", label: "Last week" },
  ]
  return (
    <div className="flex rounded-md border border-input overflow-hidden">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onWeekChange(o.key)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            week === o.key
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Returns the Monday–Sunday date range for the given WeekKey */
export function getWeekRange(week: WeekKey): { start: Date; end: Date; label: string } {
  const now = new Date()
  const day = now.getDay() // 0=Sun..6=Sat
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((day + 6) % 7))
  monday.setHours(0, 0, 0, 0)

  if (week === "last") {
    const lastMon = new Date(monday)
    lastMon.setDate(monday.getDate() - 7)
    const lastSun = new Date(lastMon)
    lastSun.setDate(lastMon.getDate() + 6)
    lastSun.setHours(23, 59, 59, 999)
    return {
      start: lastMon,
      end: lastSun,
      label: `${fmt(lastMon)} – ${fmt(lastSun)}`,
    }
  }

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday, end: sunday, label: `${fmt(monday)} – ${fmt(sunday)}` }
}

function fmt(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
