"use client"

import { useState } from "react"
import { Layers } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import autoTable from "jspdf-autotable"

import api from "@/lib/api"
import {
  initializePDF, formatCurrency, addHeader, addFooter,
  addSectionHeader, addSummaryTable, MARGIN,
} from "@/lib/pdf-helpers"
import { PDF_COLORS } from "@/lib/pdf-types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { ReportFilterState } from "./report-filters"
import { filterParams } from "./report-filters"
import { formatMoney, formatDate, dateRangeLabel } from "./report-utils"
import { ReportHeader, StatGrid } from "./report-ui"

interface LedgerRow {
  type: "SHOWROOM" | "CUSTOM"
  reference: string
  description: string
  branch_id: number
  branch_name: string
  amount: string
  date: string
}

interface LedgerData {
  rows: LedgerRow[]
  subtotals: { showroom: string; custom: string }
  grand_total: string
}

export function CombinedLedgerReportTab({ filters }: { filters: ReportFilterState }) {
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["report-combined-ledger", filters],
    queryFn: async () => {
      const { data } = await api.get<LedgerData>("/reports/combined-sales-ledger/", {
        params: filterParams(filters),
      })
      return data
    },
  })

  const rows = data?.rows ?? []

  function handleDownload() {
    if (!data) return
    setDownloading(true)
    try {
      const pdf = initializePDF()
      const range = dateRangeLabel(filters.dateFrom, filters.dateTo)
      const COLOR = PDF_COLORS.finance.primary
      let y = addHeader(pdf, "Combined Sales Ledger", "Sales", range)
      y = addSectionHeader(pdf, "Summary", y, COLOR)
      y = addSummaryTable(pdf, [
        ["Showroom subtotal", formatCurrency(data.subtotals.showroom)],
        ["Custom order subtotal", formatCurrency(data.subtotals.custom)],
        ["Grand total", formatCurrency(data.grand_total)],
      ], y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Type", "Reference", "Description", "Branch", "Date", "Amount"]],
        body: rows.map((r) => [
          r.type, r.reference, r.description, r.branch_name,
          new Date(r.date).toLocaleDateString("en-GB"), formatCurrency(r.amount),
        ]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: { 5: { halign: "right", fontStyle: "bold" } },
      })
      addFooter(pdf)
      pdf.save("combined-sales-ledger.pdf")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <ReportHeader
        icon={Layers}
        title="Combined Sales Ledger"
        description="Showroom sales and dispatched custom orders merged into one chronological feed."
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
              { label: "Showroom subtotal", value: formatMoney(data?.subtotals.showroom ?? 0) },
              { label: "Custom order subtotal", value: formatMoney(data?.subtotals.custom ?? 0) },
              { label: "Grand total", value: formatMoney(data?.grand_total ?? 0) },
              { label: "Transactions", value: String(rows.length) },
            ]} />
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No sales in range.</TableCell>
                  </TableRow>
                )}
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant={r.type === "SHOWROOM" ? "secondary" : "outline"} className="text-xs">
                        {r.type === "SHOWROOM" ? "Showroom" : "Custom"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">{r.reference}</TableCell>
                    <TableCell className="max-w-48 truncate">{r.description}</TableCell>
                    <TableCell className="text-muted-foreground">{r.branch_name}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {rows.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium">Showroom subtotal</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(data!.subtotals.showroom)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} className="font-medium">Custom order subtotal</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(data!.subtotals.custom)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} className="font-bold">Grand total</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{formatMoney(data!.grand_total)}</TableCell>
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
