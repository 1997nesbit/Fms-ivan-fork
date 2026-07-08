"use client"

import { useMemo, useState } from "react"
import { Download, Loader2, Search } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

import api from "@/lib/api"
import { generateCostBreakdownPDF } from "@/lib/generators/cost-breakdown-report"
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

function SummaryStat({
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
        <span className="text-xs text-muted-foreground">{label}</span>
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

export function CostBreakdown() {
  const [search, setSearch] = useState("")
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      generateCostBreakdownPDF({
        totalLabour,
        pendingLabour,
        paidLabour,
        byOrder,
        payments: filteredPayments.map((p) => ({
          technician_name: p.technician_name,
          stage_name: p.stage_name,
          order_reference: p.order_reference,
          status: p.status,
          amount: Number(p.amount),
          created_at: p.created_at,
        })),
      })
    } finally {
      setDownloading(false)
    }
  }

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["cost-breakdown-payments"],
    queryFn: async () => {
      const { data } = await api.get<Payment[]>("/production/payments/?page_size=500")
      return data
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const q = search.trim().toLowerCase()
  const filteredPayments = q
    ? payments.filter(
        (p) =>
          (p.technician_name ?? "").toLowerCase().includes(q) ||
          p.stage_name.toLowerCase().includes(q) ||
          p.order_reference.toLowerCase().includes(q),
      )
    : payments

  const totalLabour = filteredPayments.reduce((s, p) => s + Number(p.amount), 0)
  const pendingLabour = filteredPayments
    .filter((p) => p.status === "PENDING")
    .reduce((s, p) => s + Number(p.amount), 0)
  const paidLabour = filteredPayments
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + Number(p.amount), 0)

  // Group by order for a per-order breakdown
  const byOrder = Object.values(
    filteredPayments.reduce<
      Record<
        string,
        { reference: string; stages: number; labour: number; pending: number }
      >
    >((acc, p) => {
      const key = p.order_reference
      if (!acc[key]) acc[key] = { reference: key, stages: 0, labour: 0, pending: 0 }
      acc[key].stages += 1
      acc[key].labour += Number(p.amount)
      if (p.status === "PENDING") acc[key].pending += Number(p.amount)
      return acc
    }, {}),
  ).sort((a, b) => b.labour - a.labour)

  // Group by stage name for chart
  const byStage = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of payments) {
      map[p.stage_name] = (map[p.stage_name] ?? 0) + Number(p.amount)
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }))
  }, [payments])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading} className="gap-1.5">
          {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          {downloading ? "Generating…" : "Download PDF"}
        </Button>
      </div>
      <div className="flex flex-col gap-6">
      {/* KPI summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <SummaryStat label="Total labour (all time)" value={formatMoney(totalLabour)} />
        <SummaryStat
          label="Pending payout"
          value={formatMoney(pendingLabour)}
          valueClassName="text-amber-600 dark:text-amber-400"
        />
        <SummaryStat label="Already paid" value={formatMoney(paidLabour)} />
      </div>

      {/* Cost per stage — bar chart */}
      {byStage.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Labour cost by stage type</CardTitle>
            <CardDescription>Top 10 stage names by total payout (all time)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byStage} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : String(v)}
                  tick={{ fontSize: 11 }}
                />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatMoney(Number(v))} />
                <Bar dataKey="value" name="Labour cost" fill="#4F7BEF" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-payment table */}
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Production cost breakdown</CardTitle>
            <CardDescription>
              Labour payments per production stage across all workshop orders.
            </CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 w-56 pl-8 text-sm"
              placeholder="Search technician, stage, order…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
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
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filteredPayments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {payments.length === 0
                        ? "No production payments recorded yet."
                        : "No payments match your search."}
                    </TableCell>
                  </TableRow>
                )}
                {filteredPayments.map((p) => (
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
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMoney(Number(p.amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Per-order summary */}
      {byOrder.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Labour per order</CardTitle>
            <CardDescription>Total production labour cost grouped by order.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead className="text-right">Stages</TableHead>
                    <TableHead className="text-right">Total labour</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byOrder.map((o) => (
                    <TableRow key={o.reference}>
                      <TableCell className="font-medium tabular-nums">{o.reference}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.stages}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(o.labour)}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-600 dark:text-amber-400">
                        {o.pending > 0 ? formatMoney(o.pending) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  )
}
