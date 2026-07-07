"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStock } from "@/components/stock-keeper/stock-store"
import type { InventoryCategory } from "@/lib/mock-data"

const CATEGORIES: InventoryCategory[] = [
  "Wood",
  "Hardware",
  "Upholstery",
  "Finishing",
  "Adhesive",
]

export function AddItemDialog() {
  const { addItem } = useStock()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [category, setCategory] = useState<InventoryCategory>("Wood")
  const [unit, setUnit] = useState("")
  const [quantity, setQuantity] = useState("")
  const [reorderLevel, setReorderLevel] = useState("")
  const [unitCost, setUnitCost] = useState("")

  const categoryItems = Object.fromEntries(CATEGORIES.map((c) => [c, c]))

  const canSubmit =
    name.trim().length > 0 &&
    unit.trim().length > 0 &&
    Number.parseFloat(quantity) >= 0 &&
    Number.parseFloat(reorderLevel) >= 0 &&
    Number.parseFloat(unitCost) >= 0

  function reset() {
    setName("")
    setCategory("Wood")
    setUnit("")
    setQuantity("")
    setReorderLevel("")
    setUnitCost("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    addItem({
      name: name.trim(),
      category,
      unit: unit.trim(),
      quantity: Number.parseFloat(quantity),
      reorderLevel: Number.parseFloat(reorderLevel),
      unitCost: Number.parseFloat(unitCost),
    })
    toast.success("Inventory item added", {
      description: `${name.trim()} is now tracked in the ledger.`,
    })
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <Plus data-icon="inline-start" />
            Add item
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add inventory item</DialogTitle>
          <DialogDescription>
            Add a new material to the stock ledger with its starting balance and
            reorder threshold.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} id="add-item-form">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="item-name">Material name</FieldLabel>
              <Input
                id="item-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Teak Plank"
              />
            </Field>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="item-category">Category</FieldLabel>
                <Select
                  items={categoryItems}
                  value={category}
                  onValueChange={(v) => setCategory(v as InventoryCategory)}
                >
                  <SelectTrigger id="item-category" className="w-full">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="item-unit">Unit</FieldLabel>
                <Input
                  id="item-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. boards"
                />
              </Field>
            </Field>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="item-qty">Quantity on hand</FieldLabel>
                <Input
                  id="item-qty"
                  type="number"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-reorder">Low-stock level</FieldLabel>
                <Input
                  id="item-reorder"
                  type="number"
                  min="0"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-cost">Price / unit</FieldLabel>
                <Input
                  id="item-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button type="submit" form="add-item-form" disabled={!canSubmit}>
            Add item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
