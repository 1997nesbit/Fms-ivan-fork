"use client"

import { useState } from "react"
import { LayoutDashboard } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import autoTable from "jspdf-autotable"

import api from "@/lib/api"
import {
  initializePDF, formatCurrency, addHeader, addFooter,
  addSectionHeader, checkPageBreak, getLastTableY, MARGIN,
} from "@/lib/pdf-helpers"
import { PDF_COLORS } from "@/lib/pdf-types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { formatMoney } from "./report-utils"
import { ReportHeader, StatGrid } from "./report-ui"

interface BranchSnapshot {
  branch_id: number; branch_name: string; inventory_worth: string
  showroom_items_sold: number; showroom_units_sold: number; custom_orders_sold: number
}
interface StatusCount { status: string; count: number }
interface RawMaterialLevel {
  id: number; name: string; unit: string; current_quantity: string; is_low_stock: boolean
}
interface SnapshotData {
  by_branch: BranchSnapshot[]
  orders_by_status: StatusCount[]
  raw_materials: RawMaterialLevel[]
}

export function SnapshotReportTab() {
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["report-snapshot"],
    queryFn: async () => {
      const { data } = await api.get<SnapshotData>("/reports/snapshot/")
      return data
    },
    staleTime: 30_000,
  })

  function handleDownload() {
    if (!data) return
    setDownloading(true)
    try {
      const pdf = initializePDF()
      const COLOR = PDF_COLORS.performance.primary
      let y = addHeader(pdf, "Snapshot Report", "Current state", "Right now")

      y = addSectionHeader(pdf, "By Branch", y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Branch", "Inventory worth", "Showroom sold", "Custom orders sold"]],
        body: data.by_branch.map((b) => [
          b.branch_name, formatCurrency(b.inventory_worth),
          `${b.showroom_items_sold} (${b.showroom_units_sold} units)`, String(b.custom_orders_sold),
        ]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 1: { halign: "right" } },
      })
      y = getLastTableY(pdf) + 15

      y = checkPageBreak(pdf, y)
      y = addSectionHeader(pdf, "Orders by Status", y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Status", "Count"]],
        body: data.orders_by_status.map((s) => [s.status, String(s.count)]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 1: { halign: "right" } },
      })
      y = getLastTableY(pdf) + 15

      y = checkPageBreak(pdf, y)
      y = addSectionHeader(pdf, "Raw Material Stock Levels", y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Item", "Quantity", "Low stock"]],
        body: data.raw_materials.map((m) => [m.name, `${m.current_quantity} ${m.unit}`, m.is_low_stock ? "Yes" : "No"]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
      })

      addFooter(pdf)
      pdf.save("snapshot-report.pdf")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <ReportHeader
        icon={LayoutDashboard}
        title="Snapshot — Current State"
        description="No date filter — reflects the system right now."
        onDownload={handleDownload}
        downloading={downloading}
        disabled={downloading || !data}
      />
      <CardContent className="flex flex-col gap-6">
        {isLoading || !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <StatGrid stats={[
              { label: "Total inventory worth", value: formatMoney(data.by_branch.reduce((s, b) => s + Number(b.inventory_worth), 0)) },
              { label: "Showroom items sold", value: String(data.by_branch.reduce((s, b) => s + b.showroom_items_sold, 0)) },
              { label: "Custom orders sold", value: String(data.by_branch.reduce((s, b) => s + b.custom_orders_sold, 0)) },
              { label: "Low stock items", value: String(data.raw_materials.filter((m) => m.is_low_stock).length) },
            ]} />
            <div>
              <h3 className="mb-2 text-sm font-medium">By branch</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch</TableHead>
                      <TableHead className="text-right">Inventory worth</TableHead>
                      <TableHead className="text-right">Showroom sold</TableHead>
                      <TableHead className="text-right">Custom orders sold</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.by_branch.map((b) => (
                      <TableRow key={b.branch_id}>
                        <TableCell className="font-medium">{b.branch_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(b.inventory_worth)}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.showroom_items_sold} ({b.showroom_units_sold} units)</TableCell>
                        <TableCell className="text-right tabular-nums">{b.custom_orders_sold}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium">Orders by status</h3>
                <div className="flex flex-wrap gap-2">
                  {data.orders_by_status.map((s) => (
                    <Badge key={s.status} variant="secondary" className="gap-1.5 text-xs">
                      {s.status.replace(/_/g, " ")}
                      <span className="rounded-full bg-foreground/10 px-1.5 tabular-nums">{s.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Raw material stock levels</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.raw_materials.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{m.current_quantity} {m.unit}</TableCell>
                          <TableCell>
                            {m.is_low_stock ? (
                              <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 text-xs">Low</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
