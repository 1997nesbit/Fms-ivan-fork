"use client"

import { useState } from "react"
import { Wallet } from "lucide-react"
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

interface RestockRequestRow {
  id: number
  item_name: string
  quantity_needed: string
  unit: string
  estimated_cost: string | null
  status: "PENDING" | "APPROVED" | "REJECTED"
  requested_by_name: string | null
  reviewed_by_name: string | null
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  APPROVED: "border-green-300 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  REJECTED: "border-border bg-muted text-muted-foreground",
}

export function OfficeExpensesReportTab({ filters }: { filters: ReportFilterState }) {
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["report-office-expenses", filters.dateFrom, filters.dateTo],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filters.dateFrom) params.date_from = filters.dateFrom
      if (filters.dateTo) params.date_to = filters.dateTo
      const { data } = await api.get<{ results: RestockRequestRow[] }>("/stock/restock-requests/", { params })
      return data.results
    },
  })

  const rows = data ?? []
  const approvedTotal = rows
    .filter((r) => r.status === "APPROVED")
    .reduce((s, r) => s + Number(r.estimated_cost ?? 0), 0)

  function handleDownload() {
    setDownloading(true)
    try {
      const pdf = initializePDF()
      const range = dateRangeLabel(filters.dateFrom, filters.dateTo)
      const COLOR = PDF_COLORS.finance.primary
      let y = addHeader(pdf, "Office Expenses Report", "Finance", range)
      y = addSectionHeader(pdf, "Summary", y, COLOR)
      y = addSummaryTable(pdf, [
        ["Approved spend", formatCurrency(approvedTotal)],
        ["Total requests", String(rows.length)],
      ], y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Item", "Qty", "Est. cost", "Status", "Requested by", "Date"]],
        body: rows.map((r) => [
          r.item_name, `${r.quantity_needed} ${r.unit}`,
          formatCurrency(r.estimated_cost ?? 0), r.status,
          r.requested_by_name ?? "—", new Date(r.created_at).toLocaleDateString("en-GB"),
        ]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 2: { halign: "right" } },
      })
      addFooter(pdf)
      pdf.save(buildReportFilename("office-expenses-report", { dateFrom: filters.dateFrom, dateTo: filters.dateTo }))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <ReportHeader
        icon={Wallet}
        title="Office Expenses (Fund Requests)"
        description="Restock fund requests submitted by Stock Keepers and their approval status."
        onDownload={handleDownload}
        downloading={downloading}
        disabled={downloading}
      />
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <StatGrid stats={[
              { label: "Approved spend", value: formatMoney(approvedTotal) },
              { label: "Total requests", value: String(rows.length) },
              { label: "Pending", value: String(rows.filter((r) => r.status === "PENDING").length) },
            ]} />
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead className="text-right">Est. cost</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No requests in range.</TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.item_name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.quantity_needed} {r.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.estimated_cost ?? 0)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLES[r.status]}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.requested_by_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {rows.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-medium">Approved spend</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatMoney(approvedTotal)}</TableCell>
                    <TableCell colSpan={3} />
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
