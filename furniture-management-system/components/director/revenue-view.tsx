"use client"

import { useState } from "react"
import { TrendingUp, ShoppingBag, Hammer } from "lucide-react"
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
  created_at: string
}

interface Sale {
  id: number
  reference: string
  item_sku: string
  item_name: string
  sale_price: string
  order_type: string
  sold_by_name: string
  sold_at: string
  branch_id: number
  branch_name: string
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

type RevenueTab = "overview" | "workshop" | "showroom"

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  highlight?: "positive" | "negative"
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground text-pretty">{label}</span>
          <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Icon className="size-3.5" />
          </span>
        </div>
        <span
          className={cn(
            "text-xl font-semibold leading-tight",
            highlight === "positive" && "text-green-600 dark:text-green-400",
            highlight === "negative" && "text-destructive",
            !highlight && "text-foreground",
          )}
        >
          {value}
        </span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Revenue summary table (replaces pie/bar charts — no recharts installed)
// ---------------------------------------------------------------------------

function SummaryTable({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: { label: string; value: number }[]
}) {
  const total = rows.reduce((s, r) => s + r.value, 0)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell>{r.label}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(r.value)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {total > 0 ? `${((r.value / total) * 100).toFixed(0)}%` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right font-bold tabular-nums">{formatMoney(total)}</TableCell>
              <TableCell className="text-right">100%</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RevenueView() {
  const [tab, setTab] = useState<RevenueTab>("overview")

  const { data: dispatchedOrders = [] } = useQuery({
    queryKey: ["revenue-orders"],
    queryFn: async () => {
      const { data } = await api.get<Order[]>("/orders/?status=DISPATCHED&page_size=500")
      return data
    },
    staleTime: 60_000,
  })

  const { data: sales = [] } = useQuery({
    queryKey: ["revenue-sales"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Sale[] }>("/shop/sales/?page_size=500")
      return data.results
    },
    staleTime: 60_000,
  })

  // Workshop revenue = sum of confirmed_price (fall back to quoted_price)
  const workshopRevenue = dispatchedOrders.reduce((s, o) => {
    return s + Number(o.confirmed_price ?? o.quoted_price ?? 0)
  }, 0)

  const showroomRevenue = sales.reduce((s, sale) => s + Number(sale.sale_price), 0)
  const totalRevenue = workshopRevenue + showroomRevenue

  // Revenue by branch (from sales)
  const showroomByBranch = Object.entries(
    sales.reduce<Record<string, number>>((acc, s) => {
      const key = s.branch_name || `Branch ${s.branch_id}`
      acc[key] = (acc[key] ?? 0) + Number(s.sale_price)
      return acc
    }, {}),
  ).map(([label, value]) => ({ label, value }))

  const tabs: { key: RevenueTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "workshop", label: "Workshop orders" },
    { key: "showroom", label: "Showroom sales" },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">Revenue</h2>
        <p className="text-sm text-muted-foreground">
          Combined revenue from dispatched workshop orders and showroom sales across all branches.
        </p>
      </div>

      {/* Sub-nav tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI summary — always visible */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard icon={TrendingUp} label="Total revenue" value={formatMoney(totalRevenue)} />
        <KpiCard
          icon={Hammer}
          label="Workshop orders"
          value={formatMoney(workshopRevenue)}
          sub={`${dispatchedOrders.length} dispatched orders`}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Showroom sales"
          value={formatMoney(showroomRevenue)}
          sub={`${sales.length} transactions`}
        />
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Workshop revenue summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Workshop revenue</CardTitle>
              <CardDescription>Revenue from dispatched orders</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-2">
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                <span className="text-sm text-muted-foreground">Dispatched orders</span>
                <span className="font-medium tabular-nums">{dispatchedOrders.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                <span className="text-sm text-muted-foreground">Total revenue</span>
                <span className="text-lg font-semibold tabular-nums">{formatMoney(workshopRevenue)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Showroom revenue by branch */}
          {showroomByBranch.length > 0 ? (
            <SummaryTable
              title="Showroom revenue by branch"
              description="Revenue share per showroom location"
              rows={showroomByBranch}
            />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Showroom revenue</CardTitle>
                <CardDescription>Sales transactions</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 pt-2">
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                  <span className="text-sm text-muted-foreground">Total transactions</span>
                  <span className="font-medium tabular-nums">{sales.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                  <span className="text-sm text-muted-foreground">Total revenue</span>
                  <span className="text-lg font-semibold tabular-nums">{formatMoney(showroomRevenue)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Workshop orders tab */}
      {tab === "workshop" && (
        <Card>
          <CardHeader>
            <CardTitle>Workshop orders</CardTitle>
            <CardDescription>All dispatched customer orders and their revenue contribution.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatchedOrders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No dispatched orders yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {dispatchedOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium tabular-nums">{o.reference_number}</TableCell>
                      <TableCell>{o.customer_name}</TableCell>
                      <TableCell className="max-w-48 truncate">{o.item_description}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(o.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{o.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(Number(o.confirmed_price ?? o.quoted_price ?? 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatMoney(workshopRevenue)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Showroom sales tab */}
      {tab === "showroom" && (
        <Card>
          <CardHeader>
            <CardTitle>Showroom sales</CardTitle>
            <CardDescription>All completed showroom transactions.</CardDescription>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No showroom sales recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Sold by</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium tabular-nums">{s.reference}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{s.item_name}</span>
                            <span className="font-mono text-xs text-muted-foreground">{s.item_sku}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{s.branch_name}</TableCell>
                        <TableCell className="text-muted-foreground">{s.sold_by_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(s.sold_at)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatMoney(Number(s.sale_price))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="font-medium">Total</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatMoney(showroomRevenue)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
