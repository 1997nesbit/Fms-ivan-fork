"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Boxes, ChevronRight, CircleDollarSign, Loader2, PlayCircle } from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { OpsOrder, Stage } from "@/components/operations/types"

type StageStatus = Stage["status"]

const STAGE_DOT: Record<StageStatus, string> = {
  PENDING: "bg-muted-foreground/40",
  ACTIVE: "bg-primary",
  DONE: "bg-green-500",
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
})

// ---------- Planned order card ----------------------------------------------

function PlannedOrderCard({ order }: { order: OpsOrder }) {
  const queryClient = useQueryClient()
  const [wages, setWages] = useState<string[]>(() =>
    order.stages.map((s) => (s.agreed_wage ? String(s.agreed_wage) : ""))
  )

  const parsed = wages.map((w) => Number.parseFloat(w) || 0)
  const allPriced = parsed.length > 0 && parsed.every((w) => w > 0)
  const totalLabour = parsed.reduce((sum, w) => sum + w, 0)

  const saveWages = useMutation({
    mutationFn: async () => {
      const wageBody = order.stages.map((s, i) => ({
        stage_id: s.id,
        wage: String(parsed[i] ?? 0),
      }))
      await api.patch(`/production/orders/${order.id}/set-wages/`, wageBody)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] })
      toast.success("Wages saved", {
        description: `Labour budget for ${order.reference_number} updated to ${currency.format(totalLabour)}.`,
      })
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to save wages.")
    },
  })

  const startWork = useMutation({
    mutationFn: async () => {
      // Save wages first if not yet saved
      const wageBody = order.stages.map((s, i) => ({
        stage_id: s.id,
        wage: String(parsed[i] ?? 0),
      }))
      await api.patch(`/production/orders/${order.id}/set-wages/`, wageBody)
      await api.post(`/production/orders/${order.id}/start-work/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] })
      queryClient.invalidateQueries({ queryKey: ["pipeline"] })
      toast.success("Start Work pushed", {
        description: `${order.reference_number} is now in production.`,
      })
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to start work.")
    },
  })

  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="font-mono text-xs text-muted-foreground">
              {order.reference_number}
            </span>
            {order.item_description}
          </CardTitle>
          <Badge
            variant="outline"
            className="border-indigo-300 bg-indigo-100 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
          >
            Awaiting start
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{order.customer_name}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {order.stages.map((stage, index) => (
            <div
              key={stage.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
                {index + 1}
              </span>
              <div className="min-w-40 flex-1">
                <p className="text-sm font-medium leading-tight">
                  {stage.stage_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stage.assigned_technician?.name ?? "Unassigned"}
                  {stage.allotted_time && (
                    <span className="ml-1">· {stage.allotted_time}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">Wage</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    TZS
                  </span>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={wages[index]}
                    onChange={(e) =>
                      setWages((prev) =>
                        prev.map((w, i) => (i === index ? e.target.value : w))
                      )
                    }
                    placeholder="0"
                    aria-label={`Wage for ${stage.stage_name}`}
                    className="h-9 w-36 pl-10 tabular-nums"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <span className="flex items-center gap-1.5 text-sm">
            <CircleDollarSign className="size-4 text-primary" />
            Total labour:{" "}
            <strong className="tabular-nums">
              {currency.format(totalLabour)}
            </strong>
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={saveWages.isPending}
              onClick={() => saveWages.mutate()}
            >
              {saveWages.isPending && <Loader2 className="size-3 animate-spin" />}
              Save wages
            </Button>
            <Button
              size="sm"
              disabled={!allPriced || startWork.isPending}
              onClick={() => startWork.mutate()}
            >
              {startWork.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <PlayCircle data-icon="inline-start" />
              )}
              Start Work
            </Button>
          </div>
        </div>
        {!allPriced && (
          <p className="text-xs text-muted-foreground">
            Enter a bargained wage for every stage to enable Start Work.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- In-production card ----------------------------------------------

function ProductionOrderCard({ order }: { order: OpsOrder }) {
  const totalLabour = order.stages.reduce(
    (sum, s) => sum + (s.agreed_wage ? Number(s.agreed_wage) : 0),
    0
  )
  return (
    <Card>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="font-mono text-xs text-muted-foreground">
              {order.reference_number}
            </span>
            {order.item_description}
          </CardTitle>
          <Badge
            variant="outline"
            className="border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"
          >
            In production
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {order.customer_name} · Labour {currency.format(totalLabour)}
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-1.5">
          {order.stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs",
                  stage.status === "ACTIVE" && "border-primary/40 bg-primary/5"
                )}
              >
                <span
                  className={cn("size-2 rounded-full", STAGE_DOT[stage.status])}
                />
                <span className="font-medium">{stage.stage_name}</span>
                <span className="text-muted-foreground">
                  {stage.assigned_technician?.name}
                </span>
                {stage.agreed_wage ? (
                  <span className="tabular-nums text-muted-foreground">
                    {currency.format(Number(stage.agreed_wage))}
                  </span>
                ) : null}
              </span>
              {index < order.stages.length - 1 && (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ---------- Main ------------------------------------------------------------

type AssignTab = "planned" | "production"

export function AssignmentsManager() {
  const [tab, setTab] = useState<AssignTab>("planned")

  const { data: planned = [], isLoading: plannedLoading } = useQuery<OpsOrder[]>({
    queryKey: ["ops-queue"],
    queryFn: async () => {
      const { data } = await api.get<OpsOrder[]>("/production/ops-queue/")
      return data
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: inProduction = [], isLoading: productionLoading } = useQuery<OpsOrder[]>({
    queryKey: ["pipeline"],
    queryFn: async () => {
      const { data } = await api.get<OpsOrder[]>("/production/pipeline/")
      return data
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  // Only show ops-queue orders that already have stages (planned but not started)
  const withStages = planned.filter((o) => o.stages.length > 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Boxes className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Assignments &amp; wage pricing
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Revisit saved production plans, enter the wages you bargained with
            each technician, then push Start Work to send the job to the first
            technician&apos;s portal.
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as AssignTab)}
        className="gap-6"
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="planned" className="gap-1.5">
            Awaiting start
            {withStages.length > 0 && (
              <span className="rounded-full bg-foreground/10 px-1.5 text-xs font-medium tabular-nums">
                {withStages.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="production" className="gap-1.5">
            In production
            {inProduction.length > 0 && (
              <span className="rounded-full bg-foreground/10 px-1.5 text-xs font-medium tabular-nums">
                {inProduction.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="planned">
          {plannedLoading ? (
            <div className="flex flex-col gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : withStages.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No plans awaiting start</EmptyTitle>
                <EmptyDescription>
                  Save a production plan from the Ops queue, then price its stages
                  here before starting work.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-4">
              {withStages.map((order) => (
                <PlannedOrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="production">
          {productionLoading ? (
            <div className="flex flex-col gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : inProduction.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nothing in production</EmptyTitle>
                <EmptyDescription>
                  Orders you have started work on will appear here so you can
                  track their stages and labour.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-4">
              {inProduction.map((order) => (
                <ProductionOrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
