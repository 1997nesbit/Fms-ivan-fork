import autoTable from "jspdf-autotable"

import {
  initializePDF,
  formatCurrency,
  getLastTableY,
  MARGIN,
  PAGE_W,
  slugifyFilenamePart,
} from "../pdf-helpers"
import { LOGO_PNG_BASE64, LOGO_ASPECT } from "../assets/logo"

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
// Company constants — StyleMyspace Decor letterhead
// ---------------------------------------------------------------------------

const COMPANY_TITLE   = "STYLEMYSPACE DECOR"
const COMPANY_PHONE_1 = "0620109054"
const COMPANY_PHONE_2 = "0620109054"
const COMPANY_EMAIL   = "stylemyspacedecor49@gmail.com"
const COMPANY_ADDRESS = "Kayuni, Mbezi Juu, Dar es Salaam"

const BANKS = [
  { bank: "CRDB", account: "015C667352700", name: "STYLEMYSPACE DECOR" },
  { bank: "NMB",  account: "20310127415",   name: "STYLEMYSPACE DECOR" },
]

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

type RGB = [number, number, number]
const BLUE:       RGB = [29, 78, 216]
const BLACK:      RGB = [20, 20, 20]
const GRAY:       RGB = [120, 120, 120]
const LIGHT_GRAY: RGB = [205, 205, 205]
const TABLE_HEAD:  RGB = [91, 103, 143]
const BALANCE_BG:  RGB = [33, 33, 33]
const WHITE:       RGB = [255, 255, 255]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function fmtQty(q: string): string {
  const n = Number(q)
  return Number.isFinite(n) ? String(n) : q
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateInvoicePDF(data: InvoicePDFData): void {
  const pdf = initializePDF()
  const CONTENT_W = PAGE_W - MARGIN * 2

  const isPaid = data.status === "PAID"
  const paidAmount = isPaid ? data.subtotal : "0"
  const balanceDue = isPaid ? 0 : Number(data.subtotal)

  // ── Logo (top-left) ─────────────────────────────────────────────────
  const logoY = 14
  const logoW = 42
  const logoH = logoW / LOGO_ASPECT
  pdf.addImage(LOGO_PNG_BASE64, "PNG", MARGIN, logoY, logoW, logoH)

  // ── Company contact block (top-right, right-aligned) ────────────────
  let cy = 17
  pdf.setFontSize(8)
  pdf.setFont("helvetica", "normal")
  pdf.setTextColor(...GRAY)
  for (const line of [COMPANY_PHONE_1, COMPANY_PHONE_2, COMPANY_EMAIL, COMPANY_ADDRESS]) {
    pdf.text(line, PAGE_W - MARGIN, cy, { align: "right" })
    cy += 4.2
  }

  let y = Math.max(logoY + logoH, cy) + 6

  // ── Divider ──────────────────────────────────────────────────────────
  pdf.setDrawColor(...LIGHT_GRAY)
  pdf.setLineWidth(0.4)
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 11

  // ── Title row: company name / "INVOICE" ─────────────────────────────
  pdf.setFontSize(16)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(...BLACK)
  pdf.text(COMPANY_TITLE, MARGIN, y)
  pdf.text("INVOICE", PAGE_W - MARGIN, y, { align: "right" })
  y += 6

  pdf.setDrawColor(...LIGHT_GRAY)
  pdf.setLineWidth(0.4)
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 11

  // ── Bill To (left) / Invoice meta (right) ───────────────────────────
  const billToY = y

  pdf.setFontSize(8)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(...BLUE)
  pdf.text("BILL TO:", MARGIN, billToY)

  pdf.setFontSize(11)
  pdf.setTextColor(...BLACK)
  pdf.text(data.customer_name || "—", MARGIN + 20, billToY)

  const metaRows: [string, string][] = [
    ["NUMBER:",   data.invoice_number],
    ["DATE:",     fmtDate(data.issue_date)],
    ["DUE DATE:", fmtDate(data.due_date)],
  ]
  metaRows.forEach(([label, value], i) => {
    const ry = billToY + i * 5
    pdf.setFontSize(8)
    pdf.setFont("helvetica", "bold")
    pdf.setTextColor(...BLUE)
    pdf.text(label, PAGE_W - MARGIN - 26, ry, { align: "right" })
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(9)
    pdf.setTextColor(...BLACK)
    pdf.text(value, PAGE_W - MARGIN, ry, { align: "right" })
  })

  let afterBillY = billToY + 5
  if (data.customer_phone) {
    pdf.setFontSize(9)
    pdf.setFont("helvetica", "normal")
    pdf.setTextColor(...GRAY)
    pdf.text(data.customer_phone, MARGIN + 20, afterBillY)
    afterBillY += 4.5
  }

  y = Math.max(afterBillY, billToY + metaRows.length * 5) + 8

  // ── Line items table ─────────────────────────────────────────────────
  autoTable(pdf, {
    startY: y,
    head: [["Description", "Quantity", "Unit price", "Amount"]],
    body: data.line_items.map((li) => [
      li.description,
      fmtQty(li.quantity),
      formatCurrency(li.unit_price),
      formatCurrency(li.total),
    ]),
    margin: { left: MARGIN, right: MARGIN },
    headStyles: {
      fillColor: TABLE_HEAD,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 9.5,
    },
    styles: {
      fontSize: 9.5,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
      textColor: BLACK,
    },
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 26 },
      2: { halign: "right", cellWidth: 34 },
      3: { halign: "right", cellWidth: 34, fontStyle: "bold" },
    },
  })

  y = getLastTableY(pdf) + 10

  // ── Totals (right-aligned) ───────────────────────────────────────────
  const totLabelX = PAGE_W - MARGIN - 45
  const totValX   = PAGE_W - MARGIN
  const totalsTopY = y

  const drawTot = (label: string, value: string, bold: boolean) => {
    pdf.setFontSize(9.5)
    pdf.setFont("helvetica", bold ? "bold" : "normal")
    pdf.setTextColor(...BLACK)
    pdf.text(label, totLabelX, y, { align: "right" })
    pdf.text(value, totValX, y, { align: "right" })
    y += 5.5
  }
  drawTot("SUBTOTAL:", formatCurrency(data.subtotal), false)
  drawTot("TOTAL:",    formatCurrency(data.subtotal), true)
  drawTot("PAID:",     formatCurrency(paidAmount),    false)

  // ── Payment instructions (left column) ──────────────────────────────
  let payY = totalsTopY
  pdf.setFontSize(10)
  pdf.setFont("helvetica", "bold")
  pdf.setTextColor(...BLACK)
  pdf.text("Payment instructions", MARGIN, payY)
  payY += 5.5

  pdf.setFontSize(9)
  pdf.setFont("helvetica", "normal")
  BANKS.forEach((b, i) => {
    pdf.text(`${b.bank} ${b.account}`, MARGIN, payY)
    payY += 4.2
    pdf.text(`JINA ${b.name}`, MARGIN, payY)
    payY += 4.2
    if (i < BANKS.length - 1) payY += 3
  })

  y += 4

  // ── Balance due bar ──────────────────────────────────────────────────
  // Bar width must fit "BALANCE DUE" + the amount side by side with a gap
  // between them — measure both at their actual render size instead of a
  // fixed width, so a large total (e.g. TSh 12,900,000) can never overlap
  // the label.
  const barH = 10
  const balanceLabel = "BALANCE DUE"
  const balanceValue = formatCurrency(balanceDue)
  const innerPad = 4
  const minGap = 6

  pdf.setFontSize(11)
  pdf.setFont("helvetica", "bold")
  const labelW = pdf.getTextWidth(balanceLabel)
  const valueW = pdf.getTextWidth(balanceValue)

  const contentSpanForBar = PAGE_W - MARGIN - (totLabelX - 5)
  const minBarW = innerPad * 2 + labelW + minGap + valueW
  const barW = Math.max(minBarW, contentSpanForBar)
  const barX = PAGE_W - MARGIN - barW

  pdf.setFillColor(...BALANCE_BG)
  pdf.rect(barX, y, barW, barH, "F")
  pdf.setTextColor(...WHITE)
  pdf.text(balanceLabel, barX + innerPad, y + barH / 2 + 3)
  pdf.text(balanceValue, PAGE_W - MARGIN - innerPad, y + barH / 2 + 3, { align: "right" })

  y = Math.max(y + barH, payY) + 10

  // ── Optional extra payment terms / notes ────────────────────────────
  if (data.payment_terms) {
    pdf.setFontSize(8.5)
    pdf.setFont("helvetica", "italic")
    pdf.setTextColor(...GRAY)
    const lines = pdf.splitTextToSize(data.payment_terms, CONTENT_W) as string[]
    pdf.text(lines, MARGIN, y)
    y += lines.length * 4 + 3
  }
  if (data.notes) {
    pdf.setFontSize(8.5)
    pdf.setFont("helvetica", "italic")
    pdf.setTextColor(...GRAY)
    const lines = pdf.splitTextToSize(`Notes: ${data.notes}`, CONTENT_W) as string[]
    pdf.text(lines, MARGIN, y)
  }

  // e.g. "INV0087_moses-simon.pdf" — easy to find a customer's invoice by
  // filename alone, without opening it.
  const customerSlug = data.customer_name ? slugifyFilenamePart(data.customer_name) : ""
  pdf.save(customerSlug ? `${data.invoice_number}_${customerSlug}.pdf` : `${data.invoice_number}.pdf`)
}
