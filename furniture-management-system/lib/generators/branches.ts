import autoTable from "jspdf-autotable"

import { PDF_COLORS } from "../pdf-types"
import {
  initializePDF, formatCurrency, addHeader, addFooter,
  addSectionHeader, addSummaryTable, checkPageBreak,
  MARGIN, buildReportFilename,
} from "../pdf-helpers"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BranchStat {
  branch: { id: number; name: string; location: string }
  available: number
  sold: number
  totalItems: number
  salesRevenue: number
  salesCount: number
}

export interface BranchesReportData {
  totalBranches: number
  totalItems: number
  availableItems: number
  totalRevenue: number
  branchStats: BranchStat[]
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const COLOR = PDF_COLORS.performance.primary

export function generateBranchesPDF(data: BranchesReportData): void {
  const pdf = initializePDF()
  let y = addHeader(pdf, "Branch Performance Report", "Performance", "All time")

  // --- Overall summary ---
  y = addSectionHeader(pdf, "Overall Summary", y, COLOR)
  y = addSummaryTable(pdf, [
    ["Total branches",     String(data.totalBranches)],
    ["Total items",        String(data.totalItems)],
    ["Available items",    String(data.availableItems)],
    ["Sold items",         String(data.totalItems - data.availableItems)],
    ["Total sales revenue", formatCurrency(data.totalRevenue)],
  ], y, COLOR)

  // --- Branch breakdown table ---
  y = checkPageBreak(pdf, y)
  y = addSectionHeader(pdf, `Branch Breakdown (${data.branchStats.length} branches)`, y, COLOR)
  autoTable(pdf, {
    startY: y,
    head: [["Branch", "Location", "Sales Revenue", "Units Sold", "Available", "Total Items"]],
    body: data.branchStats.map((b) => [
      b.branch.name,
      b.branch.location,
      formatCurrency(b.salesRevenue),
      String(b.salesCount),
      String(b.available),
      String(b.totalItems),
    ]),
    margin: { left: MARGIN, right: MARGIN },
    headStyles: { fillColor: COLOR, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      2: { halign: "right", fontStyle: "bold" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  })

  addFooter(pdf)
  pdf.save(buildReportFilename("branches-report"))
}
