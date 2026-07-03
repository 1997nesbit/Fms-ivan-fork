"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, X } from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn, formatQty, toArray } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MaterialRequest } from "@/components/operations/types"

type MRStatus = MaterialRequest["status"]

const STATUS_STYLES: Record<MRStatus, string> = {
  PENDING:
    "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  APPROVED:
    "border-green-300 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  REJECTED: "border-border bg-muted text-muted-foreground",
  ISSUED:
    "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function RejectDialog({
  requestId,
  onClose,
}: {
  requestId: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState("")

  const reject = useMutation({
    mutationFn: () =>
      api.patch(`/stock/material-requests/${requestId}/review/`, {
        action: "REJECT",
        review_reason: reason.trim() || "Declined by operations manager.",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material-requests"] })
      toast("Request rejected", {
        description: "The technician will be notified the request was declined.",
      })
      onClose()
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to reject request.")
    },
  })

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject material request</DialogTitle>
          <DialogDescription>
            Optionally provide a reason. The technician will see this.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reject-reason" className="text-xs font-medium text-muted-foreground">
            Reason (optional)
          </label>
          <Input
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Insufficient stock"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={reject.isPending}
            onClick={() => reject.mutate()}
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MaterialRequestInbox() {
  const queryClient = useQueryClient()
  const [rejectingId, setRejectingId] = useState<number | null>(null)

  const { data: requestsData, isLoading } = useQuery<MaterialRequest[]>({
    queryKey: ["material-requests"],
    queryFn: async () => {
      const { data } = await api.get<{ results: MaterialRequest[] }>(
        "/stock/material-requests/?status=PENDING"
      )
      return data.results
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })
  const requests = toArray(requestsData)

  const approve = useMutation({
    mutationFn: (id: number) =>
      api.patch(`/stock/material-requests/${id}/review/`, {
        action: "APPROVE",
        review_reason: "",
      }),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["material-requests"] })
      const req = requests.find((r) => r.id === id)
      toast.success("Request approved", {
        description: req
          ? `Authorised issuance of ${formatQty(req.quantity)} ${req.unit} of ${req.material_name}.`
          : "Material request approved.",
      })
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to approve request.")
    },
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No pending material requests</EmptyTitle>
          <EmptyDescription>
            Additional-material requests raised by head technicians will appear
            here for review.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {requests.length} pending request{requests.length === 1 ? "" : "s"} awaiting
          your review. Approving notifies the stock keeper to release materials.
        </p>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Technician</TableHead>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {req.order_reference}
                  </TableCell>
                  <TableCell className="font-medium">
                    {req.requested_by_name}
                  </TableCell>
                  <TableCell>{req.material_name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQty(req.quantity)} {req.unit}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(req.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("font-medium", STATUS_STYLES[req.status])}
                    >
                      {req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {req.status === "PENDING" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(req.id)}
                        >
                          <Check data-icon="inline-start" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRejectingId(req.id)}
                        >
                          <X data-icon="inline-start" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Resolved
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {rejectingId !== null && (
        <RejectDialog
          requestId={rejectingId}
          onClose={() => setRejectingId(null)}
        />
      )}
    </>
  )
}
