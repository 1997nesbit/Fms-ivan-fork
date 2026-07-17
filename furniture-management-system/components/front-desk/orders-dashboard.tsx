"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, ClipboardList, PackageCheck, Search } from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge, type OrderStatus } from "@/components/front-desk/status-badge"
import { CreateOrderDialog } from "@/components/front-desk/create-order-dialog"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiOrder {
  id: number
  reference_number: string
  status: OrderStatus
  customer_name: string
  customer_phone: string
  item_description: string
  quoted_price: string | null
  confirmed_price: string | null
  delivery_date: string | null
  notes: string
  cancellation_reason: string
  branch_id: number
  created_by_id: number
  created_at: string
  updated_at: string
  images: { id: number; url: string }[]
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type FilterValue = "all" | OrderStatus

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all",               label: "All" },
  { value: "PRICE_REVIEW",      label: "Pending Approval" },
  { value: "OPS_QUEUE",         label: "Ops Queue" },
  { value: "IN_PRODUCTION",     label: "In Production" },
  { value: "WORKSHOP_COMPLETE", label: "Ready" },
  { value: "DISPATCHED",        label: "Dispatched" },
  { value: "CANCELLED",         label: "Cancelled" },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
})

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function splitDescription(desc: string): { type: string; size: string } {
  const [type, size = ""] = desc.split(" — ", 2)
  return { type, size }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OrdersDashboard() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterValue>("all")
  const [search, setSearch] = useState("")

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data } = await api.get<ApiOrder[]>("/orders/")
      return data
    },
  })

  const collect = useMutation({
    mutationFn: (id: number) => api.post(`/orders/${id}/collect/`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      const order = orders.find((o) => o.id === id)
      toast.success("Marked as collected", {
        description: order
          ? `${order.reference_number} · ${order.customer_name}`
          : undefined,
      })
    },
    onError: () => toast.error("Failed to mark as collected."),
  })

  const counts = useMemo(() => {
    const base: Record<FilterValue, number> = {
      all: orders.length,
      PENDING: 0,
      PRICE_REVIEW: 0,
      OPS_QUEUE: 0,
      IN_PRODUCTION: 0,
      WORKSHOP_COMPLETE: 0,
      DISPATCHED: 0,
      CANCELLED: 0,
    }
    for (const o of orders) {
      if (o.status in base) base[o.status as FilterValue] += 1
    }
    return base
  }, [orders])

  const visible = useMemo(() => {
    let list = filter === "all" ? orders : orders.filter((o) => o.status === filter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (o) =>
          o.reference_number.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          o.customer_phone.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => {
      if (a.status === "WORKSHOP_COMPLETE" && b.status !== "WORKSHOP_COMPLETE") return -1
      if (b.status === "WORKSHOP_COMPLETE" && a.status !== "WORKSHOP_COMPLETE") return 1
      return (a.delivery_date ?? "").localeCompare(b.delivery_date ?? "")
    })
  }, [orders, filter, search])

  const readyCount = counts["WORKSHOP_COMPLETE"]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <ClipboardList className="size-5" />
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Front Desk Portal
            </h1>
            <p className="max-w-xl text-pretty text-muted-foreground">
              Create customer orders, track their progress through the workshop,
              and close them out on collection.
            </p>
          </div>
        </div>
        <CreateOrderDialog />
      </div>

      {readyCount > 0 && (
        <Card className="border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/40">
          <CardContent className="flex items-center gap-3 py-3">
            <PackageCheck className="size-5 text-green-700 dark:text-green-300" />
            <p className="text-sm text-green-900 dark:text-green-100">
              <span className="font-semibold">{readyCount}</span>{" "}
              {readyCount === 1 ? "order is" : "orders are"} ready for collection.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)} className="gap-4">
          <TabsList className="h-auto flex-wrap">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="gap-1.5">
                {f.label}
                <span className="rounded-full bg-foreground/10 px-1.5 text-xs font-medium tabular-nums">
                  {counts[f.value]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 w-56 pl-8 text-sm"
            placeholder="Search reference, customer, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Furniture</TableHead>
                <TableHead className="text-right">Quoted</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Loading orders…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {search.trim() ? "No orders match your search." : "No orders in this view."}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((order) => {
                const isReady = order.status === "WORKSHOP_COMPLETE"
                const { type, size } = splitDescription(order.item_description)
                return (
                  <TableRow
                    key={order.id}
                    className={cn(
                      isReady && "bg-green-50/70 hover:bg-green-50 dark:bg-green-950/30"
                    )}
                  >
                    <TableCell className="font-medium tabular-nums">
                      {order.reference_number}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{order.customer_name}</span>
                        <span className="text-xs text-muted-foreground">{order.customer_phone}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{type}</span>
                        {size && <span className="text-xs text-muted-foreground">{size}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {order.quoted_price ? currency.format(Number(order.quoted_price)) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(order.delivery_date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={order.status} />
                        {order.status === "CANCELLED" && order.cancellation_reason && (
                          <span className="max-w-40 truncate text-xs text-muted-foreground">
                            {order.cancellation_reason}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {isReady ? (
                        <Button
                          size="sm"
                          disabled={collect.isPending && collect.variables === order.id}
                          onClick={() => collect.mutate(order.id)}
                        >
                          <CheckCircle2 data-icon="inline-start" />
                          Mark Collected
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  )
}
