"use client"

import { Download, Loader2, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** Consistent header used at the top of every report card: icon, title, description, PDF button. */
export function ReportHeader({
  icon: Icon,
  title,
  description,
  onDownload,
  downloading,
  disabled,
}: {
  icon: LucideIcon
  title: string
  description: string
  onDownload: () => void
  downloading: boolean
  disabled: boolean
}) {
  return (
    <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-0.5">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onDownload} disabled={disabled} className="shrink-0 gap-1.5">
        {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        PDF
      </Button>
    </CardHeader>
  )
}

/** Consistent row of small KPI stat tiles shown at the top of every report's content. */
export function StatGrid({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="text-lg font-semibold tabular-nums">{s.value}</p>
        </div>
      ))}
    </div>
  )
}
