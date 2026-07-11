"use client"

import { useState } from "react"
import { User } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import autoTable from "jspdf-autotable"

import api from "@/lib/api"
import {
  initializePDF, formatCurrency, addHeader, addFooter,
  addSectionHeader, addSummaryTable, MARGIN, buildReportFilename,
} from "@/lib/pdf-helpers"
import { PDF_COLORS } from "@/lib/pdf-types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { ReportFilterState } from "./report-filters"
import { formatMoney, formatDate, dateRangeLabel } from "./report-utils"
import { ReportHeader, StatGrid } from "./report-ui"

interface Technician { id: number; name: string }
interface PaymentRow {
  id: number
  stage_name: string
  order_reference: string
  item_description: string
  amount: string
  status: "PENDING" | "PAID"
  date: string
  settled_at: string | null
  time_spent: string | null
}

export function IndividualTechnicianPayReportTab({ filters }: { filters: ReportFilterState }) {
  const [technicianId, setTechnicianId] = useState("")
  const [downloading, setDownloading] = useState(false)

  const { data: technicians = [] } = useQuery({
    queryKey: ["report-technicians"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Technician[] }>("/stock/technicians/")
      return data.results
    },
    staleTime: 5 * 60_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ["report-technician-pay", technicianId, filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const params: Record<string, string> = { technician_id: technicianId }
      if (filters.dateFrom) params.date_from = filters.dateFrom
      if (filters.dateTo) params.date_to = filters.dateTo
      const { data } = await api.get<{
        technician_id: number; technician_name: string; payments: PaymentRow[]; total: string
      }>("/reports/technician-pay/", { params })
      return data
    },
    enabled: !!technicianId,
  })

  function handleDownload() {
    if (!data) return
    setDownloading(true)
    try {
      const pdf = initializePDF()
      const range = dateRangeLabel(filters.dateFrom, filters.dateTo)
      const COLOR = PDF_COLORS.finance.primary
      let y = addHeader(pdf, `Technician Performance — ${data.technician_name}`, "Payroll", range)
      y = addSectionHeader(pdf, "Summary", y, COLOR)
      y = addSummaryTable(pdf, [
        ["Total paid/owed", formatCurrency(data.total)],
        ["Tasks completed", String(data.payments.length)],
      ], y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Task done", "Stage", "Order", "Time spent", "Amount", "Status", "Date"]],
        body: data.payments.map((p) => [
          p.item_description.length > 30 ? p.item_description.slice(0, 30) + "…" : p.item_description,
          p.stage_name, p.order_reference, p.time_spent ?? "—",
          formatCurrency(p.amount), p.status, new Date(p.date).toLocaleDateString("en-GB"),
        ]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: { 4: { halign: "right" } },
      })
      addFooter(pdf)
      pdf.save(buildReportFilename(`technician-pay-${data.technician_name}`, {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      }))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <ReportHeader
        icon={User}
        title="Individual Technician Report"
        description="Tasks completed, pay, and time spent per task for one technician."
        onDownload={handleDownload}
        downloading={downloading}
        disabled={downloading || !data}
      />
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Technician</label>
          <select
            className="h-8 w-64 rounded-md border border-input bg-background px-2 text-sm"
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
          >
            <option value="">Select technician…</option>
            {technicians.map((t) => (
              <option key={t.id} value={String(t.id)}>{t.name}</option>
            ))}
          </select>
        </div>
        {!technicianId ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Select a technician to view their tasks, pay, and time spent per task.</p>
        ) : isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <StatGrid stats={[
              { label: "Total paid/owed", value: formatMoney(data?.total ?? 0) },
              { label: "Tasks completed", value: String(data?.payments.length ?? 0) },
            ]} />
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task done</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Time spent</TableHead>
                  <TableHead className="text-right">Amount charged</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No tasks completed in range.</TableCell>
                  </TableRow>
                )}
                {data?.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-56 truncate font-medium">{p.item_description}</TableCell>
                    <TableCell className="text-muted-foreground">{p.stage_name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.order_reference}</TableCell>
                    <TableCell className="text-muted-foreground">{p.time_spent ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(p.amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={p.status === "PAID"
                          ? "border-green-300 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
                          : "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200"}
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(p.date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {data && data.payments.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatMoney(data.total)}</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
