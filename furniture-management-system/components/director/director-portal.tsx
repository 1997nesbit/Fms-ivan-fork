"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Loader2, Search, ShieldCheck, X } from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CostBreakdown } from "@/components/director/cost-breakdown"
import { PayrollView } from "@/components/director/payroll-view"
import { WeeklyReportView } from "@/components/director/weekly-report-view"
import { FundsApproval } from "@/components/director/funds-approval"
import { RevenueView } from "@/components/director/revenue-view"
import type { WeekKey } from "@/components/director/week-selector"

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

interface OrdersPage {
  count: number
  results: Order[]
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
  const [confirmedPrice, setConfirmedPrice] = useState(order.quoted_price ?? "")
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="tabular-nums">
              {order.reference_number}
            </DialogTitle>
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              Pending approval
            </Badge>
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
                step="0.01"
                required
                value={confirmedPrice}
                onChange={(e) => {
                  setConfirmedPrice(e.target.value)
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
    queryKey: ["director-approval-queue", customerFilter, dateFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ status: "PRICE_REVIEW", page_size: "100" })
      if (customerFilter) params.set("search", customerFilter)
      if (dateFilter) params.set("date", dateFilter)
      const { data } = await api.get<OrdersPage>(`/orders/?${params}`)
      return data
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  const orders = data?.results ?? []
  const hasFilters = customerFilter || dateFilter

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">
            Pending price approval
            {data && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {data.count}
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

type DirectorTab = "queue" | "costs" | "payroll" | "report" | "funds" | "revenue"

export function DirectorPortal() {
  const [tab, setTab] = useState<DirectorTab>("queue")
  const [week, setWeek] = useState<WeekKey>("this")

  // Fetch pending count for badge
  const { data: queueData } = useQuery({
    queryKey: ["director-queue-count"],
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>(
        "/orders/?status=PRICE_REVIEW&page_size=1",
      )
      return data
    },
    refetchInterval: 30_000,
  })
  const pendingCount = queueData?.count ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Director Portal
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Approve customer pricing, review costs, manage payroll, oversee funds and track
            revenue.
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as DirectorTab)}
        className="gap-6"
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="queue" className="gap-1.5">
            Approval queue
            {pendingCount > 0 && (
              <span className="rounded-full bg-foreground/10 px-1.5 text-xs font-medium tabular-nums">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="costs">Cost &amp; margin</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="report">Weekly report</TabsTrigger>
          <TabsTrigger value="funds">Funds</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "queue" && <ApprovalQueue />}
      {tab === "costs" && <CostBreakdown />}
      {tab === "payroll" && <PayrollView week={week} onWeekChange={setWeek} />}
      {tab === "report" && <WeeklyReportView week={week} onWeekChange={setWeek} />}
      {tab === "funds" && <FundsApproval />}
      {tab === "revenue" && <RevenueView />}
    </div>
  )
}
