"use client"

import { useState } from "react"
import { ShoppingCart } from "lucide-react"
import { toast } from "sonner"

import type { PaymentMethod, ShopItem } from "@/lib/mock-data"
import { useBranch } from "@/components/shop/branch-store"
import { useShowroom } from "@/components/shop/showroom-store"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PAYMENT_METHODS: PaymentMethod[] = [
  "Cash",
  "Card",
  "Bank Transfer",
  "Mobile Money",
]

const PAYMENT_ITEMS: Record<string, string> = {
  Cash: "Cash",
  Card: "Card",
  "Bank Transfer": "Bank Transfer",
  "Mobile Money": "Mobile Money",
}

export function SellCheckoutDialog({
  items,
  open,
  onOpenChange,
  onSold,
}: {
  items: ShopItem[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSold: () => void
}) {
  const { activeBranch } = useBranch()
  const { sellItems } = useShowroom()
  const [customerName, setCustomerName] = useState("")
  const [contact, setContact] = useState("")
  const [payment, setPayment] = useState<PaymentMethod>("Cash")

  const total = items.reduce((sum, i) => sum + i.price, 0)
  const isSet = items.length > 1

  function handleSell() {
    if (items.length === 0) return
    if (!customerName.trim()) {
      toast.error("Add a customer name to complete the sale.")
      return
    }
    sellItems({
      itemIds: items.map((i) => i.id),
      branchId: activeBranch.id,
      customerName: customerName.trim(),
      contact: contact.trim(),
      paymentMethod: payment,
    })
    toast.success(
      isSet
        ? `Set of ${items.length} sold for $${total.toLocaleString()}`
        : `${items[0].name} sold for $${total.toLocaleString()}`,
      { description: `Paid by ${payment} · ${customerName.trim()}` }
    )
    setCustomerName("")
    setContact("")
    setPayment("Cash")
    onSold()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="size-5" />
            {isSet ? `Sell as a set (${items.length} pieces)` : "Sell item"}
          </DialogTitle>
          <DialogDescription>
            {isSet
              ? "Grouped at checkout — the individual prices are added up."
              : "Sell this individual unit off the floor."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border">
            <ul className="divide-y">
              {items.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{i.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {i.id}
                    </span>
                  </div>
                  <span className="tabular-nums">
                    ${i.price.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2.5">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-semibold tabular-nums">
                ${total.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkout-customer">Customer name</Label>
              <Input
                id="checkout-customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Adaeze Nwankwo"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="checkout-contact">Contact</Label>
              <Input
                id="checkout-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Phone or email"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="checkout-payment">Payment method</Label>
            <Select
              items={PAYMENT_ITEMS}
              value={payment}
              onValueChange={(v) => setPayment((v ?? "Cash") as PaymentMethod)}
            >
              <SelectTrigger id="checkout-payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSell}>
            Complete sale · ${total.toLocaleString()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
