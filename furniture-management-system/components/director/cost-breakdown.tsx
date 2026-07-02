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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

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
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["cost-breakdown-payments"],
    queryFn: async () => {
      const { data } = await api.get<Payment[]>("/production/payments/?page_size=500")
      return data
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const totalLabour = payments.reduce((s, p) => s + Number(p.amount), 0)
  const pendingLabour = payments
    .filter((p) => p.status === "PENDING")
    .reduce((s, p) => s + Number(p.amount), 0)
  const paidLabour = payments
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + Number(p.amount), 0)

  // Group by order for a per-order breakdown
  const byOrder = Object.values(
    payments.reduce<
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

  return (
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

      {/* Per-payment table */}
      <Card>
        <CardHeader>
          <CardTitle>Production cost breakdown</CardTitle>
          <CardDescription>
            Labour payments per production stage across all workshop orders.
          </CardDescription>
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
                {!isLoading && payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No production payments recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {payments.map((p) => (
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
  )
}
