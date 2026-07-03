"use client"

import {
  CheckCircle2,
  Clock,
  Hammer,
  Lock,
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

// Active first, then Pending.
const STATUS_ORDER: Record<QueueStage["status"], number> = {
  ACTIVE: 0,
  PENDING: 1,
  DONE: 2,
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function TechTasksScreen() {
  const queryClient = useQueryClient()

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

  // Non-done stages, sorted Active → Pending.
  const assigned = toArray<QueueStage>(stages)
    .filter((s) => s.status !== "DONE")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  const hasTasks = assigned.length > 0

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
      {assigned.map((stage) => (
        <TaskCard
          key={stage.id}
          stage={stage}
          completing={complete.isPending && complete.variables === stage.id}
          onDone={() => complete.mutate(stage.id)}
        />
      ))}

      {!hasTasks && (
        <p className="text-sm text-muted-foreground">
          No active stages right now — new work will appear here.
        </p>
      )}

      {myRequests.length > 0 && <MyRequestsPanel requests={myRequests} />}
    </div>
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
  const isActive = stage.status === "ACTIVE"

  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden border-l-4",
        isActive
          ? "border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
          : "border-l-yellow-400 bg-yellow-50/40 dark:bg-yellow-950/20 opacity-85"
      )}
    >
      <CardHeader className="gap-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {stage.order.reference_number}
          </span>
          <TaskStatusBadge status={stage.status} />
        </div>
        <CardTitle className="text-base leading-snug">
          {stage.order.item_description}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{stage.order.customer_name}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0">
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2",
            isActive
              ? "bg-blue-100/60 dark:bg-blue-900/30"
              : "bg-yellow-100/60 dark:bg-yellow-900/30"
          )}
        >
          <Hammer
            className={cn(
              "size-4",
              isActive
                ? "text-blue-600 dark:text-blue-400"
                : "text-yellow-600 dark:text-yellow-400"
            )}
          />
          <span className="text-sm font-medium">{stage.stage_name}</span>
        </div>

        {!isActive && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="size-3.5" />
            Waiting for the previous stage to finish.
          </p>
        )}

        {isActive && (
          <>
            <Button
              className="h-12 w-full bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-base"
              onClick={onDone}
              disabled={completing}
            >
              <CheckCircle2 data-icon="inline-start" />
              {completing ? "Saving…" : "Mark done"}
            </Button>
            <RequestMaterialDialog stage={stage} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

function TaskStatusBadge({ status }: { status: QueueStage["status"] }) {
  if (status === "ACTIVE") {
    return (
      <Badge className="gap-1 border-transparent bg-blue-600 text-white dark:bg-blue-500">
        <Hammer className="size-3" />
        In progress
      </Badge>
    )
  }
  return (
    <Badge className="gap-1 border border-yellow-400 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300">
      <Clock className="size-3" />
      Pending
    </Badge>
  )
}
