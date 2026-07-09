"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import autoTable from "jspdf-autotable"

import api from "@/lib/api"
import {
  initializePDF, formatCurrency, addHeader, addFooter,
  addSectionHeader, addSummaryTable, checkPageBreak, getLastTableY, MARGIN,
} from "@/lib/pdf-helpers"
import { PDF_COLORS } from "@/lib/pdf-types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import type { ReportFilterState } from "./report-filters"
import { formatMoney } from "./report-utils"

interface RawMaterial {
  id: number; name: string; unit: string; current_quantity: string
  minimum_threshold: string; is_low_stock: boolean; unit_cost: string | null; worth: string
}
interface ShowroomStockRow {
  id: number; sku: string; name: string; branch_id: number; branch_name: string
  quantity: number; unit_worth: string; worth: string
}
interface StockData {
  raw_materials: RawMaterial[]
  raw_materials_worth_total: string
  showroom_stock: ShowroomStockRow[]
  showroom_worth_total: string
}

export function StockAvailabilityReportTab({ filters }: { filters: ReportFilterState }) {
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["report-stock-availability", filters.branchId],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (filters.branchId) params.branch_id = filters.branchId
      const { data } = await api.get<StockData>("/reports/stock-availability/", { params })
      return data
    },
  })

  function handleDownload() {
    if (!data) return
    setDownloading(true)
    try {
      const pdf = initializePDF()
      const COLOR = PDF_COLORS.performance.primary
      let y = addHeader(pdf, "Stock Availability Report", "Inventory", "Current")
      y = addSectionHeader(pdf, "Summary", y, COLOR)
      y = addSummaryTable(pdf, [
        ["Raw materials worth", formatCurrency(data.raw_materials_worth_total)],
        ["Showroom stock worth", formatCurrency(data.showroom_worth_total)],
      ], y, COLOR)

      y = checkPageBreak(pdf, y)
      y = addSectionHeader(pdf, "Raw Materials", y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Item", "Quantity", "Low stock", "Unit cost", "Worth"]],
        body: data.raw_materials.map((m) => [
          m.name, `${m.current_quantity} ${m.unit}`, m.is_low_stock ? "Yes" : "No",
          m.unit_cost ? formatCurrency(m.unit_cost) : "—", formatCurrency(m.worth),
        ]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
      })
      y = getLastTableY(pdf) + 15

      y = checkPageBreak(pdf, y)
      y = addSectionHeader(pdf, "Showroom Stock", y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["SKU", "Item", "Branch", "Qty", "Worth"]],
        body: data.showroom_stock.map((s) => [
          s.sku, s.name, s.branch_name, String(s.quantity), formatCurrency(s.worth),
        ]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } },
      })

      addFooter(pdf)
      pdf.save("stock-availability-report.pdf")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Stock Availability</CardTitle>
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={downloading || !data} className="gap-1.5">
          {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          PDF
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {isLoading || !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div>
              <h3 className="mb-2 text-sm font-medium">Raw Materials — worth {formatMoney(data.raw_materials_worth_total)}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Worth</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.raw_materials.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No inventory items.</TableCell></TableRow>
                    )}
                    {data.raw_materials.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell className="text-muted-foreground">{m.current_quantity} {m.unit}</TableCell>
                        <TableCell>
                          {m.is_low_stock ? (
                            <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 text-xs">Low stock</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">OK</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(m.worth)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Showroom Stock — worth {formatMoney(data.showroom_worth_total)}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Worth</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.showroom_stock.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No showroom items available.</TableCell></TableRow>
                    )}
                    {data.showroom_stock.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{s.sku}</TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground">{s.branch_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(s.worth)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
