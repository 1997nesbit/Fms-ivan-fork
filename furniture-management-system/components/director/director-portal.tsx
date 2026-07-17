"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Loader2, Search, ShieldCheck, X, XCircle } from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/shared/status"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LowStockBanner } from "@/components/stock-keeper/issue-materials-screen"
import { FundsApproval } from "@/components/director/funds-approval"
import { ReportsPortal } from "@/components/director/reports/reports-portal"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderImage {
  id: number
  url: string
}

interface Order {
  id: number
  reference_number: string
  customer_name: string
  customer_phone: string
  item_description: string
  quoted_price: string | null
  delivery_date: string | null
  created_at: string
  notes: string
  images: OrderImage[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
})

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// Detail row helper
// ---------------------------------------------------------------------------

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value || "—"}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Order preview + confirm dialog
// ---------------------------------------------------------------------------

function OrderPreviewDialog({
  order,
  open,
  onOpenChange,
}: {
  order: Order
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<"review" | "reject">("review")
  const [confirmedPrice, setConfirmedPrice] = useState(
    order.quoted_price ? String(Math.round(Number(order.quoted_price))) : ""
  )
  const [reason, setReason] = useState("")
  const [fieldError, setFieldError] = useState<string | null>(null)

  const confirm = useMutation({
    mutationFn: () =>
      api.patch(`/orders/${order.id}/confirm-price/`, {
        confirmed_price: confirmedPrice,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["director-approval-queue"] })
      queryClient.invalidateQueries({ queryKey: ["director-queue-count"] })
      toast.success("Price confirmed", {
        description: `${order.reference_number} moved to Ops Queue.`,
      })
      onOpenChange(false)
    },
    onError: (err: {
      response?: { data?: { errors?: Record<string, string[]>; detail?: string } }
    }) => {
      const data = err.response?.data
      if (data?.errors?.confirmed_price) {
        setFieldError(data.errors.confirmed_price[0])
      } else {
        toast.error(data?.detail ?? "Failed to confirm price.")
      }
    },
  })

  const reject = useMutation({
    mutationFn: () => api.patch(`/orders/${order.id}/reject/`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["director-approval-queue"] })
      queryClient.invalidateQueries({ queryKey: ["director-queue-count"] })
      toast.success("Order rejected", {
        description: `${order.reference_number} marked as cancelled.`,
      })
      onOpenChange(false)
    },
    onError: (err: {
      response?: { data?: { errors?: Record<string, string[]>; detail?: string } }
    }) => {
      const data = err.response?.data
      if (data?.errors?.reason) {
        setFieldError(data.errors.reason[0])
      } else {
        toast.error(data?.detail ?? "Failed to reject order.")
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="tabular-nums">
              {order.reference_number}
            </DialogTitle>
            <StatusBadge tone="warning" label="Pending approval" />
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <DetailRow label="Customer" value={order.customer_name} />
          <DetailRow label="Phone" value={order.customer_phone} />
          <DetailRow label="Order date" value={formatDate(order.created_at)} />
          <DetailRow label="Delivery date" value={formatDate(order.delivery_date)} />
          <div className="col-span-2 sm:col-span-3">
            <DetailRow label="Item" value={order.item_description} />
          </div>
          {order.notes && (
            <div className="col-span-2 sm:col-span-3">
              <DetailRow label="Notes" value={order.notes} />
            </div>
          )}
        </div>

        {order.images.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Reference photos ({order.images.length})
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {order.images.map((img) => (
                  <a
                    key={img.id}
                    href={img.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative block aspect-[4/3] overflow-hidden rounded-lg border border-border bg-muted transition-opacity hover:opacity-90"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt="Reference"
                      className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        {mode === "review" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setFieldError(null)
              confirm.mutate()
            }}
          >
            <div className="space-y-4">
              <p className="text-sm font-medium">Confirm price</p>
              {order.quoted_price && (
                <p className="text-sm text-muted-foreground">
                  Quoted by front desk:{" "}
                  <span className="font-semibold text-foreground">
                    {currency.format(Number(order.quoted_price))}
                  </span>
                </p>
              )}
              <Field>
                <FieldLabel htmlFor="confirmed-price">Confirmed price (TZS)</FieldLabel>
                <Input
                  id="confirmed-price"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  required
                  value={confirmedPrice}
                  onChange={(e) => {
                    setConfirmedPrice(e.target.value.replace(/\D/g, ""))
                    setFieldError(null)
                  }}
                />
                {fieldError && <FieldError errors={[{ message: fieldError }]} />}
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>
                Close
              </DialogClose>
              <Button
                type="button"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                onClick={() => {
                  setFieldError(null)
                  setMode("reject")
                }}
              >
                <XCircle data-icon="inline-start" />
                Reject order
              </Button>
              <Button type="submit" disabled={confirm.isPending}>
                {confirm.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 data-icon="inline-start" />
                )}
                Confirm &amp; approve
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setFieldError(null)
              reject.mutate()
            }}
          >
            <div className="space-y-4">
              <p className="text-sm font-medium">Reject order</p>
              <Field>
                <FieldLabel htmlFor="reject-reason">Reason for rejection</FieldLabel>
                <Textarea
                  id="reject-reason"
                  required
                  rows={3}
                  placeholder="e.g. Customer cancelled, Price not viable…"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value)
                    setFieldError(null)
                  }}
                />
                {fieldError && <FieldError errors={[{ message: fieldError }]} />}
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setFieldError(null)
                  setMode("review")
                }}
              >
                Back
              </Button>
              <Button type="submit" variant="destructive" disabled={reject.isPending}>
                {reject.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <XCircle data-icon="inline-start" />
                )}
                Confirm rejection
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Approval queue
// ---------------------------------------------------------------------------

