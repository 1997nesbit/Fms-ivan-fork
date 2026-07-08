import autoTable from "jspdf-autotable"

import { PDF_COLORS } from "../pdf-types"
import {
  initializePDF, formatCurrency, addHeader, addFooter,
  addSectionHeader, addSummaryTable, checkPageBreak, getLastTableY,
  MARGIN,
} from "../pdf-helpers"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CostBreakdownReportData {
  totalLabour: number
  pendingLabour: number
  paidLabour: number
  byOrder: Array<{
    reference: string
    stages: number
    labour: number
    pending: number
  }>
  payments: Array<{
    technician_name: string | null
    stage_name: string
    order_reference: string
    status: "PENDING" | "PAID"
    amount: number
    created_at: string
  }>
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const COLOR = PDF_COLORS.finance.primary

export function generateCostBreakdownPDF(data: CostBreakdownReportData): void {
  const pdf = initializePDF()
  let y = addHeader(pdf, "Production Cost Breakdown", "Finance", "All time")

  // --- Labour summary ---
  y = addSectionHeader(pdf, "Labour Summary", y, COLOR)
  y = addSummaryTable(pdf, [
    ["Total labour cost",      formatCurrency(data.totalLabour)],
    ["Already paid",           formatCurrency(data.paidLabour)],
    ["Pending payout",         formatCurrency(data.pendingLabour)],
    ["Total orders",           String(data.byOrder.length)],
    ["Total payment records",  String(data.payments.length)],
  ], y, COLOR)

  // --- Labour per order ---
  y = checkPageBreak(pdf, y)
  y = addSectionHeader(pdf, `Labour per Order (${data.byOrder.length} orders)`, y, COLOR)
  autoTable(pdf, {
    startY: y,
    head: [["Order", "Stages", "Total Labour", "Pending"]],
    body: data.byOrder.map((o) => [
      o.reference,
      String(o.stages),
      formatCurrency(o.labour),
      o.pending > 0 ? formatCurrency(o.pending) : "—",
    ]),
    margin: { left: MARGIN, right: MARGIN },
    headStyles: { fillColor: COLOR, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right", fontStyle: "bold" },
      3: { halign: "right" },
    },
  })
  y = getLastTableY(pdf) + 15

  // --- Detailed payment records ---
  y = checkPageBreak(pdf, y)
  y = addSectionHeader(pdf, `Payment Records (${data.payments.length} entries)`, y, COLOR)
  autoTable(pdf, {
    startY: y,
    head: [["Technician", "Stage", "Order", "Status", "Amount"]],
    body: data.payments.map((p) => [
      p.technician_name ?? "—",
      p.stage_name,
      p.order_reference,
      p.status,
      formatCurrency(p.amount),
    ]),
    margin: { left: MARGIN, right: MARGIN },
    headStyles: { fillColor: COLOR, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      3: { fontStyle: "bold" },
      4: { halign: "right", fontStyle: "bold" },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 3) {
        const status = hookData.cell.raw as string
        hookData.cell.styles.textColor =
          status === "PENDING"
            ? [180, 100, 0]   // amber
            : [22, 163, 74]   // green
      }
    },
  })

  addFooter(pdf)
  pdf.save("cost-breakdown-report.pdf")
}
