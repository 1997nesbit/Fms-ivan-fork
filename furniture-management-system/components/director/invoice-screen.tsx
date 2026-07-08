"use client"

import { useMemo, useRef, useState } from "react"
import { CheckCircle2, Download, FileText, Link2, Loader2, Plus, Search, X } from "lucide-react"

import { generateInvoicePDF } from "@/lib/generators/invoice"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Field, FieldLabel } from "@/components/ui/field"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItem {
  id: number
  description: string
  quantity: string
  unit_price: string
  total: string
}

interface Invoice {
  id: number
  invoice_number: string
  order_id: number | null
  branch_id: number
  branch_name: string
  customer_name: string
  customer_phone: string
  customer_address: string
  issue_date: string
  due_date: string | null
  payment_terms: string
  notes: string
  status: "DRAFT" | "ISSUED" | "PAID"
  line_items: LineItem[]
  subtotal: string
  created_by: string
  created_at: string
}

interface Branch {
  id: number
  name: string
  location: string
}

interface OrderSummary {
  id: number
  reference_number: string
  customer_name: string
  customer_phone: string
  item_description: string
  confirmed_price: string | null
  quoted_price: string | null
  status: string
  branch_id: number
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING:            "Pending",
  PRICE_REVIEW:       "Price review",
  OPS_QUEUE:          "Ops queue",
  IN_PRODUCTION:      "In production",
  WORKSHOP_COMPLETE:  "Workshop complete",
  DISPATCHED:         "Dispatched",
  CANCELLED:          "Cancelled",
}

const ORDER_STATUS_CLASS: Record<string, string> = {
  DISPATCHED:         "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
  WORKSHOP_COMPLETE:  "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  IN_PRODUCTION:      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  OPS_QUEUE:          "border-muted-foreground/30 text-muted-foreground",
  PRICE_REVIEW:       "border-muted-foreground/30 text-muted-foreground",
  PENDING:            "border-muted-foreground/30 text-muted-foreground",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
})

function formatMoney(v: number | string) {
  return currency.format(Number(v))
}

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { dateStyle: "medium" })
}

const STATUS_STYLES: Record<Invoice["status"], string> = {
  DRAFT:  "border-muted-foreground/30 text-muted-foreground",
  ISSUED: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  PAID:   "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
}


// ---------------------------------------------------------------------------
// Create Invoice dialog
// ---------------------------------------------------------------------------

interface DraftLine {
  description: string
  quantity: string
  unit_price: string
}

