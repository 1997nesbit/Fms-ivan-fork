"use client"

import { useMemo, useState } from "react"
import {
  BadgeCheck,
  CheckCircle2,
  Hammer,
  Wallet,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/app/providers"
import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TechTasksScreen } from "@/components/head-technician/tech-tasks-screen"
import { TechDoneScreen } from "@/components/head-technician/tech-done-screen"
import { TechFinancialsScreen } from "@/components/head-technician/tech-financials-screen"

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface QueueStage {
  id: number
  status: "PENDING" | "ACTIVE" | "DONE"
  agreed_wage: string
  completed_at: string | null
}

interface Earning {
  id: number
  amount: string
  status: "PENDING" | "PAID"
  settled_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
})

function getThisWeekRange(): { start: Date; end: Date } {
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
  return { start, end }
}

type TechTab = "tasks" | "done" | "financials"

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

export function HeadTechnicianPortal() {
  const { user } = useAuth()
  const [tab, setTab] = useState<TechTab>("tasks")

  const { data: stages = [] } = useQuery({
    queryKey: ["my-queue"],
    queryFn: async () => {
      const { data } = await api.get<QueueStage[]>("/production/my-queue/")
      return data
    },
    refetchInterval: 30_000,
  })

  const { data: earnings = [] } = useQuery({
    queryKey: ["my-earnings"],
    queryFn: async () => {
      const { data } = await api.get<Earning[]>("/production/my-earnings/")
      return data
    },
    refetchInterval: 60_000,
  })

  // Header stats
  const { weekEarnings, unsettledTotal } = useMemo(() => {
    const range = getThisWeekRange()
    let weekEarnings = 0
    for (const s of stages) {
      if (s.status === "DONE" && s.completed_at) {
        const t = new Date(s.completed_at).getTime()
        if (t >= range.start.getTime() && t <= range.end.getTime()) {
          weekEarnings += Number(s.agreed_wage)
        }
      }
    }
    const unsettledTotal = earnings
      .filter((e) => e.status === "PENDING")
      .reduce((sum, e) => sum + Number(e.amount), 0)
    return { weekEarnings, unsettledTotal }
  }, [stages, earnings])

  // Tab badge counts
  const { activeTasks, pendingTasks, doneCount, unsettledBatches } = useMemo(() => {
    let activeTasks = 0
    let pendingTasks = 0
    let doneCount = 0
    for (const s of stages) {
      if (s.status === "ACTIVE") activeTasks++
      else if (s.status === "PENDING") pendingTasks++
      else if (s.status === "DONE") doneCount++
    }
    // Count unsettled weekly batches from earnings
    const byWeek = new Map<string, boolean>()
    for (const e of earnings) {
      const d = new Date(e.created_at)
      d.setHours(12, 0, 0, 0)
      const day = d.getDay()
      const diffDays = day === 0 ? -6 : 1 - day
      d.setDate(d.getDate() + diffDays)
      const key = d.toISOString().slice(0, 10)
      // A week starts as settled; any PENDING earning marks it unsettled.
      if (!byWeek.has(key)) byWeek.set(key, true)
      if (e.status === "PENDING") byWeek.set(key, false)
    }
    const unsettledBatches = [...byWeek.values()].filter((settled) => !settled).length
    return { activeTasks, pendingTasks, doneCount, unsettledBatches }
  }, [stages, earnings])

  const totalTasks = activeTasks + pendingTasks

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="leading-tight">
          <p className="text-xs text-muted-foreground">Technician</p>
          <p className="text-lg font-semibold tracking-tight">
            {user?.full_name || user?.username}
          </p>
        </div>

        {/* Quick stats strip */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
            <Wallet className="size-4 text-blue-500" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-none mb-0.5">This week</p>
              <p className="text-base font-semibold tabular-nums leading-none text-blue-600 dark:text-blue-400">
                {currency.format(weekEarnings)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
            <BadgeCheck
              className={cn(
                "size-4",
                unsettledTotal > 0 ? "text-blue-500" : "text-green-500"
              )}
            />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground leading-none mb-0.5">
                Awaiting collection
              </p>
              <p
                className={cn(
                  "text-base font-semibold tabular-nums leading-none",
                  unsettledTotal > 0
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-green-600 dark:text-green-400"
                )}
              >
                {currency.format(unsettledTotal)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TechTab)}
        className="gap-0"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tasks" className="gap-1.5">
            <span className="flex items-center gap-1.5">
              <Hammer className="size-3.5" />
              Tasks
              {totalTasks > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0 text-xs font-medium tabular-nums leading-5",
                    activeTasks > 0
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300"
                  )}
                >
                  {totalTasks}
                </span>
              )}
            </span>
          </TabsTrigger>

          <TabsTrigger value="done" className="gap-1.5">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5" />
              Done
              {doneCount > 0 && (
                <span className="rounded-full bg-green-100 px-1.5 py-0 text-xs font-medium tabular-nums leading-5 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                  {doneCount}
                </span>
              )}
            </span>
          </TabsTrigger>

          <TabsTrigger value="financials" className="gap-1.5">
            <span className="flex items-center gap-1.5">
              <Wallet className="size-3.5" />
              Financials
              {unsettledBatches > 0 && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0 text-xs font-medium tabular-nums leading-5 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  {unsettledBatches}
                </span>
              )}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-4">
          <TechTasksScreen />
        </TabsContent>
        <TabsContent value="done" className="mt-4">
          <TechDoneScreen />
        </TabsContent>
        <TabsContent value="financials" className="mt-4">
          <TechFinancialsScreen />
        </TabsContent>
      </Tabs>
    </div>
  )
}
