"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  type CatalogueProduct,
  type ShopCategory,
} from "@/lib/mock-data"
import { useBranch } from "@/components/shop/branch-store"
import { useCatalogue } from "@/components/shop/catalogue-store"
import { useQuotes } from "@/components/shop/quotes-store"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function NewQuoteDialog({
  product,
  open,
  onOpenChange,
  trigger,
}: {
  /** Optional catalogue product to pre-fill the reference range. */
  product?: CatalogueProduct
  open?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: React.ReactNode
}) {
  const { activeBranch } = useBranch()
  const { products: catalogue } = useCatalogue()
  const { createQuote } = useQuotes()

  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = open !== undefined
  const dialogOpen = isControlled ? open : internalOpen
  const setDialogOpen = (v: boolean) => {
    if (isControlled) onOpenChange?.(v)
    else setInternalOpen(v)
  }

  const [catalogueId, setCatalogueId] = useState(product?.id ?? "")
  const [customerName, setCustomerName] = useState("")
  const [contact, setContact] = useState("")
  const [size, setSize] = useState("")
  const [price, setPrice] = useState("")
  const [notes, setNotes] = useState("")

  // Keep the selected catalogue product in sync when opened from a card.
  useEffect(() => {
    if (dialogOpen && product) setCatalogueId(product.id)
  }, [dialogOpen, product])

  const selected = useMemo(
    () => catalogue.find((c) => c.id === catalogueId),
    [catalogue, catalogueId]
  )

  const quoted = Number(price)
  const hasValidPrice = price.trim() !== "" && !Number.isNaN(quoted) && quoted > 0
  const withinRange =
    selected && hasValidPrice
      ? quoted >= selected.minPrice && quoted <= selected.maxPrice
      : true

  function reset() {
    setCatalogueId(product?.id ?? "")
    setCustomerName("")
    setContact("")
    setSize("")
    setPrice("")
    setNotes("")
  }

  function handleSubmit() {
    if (!selected) {
      toast.error("Pick a catalogue product for the reference range.")
      return
    }
    if (!customerName.trim()) {
      toast.error("Add a customer name.")
      return
    }
    if (!hasValidPrice) {
      toast.error("Enter the bargained price.")
      return
    }

    const created = createQuote({
      branchId: activeBranch.id,
      customerName: customerName.trim(),
      contact: contact.trim(),
      productName: selected.name,
      catalogueId: selected.id,
      category: selected.category as ShopCategory,
      size: size.trim() || undefined,
      refMin: selected.minPrice,
      refMax: selected.maxPrice,
      quotedPrice: quoted,
      notes: notes.trim() || undefined,
    })

    if (created.withinRange) {
      toast.success(`Quote ${created.id} confirmed`, {
        description: `$${quoted.toLocaleString()} is within the reference range — no approval needed.`,
      })
    } else {
      toast.info(`Quote ${created.id} sent to the Director`, {
        description: `$${quoted.toLocaleString()} is outside the $${selected.minPrice.toLocaleString()}–$${selected.maxPrice.toLocaleString()} range.`,
      })
    }
    reset()
    setDialogOpen(false)
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {trigger}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New custom-piece quote</DialogTitle>
          <DialogDescription>
            Bargain a price for a bespoke build. Within the catalogue range you
            confirm it directly; outside it, the Director gives the verdict.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-product">Catalogue product</Label>
            <select
              id="quote-product"
              value={catalogueId}
              onChange={(e) => setCatalogueId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select a product…</option>
              {catalogue.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.category})
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Reference range: </span>
              <span className="font-medium tabular-nums">
                ${selected.minPrice.toLocaleString()} – $
                {selected.maxPrice.toLocaleString()}
              </span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-customer">Customer name</Label>
              <Input
                id="quote-customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Chidi Okafor"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-contact">Contact</Label>
              <Input
                id="quote-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Phone or email"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-size">Size / spec</Label>
              <Input
                id="quote-size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. 6-seater, 200cm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-price">Bargained price ($)</Label>
              <Input
                id="quote-price"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {selected && hasValidPrice && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                withinRange
                  ? "border-primary/20 bg-primary/5 text-primary"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              )}
            >
              {withinRange ? (
                <>
                  <CheckCircle2 className="size-4" />
                      Within the reference range — confirms immediately.
                </>
              ) : (
                <>
                  <TriangleAlert className="size-4" />
                  Outside range — needs Director approval.
                </>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-notes">Notes</Label>
            <Textarea
              id="quote-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Finish, materials, deadline, why the customer is bargaining…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            {selected && hasValidPrice && !withinRange
              ? "Send to Director"
              : "Create quote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
