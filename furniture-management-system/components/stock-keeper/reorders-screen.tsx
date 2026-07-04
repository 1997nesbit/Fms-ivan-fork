"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  Check,
  Loader2,
  PackageSearch,
  Plus,
  RotateCcw,
  Send,
} from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn, formatQty } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
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

interface RestockRequest {
  id: number
  inventory_item_id: number | null
  item_name: string
  quantity_needed: string
  unit: string
  estimated_cost: string | null
  reason: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  requested_by_name: string | null
  reviewed_by_name: string | null
  review_notes: string
  created_at: string
  reviewed_at: string | null
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

function useRestockRequests() {
  return useQuery({
    queryKey: ["restock-requests"],
    queryFn: async () => {
      const { data } = await api.get<{ results: RestockRequest[] }>("/stock/restock-requests/")
      return data.results
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: RestockRequest["status"] }) {
  if (status === "PENDING") {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Pending
      </Badge>
    )
  }
  if (status === "APPROVED") {
    return (
      <Badge className="gap-1 border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
        <Check className="size-3" />
        Approved
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
      Rejected
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// New Restock Request dialog
// ---------------------------------------------------------------------------

function NewRestockDialog({
  open,
  onOpenChange,
  inventoryItems,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  inventoryItems: InventoryItem[]
}) {
  const queryClient = useQueryClient()
  const [itemName, setItemName] = useState("")
  const [invItemId, setInvItemId] = useState("")
  const [qtyNeeded, setQtyNeeded] = useState("")
  const [unit, setUnit] = useState("")
  const [estimatedCost, setEstimatedCost] = useState("")
  const [reason, setReason] = useState("")
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  function reset() {
    setItemName(""); setInvItemId(""); setQtyNeeded(""); setUnit(""); setEstimatedCost(""); setReason(""); setFormErrors({})
  }

  // Auto-fill unit when an inventory item is selected
  function handleInvItemChange(id: string) {
    setInvItemId(id)
    if (id) {
      const found = inventoryItems.find((i) => String(i.id) === id)
      if (found) {
        if (!itemName) setItemName(found.name)
        setUnit(found.unit)
      }
    }
  }

  const submit = useMutation({
    mutationFn: () =>
      api.post("/stock/restock-requests/", {
        item_name: itemName,
        inventory_item_id: invItemId ? Number(invItemId) : undefined,
        quantity_needed: qtyNeeded,
        unit,
        estimated_cost: estimatedCost || undefined,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restock-requests"] })
      toast.success("Restock request submitted.", {
        description: `Request for ${itemName} sent for Director review.`,
      })
      reset()
      onOpenChange(false)
    },
    onError: (err: ApiError) => {
      const data = err.response?.data
      if (data?.errors) {
        setFormErrors(Object.fromEntries(Object.entries(data.errors).map(([k, v]) => [k, v[0]])))
      } else {
        toast.error(data?.detail ?? "Failed to submit request.")
      }
    },
  })

  const canSubmit = itemName.trim() && qtyNeeded && unit.trim()

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request restock funds</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); setFormErrors({}); submit.mutate() }}
          id="restock-form"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="rr-item-name">Item name</FieldLabel>
              <Input
                id="rr-item-name"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Oak Planks"
                required
              />
              {formErrors.item_name && <FieldError errors={[{ message: formErrors.item_name }]} />}
            </Field>

            <Field>
              <FieldLabel htmlFor="rr-inv-item">Link to inventory item (optional)</FieldLabel>
              <select
                id="rr-inv-item"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={invItemId}
                onChange={(e) => handleInvItemChange(e.target.value)}
              >
                <option value="">None</option>
                {inventoryItems.map((i) => (
                  <option key={i.id} value={String(i.id)}>
                    {i.name} ({formatQty(i.current_quantity)} {i.unit} on hand)
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="rr-qty">Quantity needed</FieldLabel>
                <Input
                  id="rr-qty"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={qtyNeeded}
                  onChange={(e) => setQtyNeeded(e.target.value)}
                  required
                />
                {formErrors.quantity_needed && <FieldError errors={[{ message: formErrors.quantity_needed }]} />}
              </Field>
              <Field>
                <FieldLabel htmlFor="rr-unit">Unit</FieldLabel>
                <Input
                  id="rr-unit"
                  placeholder="kg, pcs, m…"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  required
                />
                {formErrors.unit && <FieldError errors={[{ message: formErrors.unit }]} />}
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="rr-cost">Estimated cost (TZS, optional)</FieldLabel>
              <Input
                id="rr-cost"
                type="number"
                min="0"
                step="0.01"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                placeholder="0"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="rr-reason">Reason</FieldLabel>
              <textarea
                id="rr-reason"
                className="min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                placeholder="Why is this restock needed?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </FieldGroup>
        </form>
        <div className="flex justify-end gap-2 pt-2">
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" form="restock-form" disabled={submit.isPending || !canSubmit}>
            {submit.isPending && <Loader2 className="size-4 animate-spin" />}
            <Send data-icon="inline-start" />
            Submit request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Count badge
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
// Requests table
// ---------------------------------------------------------------------------

function RequestsTable({ requests }: { requests: RestockRequest[] }) {
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "TZS",
    maximumFractionDigits: 0,
  })

  if (requests.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <PackageSearch className="size-8 text-muted-foreground" />
          <EmptyTitle>No requests yet</EmptyTitle>
          <EmptyDescription>
            Submit a restock request to ask the Director to release funds for
            purchasing new stock.
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
            <TableHead>Item</TableHead>
            <TableHead>Qty needed</TableHead>
            <TableHead className="text-right">Est. cost</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((req) => (
            <TableRow key={req.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{req.item_name}</span>
                  {req.reason && (
                    <span className="text-xs text-muted-foreground line-clamp-1 max-w-48">
                      {req.reason}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="tabular-nums">
                {formatQty(req.quantity_needed)} {req.unit}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {req.estimated_cost
                  ? currency.format(Number(req.estimated_cost))
                  : "—"}
              </TableCell>
              <TableCell>
                <StatusBadge status={req.status} />
              </TableCell>
              <TableCell className="text-muted-foreground text-sm max-w-40 truncate">
                {req.review_notes || "—"}
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                {new Date(req.created_at).toLocaleDateString("en-US", {
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
// Low-stock suggestions panel
// ---------------------------------------------------------------------------

function LowStockSuggestions({
  items,
  onRaiseRequest,
}: {
  items: InventoryItem[]
  onRaiseRequest: () => void
}) {
  const lowStock = items.filter((i) => i.is_low_stock)

  if (lowStock.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>All stock levels healthy</EmptyTitle>
          <EmptyDescription>
            No materials are currently below their minimum threshold.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Materials below their threshold — consider raising a restock request.
      </p>
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Threshold</TableHead>
              <TableHead className="text-right">Deficit</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lowStock.map((item) => {
              const deficit =
                Number(item.minimum_threshold) - Number(item.current_quantity)
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">
                    <span className="flex items-center justify-end gap-1">
                      <AlertTriangle className="size-3" />
                      {formatQty(item.current_quantity)} {item.unit}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatQty(item.minimum_threshold)} {item.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {deficit > 0 ? `${deficit} ${item.unit}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onRaiseRequest}
                    >
                      <RotateCcw className="size-3.5" />
                      Request restock
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function ReordersScreen() {
  const { data: inventoryItems = [] } = useInventory()
  const { data: requests = [], isLoading } = useRestockRequests()
  const [newOpen, setNewOpen] = useState(false)

  const pending = requests.filter((r) => r.status === "PENDING")
  const resolved = requests.filter((r) => r.status !== "PENDING")
  const lowCount = inventoryItems.filter((i) => i.is_low_stock).length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Submit purchase requests for the Director to approve. Requests are
          visible to the Director as restock fund approvals.
        </p>
        <Button onClick={() => setNewOpen(true)}>
          <Plus data-icon="inline-start" />
          New request
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="pending" className="gap-1.5">
            Pending
            <CountBadge count={pending.length} />
          </TabsTrigger>
          <TabsTrigger value="resolved" className="gap-1.5">
            Resolved
            <CountBadge count={resolved.length} />
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="gap-1.5">
            Low stock
            {lowCount > 0 && (
              <span className={cn(
                "rounded-full px-1.5 text-xs font-medium tabular-nums",
                "bg-destructive/20 text-destructive"
              )}>
                {lowCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <RequestsTable requests={pending} />
          )}
        </TabsContent>

        <TabsContent value="resolved" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : resolved.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No resolved requests</EmptyTitle>
                <EmptyDescription>
                  Approved or rejected requests will appear here after the
                  Director reviews them.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <RequestsTable requests={resolved} />
          )}
        </TabsContent>

        <TabsContent value="suggestions" className="mt-4">
          <LowStockSuggestions
            items={inventoryItems}
            onRaiseRequest={() => setNewOpen(true)}
          />
        </TabsContent>
      </Tabs>

      <NewRestockDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        inventoryItems={inventoryItems}
      />
    </div>
  )
}
