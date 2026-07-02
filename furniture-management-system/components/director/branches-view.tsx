"use client"

import { useState } from "react"
import { MapPin, Package, ShoppingBag } from "lucide-react"
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  id: number
  name: string
  location: string
}

interface ShopItem {
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

const BRANCH_COLORS = [
  "#4F7BEF",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
]

function MetricItem({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Icon className="size-3" />
        <span className="text-xs">{label}</span>
      </div>
      <span className={cn("text-sm font-semibold", highlight && "text-primary")}>
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BranchesView() {
  const [selected, setSelected] = useState<number | "all">("all")

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Branch[] }>("/branches/")
      return data.results
    },
    staleTime: 60_000,
  })

  const { data: items = [] } = useQuery({
    queryKey: ["branches-items"],
    queryFn: async () => {
      const { data } = await api.get<{ results: ShopItem[] }>("/shop/items/?page_size=500")
      return data.results
    },
    staleTime: 60_000,
  })

  const { data: sales = [] } = useQuery({
    queryKey: ["branches-sales"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Sale[] }>("/shop/sales/?page_size=500")
      return data.results
    },
    staleTime: 60_000,
  })

  // Per-branch stats
  const branchStats = branches.map((b) => {
    const branchItems = items.filter((i) => i.branch_id === b.id)
    const branchSales = sales.filter((s) => s.branch_id === b.id)
    const available = branchItems.filter((i) => i.status === "AVAILABLE").length
    const sold = branchItems.filter((i) => i.status === "SOLD").length
    const salesRevenue = branchSales.reduce((s, sale) => s + Number(sale.sale_price), 0)
    return { branch: b, available, sold, totalItems: branchItems.length, salesRevenue, salesCount: branchSales.length }
  })

  // Filtered items for drill-down table
  const filteredItems =
    selected === "all" ? items : items.filter((i) => i.branch_id === selected)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">Branches</h2>
        <p className="text-sm text-muted-foreground">
          Stock and sales activity across all showroom branches.
        </p>
      </div>

      {/* Branch summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branchStats.map((b, i) => (
          <Card
            key={b.branch.id}
            className={cn(
              "cursor-pointer transition-shadow hover:shadow-md",
              selected === b.branch.id && "ring-2 ring-primary",
            )}
            onClick={() =>
              setSelected(selected === b.branch.id ? "all" : b.branch.id)
            }
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="flex size-8 items-center justify-center rounded-lg text-white text-xs font-bold"
                    style={{ backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] }}
                  >
                    {b.branch.name.slice(0, 2).toUpperCase()}
                  </span>
                  <CardTitle className="text-base">{b.branch.name}</CardTitle>
                </div>
                <MapPin className="size-4 text-muted-foreground" />
              </div>
              <CardDescription className="text-xs">{b.branch.location}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <MetricItem icon={Package} label="Available stock" value={String(b.available)} />
              <MetricItem icon={ShoppingBag} label="Items sold" value={String(b.sold)} />
              <MetricItem icon={ShoppingBag} label="Transactions" value={String(b.salesCount)} />
              <MetricItem
                icon={ShoppingBag}
                label="Sales revenue"
                value={formatMoney(b.salesRevenue)}
                highlight
              />
            </CardContent>
          </Card>
        ))}

        {branches.length === 0 && (
          <p className="col-span-3 py-8 text-center text-sm text-muted-foreground">
            No branches found.
          </p>
        )}
      </div>

      {/* Overall summary row */}
      {branchStats.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total branches", value: String(branches.length) },
            { label: "Total items", value: String(items.length) },
            { label: "Available items", value: String(items.filter((i) => i.status === "AVAILABLE").length) },
            {
              label: "Total sales revenue",
              value: formatMoney(sales.reduce((s, sale) => s + Number(sale.sale_price), 0)),
            },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="flex flex-col gap-1 py-4">
                <span className="text-xs text-muted-foreground">{stat.label}</span>
                <span className="text-xl font-semibold">{stat.value}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Inventory drill-down table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle>
                {selected === "all"
                  ? "All inventory"
                  : `Inventory — ${branches.find((b) => b.id === selected)?.name ?? "Branch"}`}
              </CardTitle>
              <CardDescription>
                {selected === "all"
                  ? "Click a branch card above to filter."
                  : `Showing ${filteredItems.length} item${filteredItems.length === 1 ? "" : "s"}.`}
              </CardDescription>
            </div>
            {selected !== "all" && (
              <Button variant="ghost" size="sm" onClick={() => setSelected("all")}>
                Clear filter
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No items to display.
                    </TableCell>
                  </TableRow>
                )}
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-muted-foreground">{item.category || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{item.branch_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={item.status === "AVAILABLE" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(Number(item.price))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
