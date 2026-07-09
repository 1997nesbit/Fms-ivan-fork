"use client"

import { useState } from "react"
import { TrendingUp } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import autoTable from "jspdf-autotable"

import api from "@/lib/api"
import {
  initializePDF, formatCurrency, addHeader, addFooter,
  addSectionHeader, addSummaryTable, MARGIN,
} from "@/lib/pdf-helpers"
import { PDF_COLORS } from "@/lib/pdf-types"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { ReportFilterState } from "./report-filters"
import { filterParams } from "./report-filters"
import { formatMoney, dateRangeLabel } from "./report-utils"
import { ReportHeader, StatGrid } from "./report-ui"

interface BranchRow {
  branch_id: number
  branch_name: string
  showroom_revenue: string
  order_revenue: string
  total_revenue: string
  units_sold: number
  orders_fulfilled: number
}

export function GrossReportTab({ filters }: { filters: ReportFilterState }) {
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["report-gross", filters],
    queryFn: async () => {
      const { data } = await api.get<{ branches: BranchRow[]; grand_total: string }>(
        "/reports/branch-performance/",
        { params: filterParams(filters) },
      )
      return data
    },
  })

  const branches = data?.branches ?? []
  const grandTotal = data?.grand_total ?? "0"

  function handleDownload() {
    if (!data) return
    setDownloading(true)
    try {
      const pdf = initializePDF()
      const range = dateRangeLabel(filters.dateFrom, filters.dateTo)
      let y = addHeader(pdf, "Gross Report", "All Branches", range)
      y = addSectionHeader(pdf, "Summary", y, PDF_COLORS.finance.primary)
      y = addSummaryTable(pdf, [
        ["Grand total revenue", formatCurrency(grandTotal)],
        ["Branches", String(branches.length)],
      ], y, PDF_COLORS.finance.primary)
      autoTable(pdf, {
        startY: y,
        head: [["Branch", "Showroom", "Custom orders", "Total", "Units sold", "Orders fulfilled"]],
        body: branches.map((b) => [
          b.branch_name,
          formatCurrency(b.showroom_revenue),
          formatCurrency(b.order_revenue),
          formatCurrency(b.total_revenue),
          String(b.units_sold),
          String(b.orders_fulfilled),
        ]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: PDF_COLORS.finance.primary, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
      })
      addFooter(pdf)
      pdf.save("gross-report.pdf")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <ReportHeader
        icon={TrendingUp}
        title="Gross Report — All Branches"
        description="Combined showroom + custom order revenue, broken down per branch."
        onDownload={handleDownload}
        downloading={downloading}
        disabled={downloading || !data}
      />
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <StatGrid stats={[
              { label: "Grand total revenue", value: formatMoney(grandTotal) },
              { label: "Branches", value: String(branches.length) },
              { label: "Total units sold", value: String(branches.reduce((s, b) => s + b.units_sold, 0)) },
              { label: "Orders fulfilled", value: String(branches.reduce((s, b) => s + b.orders_fulfilled, 0)) },
            ]} />
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Showroom</TableHead>
                  <TableHead className="text-right">Custom orders</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Units sold</TableHead>
                  <TableHead className="text-right">Orders fulfilled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No data in range.</TableCell>
                  </TableRow>
                )}
                {branches.map((b) => (
                  <TableRow key={b.branch_id}>
                    <TableCell className="font-medium">{b.branch_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(b.showroom_revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(b.order_revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatMoney(b.total_revenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.units_sold}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.orders_fulfilled}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {branches.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-medium">Grand total</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatMoney(grandTotal)}</TableCell>
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
