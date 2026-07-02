"use client"

import { CalendarDays, CheckCircle2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import api from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface QueueStage {
  id: number
  stage_name: string
  sequence_number: number
  status: "PENDING" | "ACTIVE" | "DONE"
  completed_at: string | null
  order: {
    id: number
    reference_number: string
    customer_name: string
    item_description: string
    delivery_date: string | null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/** ISO date → "Jun 22 – Jun 28, 2026" style week label (Mon–Sun). */
function weekLabel(iso: string): string {
  const d = new Date(iso)
  d.setHours(12, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(mon.getDate() + diff)
  const sun = new Date(mon)
  sun.setDate(sun.getDate() + 6)
  const f = (x: Date) =>
    x.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return `${f(mon)} – ${f(sun)}, ${sun.getFullYear()}`
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function TechDoneScreen() {
  const { data: stages = [], isLoading } = useQuery({
    queryKey: ["my-queue"],
    queryFn: async () => {
      const { data } = await api.get<QueueStage[]>("/production/my-queue/")
      return data
    },
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }

  const completed = stages
    .filter((s) => s.status === "DONE" && s.completed_at)
    .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))

  if (completed.length === 0) {
    return (
      <Empty className="mt-8">
        <EmptyHeader>
          <EmptyTitle>No completed stages yet</EmptyTitle>
          <EmptyDescription>
            Stages you finish will appear here, grouped by week.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  // Group by week label.
  const groups = new Map<string, QueueStage[]>()
  for (const stage of completed) {
    const key = weekLabel(stage.completed_at!)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(stage)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {completed.length} stage{completed.length !== 1 ? "s" : ""} completed in total
        </p>
      </div>

      {[...groups.entries()].map(([week, weekStages]) => (
        <section key={week}>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {week}
            <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums">
              {weekStages.length}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {weekStages.map((stage) => (
              <DoneCard key={stage.id} stage={stage} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DoneCard
// ---------------------------------------------------------------------------

function DoneCard({ stage }: { stage: QueueStage }) {
  return (
    <Card className="gap-0 overflow-hidden border-l-4 border-l-green-500 bg-green-50/40 dark:bg-green-950/20">
      <CardHeader className="gap-1 pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {stage.order.reference_number}
          </span>
          <Badge className="gap-1 border-transparent bg-green-600 text-white dark:bg-green-500">
            <CheckCircle2 className="size-3" />
            Done
          </Badge>
        </div>
        <CardTitle className="text-base leading-snug">
          {stage.order.item_description}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-md bg-green-100/60 dark:bg-green-900/30 px-3 py-1.5">
            <CheckCircle2 className="size-3.5 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-800 dark:text-green-300">
              {stage.stage_name}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {stage.completed_at ? fmt(stage.completed_at) : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
