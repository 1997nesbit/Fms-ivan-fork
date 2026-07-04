"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  RotateCcw,
  TrendingDown,
} from "lucide-react"

import api from "@/lib/api"
import { formatQty, toArray } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
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

interface MaterialRequest {
  id: number
  material_name: string
  quantity: string
  unit: string
  order_reference: string | null
  requested_by_name: string | null
  created_at: string
}

interface IssuanceRecord {
  id: number
  order_reference: string | null
  inventory_item_name: string
  quantity_issued: string
  unit: string
  issuance_type: "INITIAL" | "ADDITIONAL"
  issued_at: string
}

interface RestockRequest {
  id: number
  item_name: string
  status: "PENDING" | "APPROVED" | "REJECTED"
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  alert,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  alert?: boolean
}) {
  return (
    <Card className={alert ? "border-destructive/40 bg-destructive/5" : ""}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon
          className={`size-4 shrink-0 ${alert ? "text-destructive" : "text-muted-foreground"}`}
        />
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold tabular-nums ${alert ? "text-destructive" : ""}`}>
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StockOverview() {
  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data } = await api.get<{ results: InventoryItem[] }>("/stock/items/")
      return data.results
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  const { data: requests = [] } = useQuery({
    queryKey: ["material-requests"],
    queryFn: async () => {
      const { data } = await api.get<{ results: MaterialRequest[] }>("/stock/material-requests/")
      return data.results
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: issuances = [] } = useQuery({
    queryKey: ["issuances"],
    queryFn: async () => {
      const { data } = await api.get<{ results: IssuanceRecord[] }>("/stock/issuances/")
      return data.results
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: restockRequests = [] } = useQuery({
    queryKey: ["restock-requests"],
    queryFn: async () => {
      const { data } = await api.get<{ results: RestockRequest[] }>("/stock/restock-requests/")
      return data.results
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const lowStockItems = useMemo(
    () => toArray(items).filter((i) => i.is_low_stock),
    [items]
  )

  const pendingRestocks = useMemo(
    () => toArray(restockRequests).filter((r) => r.status === "PENDING"),
    [restockRequests]
  )

  const recentIssuances = useMemo(() => toArray(issuances).slice(0, 8), [issuances])
  const safeRequests = toArray(requests)

  if (itemsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="Materials tracked"
          value={items.length}
          sub={`${lowStockItems.length} low-stock`}
          icon={Boxes}
        />
        <KpiCard
          label="Low stock"
          value={lowStockItems.length}
          sub={lowStockItems.length > 0 ? "At or below threshold" : "All levels healthy"}
          icon={TrendingDown}
          alert={lowStockItems.length > 0}
        />
        <KpiCard
          label="Pending requests"
          value={safeRequests.length}
          sub="Approved, awaiting issue"
          icon={ClipboardCheck}
          alert={safeRequests.length > 0}
        />
        <KpiCard
          label="Open restock req."
          value={pendingRestocks.length}
          sub={`${toArray(restockRequests).length} total submitted`}
          icon={RotateCcw}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Low-stock materials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-destructive" />
              Low-stock materials
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {lowStockItems.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                All materials are above their minimum threshold.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                    <TableHead className="text-right">Deficit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.map((item) => {
                    const deficit =
                      Number(item.minimum_threshold) - Number(item.current_quantity)
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">
                          {formatQty(item.current_quantity)} {item.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatQty(item.minimum_threshold)} {item.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {deficit > 0 ? `${deficit} ${item.unit}` : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent issuances */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackageCheck className="size-4 text-primary" />
              Recent issuances
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentIssuances.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                No materials have been issued yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentIssuances.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell>
                        <span className="font-mono text-xs text-muted-foreground">
                          {rec.order_reference ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{rec.inventory_item_name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={rec.issuance_type === "ADDITIONAL" ? "outline" : "secondary"}
                          className={`text-xs ${rec.issuance_type === "ADDITIONAL" ? "border-primary/50" : ""}`}
                        >
                          {rec.issuance_type === "INITIAL" ? "Initial" : "Additional"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {formatQty(rec.quantity_issued)} {rec.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending material requests */}
      {safeRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-4 text-primary" />
              Approved requests waiting to be issued
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Qty needed</TableHead>
                  <TableHead>Requested by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeRequests.slice(0, 5).map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {req.order_reference ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{req.material_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(req.quantity)} {req.unit}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {req.requested_by_name ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
