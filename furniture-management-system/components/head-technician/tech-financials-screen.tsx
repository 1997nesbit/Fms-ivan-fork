"use client"

import {
  BadgeCheck,
  CalendarDays,
  CheckCircle2,
  Wallet,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

interface Earning {
  id: number
  amount: string
  status: "PENDING" | "PAID"
  stage_name: string
  order_reference: string
  order_description: string
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

/** ISO date string → Monday of that week as ISO date string */
function mondayOf(iso: string): string {
  const d = new Date(iso)
  d.setHours(12, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

/** Monday ISO date → human label "Jun 22 – Jun 28, 2026" */
function labelFromMonday(mondayIso: string): string {
  const mon = new Date(mondayIso + "T12:00:00")
  const sun = new Date(mon)
  sun.setDate(sun.getDate() + 6)
  const f = (x: Date) =>
    x.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return `${f(mon)} – ${f(sun)}, ${sun.getFullYear()}`
}

function fmtSettled(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ---------------------------------------------------------------------------
// Week batch derived from earnings
// ---------------------------------------------------------------------------

interface WeekBatch {
  weekStart: string
  weekLabel: string
  earnings: Earning[]
  total: number
  settled: boolean
  settledAt: string | null
}

function buildBatches(earnings: Earning[]): WeekBatch[] {
  const byWeek = new Map<string, Earning[]>()
  for (const e of earnings) {
    const mon = mondayOf(e.created_at)
    if (!byWeek.has(mon)) byWeek.set(mon, [])
    byWeek.get(mon)!.push(e)
  }

  const batches: WeekBatch[] = []
  for (const [weekStart, items] of byWeek.entries()) {
    const total = items.reduce((s, e) => s + Number(e.amount), 0)
    // A batch is settled only if ALL its earnings are PAID.
    const settled = items.every((e) => e.status === "PAID")
    // Use the latest settled_at among paid items.
    const settledAt = settled
      ? items
          .map((e) => e.settled_at)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null
      : null
    batches.push({
      weekStart,
      weekLabel: labelFromMonday(weekStart),
      earnings: items,
      total,
      settled,
      settledAt,
    })
  }

  return batches.sort((a, b) => b.weekStart.localeCompare(a.weekStart))
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function TechFinancialsScreen() {
  const { data: earnings = [], isLoading } = useQuery({
    queryKey: ["my-earnings"],
    queryFn: async () => {
      const { data } = await api.get<Earning[]>("/production/my-earnings/")
      return data
    },
    refetchInterval: 60_000,
  })

  const batches = buildBatches(earnings)

  const totalEarned = batches.reduce((s, b) => s + b.total, 0)
  const totalOwed = batches
    .filter((b) => !b.settled)
    .reduce((s, b) => s + b.total, 0)
  const unsettledCount = batches.filter((b) => !b.settled).length

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-4 px-4">
            <p className="text-xs text-muted-foreground mb-1">Total earned</p>
            <p className="text-2xl font-semibold tabular-nums">
              {currency.format(totalEarned)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">all weeks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-4">
            <p className="text-xs text-muted-foreground mb-1">Awaiting collection</p>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                unsettledCount > 0
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-muted-foreground"
              )}
            >
              {currency.format(totalOwed)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {unsettledCount} batch{unsettledCount !== 1 ? "es" : ""} pending
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground text-pretty">
        Payments are settled weekly by your manager. Each batch below shows the
        stages completed that week and the total owed.
      </p>

      {batches.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          No earnings recorded yet. Complete your first stage to see it here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {batches.map((batch) => (
            <BatchCard key={batch.weekStart} batch={batch} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// BatchCard
// ---------------------------------------------------------------------------

function BatchCard({ batch }: { batch: WeekBatch }) {
  const settled = batch.settled

  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden border-l-4",
        settled
          ? "border-l-green-500 bg-green-50/40 dark:bg-green-950/20"
          : "border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
      )}
    >
      <CardHeader className="gap-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarDays className="size-3.5" />
            {batch.weekLabel}
          </div>
          {settled ? (
            <Badge className="gap-1 border-transparent bg-green-600 text-white dark:bg-green-500">
              <BadgeCheck className="size-3" />
              Settled
            </Badge>
          ) : (
            <Badge className="gap-1 border-transparent bg-blue-600 text-white dark:bg-blue-500">
              <Wallet className="size-3" />
              Awaiting collection
            </Badge>
          )}
        </div>
        <CardTitle
          className={cn(
            "text-2xl font-semibold tabular-nums",
            settled
              ? "text-green-700 dark:text-green-400"
              : "text-blue-700 dark:text-blue-400"
          )}
        >
          {currency.format(batch.total)}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0">
        <div className="flex flex-col gap-1.5">
          {batch.earnings.map((e) => (
            <div
              key={e.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
                settled
                  ? "bg-green-100/60 dark:bg-green-900/30"
                  : "bg-blue-100/60 dark:bg-blue-900/30"
              )}
            >
              <div className="flex flex-col">
                <span className="font-medium">{e.stage_name}</span>
                <span className="text-xs text-muted-foreground">
                  {e.order_reference}
                </span>
              </div>
              <span className="shrink-0 tabular-nums">{currency.format(Number(e.amount))}</span>
            </div>
          ))}
        </div>

        {settled && batch.settledAt ? (
          <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="size-4" />
            Confirmed received on {fmtSettled(batch.settledAt)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
