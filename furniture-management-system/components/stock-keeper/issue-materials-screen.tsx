"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  PackageCheck,
} from "lucide-react"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InventoryItem {
  id: number
  name: string
  unit: string
  current_quantity: string
  minimum_threshold: string
  is_low_stock: boolean
  last_updated: string
}

interface MaterialRequest {
  id: number
  stage_id: number
  order_id: number | null
  order_reference: string | null
  material_name: string
  quantity: string
  quantity_issued: string
  quantity_remaining: string
  issuance_count: number
  next_issuance_type: "INITIAL" | "ADDITIONAL"
  unit: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "ISSUED"
  requested_by_name: string | null
  created_at: string
}

interface IssuanceRecord {
  id: number
  order_reference: string | null
  stage_id: number | null
  inventory_item_id: number
  inventory_item_name: string
  material_request_id: number | null
  sequence_for_request: number | null
  quantity_issued: string
  unit: string
  issuance_type: "INITIAL" | "ADDITIONAL"
  issued_by_id: number
  issued_at: string
}

type ApiError = {
  response?: { data?: { errors?: Record<string, string[]>; detail?: string } }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useInventory() {
  return useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data } = await api.get<{ results: InventoryItem[] }>("/stock/items/")
      return data.results
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}

function useMaterialRequests() {
  return useQuery({
    queryKey: ["material-requests"],
    queryFn: async () => {
      const { data } = await api.get<{ results: MaterialRequest[] }>("/stock/material-requests/")
      return data.results
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })
}

function useIssuanceRecords() {
  return useQuery({
    queryKey: ["issuances"],
    queryFn: async () => {
      const { data } = await api.get<{ results: IssuanceRecord[] }>("/stock/issuances/")
      return data.results
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })
}

// ---------------------------------------------------------------------------
// Issue Material Dialog
// ---------------------------------------------------------------------------

function IssueMaterialDialog({
  request,
  inventoryItems,
  open,
  onOpenChange,
}: {
  request: MaterialRequest
  inventoryItems: InventoryItem[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [invItemId, setInvItemId] = useState("")
  const [qty, setQty] = useState(formatQty(request.quantity_remaining))
  const [error, setError] = useState<string | null>(null)

  // Whether this will be recorded as the Initial or an Additional batch is
  // decided by the server from issuance history — not a choice the stock
  // keeper makes, so it can't be mislabelled.
  const nextSequence = request.issuance_count + 1
  const nextTypeLabel = request.next_issuance_type === "INITIAL" ? "Initial" : "Additional"

  const issue = useMutation({
    mutationFn: () =>
      api.post("/stock/issuances/", {
        order_id: request.order_id,
        inventory_item_id: Number(invItemId),
        quantity_issued: qty,
        stage_id: request.stage_id,
        material_request_id: request.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["material-requests"] })
      queryClient.invalidateQueries({ queryKey: ["inventory"] })
      queryClient.invalidateQueries({ queryKey: ["issuances"] })
      toast.success("Materials issued successfully.", {
        description: `${qty} ${request.unit} of ${request.material_name} deducted from inventory.`,
      })
      onOpenChange(false)
    },
    onError: (err: ApiError) => {
      const data = err.response?.data
      const msg =
        data?.errors?.quantity_issued?.[0] ??
        data?.errors?.inventory_item_id?.[0] ??
        data?.detail ?? "Failed to issue materials."
      setError(msg)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Issue Materials</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg bg-muted/60 p-3 text-sm space-y-1">
          <p><span className="font-medium">Requested:</span> {request.material_name}</p>
          <p><span className="font-medium">Total needed:</span> {formatQty(request.quantity)} {request.unit}</p>
          {Number(request.quantity_issued) > 0 && (
            <p className="text-primary">
              <span className="font-medium">Already issued:</span> {formatQty(request.quantity_issued)} {request.unit} — {formatQty(request.quantity_remaining)} {request.unit} remaining
            </p>
          )}
          <p><span className="font-medium">Order:</span> {request.order_reference ?? "—"}</p>
          <p><span className="font-medium">By:</span> {request.requested_by_name ?? "—"}</p>
          <p>
            <span className="font-medium">This will be recorded as:</span>{" "}
            issuance #{nextSequence} ({nextTypeLabel})
          </p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(null); issue.mutate() }}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel htmlFor="inv-item">Inventory item to issue</FieldLabel>
            <select
              id="inv-item"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={invItemId}
              onChange={(e) => setInvItemId(e.target.value)}
              required
            >
              <option value="">Select item…</option>
              {inventoryItems.map((i) => (
                <option key={i.id} value={String(i.id)}>
                  {i.name} ({formatQty(i.current_quantity)} {i.unit} available)
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="issue-qty">Quantity to issue</FieldLabel>
            <Input
              id="issue-qty"
              type="number"
              min="0.001"
              step="0.001"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={issue.isPending || !invItemId}>
              {issue.isPending && <Loader2 className="size-4 animate-spin" />}
              <PackageCheck data-icon="inline-start" />
              Issue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Expandable request card
// ---------------------------------------------------------------------------

function RequestCard({
  request,
  inventoryItems,
}: {
  request: MaterialRequest
  inventoryItems: InventoryItem[]
}) {
  const [expanded, setExpanded] = useState(true)
  const [issueOpen, setIssueOpen] = useState(false)
  const isPartiallyIssued = Number(request.quantity_issued) > 0

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <CardTitle className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-base">
          <span className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
            <span className="font-mono text-xs text-muted-foreground">
              {request.order_reference ?? `#${request.id}`}
            </span>
            <span>{request.material_name}</span>
          </span>
          {isPartiallyIssued ? (
            <Badge className="gap-1 border border-orange-400 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300">
              Partially issued
            </Badge>
          ) : (
            <Badge variant="outline" className="border-primary/50">
              Approved
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="flex flex-col gap-4 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Requested qty</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">{request.material_name}</TableCell>
                <TableCell className="tabular-nums">
                  {formatQty(request.quantity)} {request.unit}
                </TableCell>
                <TableCell className="tabular-nums">
                  {isPartiallyIssued ? (
                    <span className="text-blue-600 dark:text-blue-400">
                      {formatQty(request.quantity_issued)} issued · {formatQty(request.quantity_remaining)} left
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not started</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {request.requested_by_name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
                  {new Date(request.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <div className="flex justify-end">
            <Button onClick={() => setIssueOpen(true)}>
              <PackageCheck data-icon="inline-start" />
              {isPartiallyIssued
                ? `Issue remaining (${formatQty(request.quantity_remaining)} ${request.unit})`
                : "Issue materials"}
            </Button>
          </div>
        </CardContent>
      )}

      <IssueMaterialDialog
        request={request}
        inventoryItems={inventoryItems}
        open={issueOpen}
        onOpenChange={setIssueOpen}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Count badge helper
// ---------------------------------------------------------------------------

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="rounded-full bg-foreground/10 px-1.5 text-xs font-medium tabular-nums">
      {count}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Issuance history table
// ---------------------------------------------------------------------------

function IssuanceHistory({ records }: { records: IssuanceRecord[] }) {
  if (records.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No issuances yet</EmptyTitle>
          <EmptyDescription>
            Every batch of materials you issue is logged here with its order
            reference and quantities.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Material</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Qty issued</TableHead>
            <TableHead className="text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((rec) => (
            <TableRow key={rec.id}>
              <TableCell>
                <span className="font-mono text-xs text-muted-foreground">
                  {rec.order_reference ?? "—"}
                </span>
              </TableCell>
              <TableCell className="font-medium">{rec.inventory_item_name}</TableCell>
              <TableCell>
                <Badge
                  variant={rec.issuance_type === "ADDITIONAL" ? "outline" : "secondary"}
                  className={cn(rec.issuance_type === "ADDITIONAL" && "border-primary/50")}
                >
                  {rec.issuance_type === "INITIAL" ? "Initial" : "Additional"}
                  {rec.sequence_for_request && rec.sequence_for_request > 1
                    ? ` · #${rec.sequence_for_request}`
                    : ""}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQty(rec.quantity_issued)} {rec.unit}
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                {new Date(rec.issued_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function IssueMaterialsScreen() {
  const { data: inventoryItemsData = [] } = useInventory()
  const { data: requestsData = [], isLoading: requestsLoading } = useMaterialRequests()
  const { data: issuanceRecords = [], isLoading: recordsLoading } = useIssuanceRecords()

  const inventoryItems = toArray(inventoryItemsData)
  const requests = toArray(requestsData)
  const pendingCount = requests.length
  const lowStockCount = inventoryItems.filter((i) => i.is_low_stock).length

  return (
    <div className="flex flex-col gap-6">
      <LowStockBanner count={lowStockCount} />

      {/* Summary strip */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
        <span>
          <strong className="tabular-nums">{pendingCount}</strong>{" "}
          approved request{pendingCount !== 1 ? "s" : ""} to issue
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {issuanceRecords.length} issuance{issuanceRecords.length !== 1 ? "s" : ""} recorded
        </span>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="pending" className="gap-1.5">
            Approved requests
            <CountBadge count={pendingCount} />
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            Issuance history
            <CountBadge count={issuanceRecords.length} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <div className="flex flex-col gap-4">
            {requestsLoading && (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!requestsLoading && requests.length === 0 && (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No approved requests</EmptyTitle>
                  <EmptyDescription>
                    Material requests approved by the Operations Manager will
                    appear here, ready for you to issue from stock.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {requests.map((req) => (
              <RequestCard
                key={req.id}
                request={req}
                inventoryItems={inventoryItems}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {recordsLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <IssuanceHistory records={issuanceRecords} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Re-export low-stock alert banner for portal header use
// ---------------------------------------------------------------------------

export function LowStockBanner({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <div className="flex items-center gap-2 rounded-lg border border-yellow-400/60 bg-yellow-50/60 px-3 py-2 text-sm dark:bg-yellow-950/20">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
      <span className="text-yellow-900 dark:text-yellow-200">
        <strong>{count}</strong> material{count === 1 ? " is" : "s are"} at or below
        the low-stock threshold.
      </span>
    </div>
  )
}
