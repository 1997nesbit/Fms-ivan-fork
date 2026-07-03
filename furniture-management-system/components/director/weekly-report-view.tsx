"use client"

import { useQuery } from "@tanstack/react-query"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { WeekSelector, getWeekRange, type WeekKey } from "@/components/director/week-selector"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Order {
  id: number
  reference_number: string
  customer_name: string
  item_description: string
  confirmed_price: string | null
  quoted_price: string | null
  status: string
  delivery_date: string | null
  created_at: string
  updated_at: string
}

interface Payment {
  id: number
  amount: string
  status: "PENDING" | "PAID"
  technician_name: string | null
  stage_name: string
  order_reference: string
  settled_at: string | null
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

function inRange(dateStr: string, start: Date, end: Date) {
  const d = new Date(dateStr)
  return d >= start && d <= end
}

function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: string
  valueClassName?: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs text-muted-foreground text-pretty">{label}</span>
        <span className={cn("text-xl font-semibold text-foreground", valueClassName)}>
          {value}
        </span>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeeklyReportView({
  week,
  onWeekChange,
}: {
  week: WeekKey
  onWeekChange: (week: WeekKey) => void
}) {
  const range = getWeekRange(week)

  const { data: orders = [] } = useQuery({
    queryKey: ["weekly-orders"],
    queryFn: async () => {
      const { data } = await api.get<Order[]>("/orders/?page_size=500")
      return data
    },
    staleTime: 60_000,
  })

  const { data: payments = [] } = useQuery({
    queryKey: ["weekly-payments"],
    queryFn: async () => {
      const { data } = await api.get<Payment[]>("/production/payments/?page_size=500")
      return data
    },
    staleTime: 60_000,
  })

  // Orders actually dispatched within this week (status transition tracked
  // via updated_at, since Order has no dedicated dispatched_at field)
  const weekOrders = orders.filter(
    (o) => o.status === "DISPATCHED" && inRange(o.updated_at, range.start, range.end),
  )

  // Labour incurred (earned) during this week, regardless of settlement status
  const weekPayments = payments.filter((p) => inRange(p.created_at, range.start, range.end))

  // Revenue from dispatched orders (confirmed or quoted price)
  const weekRevenue = weekOrders.reduce(
    (s, o) => s + Number(o.confirmed_price ?? o.quoted_price ?? 0),
    0,
  )

  // Total labour cost incurred this week (paid + pending)
  const weekLabour = weekPayments.reduce((s, p) => s + Number(p.amount), 0)

  const netMargin = weekRevenue - weekLabour

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Weekly cost report</h2>
          <p className="text-sm text-muted-foreground">
            Summary for {range.label} &middot; {weekOrders.length} order
            {weekOrders.length === 1 ? "" : "s"} in period.
          </p>
        </div>
        <WeekSelector week={week} onWeekChange={onWeekChange} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Orders in period" value={String(weekOrders.length)} />
        <StatCard label="Revenue (period)" value={formatMoney(weekRevenue)} />
        <StatCard label="Labour cost (period)" value={formatMoney(weekLabour)} />
        <StatCard
          label="Net margin"
          value={formatMoney(netMargin)}
          valueClassName={
            netMargin >= 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
          }
        />
      </div>

      {/* Orders table for the week */}
      <Card>
        <CardHeader>
          <CardTitle>Orders dispatched — {range.label}</CardTitle>
          <CardDescription>
            Orders marked Dispatched during this period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {weekOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No orders in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weekOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium tabular-nums">{o.reference_number}</TableCell>
                      <TableCell>{o.customer_name}</TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {o.item_description}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(o.confirmed_price ?? o.quoted_price ?? 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {formatMoney(weekRevenue)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Labour payments for the week */}
      <Card>
        <CardHeader>
          <CardTitle>Labour — {range.label}</CardTitle>
          <CardDescription>
            Technician payments earned during this period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {weekPayments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No labour payments in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Technician</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weekPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.technician_name ?? "—"}</TableCell>
                      <TableCell>{p.stage_name}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {p.order_reference}
                      </TableCell>
                      <TableCell>
                        {p.status === "PENDING" ? (
                          <Badge
                            variant="outline"
                            className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                          >
                            Pending
                          </Badge>
                        ) : (
                          <Badge className="border-transparent bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
                            Paid
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatMoney(Number(p.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-medium">Total labour</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">
                      {formatMoney(weekLabour)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
