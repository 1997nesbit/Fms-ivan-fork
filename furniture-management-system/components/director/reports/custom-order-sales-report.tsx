"use client"

import { useState } from "react"
import { Hammer } from "lucide-react"
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
import { formatMoney, formatDate, dateRangeLabel } from "./report-utils"
import { ReportHeader, StatGrid } from "./report-ui"

interface CustomOrderRow {
  order_id: number
  reference_number: string
  customer_name: string
  item_description: string
  confirmed_price: string
  branch_id: number
  branch_name: string
  dispatched_at: string
}

export function CustomOrderSalesReportTab({ filters }: { filters: ReportFilterState }) {
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["report-custom-order-sales", filters],
    queryFn: async () => {
      const { data } = await api.get<{ orders: CustomOrderRow[]; total_revenue: string; count: number }>(
        "/reports/custom-order-sales/",
        { params: filterParams(filters) },
      )
      return data
    },
  })

  const orders = data?.orders ?? []

  function handleDownload() {
    if (!data) return
    setDownloading(true)
    try {
      const pdf = initializePDF()
      const range = dateRangeLabel(filters.dateFrom, filters.dateTo)
      const COLOR = PDF_COLORS.finance.primary
      let y = addHeader(pdf, "Custom Order Sales Report", "Sales", range)
      y = addSectionHeader(pdf, "Summary", y, COLOR)
      y = addSummaryTable(pdf, [
        ["Total revenue", formatCurrency(data.total_revenue)],
        ["Orders dispatched", String(data.count)],
      ], y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Reference", "Customer", "Item", "Branch", "Date", "Amount"]],
        body: orders.map((o) => [
          o.reference_number, o.customer_name,
          o.item_description.length > 40 ? o.item_description.slice(0, 40) + "…" : o.item_description,
          o.branch_name, new Date(o.dispatched_at).toLocaleDateString("en-GB"),
          formatCurrency(o.confirmed_price),
        ]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 5: { halign: "right", fontStyle: "bold" } },
      })
      addFooter(pdf)
      pdf.save("custom-order-sales-report.pdf")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <ReportHeader
        icon={Hammer}
        title="Custom Order Sales"
        description="Dispatched custom orders and the revenue they contributed."
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
              { label: "Total revenue", value: formatMoney(data?.total_revenue ?? 0) },
              { label: "Orders dispatched", value: String(data?.count ?? 0) },
            ]} />
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No dispatched orders in range.</TableCell>
                  </TableRow>
                )}
                {orders.map((o) => (
                  <TableRow key={o.order_id}>
                    <TableCell className="font-medium tabular-nums">{o.reference_number}</TableCell>
                    <TableCell>{o.customer_name}</TableCell>
                    <TableCell className="max-w-48 truncate">{o.item_description}</TableCell>
                    <TableCell className="text-muted-foreground">{o.branch_name}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(o.dispatched_at)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatMoney(o.confirmed_price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {orders.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium">Total</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatMoney(data!.total_revenue)}</TableCell>
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
