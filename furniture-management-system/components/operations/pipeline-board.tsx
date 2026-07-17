"use client"

import { useQuery } from "@tanstack/react-query"
import { ChevronRight } from "lucide-react"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import type { OpsOrder, Stage } from "@/components/operations/types"

type StageStatus = Stage["status"]

const STAGE_STYLES: Record<StageStatus, string> = {
  PENDING:
    "border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200",
  ACTIVE:
    "border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  DONE: "border-green-300 bg-green-100 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
}

const LEGEND: { status: StageStatus; label: string }[] = [
  { status: "PENDING", label: "Pending" },
  { status: "ACTIVE", label: "Active" },
  { status: "DONE", label: "Done" },
]

function StageBlock({ stage }: { stage: Stage }) {
  return (
    <div
      className={cn(
        "flex min-w-40 flex-col gap-0.5 rounded-md border px-3 py-2",
        STAGE_STYLES[stage.status]
      )}
    >
      <span className="text-sm font-medium leading-tight">{stage.stage_name}</span>
      <span className="text-xs opacity-80">
        {stage.assigned_technician?.name ?? "Unassigned"}
      </span>
      <span className="mt-1 text-xs font-semibold uppercase tracking-wide opacity-70">
        {stage.status}
      </span>
    </div>
  )
}

function stageProgress(stages: Stage[]) {
  if (stages.length === 0) return 0
  const done = stages.filter((s) => s.status === "DONE").length
  return Math.round((done / stages.length) * 100)
}

export function PipelineBoard() {
  const { data: orders = [], isLoading } = useQuery<OpsOrder[]>({
    queryKey: ["pipeline"],
    queryFn: async () => {
      const { data } = await api.get<OpsOrder[]>("/production/pipeline/")
      return data
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          Stage status
        </span>
        {LEGEND.map(({ status, label }) => (
          <span key={status} className="flex items-center gap-1.5 text-xs">
            <span
              className={cn(
                "size-3 rounded-sm border",
                STAGE_STYLES[status]
              )}
            />
            {label}
          </span>
        ))}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {!isLoading && orders.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing in production</EmptyTitle>
            <EmptyDescription>
              Orders with assigned stages will appear here so you can track
              their progress across the workshop.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {orders.length > 0 && (
        <div className="flex flex-col gap-3">
          {orders.map((order) => {
            const progress = stageProgress(order.stages)
            const done = order.stages.filter((s) => s.status === "DONE").length
            return (
              <div
                key={order.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {order.reference_number}
                    </span>
                    <span className="font-medium">{order.item_description}</span>
                  </div>
                  <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
                    <span>{order.customer_name}</span>
                    <span className="tabular-nums">{done}/{order.stages.length} done</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="h-1.5 w-full rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        progress === 100 ? "bg-green-500" : "bg-primary"
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {order.stages.map((stage, index) => (
                    <div
                      key={stage.id}
                      className="flex items-center gap-1.5"
                    >
                      <StageBlock stage={stage} />
                      {index < order.stages.length - 1 && (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
