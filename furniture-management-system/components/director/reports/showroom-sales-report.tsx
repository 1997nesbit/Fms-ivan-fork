"use client"

import { useState } from "react"
import { ShoppingBag } from "lucide-react"
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

interface ShowroomSalesData {
  sales: { total_revenue: string; units_sold: number; transaction_count: number }
  items_added: { count: number; units: number }
  inventory_worth: { at_cost: string; at_retail: string }
  by_branch: { branch: string; revenue: string; units: number }[]
}

export function ShowroomSalesReportTab({ filters }: { filters: ReportFilterState }) {
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["report-showroom-sales", filters],
    queryFn: async () => {
      const { data } = await api.get<ShowroomSalesData>("/reports/showroom-sales/", {
        params: filterParams(filters),
      })
      return data
    },
  })

  function handleDownload() {
    if (!data) return
    setDownloading(true)
    try {
      const pdf = initializePDF()
      const range = dateRangeLabel(filters.dateFrom, filters.dateTo)
      const COLOR = PDF_COLORS.sales.primary
      let y = addHeader(pdf, "Showroom Sales Report", "Sales", range)
      y = addSectionHeader(pdf, "Summary", y, COLOR)
      y = addSummaryTable(pdf, [
        ["Total revenue", formatCurrency(data.sales.total_revenue)],
        ["Units sold", String(data.sales.units_sold)],
        ["Transactions", String(data.sales.transaction_count)],
        ["Inventory worth (at cost)", formatCurrency(data.inventory_worth.at_cost)],
      ], y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Branch", "Revenue", "Units"]],
        body: data.by_branch.map((b) => [b.branch, formatCurrency(b.revenue), String(b.units)]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      })
      addFooter(pdf)
      pdf.save("showroom-sales-report.pdf")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <ReportHeader
        icon={ShoppingBag}
        title="Showroom Sales"
        description="Showroom transactions and revenue across branches, with unsold inventory worth."
        onDownload={handleDownload}
        downloading={downloading}
        disabled={downloading || !data}
      />
      <CardContent className="flex flex-col gap-4">
        {isLoading || !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <StatGrid stats={[
              { label: "Total revenue", value: formatMoney(data.sales.total_revenue) },
              { label: "Units sold", value: String(data.sales.units_sold) },
              { label: "Transactions", value: String(data.sales.transaction_count) },
              { label: "Inventory worth (cost)", value: formatMoney(data.inventory_worth.at_cost) },
            ]} />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.by_branch.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No sales in range.</TableCell>
                    </TableRow>
                  )}
                  {data.by_branch.map((b) => (
                    <TableRow key={b.branch}>
                      <TableCell className="font-medium">{b.branch}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(b.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.units}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {data.by_branch.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-medium">Total</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{formatMoney(data.sales.total_revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{data.sales.units_sold}</TableCell>
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
