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

export interface RevenueReportData {
  totalRevenue: number
  workshopRevenue: number
  showroomRevenue: number
  dispatchedOrders: Array<{
    reference_number: string
    customer_name: string
    item_description: string
    confirmed_price: string | null
    quoted_price: string | null
    created_at: string
  }>
  sales: Array<{
    reference: string
    item_name: string
    item_sku: string
    branch_name: string
    sold_by_name: string
    sold_at: string
    sale_price: string
  }>
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const COLOR = PDF_COLORS.finance.primary

export function generateRevenuePDF(data: RevenueReportData): void {
  const pdf = initializePDF()
  let y = addHeader(pdf, "Revenue Report", "Finance", "All time")

  // --- Revenue summary ---
  y = addSectionHeader(pdf, "Revenue Summary", y, COLOR)
  y = addSummaryTable(pdf, [
    ["Total revenue",               formatCurrency(data.totalRevenue)],
    ["Workshop order revenue",      formatCurrency(data.workshopRevenue)],
    ["Showroom sales revenue",      formatCurrency(data.showroomRevenue)],
    ["Dispatched workshop orders",  String(data.dispatchedOrders.length)],
    ["Showroom transactions",       String(data.sales.length)],
  ], y, COLOR)

  // --- Workshop orders ---
  y = checkPageBreak(pdf, y)
  y = addSectionHeader(pdf, `Workshop Orders (${data.dispatchedOrders.length} dispatched)`, y, COLOR)
  autoTable(pdf, {
    startY: y,
    head: [["Order", "Customer", "Item", "Date", "Revenue"]],
    body: data.dispatchedOrders.map((o) => [
      o.reference_number,
      o.customer_name,
      o.item_description.length > 42
        ? o.item_description.slice(0, 42) + "…"
        : o.item_description,
      new Date(o.created_at).toLocaleDateString("en-GB"),
      formatCurrency(Number(o.confirmed_price ?? o.quoted_price ?? 0)),
    ]),
    margin: { left: MARGIN, right: MARGIN },
    headStyles: { fillColor: COLOR, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: {
      4: { halign: "right", fontStyle: "bold" },
    },
    foot: [[
      { content: "Total", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
      {
        content: formatCurrency(data.workshopRevenue),
        styles: { halign: "right", fontStyle: "bold" },
      },
    ]],
    showFoot: "lastPage",
    footStyles: { fillColor: [240, 244, 248], textColor: [30, 58, 95] },
  })
  y = getLastTableY(pdf) + 15

  // --- Showroom sales ---
  if (data.sales.length > 0) {
    y = checkPageBreak(pdf, y)
    y = addSectionHeader(pdf, `Showroom Sales (${data.sales.length} transactions)`, y, COLOR)
    autoTable(pdf, {
      startY: y,
      head: [["Reference", "Item", "Branch", "Sold By", "Date", "Amount"]],
      body: data.sales.map((s) => [
        s.reference,
        s.item_name,
        s.branch_name,
        s.sold_by_name,
        new Date(s.sold_at).toLocaleDateString("en-GB"),
        formatCurrency(Number(s.sale_price)),
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
        {
          content: formatCurrency(data.showroomRevenue),
          styles: { halign: "right", fontStyle: "bold" },
        },
      ]],
      showFoot: "lastPage",
      footStyles: { fillColor: [240, 244, 248], textColor: [30, 58, 95] },
    })
  }

  addFooter(pdf)
  pdf.save("revenue-report.pdf")
}
