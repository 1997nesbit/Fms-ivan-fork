"use client"

import { useMemo, useState } from "react"
import { BarChart3, Boxes, Download, Loader2, PackageCheck, Tag, Wallet } from "lucide-react"
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
import { generateShopSalesPDF } from "@/lib/generators/shop-sales"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  id: number
  name: string
  location: string
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

interface ShowroomItem {
  id: number
  sku: string
  name: string
  price: string
  cost_price: string | null
  status: string
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

const CHART_COLORS = [
  "#4F7BEF", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShopReportsScreen() {
  const [branchFilter, setBranchFilter] = useState<number | "all">("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const dateRange = [
        dateFrom && `From ${dateFrom}`,
        dateTo && `To ${dateTo}`,
      ].filter(Boolean).join(" ") || "All time"
      generateShopSalesPDF({
        scopeLabel,
        dateRange,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        totalSalesValue,
        unitsSold,
        unsoldValueRetail,
        unsoldValueCost,
        hasCostData,
        sales: filteredSales.map((s) => ({
          reference: s.reference,
          item_name: s.item_name,
          item_sku: s.item_sku,
          branch_name: s.branch_name,
          sold_by_name: s.sold_by_name,
          sold_at: s.sold_at,
          sale_price: Number(s.sale_price),
        })),
        perBranch,
      })
    } finally {
      setDownloading(false)
    }
  }

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Branch[] }>("/branches/")
      return data.results
    },
    staleTime: 60_000,
  })

  const { data: items = [] } = useQuery({
    queryKey: ["report-items"],
    queryFn: async () => {
      const { data } = await api.get<{ results: ShowroomItem[] }>("/shop/items/?page_size=500")
      return data.results
    },
    staleTime: 30_000,
  })

  const { data: sales = [] } = useQuery({
    queryKey: ["report-sales"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Sale[] }>("/shop/sales/?page_size=500")
      return data.results
    },
    staleTime: 30_000,
  })

  // ---------------------------------------------------------------------------
  // Client-side filtering (applied to sales ledger and charts)
  // ---------------------------------------------------------------------------

  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      if (branchFilter !== "all" && s.branch_id !== branchFilter) return false
      if (dateFrom && s.sold_at < dateFrom) return false
      if (dateTo && s.sold_at > dateTo + "T23:59:59") return false
      return true
    })
  }, [sales, branchFilter, dateFrom, dateTo])

  const filteredItems = useMemo(
    () => (branchFilter === "all" ? items : items.filter((i) => i.branch_id === branchFilter)),
    [items, branchFilter],
  )

  // Summary metrics
  const totalSalesValue = filteredSales.reduce((s, sale) => s + Number(sale.sale_price), 0)
  const unsoldItems = filteredItems.filter((i) => i.status === "AVAILABLE")
  const unsoldValueRetail = unsoldItems.reduce((s, i) => s + Number(i.price), 0)
  const unsoldValueCost = unsoldItems.reduce(
    (s, i) => s + Number(i.cost_price ?? i.price),
    0,
  )
  const unitsSold = filteredSales.length

  // Per-branch breakdown
  const perBranch = useMemo(
    () =>
      branches
        .map((b) => ({
          name: b.name,
          value: filteredSales.filter((s) => s.branch_id === b.id).reduce((s, x) => s + Number(x.sale_price), 0),
          units: filteredSales.filter((s) => s.branch_id === b.id).length,
          available: filteredItems.filter((i) => i.branch_id === b.id && i.status === "AVAILABLE").length,
          unsoldVal: filteredItems
            .filter((i) => i.branch_id === b.id && i.status === "AVAILABLE")
            .reduce((s, i) => s + Number(i.price), 0),
        }))
        .filter((b) => b.value > 0 || b.available > 0),
    [branches, filteredSales, filteredItems],
  )

  // Sales by month (for bar chart)
  const salesByMonth = useMemo(() => {
    const map: Record<string, number> = {}
    for (const s of filteredSales) {
      const month = new Date(s.sold_at).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
      map[month] = (map[month] ?? 0) + Number(s.sale_price)
    }
    return Object.entries(map)
      .sort(([a], [b]) => new Date(`1 ${a}`).getTime() - new Date(`1 ${b}`).getTime())
      .map(([name, value]) => ({ name, value }))
  }, [filteredSales])

  const scopeLabel =
    branchFilter === "all"
      ? "All branches"
      : branches.find((b) => b.id === branchFilter)?.name ?? "Branch"

  const hasCostData = unsoldItems.some((i) => i.cost_price !== null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading} className="gap-1.5">
          {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {downloading ? "Generating…" : "Download PDF"}
        </Button>
      </div>
      <div className="flex flex-col gap-6">

      {/* Header + Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <BarChart3 className="size-5" />
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Shop Reports</h1>
            <p className="max-w-2xl text-pretty text-muted-foreground">
              Sales performance and inventory overview across every branch.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={String(branchFilter)}
            onChange={(e) =>
              setBranchFilter(e.target.value === "all" ? "all" : Number(e.target.value))
            }
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <Input type="date" className="h-9 w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" className="h-9 w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total sales value", value: formatMoney(totalSalesValue), icon: Wallet, hint: scopeLabel },
          { label: "Units sold", value: String(unitsSold), icon: Tag, hint: "Transactions" },
          { label: "Unsold stock (retail)", value: formatMoney(unsoldValueRetail), icon: Boxes, hint: "Available items at retail" },
          { label: "Unsold stock (cost)", value: hasCostData ? formatMoney(unsoldValueCost) : "—", icon: PackageCheck, hint: hasCostData ? "Available items at cost" : "No cost data yet" },
        ].map((card) => (
          <Card key={card.label}>
            <CardHeader className="gap-2 pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-pretty">{card.label}</CardDescription>
                <card.icon className="size-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl tabular-nums">{card.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      {(salesByMonth.length > 0 || perBranch.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* Sales by branch — pie */}
          {perBranch.length > 1 && branchFilter === "all" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sales by branch</CardTitle>
                <CardDescription>Revenue share per showroom location</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={perBranch} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                      {perBranch.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => formatMoney(Number(v))} />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Sales by month — bar */}
          {salesByMonth.length > 0 && (
            <Card className={cn(perBranch.length <= 1 || branchFilter !== "all" ? "lg:col-span-2" : "")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sales by month</CardTitle>
                <CardDescription>Revenue trend over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={salesByMonth} margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis
                      tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : String(v)}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(v) => formatMoney(Number(v))} />
                    <Bar dataKey="value" name="Revenue" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Per-branch table */}
      {branchFilter === "all" && perBranch.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Per-branch breakdown</h2>
          <Card>
            <CardContent className="px-0 py-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Sales value</TableHead>
                      <TableHead className="text-right">Units sold</TableHead>
                      <TableHead className="text-right">Available items</TableHead>
                      <TableHead className="text-right">Unsold value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perBranch.map((b) => (
                      <TableRow key={b.name}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(b.value)}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.units}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.available}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(b.unsoldVal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Sales ledger */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Sales ledger ({filteredSales.length})
        </h2>
        <Card>
          <CardContent className="px-0 py-0">
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
                  {filteredSales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No sales in the selected range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSales.map((s) => (
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
                        <TableCell className="text-muted-foreground">{formatDate(s.sold_at)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatMoney(Number(s.sale_price))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {filteredSales.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="font-medium">Total</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatMoney(totalSalesValue)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
      </div>
    </div>
  )
}
