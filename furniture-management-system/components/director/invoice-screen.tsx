"use client"

import { useRef, useState } from "react"
import { FileText, Plus, Printer, X } from "lucide-react"
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
// Print view (rendered off-screen, captured by window.print)
// ---------------------------------------------------------------------------

function PrintInvoice({ inv, companyName }: { inv: Invoice; companyName: string }) {
  const subtotal = Number(inv.subtotal)

  return (
    <div id="invoice-print-area" className="hidden print:block p-8 text-sm font-sans text-gray-900">
      {/* Header band */}
      <div className="mb-6 flex items-start justify-between rounded-t-lg bg-[#4F46E5] px-6 py-5 text-white">
        <div>
          <p className="text-xs uppercase tracking-widest opacity-70">Invoice</p>
          <p className="mt-1 text-2xl font-bold">{inv.invoice_number}</p>
        </div>
        <div className="text-right text-xs opacity-80">
          <p>{companyName}</p>
          <p>{inv.branch_name}</p>
        </div>
      </div>

      {/* Bill from / to + dates */}
      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-gray-400">Bill From</p>
          <p className="font-semibold">{companyName}</p>
          <p className="text-gray-500">{inv.branch_name}</p>
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-gray-400">Bill To</p>
          <p className="font-semibold">{inv.customer_name}</p>
          {inv.customer_phone && <p className="text-gray-500">{inv.customer_phone}</p>}
          {inv.customer_address && <p className="text-gray-500">{inv.customer_address}</p>}
        </div>
      </div>
      <div className="mb-6 flex gap-8 text-xs text-gray-500">
        <div><span className="font-medium text-gray-700">Issue Date</span><br />{formatDate(inv.issue_date)}</div>
        {inv.due_date && <div><span className="font-medium text-gray-700">Due Date</span><br />{formatDate(inv.due_date)}</div>}
      </div>

      {/* Line items table */}
      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-gray-200 text-left text-xs uppercase tracking-wider text-gray-400">
            <th className="pb-2 pr-4">Description</th>
            <th className="pb-2 pr-4 text-right">QTY</th>
            <th className="pb-2 pr-4 text-right">Price</th>
            <th className="pb-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {inv.line_items.map((li) => (
            <tr key={li.id} className="border-b border-gray-100">
              <td className="py-2 pr-4">{li.description}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{li.quantity}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(li.unit_price)}</td>
              <td className="py-2 text-right tabular-nums font-medium">{formatMoney(li.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-56 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="tabular-nums">{formatMoney(subtotal)}</span></div>
          <div className="flex justify-between font-bold border-t border-gray-300 pt-1 text-base">
            <span>Total Due</span><span className="tabular-nums">{formatMoney(subtotal)}</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      {(inv.payment_terms || inv.notes) && (
        <div className="mt-8 grid grid-cols-2 gap-6 rounded-b-lg bg-gray-50 px-6 py-4 text-xs text-gray-500">
          {inv.payment_terms && <div><p className="font-semibold text-gray-700">Payment Terms</p><p className="mt-0.5">{inv.payment_terms}</p></div>}
          {inv.notes && <div><p className="font-semibold text-gray-700">Notes</p><p className="mt-0.5">{inv.notes}</p></div>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create Invoice dialog
// ---------------------------------------------------------------------------

interface DraftLine {
  description: string
  quantity: string
  unit_price: string
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

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/reports/invoices/", {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Bill to */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="inv-cname">Customer name *</FieldLabel>
              <Input id="inv-cname" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-phone">Phone</FieldLabel>
              <Input id="inv-phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="inv-addr">Customer address</FieldLabel>
            <Input id="inv-addr" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
          </Field>

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

          {/* Line items */}
          <div className="flex flex-col gap-2">
            <Label>Line items</Label>
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Description</th>
                    <th className="w-20 px-3 py-2 text-right font-medium text-muted-foreground">QTY</th>
                    <th className="w-32 px-3 py-2 text-right font-medium text-muted-foreground">Unit price</th>
                    <th className="w-32 px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const lineTotal = (Number(l.quantity) || 1) * (Number(l.unit_price) || 0)
                    return (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 border-0 bg-transparent px-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                            placeholder="Description"
                            value={l.description}
                            onChange={(e) => updateLine(i, "description", e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 w-full border-0 bg-transparent px-1 text-right focus-visible:ring-0 focus-visible:ring-offset-0"
                            type="number"
                            min="1"
                            step="0.01"
                            value={l.quantity}
                            onChange={(e) => updateLine(i, "quantity", e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            className="h-8 w-full border-0 bg-transparent px-1 text-right focus-visible:ring-0 focus-visible:ring-offset-0"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={l.unit_price}
                            onChange={(e) => updateLine(i, "unit_price", e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {currency.format(lineTotal)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(i)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <X className="size-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td colSpan={3} className="px-3 py-2 text-right text-sm font-medium">Total Due</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{currency.format(subtotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <Button type="button" variant="outline" size="sm" className="self-start gap-1.5" onClick={addLine}>
              <Plus className="size-3.5" />
              Add line
            </Button>
          </div>

          {/* Notes / Terms */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="inv-terms">Payment terms</FieldLabel>
              <Textarea id="inv-terms" rows={2} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30 days" />
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-notes">Notes</FieldLabel>
              <Textarea id="inv-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
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

  function handlePrint() {
    window.print()
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
          <Button size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="size-3.5" />
            Print / PDF
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Print-only view (hidden on screen) */}
      <PrintInvoice inv={inv} companyName="Style My Space" />
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
