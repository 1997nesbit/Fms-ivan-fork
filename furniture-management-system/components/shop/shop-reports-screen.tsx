"use client"

import { useMemo, useState } from "react"
import { BarChart3, Boxes, PackageCheck, Tag, Wallet } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  id: number
  name: string
  location: string
}

interface ShowroomItem {
  id: number
  sku: string
  name: string
  category: string
  price: string
  status: string
  branch_id: number
  branch_name: string
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ShopReportsScreen() {
  const [branchFilter, setBranchFilter] = useState<number | "all">("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

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

  // Filter sales by branch + date range
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
  const unsoldValue = filteredItems
    .filter((i) => i.status === "AVAILABLE")
    .reduce((s, i) => s + Number(i.price), 0)
  const unitsSold = filteredSales.length

  // Per-branch breakdown
  const perBranch = useMemo(
    () =>
      branches.map((b) => ({
        branch: b,
        sales: sales.filter((s) => s.branch_id === b.id).reduce((s, x) => s + Number(x.sale_price), 0),
        units: sales.filter((s) => s.branch_id === b.id).length,
        available: items.filter((i) => i.branch_id === b.id && i.status === "AVAILABLE").length,
        unsoldVal: items
          .filter((i) => i.branch_id === b.id && i.status === "AVAILABLE")
          .reduce((s, i) => s + Number(i.price), 0),
      })),
    [branches, sales, items],
  )

  const statCards = [
    {
      label: "Total sales value",
      value: formatMoney(totalSalesValue),
      icon: Wallet,
      hint: branchFilter === "all" ? "All branches" : "Filtered branch",
    },
    {
      label: "Units sold",
      value: String(unitsSold),
      icon: Tag,
      hint: "Individual transactions",
    },
    {
      label: "Unsold inventory",
      value: formatMoney(unsoldValue),
      icon: Boxes,
      hint: "Available stock value",
    },
    {
      label: "Items available",
      value: String(filteredItems.filter((i) => i.status === "AVAILABLE").length),
      icon: PackageCheck,
      hint: "In-stock count",
    },
  ]

  const scopeLabel =
    branchFilter === "all"
      ? "All branches"
      : branches.find((b) => b.id === branchFilter)?.name ?? "Branch"

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
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

        {/* Filters */}
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
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Input
            type="date"
            className="h-9 w-36"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From"
          />
          <Input
            type="date"
            className="h-9 w-36"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To"
          />
        </div>
      </div>

      {/* Summary stat cards */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{scopeLabel} summary</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((card) => (
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
      </section>

      {/* Per-branch breakdown — combined view only */}
      {branchFilter === "all" && perBranch.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Per-branch breakdown</h2>
          <Card>
            <CardContent className="px-0 py-0">
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
                  {perBranch.map(({ branch, sales: s, units, available, unsoldVal }) => (
                    <TableRow key={branch.id}>
                      <TableCell className="font-medium">{branch.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(s)}</TableCell>
                      <TableCell className="text-right tabular-nums">{units}</TableCell>
                      <TableCell className="text-right tabular-nums">{available}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(unsoldVal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
  )
}
