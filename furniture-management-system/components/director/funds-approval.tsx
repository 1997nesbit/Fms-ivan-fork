"use client"

import { useState } from "react"
import { Check, Clock, X } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn, formatQty } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RestockRequest {
  id: number
  item_name: string
  quantity_needed: string
  unit: string
  estimated_cost: string | null
  reason: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  requested_by_name: string | null
  review_notes: string
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

function formatMoney(v: number) {
  return currency.format(v)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" })
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <Card className={cn(highlight && "border-primary/40 bg-primary/5")}>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Pending card with approve/reject inline
// ---------------------------------------------------------------------------

function PendingCard({
  req,
  onApprove,
  onReject,
  isPending,
}: {
  req: RestockRequest
  onApprove: (note: string) => void
  onReject: (note: string) => void
  isPending: boolean
}) {
  const [note, setNote] = useState("")

  return (
    <Card className="border-l-4 border-l-yellow-400">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{req.item_name}</CardTitle>
            <CardDescription>
              {formatQty(req.quantity_needed)} {req.unit}
              {req.estimated_cost
                ? ` · Est. ${formatMoney(Number(req.estimated_cost))}`
                : ""}
              {" · "}
              Requested by {req.requested_by_name ?? "Unknown"} · {formatDate(req.created_at)}
            </CardDescription>
          </div>
          <Badge className="gap-1 border border-yellow-400 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300">
            <Clock className="size-3" />
            Pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {req.reason && (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">{req.reason}</p>
        )}
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note to the Stock Keeper"
        />
        <div className="flex gap-2">
          <Button size="sm" disabled={isPending} onClick={() => onApprove(note)}>
            <Check className="size-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => onReject(note)}
          >
            <X className="size-3.5" />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Resolved history row
// ---------------------------------------------------------------------------

function ResolvedRow({ req }: { req: RestockRequest }) {
  const approved = req.status === "APPROVED"
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border-l-4 bg-card px-3 py-2",
        approved ? "border-l-green-500" : "border-l-muted-foreground/40",
      )}
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {req.item_name}
          {req.estimated_cost ? ` · ${formatMoney(Number(req.estimated_cost))}` : ""}
        </span>
        <span className="text-xs text-muted-foreground">
          {req.requested_by_name ?? "Unknown"} · {formatDate(req.created_at)}
          {req.review_notes ? ` · "${req.review_notes}"` : ""}
        </span>
      </div>
      <Badge
        className={cn(
          "gap-1",
          approved
            ? "border-transparent bg-green-600 text-white dark:bg-green-500"
            : "border border-border bg-muted text-muted-foreground",
        )}
      >
        {approved ? <Check className="size-3" /> : <X className="size-3" />}
        {req.status === "APPROVED" ? "Approved" : "Rejected"}
      </Badge>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FundsApproval() {
  const queryClient = useQueryClient()

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["funds-restock-requests"],
    queryFn: async () => {
      const { data } = await api.get<{ results: RestockRequest[] }>("/stock/restock-requests/")
      return data.results
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  const review = useMutation({
    mutationFn: ({
      id,
      action,
      notes,
    }: {
      id: number
      action: "APPROVE" | "REJECT"
      notes: string
    }) =>
      api.patch(`/stock/restock-requests/${id}/review/`, {
        action,
        review_notes: notes,
      }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["funds-restock-requests"] })
      queryClient.invalidateQueries({ queryKey: ["director-restock-requests"] })
      toast.success(vars.action === "APPROVE" ? "Request approved." : "Request rejected.")
    },
    onError: () => toast.error("Failed to submit review."),
  })

  const pending = requests.filter((r) => r.status === "PENDING")
  const resolved = requests.filter((r) => r.status !== "PENDING")

  const pendingTotal = pending.reduce(
    (s, r) => s + Number(r.estimated_cost ?? 0),
    0,
  )
  const approvedTotal = requests
    .filter((r) => r.status === "APPROVED")
    .reduce((s, r) => s + Number(r.estimated_cost ?? 0), 0)

  return (
    <div className="flex flex-col gap-6">
      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pending requests" value={String(pending.length)} />
        <StatCard
          label="Pending est. cost"
          value={pendingTotal > 0 ? formatMoney(pendingTotal) : "—"}
          highlight
        />
        <StatCard
          label="Approved to date (est.)"
          value={approvedTotal > 0 ? formatMoney(approvedTotal) : "—"}
        />
      </div>

      {/* Pending queue */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Awaiting decision</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : pending.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <p className="text-sm font-medium">No pending fund requests</p>
              <p className="text-xs text-muted-foreground">
                When the Stock Keeper requests restocking funds, they will appear here.
              </p>
            </CardContent>
          </Card>
        ) : (
          pending.map((req) => (
            <PendingCard
              key={req.id}
              req={req}
              isPending={review.isPending}
              onApprove={(note) => review.mutate({ id: req.id, action: "APPROVE", notes: note })}
              onReject={(note) => review.mutate({ id: req.id, action: "REJECT", notes: note })}
            />
          ))
        )}
      </section>

      {/* History */}
      {resolved.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">History</h2>
          <div className="flex flex-col gap-2">
            {resolved.map((req) => (
              <ResolvedRow key={req.id} req={req} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
