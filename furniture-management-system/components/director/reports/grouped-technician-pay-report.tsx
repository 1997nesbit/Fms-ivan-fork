"use client"

import { useState } from "react"
import { Users } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import autoTable from "jspdf-autotable"

import api from "@/lib/api"
import {
  initializePDF, formatCurrency, addHeader, addFooter,
  addSectionHeader, addSummaryTable, checkPageBreak, getLastTableY, MARGIN, buildReportFilename,
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

interface StageRow { stage_name: string; total: string; count: number }
interface TechRow {
  technician_id: number
  technician_name: string
  total: string
  stages_completed: number
  revenue_attributed: string
}

export function GroupedTechnicianPayReportTab({ filters }: { filters: ReportFilterState }) {
  const [downloading, setDownloading] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["report-production-cost", filters],
    queryFn: async () => {
      const { data } = await api.get<{ by_stage: StageRow[]; by_technician: TechRow[]; grand_total: string }>(
        "/reports/production-cost/",
        { params: filterParams(filters) },
      )
      return data
    },
  })

  const byStage = data?.by_stage ?? []
  const byTech = data?.by_technician ?? []

  function handleDownload() {
    if (!data) return
    setDownloading(true)
    try {
      const pdf = initializePDF()
      const range = dateRangeLabel(filters.dateFrom, filters.dateTo)
      const COLOR = PDF_COLORS.finance.primary
      let y = addHeader(pdf, "Grouped Technician Pay Report", "Payroll", range)
      y = addSectionHeader(pdf, "Summary", y, COLOR)
      y = addSummaryTable(pdf, [["Grand total", formatCurrency(data.grand_total)]], y, COLOR)

      y = checkPageBreak(pdf, y)
      y = addSectionHeader(pdf, "By Stage", y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Stage", "Total paid", "Stages completed"]],
        body: byStage.map((s) => [s.stage_name, formatCurrency(s.total), String(s.count)]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
      })
      y = getLastTableY(pdf) + 15

      y = checkPageBreak(pdf, y)
      y = addSectionHeader(pdf, "By Technician — Revenue Contribution", y, COLOR)
      autoTable(pdf, {
        startY: y,
        head: [["Technician", "Revenue attributed", "Wages paid", "Stages completed"]],
        body: byTech.map((t) => [
          t.technician_name, formatCurrency(t.revenue_attributed), formatCurrency(t.total), String(t.stages_completed),
        ]),
        margin: { left: MARGIN, right: MARGIN },
        headStyles: { fillColor: COLOR, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 248, 252] },
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" } },
      })

      addFooter(pdf)
      pdf.save(buildReportFilename("grouped-technician-pay-report", { dateFrom: filters.dateFrom, dateTo: filters.dateTo }))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <ReportHeader
        icon={Users}
        title="Grouped Technician Pay"
        description="Pay totals grouped by stage and by technician, for comparing contribution across the workshop."
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
              { label: "Grand total paid", value: formatMoney(data.grand_total) },
              { label: "Stages", value: String(byStage.length) },
              { label: "Technicians", value: String(byTech.length) },
            ]} />
            <div>
              <h3 className="mb-2 text-sm font-medium">By stage</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stage</TableHead>
                      <TableHead className="text-right">Total paid</TableHead>
                      <TableHead className="text-right">Stages completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byStage.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">No completed stages in range.</TableCell></TableRow>
                    )}
                    {byStage.map((s) => (
                      <TableRow key={s.stage_name}>
                        <TableCell className="font-medium">{s.stage_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(s.total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {byStage.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-medium">Grand total</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{formatMoney(data.grand_total)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">By technician — revenue contribution</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Revenue attributed = full value of every order a technician worked a stage on. If more than one
                technician worked different stages of the same order, that order's value is counted for each of them —
                totals across technicians can exceed total order revenue.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Technician</TableHead>
                      <TableHead className="text-right">Revenue attributed</TableHead>
                      <TableHead className="text-right">Wages paid</TableHead>
                      <TableHead className="text-right">Stages completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byTech.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No completed stages in range.</TableCell></TableRow>
                    )}
                    {byTech.map((t) => (
                      <TableRow key={t.technician_id}>
                        <TableCell className="font-medium">{t.technician_name}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{formatMoney(t.revenue_attributed)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(t.total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.stages_completed}</TableCell>
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
