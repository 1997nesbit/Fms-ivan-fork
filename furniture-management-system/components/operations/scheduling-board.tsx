"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarClock, CircleDot, Clock } from "lucide-react"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
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
import type { OpsOrder, Stage, Technician } from "@/components/operations/types"

interface ScheduledStage {
  order: OpsOrder
  stage: Stage
  stageIndex: number
  position: number
  total: number
  tech: Technician
}

export function SchedulingBoard() {
  const { data: orders = [], isLoading: ordersLoading } = useQuery<OpsOrder[]>({
    queryKey: ["pipeline"],
    queryFn: async () => {
      const { data } = await api.get<OpsOrder[]>("/production/pipeline/")
      return data
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Technician[] }>("/stock/technicians/")
      return data.results
    },
    staleTime: 5 * 60 * 1000,
  })

  // Group non-done stages by assigned technician
  const byTechnician = useMemo(() => {
    const map = new Map<number, ScheduledStage[]>()
    for (const order of orders) {
      order.stages.forEach((stage, index) => {
        if (stage.status === "DONE") return
        if (!stage.assigned_technician) return
        const techId = stage.assigned_technician.id
        const list = map.get(techId) ?? []
        const tech = technicians.find((t) => t.id === techId)
        if (!tech) return
        list.push({
          order,
          stage,
          stageIndex: index,
          position: index + 1,
          total: order.stages.length,
          tech,
        })
        map.set(techId, list)
      })
    }
    return map
  }, [orders, technicians])

  const techsWithWork = technicians.filter((t) => byTechnician.has(t.id))

  const activeCount = useMemo(
    () =>
      orders.reduce(
        (sum, o) => sum + o.stages.filter((s) => s.status === "ACTIVE").length,
        0
      ),
    [orders]
  )
  const pendingCount = useMemo(
    () =>
      orders.reduce(
        (sum, o) => sum + o.stages.filter((s) => s.status === "PENDING").length,
        0
      ),
    [orders]
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <CalendarClock className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Scheduling
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Live view of every stage currently in production, grouped by the
            technician responsible. Active stages are underway now; pending
            stages are queued next in the workflow.
          </p>
        </div>
      </div>

      {/* Legend + counts */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" />
          <span className="tabular-nums font-medium">{activeCount}</span> active
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-yellow-400" />
          <span className="tabular-nums font-medium">{pendingCount}</span> pending
        </span>
        <span className="text-muted-foreground">
          across {orders.length} order{orders.length === 1 ? "" : "s"}
        </span>
      </div>

      {ordersLoading && (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {!ordersLoading && techsWithWork.length === 0 && (
        <Empty className="rounded-lg border border-dashed border-border py-12">
          <EmptyHeader>
            <EmptyTitle>Nothing scheduled</EmptyTitle>
            <EmptyDescription>
              Once you push Start Work on a planned order, its stages will be
              scheduled here against each technician.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!ordersLoading && techsWithWork.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {techsWithWork.map((tech) => {
            const stages = (byTechnician.get(tech.id) ?? []).sort((a, b) => {
              if (a.stage.status !== b.stage.status) {
                return a.stage.status === "ACTIVE" ? -1 : 1
              }
              return a.position - b.position
            })
            return (
              <Card key={tech.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    <span>{tech.name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      #{tech.id}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 pt-0">
                  {stages.map((s) => (
                    <ScheduleRow key={`${s.order.id}-${s.stageIndex}`} item={s} />
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ScheduleRow({ item }: { item: ScheduledStage }) {
  const active = item.stage.status === "ACTIVE"
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border-l-4 px-3 py-2",
        active
          ? "border-l-primary bg-primary/5"
          : "border-l-yellow-400 bg-yellow-50/40 dark:bg-yellow-950/20"
      )}
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium">{item.stage.stage_name}</span>
        <span className="text-xs text-muted-foreground">
          {item.order.reference_number} · {item.order.item_description} · stage{" "}
          {item.position}/{item.total}
        </span>
      </div>
      <Badge
        className={cn(
          "gap-1 shrink-0",
          active
            ? "border-transparent bg-primary text-primary-foreground"
            : "border border-yellow-400 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300"
        )}
      >
        {active ? (
          <CircleDot className="size-3" />
        ) : (
          <Clock className="size-3" />
        )}
        {active ? "Active" : "Pending"}
      </Badge>
    </div>
  )
}