function ApprovalQueue() {
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null)
  const [customerFilter, setCustomerFilter] = useState("")
  const [dateFilter, setDateFilter] = useState("")

  const { data, isLoading } = useQuery({
    queryKey: ["director-approval-queue"],
    queryFn: async () => {
      const { data } = await api.get<Order[]>("/orders/?status=PRICE_REVIEW")
      return data
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  const orders = useMemo(() => {
    const all = data ?? []
    return all.filter((order) => {
      if (
        customerFilter &&
        !order.customer_name.toLowerCase().includes(customerFilter.toLowerCase())
      ) {
        return false
      }
      if (dateFilter && order.delivery_date !== dateFilter) return false
      return true
    })
  }, [data, customerFilter, dateFilter])
  const hasFilters = customerFilter || dateFilter

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">
            Pending price approval
            {data && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {data.length}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 w-44 pl-8 text-sm"
                placeholder="Customer name…"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
              />
            </div>
            <Input
              type="date"
              className="h-8 w-36 text-sm"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground"
                onClick={() => {
                  setCustomerFilter("")
                  setDateFilter("")
                }}
              >
                <X className="size-3.5" />
                Clear
              </Button>
            )}
            <p className="hidden text-xs text-muted-foreground sm:block">Click a row to review</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Order date</TableHead>
                <TableHead className="text-right">Quoted</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Photos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {hasFilters
                      ? "No orders match the current filters."
                      : "No orders awaiting price approval."}
                  </TableCell>
                </TableRow>
              )}
              {orders.map((order) => (
                <TableRow
                  key={order.id}
                  className={cn("cursor-pointer transition-colors hover:bg-muted/60")}
                  onClick={() => setPreviewOrder(order)}
                >
                  <TableCell className="font-medium tabular-nums">
                    {order.reference_number}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{order.customer_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {order.customer_phone}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{order.item_description}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(order.created_at)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {order.quoted_price
                      ? currency.format(Number(order.quoted_price))
                      : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(order.delivery_date)}
                  </TableCell>
                  <TableCell>
                    {order.images.length > 0 ? (
                      <span className="text-xs font-medium">
                        {order.images.length} photo{order.images.length !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {previewOrder && (
        <OrderPreviewDialog
          order={previewOrder}
          open={!!previewOrder}
          onOpenChange={(v) => {
            if (!v) setPreviewOrder(null)
          }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

type DirectorTab = "queue" | "reports" | "funds"

export function DirectorPortal() {
  const [tab, setTab] = useState<DirectorTab>("queue")

  // Fetch pending count for badge
  const { data: queueData } = useQuery({
    queryKey: ["director-queue-count"],
    queryFn: async () => {
      const { data } = await api.get<unknown[]>("/orders/?status=PRICE_REVIEW")
      return data
    },
    refetchInterval: 30_000,
  })
  const pendingCount = queueData?.length ?? 0

  const { data: lowStockCount = 0 } = useQuery({
    queryKey: ["low-stock-count"],
    queryFn: async () => {
      const { data } = await api.get<{ results: { is_low_stock: boolean }[] }>("/stock/items/")
      return data.results.filter((i) => i.is_low_stock).length
    },
    staleTime: 60_000,
  })

  return (
    <div className="flex flex-col gap-6">
      <LowStockBanner count={lowStockCount} />

      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Director Portal
          </h1>
          <p className="max-w-xl text-pretty text-muted-foreground">
            Approve customer pricing, review costs, manage payroll, oversee funds and track
            revenue.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as DirectorTab)} className="gap-6">
        <div className="border-b border-border">
          <TabsList variant="line" className="h-auto flex-wrap">
            <TabsTrigger value="queue" className="gap-1.5">
              Approval queue
              {pendingCount > 0 && (
                <span className="rounded-full bg-foreground/10 px-1.5 text-xs font-medium tabular-nums">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="funds">Funds</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="queue"><ApprovalQueue /></TabsContent>
        <TabsContent value="reports"><ReportsPortal /></TabsContent>
        <TabsContent value="funds"><FundsApproval /></TabsContent>
      </Tabs>
    </div>
  )
}
