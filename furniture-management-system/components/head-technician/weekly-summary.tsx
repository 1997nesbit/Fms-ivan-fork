"use client"

import { useMemo } from "react"
import { CalendarDays, CheckCircle2, Wallet } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import api from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface QueueStage {
  id: number
  status: "PENDING" | "ACTIVE" | "DONE"
  agreed_wage: string
  completed_at: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getThisWeekRange(): { start: Date; end: Date; label: string } {
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(now)
  start.setDate(start.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  const f = (x: Date) =>
    x.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return { start, end, label: `${f(start)} – ${f(end)}, ${end.getFullYear()}` }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeeklySummary() {
  const { data: stages = [] } = useQuery({
    queryKey: ["my-queue"],
    queryFn: async () => {
      const { data } = await api.get<QueueStage[]>("/production/my-queue/")
      return data
    },
  })

  const { stagesCompleted, earnings } = useMemo(() => {
    const range = getThisWeekRange()
    let count = 0
    let total = 0
    for (const stage of stages) {
      if (stage.status === "DONE" && stage.completed_at) {
        const t = new Date(stage.completed_at).getTime()
        if (t >= range.start.getTime() && t <= range.end.getTime()) {
          count++
          total += Number(stage.agreed_wage)
        }
      }
    }
    return { stagesCompleted: count, earnings: total }
  }, [stages])

  const range = getThisWeekRange()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarDays className="size-4" />
        {range.label}
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 py-5">
          <span className="flex size-12 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <CheckCircle2 className="size-6" />
          </span>
          <div>
            <p className="text-3xl font-semibold tabular-nums leading-none">
              {stagesCompleted}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {stagesCompleted === 1 ? "stage" : "stages"} completed this week
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-4 py-5">
          <span className="flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="size-6" />
          </span>
          <div>
            <p className="text-3xl font-semibold tabular-nums leading-none">
              ${earnings.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              earnings due this week
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground text-pretty">
        Based on {stagesCompleted} completed{" "}
        {stagesCompleted === 1 ? "stage" : "stages"} at your agreed wages. Only
        your own figures are shown.
      </p>
    </div>
  )
}
