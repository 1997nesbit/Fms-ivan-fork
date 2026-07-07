"use client"

import { useState } from "react"
import { TrendingUp, ShoppingBag, Hammer, Search } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"

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
import { Input } from "@/components/ui/input"

const PIE_COLORS = [
  "#4F7BEF",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
]

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
// Main component
// ---------------------------------------------------------------------------

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-8 w-56 pl-8 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function RevenueView() {
  const [tab, setTab] = useState<RevenueTab>("overview")
  const [workshopSearch, setWorkshopSearch] = useState("")
  const [showroomSearch, setShowroomSearch] = useState("")

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

  // Revenue by branch (from sales) — used in chart + table
  const showroomByBranch = Object.entries(
    sales.reduce<Record<string, number>>((acc, s) => {
      const key = s.branch_name || `Branch ${s.branch_id}`
      acc[key] = (acc[key] ?? 0) + Number(s.sale_price)
      return acc
    }, {}),
  ).map(([name, value]) => ({ name, value }))

  // Workshop orders by month (BarChart)
  const workshopByMonth = Object.entries(
    dispatchedOrders.reduce<Record<string, number>>((acc, o) => {
      const month = new Date(o.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      })
      acc[month] = (acc[month] ?? 0) + Number(o.confirmed_price ?? o.quoted_price ?? 0)
      return acc
    }, {}),
  )
    .sort((a, b) => {
      const parse = (s: string) => new Date(`1 ${s}`)
      return parse(a[0]).getTime() - parse(b[0]).getTime()
    })
    .map(([name, value]) => ({ name, value }))

  // Workshop vs Showroom split (PieChart)
  const revenueSplit = [
    { name: "Workshop", value: workshopRevenue },
    { name: "Showroom", value: showroomRevenue },
  ].filter((d) => d.value > 0)

  const workshopQuery = workshopSearch.trim().toLowerCase()
  const filteredOrders = workshopQuery
    ? dispatchedOrders.filter(
        (o) =>
          o.reference_number.toLowerCase().includes(workshopQuery) ||
          o.customer_name.toLowerCase().includes(workshopQuery) ||
          o.item_description.toLowerCase().includes(workshopQuery),
      )
    : dispatchedOrders
  const filteredOrdersRevenue = filteredOrders.reduce(
    (s, o) => s + Number(o.confirmed_price ?? o.quoted_price ?? 0),
    0,
  )

  const showroomQuery = showroomSearch.trim().toLowerCase()
  const filteredSales = showroomQuery
    ? sales.filter(
        (s) =>
          s.reference.toLowerCase().includes(showroomQuery) ||
          s.item_name.toLowerCase().includes(showroomQuery) ||
          s.item_sku.toLowerCase().includes(showroomQuery) ||
          s.branch_name.toLowerCase().includes(showroomQuery),
      )
    : sales
  const filteredSalesRevenue = filteredSales.reduce((s, sale) => s + Number(sale.sale_price), 0)

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
          {/* Workshop vs Showroom split */}
          {revenueSplit.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue split</CardTitle>
                <CardDescription>Workshop orders vs showroom sales</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={revenueSplit}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {revenueSplit.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(Number(v))} />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Showroom revenue by branch */}
          {showroomByBranch.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Showroom revenue by branch</CardTitle>
                <CardDescription>Sales value per showroom location</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={showroomByBranch}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {showroomByBranch.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(Number(v))} />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Workshop revenue by month */}
          {workshopByMonth.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Workshop revenue by month</CardTitle>
                <CardDescription>Dispatched order value over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={workshopByMonth} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v) =>
                        v >= 1_000_000
                          ? `${(v / 1_000_000).toFixed(1)}M`
                          : v >= 1_000
                            ? `${(v / 1_000).toFixed(0)}k`
                            : String(v)
                      }
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(v) => formatMoney(Number(v))} />
                    <Bar dataKey="value" fill={PIE_COLORS[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Workshop orders tab */}
      {tab === "workshop" && (
        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Workshop orders</CardTitle>
              <CardDescription>All dispatched customer orders and their revenue contribution.</CardDescription>
            </div>
            <SearchBox
              value={workshopSearch}
              onChange={setWorkshopSearch}
              placeholder="Search order, customer, item…"
            />
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
                  {filteredOrders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        {dispatchedOrders.length === 0
                          ? "No dispatched orders yet."
                          : "No orders match your search."}
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredOrders.map((o) => (
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
                    <TableCell className="text-right font-bold tabular-nums">{formatMoney(filteredOrdersRevenue)}</TableCell>
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
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle>Showroom sales</CardTitle>
              <CardDescription>All completed showroom transactions.</CardDescription>
            </div>
            <SearchBox
              value={showroomSearch}
              onChange={setShowroomSearch}
              placeholder="Search reference, item, branch…"
            />
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No showroom sales recorded yet.</p>
            ) : filteredSales.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sales match your search.</p>
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
                    {filteredSales.map((s) => (
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
                      <TableCell className="text-right font-bold tabular-nums">{formatMoney(filteredSalesRevenue)}</TableCell>
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
