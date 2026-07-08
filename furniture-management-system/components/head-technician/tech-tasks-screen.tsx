"use client"

import { useState } from "react"
import {
  CheckCircle2,
  Clock,
  Hammer,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  XCircle,
} from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn, formatQty, toArray } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { RequestMaterialDialog } from "@/components/head-technician/request-material-dialog"

// ---------------------------------------------------------------------------
// API types
// ---------------------------------------------------------------------------

export interface QueueStage {
  id: number
  stage_name: string
  sequence_number: number
  status: "PENDING" | "ACTIVE" | "DONE"
  agreed_wage: string
  allotted_time: number | null
  activated_at: string | null
  completed_at: string | null
  order: {
    id: number
    reference_number: string
    customer_name: string
    item_description: string
    delivery_date: string | null
  }
}

interface MaterialRequest {
  id: number
  stage_id: number
  order_id: number
  order_reference: string
  material_name: string
  quantity: number
  quantity_issued: string
  quantity_remaining: string
  unit: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "ISSUED"
  requested_by_name: string
  created_at: string
}

// A request that's APPROVED but has some (not all) quantity issued gets its
// own display state — visually distinct from both "not started" and "done".
type DisplayStatus = MaterialRequest["status"] | "PARTIALLY_ISSUED"

function displayStatus(req: MaterialRequest): DisplayStatus {
  if (req.status === "APPROVED" && Number(req.quantity_issued) > 0) {
    return "PARTIALLY_ISSUED"
  }
  return req.status
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const REQUEST_STATUS: Record<
  DisplayStatus,
  { label: string; badge: string; row: string; Icon: typeof CheckCircle2 }
> = {
  PENDING: {
    label: "Awaiting approval",
    badge:
      "border border-yellow-400 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300",
    row: "border-l-yellow-400 bg-yellow-50/40 dark:bg-yellow-950/20",
    Icon: Clock,
  },
  APPROVED: {
    label: "Approved",
    badge: "border-transparent bg-green-600 text-white dark:bg-green-500",
    row: "border-l-green-500 bg-green-50/40 dark:bg-green-950/20",
    Icon: CheckCircle2,
  },
  REJECTED: {
    label: "Rejected",
    badge: "border border-border bg-muted text-muted-foreground",
    row: "border-l-muted-foreground/40 bg-muted/40",
    Icon: XCircle,
  },
  PARTIALLY_ISSUED: {
    label: "Partially issued",
    badge:
      "border border-orange-400 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300",
    row: "border-l-orange-400 bg-orange-50/40 dark:bg-orange-950/20",
    Icon: PackageMinus,
  },
  ISSUED: {
    label: "Issued",
    badge: "border-transparent bg-blue-600 text-white dark:bg-blue-500",
    row: "border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20",
    Icon: PackageCheck,
  },
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const ACTIVE_COLLAPSE_AT = 3

export function TechTasksScreen() {
  const queryClient = useQueryClient()
  const [showAllActive, setShowAllActive] = useState(false)

  const { data: stages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ["my-queue"],
    queryFn: async () => {
      const { data } = await api.get<QueueStage[]>("/production/my-queue/")
      return data
    },
    refetchInterval: 30_000,
  })

  const { data: requestsData } = useQuery({
    queryKey: ["material-requests"],
    queryFn: async () => {
      const { data } = await api.get<{ results: MaterialRequest[] }>(
        "/stock/material-requests/"
      )
      return data.results
    },
    refetchInterval: 60_000,
  })
  // Defensive: this query key is shared across several screens, so normalize
  // before sorting in case any of them ever cache something other than the
  // plain array this screen expects (a paginated envelope, an error body, etc).
  const myRequests = toArray<MaterialRequest>(requestsData).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )

  const complete = useMutation({
    mutationFn: (stageId: number) =>
      api.post(`/production/stages/${stageId}/complete/`),
    onSuccess: (_data, stageId) => {
      const stage = stages.find((s) => s.id === stageId)
      toast.success("Stage marked done.", {
        description: stage
          ? `${stage.stage_name} on order ${stage.order.reference_number} is complete.`
          : undefined,
      })
      queryClient.invalidateQueries({ queryKey: ["my-queue"] })
    },
    onError: () => toast.error("Failed to mark stage complete."),
  })

  const assigned = toArray<QueueStage>(stages).filter((s) => s.status !== "DONE")
  const hasTasks = assigned.length > 0
  const activeStages = assigned.filter((s) => s.status === "ACTIVE")
  const pendingGroups = groupPendingByOrder(assigned.filter((s) => s.status === "PENDING"))

  const visibleActiveStages = showAllActive ? activeStages : activeStages.slice(0, ACTIVE_COLLAPSE_AT)
  const hiddenActiveCount = activeStages.length - visibleActiveStages.length

  if (stagesLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    )
  }

  if (!hasTasks && myRequests.length === 0) {
    return (
      <Empty className="mt-8">
        <EmptyHeader>
          <EmptyTitle>No active tasks</EmptyTitle>
          <EmptyDescription>
            You have no pending or in-progress stages right now. The Operations
            Manager will assign work to you here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {activeStages.length > 0 && (
        <div className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
          <Hammer className="size-4" />
          In progress ({activeStages.length})
        </div>
      )}
      {visibleActiveStages.map((stage) => (
        <TaskCard
          key={stage.id}
          stage={stage}
          completing={complete.isPending && complete.variables === stage.id}
          onDone={() => complete.mutate(stage.id)}
        />
      ))}

      {hiddenActiveCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAllActive(true)}
          className="rounded-lg border border-border py-2.5 text-center text-sm font-medium text-primary hover:bg-muted/50"
        >
          Show {hiddenActiveCount} more active task{hiddenActiveCount === 1 ? "" : "s"}
        </button>
      )}

      {!hasTasks && (
        <p className="text-sm text-muted-foreground">
          No active stages right now — new work will appear here.
        </p>
      )}

      {pendingGroups.length > 0 && <UpNextPanel groups={pendingGroups} />}

      {myRequests.length > 0 && <MyRequestsPanel requests={myRequests} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Up next (queued, non-actionable stages) — grouped by order and collapsed
// past a handful of orders so a big backlog doesn't turn this into a wall
// of identical cards. Unlike ACTIVE stages, these can't be worked yet
// (they're waiting on an earlier stage in the same order), so they get a
// compact read-only row instead of the full TaskCard treatment.
// ---------------------------------------------------------------------------

interface PendingGroup {
  orderRef: string
  itemDescription: string
  customerName: string
  stages: QueueStage[]
}

function groupPendingByOrder(stages: QueueStage[]): PendingGroup[] {
  const groups = new Map<string, PendingGroup>()
  for (const stage of stages) {
    const ref = stage.order.reference_number
    let group = groups.get(ref)
    if (!group) {
      group = {
        orderRef: ref,
        itemDescription: stage.order.item_description,
        customerName: stage.order.customer_name,
        stages: [],
      }
      groups.set(ref, group)
    }
    group.stages.push(stage)
  }
  return [...groups.values()]
}

const PENDING_COLLAPSE_AT = 4

function UpNextPanel({ groups }: { groups: PendingGroup[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? groups : groups.slice(0, PENDING_COLLAPSE_AT)
  const hiddenCount = groups.length - visible.length
  const stageCount = groups.reduce((n, g) => n + g.stages.length, 0)

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="gap-1 border-b border-border py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="size-4 text-muted-foreground" />
          Up next
          <span className="font-normal text-muted-foreground">
            ({stageCount} stage{stageCount === 1 ? "" : "s"} queued)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {visible.map((group) => (
          <div key={group.orderRef} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {group.orderRef}
                </span>
                <span className="text-sm font-medium">{group.itemDescription}</span>
              </div>
              <span className="text-xs text-muted-foreground">{group.customerName}</span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              {group.stages.map((stage) => (
                <span key={stage.id} className="text-xs text-muted-foreground">
                  {stage.stage_name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full border-t border-border py-2.5 text-center text-sm font-medium text-primary hover:bg-muted/50"
        >
          Show {hiddenCount} more order{hiddenCount === 1 ? "" : "s"}
        </button>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// MyRequestsPanel
// ---------------------------------------------------------------------------

function MyRequestsPanel({ requests }: { requests: MaterialRequest[] }) {
  return (
    <Card className="mt-2 gap-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <PackagePlus className="size-4 text-primary" />
          My material requests
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0">
        {requests.map((req) => {
          const status = displayStatus(req)
          const cfg = REQUEST_STATUS[status]
          const { Icon } = cfg
          return (
            <div
              key={req.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border-l-4 px-3 py-2",
                cfg.row
              )}
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {formatQty(req.quantity)} {req.unit} — {req.material_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {req.order_reference}
                  {status === "PARTIALLY_ISSUED" &&
                    ` · ${formatQty(req.quantity_issued)} ${req.unit} received so far, ${formatQty(req.quantity_remaining)} ${req.unit} still owed`}
                </span>
              </div>
              <Badge className={cn("gap-1", cfg.badge)}>
                <Icon className="size-3" />
                {cfg.label}
              </Badge>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// TaskCard
// ---------------------------------------------------------------------------

function TaskCard({
  stage,
  completing,
  onDone,
}: {
  stage: QueueStage
  completing: boolean
  onDone: () => void
}) {
  return (
    <Card size="sm" className="gap-2 overflow-hidden border-l-4 border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {stage.order.reference_number}
          </span>
          <Badge className="gap-1 border-transparent bg-blue-600 text-white dark:bg-blue-500">
            <Hammer className="size-3" />
            {stage.stage_name}
          </Badge>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{stage.order.item_description}</p>
          <p className="truncate text-xs text-muted-foreground">{stage.order.customer_name}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            className="h-9 flex-1 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            onClick={onDone}
            disabled={completing}
          >
            <CheckCircle2 data-icon="inline-start" />
            {completing ? "Saving…" : "Mark done"}
          </Button>
          <RequestMaterialDialog stage={stage} />
        </div>
      </CardContent>
    </Card>
  )
}