function OrderPicker({
  linkedOrder,
  onSelect,
  onClear,
  open: dialogOpen,
}: {
  linkedOrder: OrderSummary | null
  onSelect: (o: OrderSummary) => void
  onClear: () => void
  open: boolean
}) {
  const [search, setSearch] = useState("")
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: allOrders = [], isLoading } = useQuery<OrderSummary[]>({
    queryKey: ["orders-for-invoice"],
    queryFn: async () => {
      const { data } = await api.get<OrderSummary[]>("/orders/")
      return (data as OrderSummary[]).filter((o) => o.status !== "CANCELLED")
    },
    enabled: dialogOpen,
    staleTime: 60_000,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return allOrders.slice(0, 8)
    return allOrders
      .filter(
        (o) =>
          o.reference_number.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [allOrders, search])

  if (linkedOrder) {
    const price = linkedOrder.confirmed_price ?? linkedOrder.quoted_price
    return (
      <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{linkedOrder.reference_number}</span>
            <Badge
              variant="outline"
              className={cn("text-xs", ORDER_STATUS_CLASS[linkedOrder.status])}
            >
              {ORDER_STATUS_LABEL[linkedOrder.status] ?? linkedOrder.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground truncate">{linkedOrder.customer_name}</p>
          {price && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {currency.format(Number(price))}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Unlink order"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          className="pl-9 pr-4"
          placeholder="Search by order # or customer name…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true) }}
          onFocus={() => setDropdownOpen(true)}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {dropdownOpen && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          {filtered.map((order) => {
            const price = order.confirmed_price ?? order.quoted_price
            return (
              <button
                key={order.id}
                type="button"
                onMouseDown={() => {
                  onSelect(order)
                  setSearch("")
                  setDropdownOpen(false)
                }}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors border-b border-border last:border-0"
              >
                <Link2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-medium">{order.reference_number}</span>
                    <Badge
                      variant="outline"
                      className={cn("text-xs py-0", ORDER_STATUS_CLASS[order.status])}
                    >
                      {ORDER_STATUS_LABEL[order.status] ?? order.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-muted-foreground truncate">{order.customer_name}</span>
                    {price && (
                      <span className="shrink-0 ml-2 tabular-nums text-muted-foreground">
                        {currency.format(Number(price))}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {dropdownOpen && !isLoading && filtered.length === 0 && search.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover px-4 py-3 text-sm text-muted-foreground shadow-lg">
          No orders match &ldquo;{search}&rdquo;
        </div>
      )}
    </div>
  )
}

function CreateInvoiceDialog({
  open,
  onOpenChange,
  branches,
  defaultBranchId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  branches: Branch[]
  defaultBranchId: number | null
}) {
  const qc = useQueryClient()

  const [linkedOrder, setLinkedOrder] = useState<OrderSummary | null>(null)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customerAddress, setCustomerAddress] = useState("")
  const [branchId, setBranchId] = useState<number | "">(defaultBranchId ?? "")
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState("")
  const [paymentTerms, setPaymentTerms] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([
    { description: "", quantity: "1", unit_price: "" },
  ])

  function handleSelectOrder(order: OrderSummary) {
    setLinkedOrder(order)
    setCustomerName(order.customer_name)
    setCustomerPhone(order.customer_phone)
    setBranchId(order.branch_id)
    const price = order.confirmed_price ?? order.quoted_price ?? ""
    const desc = order.item_description.split("\n")[0].slice(0, 200)
    setLines([{ description: desc, quantity: "1", unit_price: price }])
  }

  function handleClearOrder() {
    setLinkedOrder(null)
    setCustomerName("")
    setCustomerPhone("")
    setBranchId(defaultBranchId ?? "")
    setLines([{ description: "", quantity: "1", unit_price: "" }])
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/reports/invoices/", {
        ...(linkedOrder ? { order_id: linkedOrder.id } : {}),
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: customerAddress,
        branch_id: branchId,
        issue_date: issueDate,
        due_date: dueDate || null,
        payment_terms: paymentTerms,
        notes,
        line_items: lines.map((l) => ({
          description: l.description,
          quantity: l.quantity || "1",
          unit_price: l.unit_price || "0",
        })),
      })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("Invoice created.")
      onOpenChange(false)
      resetForm()
    },
    onError: () => toast.error("Failed to create invoice."),
  })

  function resetForm() {
    setLinkedOrder(null)
    setCustomerName("")
    setCustomerPhone("")
    setCustomerAddress("")
    setBranchId(defaultBranchId ?? "")
    setIssueDate(new Date().toISOString().slice(0, 10))
    setDueDate("")
    setPaymentTerms("")
    setNotes("")
    setLines([{ description: "", quantity: "1", unit_price: "" }])
  }

  function updateLine(idx: number, key: keyof DraftLine, val: string) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: val } : l)))
  }

  function addLine() {
    setLines((prev) => [...prev, { description: "", quantity: "1", unit_price: "" }])
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx))
  }

  const subtotal = lines.reduce(
    (s, l) => s + (Number(l.quantity) || 1) * (Number(l.unit_price) || 0),
    0,
  )

  const canSubmit =
    customerName.trim().length > 0 &&
    branchId !== "" &&
    issueDate.length > 0 &&
    lines.length > 0 &&
    lines.some((l) => l.description.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">

          {/* ── Order link ── */}
          <div>
            <Label className="mb-1.5 block text-sm font-medium">
              Link to order <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <OrderPicker
              linkedOrder={linkedOrder}
              onSelect={handleSelectOrder}
              onClear={handleClearOrder}
              open={open}
            />
            {!linkedOrder && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Select a custom order to pre-fill customer details and line items, or leave blank for a standalone invoice.
              </p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* ── Customer details ── */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Bill to
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="inv-cname">Customer name *</FieldLabel>
                <Input
                  id="inv-cname"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Full name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="inv-phone">Phone</FieldLabel>
                <Input
                  id="inv-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+255 7xx xxx xxx"
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="inv-addr">Address</FieldLabel>
              <Input
                id="inv-addr"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Street, city…"
              />
            </Field>
          </div>

          {/* ── Invoice meta ── */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field>
              <FieldLabel>Branch *</FieldLabel>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={String(branchId)}
                onChange={(e) => setBranchId(Number(e.target.value))}
              >
                <option value="">Select branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-issue">Issue date *</FieldLabel>
              <Input id="inv-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-due">Due date</FieldLabel>
              <Input id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>

          {/* ── Line items ── */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Items charged
            </p>

            <div className="flex flex-col gap-2">
              {lines.map((l, i) => {
                const lineTotal = (Number(l.quantity) || 1) * (Number(l.unit_price) || 0)
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col gap-3"
                  >
                    {/* Item header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Item {i + 1}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        >
                          <X className="size-3" />
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Description */}
                    <Field>
                      <FieldLabel htmlFor={`line-desc-${i}`}>Description</FieldLabel>
                      <Textarea
                        id={`line-desc-${i}`}
                        rows={2}
                        value={l.description}
                        onChange={(e) => updateLine(i, "description", e.target.value)}
                        placeholder="e.g. Custom mahogany dining table, 6-seater"
                        className="resize-none"
                      />
                    </Field>

                    {/* Qty + Unit price + Total */}
                    <div className="grid grid-cols-3 gap-3">
                      <Field>
                        <FieldLabel htmlFor={`line-qty-${i}`}>Quantity</FieldLabel>
                        <Input
                          id={`line-qty-${i}`}
                          type="number"
                          min="1"
                          step="1"
                          value={l.quantity}
                          onChange={(e) => updateLine(i, "quantity", e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`line-price-${i}`}>Unit price (TZS)</FieldLabel>
                        <Input
                          id={`line-price-${i}`}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0"
                          value={l.unit_price}
                          onChange={(e) => updateLine(i, "unit_price", e.target.value)}
                        />
                      </Field>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium">Line total</span>
                        <div className="flex h-9 items-center rounded-md bg-muted px-3 text-sm font-semibold tabular-nums">
                          {currency.format(lineTotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addLine}>
                <Plus className="size-3.5" />
                Add item
              </Button>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2">
                <span className="text-sm font-medium text-muted-foreground">Total Due</span>
                <span className="text-base font-bold tabular-nums">{currency.format(subtotal)}</span>
              </div>
            </div>
          </div>

          {/* ── Terms & notes ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="inv-terms">Payment terms</FieldLabel>
              <Textarea
                id="inv-terms"
                rows={2}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. Net 14 days"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-notes">Notes</FieldLabel>
              <Textarea
                id="inv-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any extra info for the customer…"
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false) }}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {mutation.isPending ? "Creating…" : "Create invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Invoice detail / print dialog
// ---------------------------------------------------------------------------

function InvoiceDetailDialog({
  inv,
  open,
  onOpenChange,
}: {
  inv: Invoice | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const qc = useQueryClient()

  const statusMutation = useMutation({
    mutationFn: async (status: Invoice["status"]) => {
      await api.patch(`/reports/invoices/${inv!.id}/`, { status })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("Invoice status updated.")
    },
  })

  function handleDownload() {
    if (!inv) return
    generateInvoicePDF({
      invoice_number:   inv.invoice_number,
      status:           inv.status,
      branch_name:      inv.branch_name,
      customer_name:    inv.customer_name,
      customer_phone:   inv.customer_phone,
      customer_address: inv.customer_address,
      issue_date:       inv.issue_date,
      due_date:         inv.due_date,
      payment_terms:    inv.payment_terms,
      notes:            inv.notes,
      line_items:       inv.line_items,
      subtotal:         inv.subtotal,
    })
  }

  if (!inv) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl print:hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{inv.invoice_number}</DialogTitle>
            <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[inv.status])}>
              {inv.status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Bill to</p>
              <p className="font-medium">{inv.customer_name}</p>
              {inv.customer_phone && <p className="text-muted-foreground">{inv.customer_phone}</p>}
              {inv.customer_address && <p className="text-muted-foreground">{inv.customer_address}</p>}
            </div>
            <div className="space-y-1 text-right">
              <div><span className="text-muted-foreground">Branch: </span>{inv.branch_name}</div>
              <div><span className="text-muted-foreground">Issue date: </span>{formatDate(inv.issue_date)}</div>
              {inv.due_date && <div><span className="text-muted-foreground">Due: </span>{formatDate(inv.due_date)}</div>}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">QTY</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {inv.line_items.map((li) => (
                  <tr key={li.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{li.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{li.quantity}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(li.unit_price)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(li.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/20">
                  <td colSpan={3} className="px-3 py-2 text-right font-bold">Total Due</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{formatMoney(inv.subtotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {(inv.payment_terms || inv.notes) && (
            <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              {inv.payment_terms && <div><p className="font-medium text-foreground">Payment Terms</p><p>{inv.payment_terms}</p></div>}
              {inv.notes && <div><p className="font-medium text-foreground">Notes</p><p>{inv.notes}</p></div>}
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {inv.status === "DRAFT" && (
            <Button variant="outline" size="sm" onClick={() => statusMutation.mutate("ISSUED")} disabled={statusMutation.isPending}>
              Mark as Issued
            </Button>
          )}
          {inv.status === "ISSUED" && (
            <Button variant="outline" size="sm" onClick={() => statusMutation.mutate("PAID")} disabled={statusMutation.isPending}>
              Mark as Paid
            </Button>
          )}
          <Button size="sm" onClick={handleDownload} className="gap-1.5">
            <Download className="size-3.5" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>

    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main InvoiceScreen
// ---------------------------------------------------------------------------

export function InvoiceScreen() {
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Branch[] }>("/branches/")
      return data.results
    },
    staleTime: 60_000,
  })

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data } = await api.get<Invoice[]>("/reports/invoices/")
      return data
    },
    staleTime: 30_000,
  })

  function openDetail(inv: Invoice) {
    setSelectedInv(inv)
    setDetailOpen(true)
  }

  const defaultBranchId = branches.length === 1 ? branches[0].id : null

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileText className="size-5" />
          </span>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight text-balance">Invoices</h2>
            <p className="text-sm text-muted-foreground">
              Generate and manage customer invoices for orders and showroom sales.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5 shrink-0">
          <Plus className="size-4" />
          New invoice
        </Button>
      </div>

      {/* Invoice list */}
      <Card>
        <CardContent className="px-0 py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Issue date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                )}
                {!isLoading && invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No invoices yet. Click <strong>New invoice</strong> to create one.
                    </TableCell>
                  </TableRow>
                )}
                {invoices.map((inv) => (
                  <TableRow
                    key={inv.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetail(inv)}
                  >
                    <TableCell className="font-medium tabular-nums">{inv.invoice_number}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{inv.customer_name}</span>
                        {inv.customer_phone && <span className="text-xs text-muted-foreground">{inv.customer_phone}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{inv.branch_name}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(inv.issue_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-xs", STATUS_STYLES[inv.status])}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatMoney(inv.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        branches={branches}
        defaultBranchId={defaultBranchId}
      />

      <InvoiceDetailDialog
        inv={selectedInv}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}
