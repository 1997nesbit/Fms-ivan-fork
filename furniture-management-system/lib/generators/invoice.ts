import autoTable from "jspdf-autotable"

import {
  initializePDF,
  formatCurrency,
  getLastTableY,
  MARGIN,
  PAGE_W,
  PAGE_H,
  COMPANY,
} from "../pdf-helpers"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoicePDFData {
  invoice_number: string
  status: string
  branch_name: string
  customer_name: string
  customer_phone: string
  customer_address: string
  issue_date: string
  due_date: string | null
  payment_terms: string
  notes: string
  line_items: Array<{
    description: string
    quantity: string
    unit_price: string
    total: string
  }>
  subtotal: string
}

// ---------------------------------------------------------------------------
// Constants — soft lavender/purple matching the invoice template
// ---------------------------------------------------------------------------

const [PR, PG, PB] = [180, 163, 207] as const   // purple band colour
const HEADER_H = 32
const FOOTER_H = 48
const TABLE_LEFT  = MARGIN
const TABLE_RIGHT = PAGE_W - MARGIN

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateInvoicePDF(data: InvoicePDFData): void {
  const pdf = initializePDF()
  const CONTENT_W = PAGE_W - MARGIN * 2

  // ── Purple header band ─────────────────────────────────────────────
  pdf.setFillColor(PR, PG, PB)
  pdf.rect(0, 0, PAGE_W, HEADER_H, "F")

  // "INVOICE" — large, black, right-aligned in band
  pdf.setFontSize(34)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(20, 20, 20)
  pdf.text("INVOICE", PAGE_W - MARGIN, HEADER_H - 7, { align: "right" })

  // ── Bill From / Bill To / Dates (4-column layout) ──────────────────
  const c1 = MARGIN
  const c2 = MARGIN + CONTENT_W * 0.33
  const c3 = MARGIN + CONTENT_W * 0.645
  const c4 = MARGIN + CONTENT_W * 0.825

  let y = HEADER_H + 13

  // Labels row
  pdf.setFontSize(7.5)
  pdf.setFont("helvetica", "normal")
  pdf.setTextColor(130, 130, 130)
  pdf.text("BILL FROM:", c1, y)
  pdf.text("BILL TO:",   c2, y)
  pdf.text("ISSUE DATE:", c3, y)
  pdf.text("DUE DATE:",  c4, y)

  y += 5

  // Name row
  pdf.setFontSize(10)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(20, 20, 20)
  pdf.text(COMPANY,                  c1, y)
  pdf.text(data.customer_name || "—", c2, y)

  // Date values on same row
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(9)
  pdf.setTextColor(40, 40, 40)
  pdf.text(fmtDate(data.issue_date), c3, y)
  pdf.text(fmtDate(data.due_date),   c4, y)

  y += 5

  // Sub-detail row — branch (left) + customer contact (right)
  pdf.setFontSize(9)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(20, 20, 20)
  pdf.text(data.branch_name, c1, y)

  let custY = y
  pdf.setFont("helvetica", "normal")
  pdf.setTextColor(40, 40, 40)
  if (data.customer_phone) {
    pdf.text(data.customer_phone, c2, custY)
    custY += 4.5
  }
  if (data.customer_address) {
    const addr = pdf.splitTextToSize(data.customer_address, CONTENT_W * 0.3) as string[]
    pdf.text(addr, c2, custY)
    custY += addr.length * 4.5
  }

  y = Math.max(y + 6, custY + 4, HEADER_H + 48)

  // ── Line items table — plain theme, bottom-border rows only ────────
  autoTable(pdf, {
    startY: y,
    head: [["Description", "Price", "QTY", "Total"]],
    body: data.line_items.map((li) => [
      li.description,
      formatCurrency(li.unit_price),
      li.quantity,
      formatCurrency(li.total),
    ]),
    margin: { left: MARGIN, right: MARGIN, bottom: FOOTER_H + 15 },
    theme: "plain",
    headStyles: {
      fillColor: [255, 255, 255] as [number, number, number],
      textColor:  [20,  20,  20] as [number, number, number],
      fontStyle: "bold",
      fontSize: 10,
    },
    styles: {
      fontSize: 10,
      cellPadding: { top: 5, bottom: 5, left: 3, right: 3 },
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: [30,  30,  30] as [number, number, number],
    },
    alternateRowStyles: { fillColor: [255, 255, 255] as [number, number, number] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 38 },
      2: { halign: "right", cellWidth: 18 },
      3: { halign: "right", cellWidth: 36, fontStyle: "bold" },
    },
    // Draw a horizontal rule at the bottom of each row (head = darker, body = light)
    didDrawCell: (hookData) => {
      if (hookData.column.index !== hookData.table.columns.length - 1) return
      const bottom = hookData.cell.y + hookData.cell.height
      if (hookData.section === "head") {
        pdf.setDrawColor(150, 150, 150)
        pdf.setLineWidth(0.5)
      } else {
        pdf.setDrawColor(210, 210, 210)
        pdf.setLineWidth(0.3)
      }
      pdf.line(TABLE_LEFT, bottom, TABLE_RIGHT, bottom)
    },
  })

  y = getLastTableY(pdf) + 8

  // ── Totals block — right-aligned, Subtotal / Tax / Total Due ───────
  const totX    = PAGE_W - MARGIN - 78
  const totValX = PAGE_W - MARGIN

  const drawTotRow = (label: string, value: string, bold: boolean, addLine: boolean) => {
    pdf.setFontSize(10)
    pdf.setTextColor(20, 20, 20)
    pdf.setFont("helvetica", bold ? "bold" : "normal")
    pdf.text(label, totX,    y)
    pdf.text(value, totValX, y, { align: "right" })
    if (addLine) {
      y += 2.5
      pdf.setDrawColor(200, 200, 200)
      pdf.setLineWidth(0.3)
      pdf.line(totX, y, totValX, y)
    }
    y += 5.5
  }

  drawTotRow("Subtotal",  formatCurrency(data.subtotal), false, true)
  drawTotRow("Tax",       "Tax-exempt",                  false, true)
  drawTotRow("Total Due", formatCurrency(data.subtotal), true,  false)

  // ── Purple footer band ─────────────────────────────────────────────
  const footerY = PAGE_H - FOOTER_H
  pdf.setFillColor(PR, PG, PB)
  pdf.rect(0, footerY, PAGE_W, FOOTER_H, "F")

  const fCol2 = PAGE_W / 2 + 6
  const fY    = footerY + 11

  pdf.setFontSize(10)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(20, 20, 20)
  pdf.text("Payment Terms:", MARGIN, fY)
  pdf.text("Notes:",         fCol2,  fY)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(9)
  pdf.setTextColor(30, 30, 30)
  if (data.payment_terms) {
    const lines = pdf.splitTextToSize(data.payment_terms, PAGE_W / 2 - MARGIN - 6) as string[]
    pdf.text(lines, MARGIN, fY + 7)
  }
  if (data.notes) {
    const lines = pdf.splitTextToSize(data.notes, PAGE_W / 2 - MARGIN - 6) as string[]
    pdf.text(lines, fCol2, fY + 7)
  }

  pdf.save(`${data.invoice_number}.pdf`)
}
