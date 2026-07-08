import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

import type { PDFColor } from "./pdf-types"
import { PDF_COLORS } from "./pdf-types"

// ---------------------------------------------------------------------------
// Page constants
// ---------------------------------------------------------------------------

export const PAGE_W  = 210   // A4 width  mm
export const PAGE_H  = 297   // A4 height mm
export const MARGIN  = 20    // left / right margin mm
export const COMPANY = "Style My Space"

// ---------------------------------------------------------------------------
// initializePDF
// ---------------------------------------------------------------------------

export function initializePDF(): jsPDF {
  return new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
}

// ---------------------------------------------------------------------------
// formatCurrency — "TSh 12,500"
// ---------------------------------------------------------------------------

export function formatCurrency(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0)
  return `TSh ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

// ---------------------------------------------------------------------------
// addHeader — branded top section, returns y after the divider line
// ---------------------------------------------------------------------------

export function addHeader(
  pdf: jsPDF,
  title: string,
  category: string,
  dateRange: string,
): number {
  const [pr, pg, pb] = PDF_COLORS.primary

  // Dark navy header band
  pdf.setFillColor(pr, pg, pb)
  pdf.rect(0, 0, PAGE_W, 16, "F")

  // Company name in band
  pdf.setFontSize(11)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(255, 255, 255)
  pdf.text(COMPANY, MARGIN, 10.5)

  // "REPORT" label on right
  pdf.setFontSize(7.5)
  pdf.setFont("helvetica", "normal")
  pdf.setTextColor(185, 210, 240)
  pdf.text("REPORT", PAGE_W - MARGIN, 10.5, { align: "right" })

  // Report title below the band
  pdf.setFontSize(15)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(pr, pg, pb)
  pdf.text(title, MARGIN, 27)

  // Metadata block
  const now = new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
  const [nr, ng, nb] = PDF_COLORS.neutral
  pdf.setFontSize(8.5)
  pdf.setFont("helvetica", "normal")
  pdf.setTextColor(nr, ng, nb)
  pdf.text(`Generated on: ${now}`,       MARGIN, 35)
  pdf.text(`Report Category: ${category}`, MARGIN, 40)
  pdf.text(`Date Range: ${dateRange}`,   MARGIN, 45)

  // Thin divider
  pdf.setDrawColor(pr, pg, pb)
  pdf.setLineWidth(0.4)
  pdf.line(MARGIN, 50, PAGE_W - MARGIN, 50)

  return 59   // y to start content
}

// ---------------------------------------------------------------------------
// addFooter — "Page N of M" stamped on every page after content is done
// ---------------------------------------------------------------------------

export function addFooter(pdf: jsPDF): void {
  const pageCount = pdf.getNumberOfPages()
  const [r, g, b] = PDF_COLORS.neutral
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i)
    pdf.setFontSize(7.5)
    pdf.setFont("helvetica", "normal")
    pdf.setTextColor(r, g, b)
    pdf.text(`${COMPANY} — Confidential Report`, MARGIN, PAGE_H - 8)
    pdf.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" })
  }
}

// ---------------------------------------------------------------------------
// addSectionHeader — coloured bold label, returns y + 10
// ---------------------------------------------------------------------------

export function addSectionHeader(
  pdf: jsPDF,
  title: string,
  y: number,
  color: PDFColor = PDF_COLORS.primary,
): number {
  const [r, g, b] = color
  pdf.setFontSize(11.5)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(r, g, b)
  pdf.text(title, MARGIN, y)
  return y + 9
}

// ---------------------------------------------------------------------------
// addSummaryTable — narrow 2-col Metric | Value table, returns y after table
// ---------------------------------------------------------------------------

export function addSummaryTable(
  pdf: jsPDF,
  rows: Array<[string, string]>,
  y: number,
  color: PDFColor = PDF_COLORS.primary,
): number {
  const [r, g, b] = color
  autoTable(pdf, {
    startY: y,
    head: [["Metric", "Value"]],
    body: rows,
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: 120,
    headStyles: { fillColor: [r, g, b], fontStyle: "bold", fontSize: 10 },
    alternateRowStyles: { fillColor: [245, 248, 252] },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 1: { fontStyle: "bold" } },
  })
  return getLastTableY(pdf) + 15
}

// ---------------------------------------------------------------------------
// checkPageBreak — adds a new page if y is too close to the bottom
// ---------------------------------------------------------------------------

export function checkPageBreak(
  pdf: jsPDF,
  y: number,
  threshold: number = PAGE_H - 45,
): number {
  if (y > threshold) {
    pdf.addPage()
    return 20
  }
  return y
}

// ---------------------------------------------------------------------------
// getLastTableY — reads jspdf-autotable's stored finalY
// ---------------------------------------------------------------------------

export function getLastTableY(
  pdf: jsPDF,
  offset = 0,
  fallback = 20,
): number {
  const lastTable = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  return (lastTable?.finalY ?? fallback) + offset
}

// ---------------------------------------------------------------------------
// addAnalysisHeader — smaller coloured label for insight sections
// ---------------------------------------------------------------------------

export function addAnalysisHeader(
  pdf: jsPDF,
  title: string,
  y: number,
  color: PDFColor = PDF_COLORS.success,
): number {
  const [r, g, b] = color
  pdf.setFontSize(10.5)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(r, g, b)
  pdf.text(title, MARGIN, y)
  return y + 8
}

// ---------------------------------------------------------------------------
// addInsightText — word-wrapped 9pt body text
// ---------------------------------------------------------------------------

export function addInsightText(
  pdf: jsPDF,
  text: string,
  y: number,
  color: PDFColor = PDF_COLORS.neutral,
): number {
  const [r, g, b] = color
  pdf.setFontSize(9)
  pdf.setFont("helvetica", "normal")
  pdf.setTextColor(r, g, b)
  const lines = pdf.splitTextToSize(text, PAGE_W - MARGIN * 2) as string[]
  pdf.text(lines, MARGIN, y)
  return y + lines.length * 5
}
