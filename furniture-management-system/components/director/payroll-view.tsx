"use client"

import { Lock } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import api from "@/lib/api"
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
import { WeekSelector, getWeekRange, type WeekKey } from "@/components/director/week-selector"

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

function inRange(dateStr: string, start: Date, end: Date) {
  const d = new Date(dateStr)
  return d >= start && d <= end
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PayrollView({
  week,
  onWeekChange,
}: {
  week: WeekKey
  onWeekChange: (week: WeekKey) => void
}) {
  const range = getWeekRange(week)

  const { data: allPayments = [] } = useQuery({
    queryKey: ["payroll-payments"],
    queryFn: async () => {
      const { data } = await api.get<Payment[]>("/production/payments/?page_size=500")
      return data
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  // Filter to payments created (or settled) in the selected week
  const weekPayments = allPayments.filter((p) =>
    inRange(p.settled_at ?? p.created_at, range.start, range.end),
  )

  // Group by technician
  const rows = Object.values(
    weekPayments.reduce<
      Record<string, { name: string; stagesCompleted: number; payout: number }>
    >((acc, p) => {
      const key = p.technician_name ?? "Unknown"
      if (!acc[key]) acc[key] = { name: key, stagesCompleted: 0, payout: 0 }
      acc[key].stagesCompleted += 1
      acc[key].payout += Number(p.amount)
      return acc
    }, {}),
  ).sort((a, b) => b.payout - a.payout)

  const total = rows.reduce((s, r) => s + r.payout, 0)

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Weekly payroll</CardTitle>
          <CardDescription>
            Payout per technician for payments created during {range.label}.
          </CardDescription>
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Lock className="size-3.5" />
            Director-only view — not visible to other roles.
          </p>
        </div>
        <WeekSelector week={week} onWeekChange={onWeekChange} />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No technician payments during {range.label}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Technician</TableHead>
                  <TableHead className="text-right">Stages</TableHead>
                  <TableHead className="text-right">Payout due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.stagesCompleted}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatMoney(row.payout)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-medium">
                    Total payout
                  </TableCell>
                  <TableCell className="text-right text-base font-bold tabular-nums">
                    {formatMoney(total)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
