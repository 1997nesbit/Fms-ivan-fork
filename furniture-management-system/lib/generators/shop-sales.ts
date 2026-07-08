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

export interface ShopSalesReportData {
  scopeLabel: string
  dateRange: string
  totalSalesValue: number
  unitsSold: number
  unsoldValueRetail: number
  unsoldValueCost: number | null
  hasCostData: boolean
  sales: Array<{
    reference: string
    item_name: string
    item_sku: string
    branch_name: string
    sold_by_name: string
    sold_at: string
    sale_price: number
  }>
  perBranch: Array<{
    name: string
    value: number
    units: number
    available: number
    unsoldVal: number
  }>
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const COLOR = PDF_COLORS.sales.primary

export function generateShopSalesPDF(data: ShopSalesReportData): void {
  const pdf = initializePDF()
  const dateStr = data.dateRange || "All time"
  let y = addHeader(pdf, "Shop Sales Report", "Sales", `${data.scopeLabel} · ${dateStr}`)

  // --- Summary metrics ---
  y = addSectionHeader(pdf, "Sales Summary", y, COLOR)
  y = addSummaryTable(pdf, [
    ["Total sales value",     formatCurrency(data.totalSalesValue)],
    ["Units sold",            String(data.unitsSold)],
    ["Unsold stock (retail)", formatCurrency(data.unsoldValueRetail)],
    ["Unsold stock (cost)",   data.hasCostData ? formatCurrency(data.unsoldValueCost ?? 0) : "N/A"],
  ], y, COLOR)

  // --- Per-branch breakdown (only when showing all branches) ---
  if (data.perBranch.length > 1) {
    y = checkPageBreak(pdf, y)
    y = addSectionHeader(pdf, "Per-Branch Breakdown", y, COLOR)
    autoTable(pdf, {
      startY: y,
      head: [["Branch", "Sales Value", "Units Sold", "Available", "Unsold Value"]],
      body: data.perBranch.map((b) => [
        b.name,
        formatCurrency(b.value),
        String(b.units),
        String(b.available),
        formatCurrency(b.unsoldVal),
      ]),
      margin: { left: MARGIN, right: MARGIN },
      headStyles: { fillColor: COLOR, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
    })
    y = getLastTableY(pdf) + 15
  }

  // --- Sales ledger ---
  y = checkPageBreak(pdf, y)
  y = addSectionHeader(pdf, `Sales Ledger (${data.sales.length} transactions)`, y, COLOR)
  autoTable(pdf, {
    startY: y,
    head: [["Reference", "Item", "Branch", "Sold By", "Date", "Amount"]],
    body: data.sales.map((s) => [
      s.reference,
      s.item_name,
      s.branch_name,
      s.sold_by_name,
      new Date(s.sold_at).toLocaleDateString("en-GB"),
      formatCurrency(s.sale_price),
    ]),
    margin: { left: MARGIN, right: MARGIN },
    headStyles: { fillColor: COLOR, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      5: { halign: "right", fontStyle: "bold" },
    },
    foot: [[
      { content: "Total", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      { content: formatCurrency(data.totalSalesValue), styles: { halign: "right", fontStyle: "bold" } },
    ]],
    showFoot: "lastPage",
    footStyles: { fillColor: [240, 244, 248], textColor: [30, 58, 95] },
  })

  addFooter(pdf)
  pdf.save("shop-sales-report.pdf")
}
