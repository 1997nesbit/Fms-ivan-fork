"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  shopCategories,
  type CatalogueProduct,
  type ShopCategory,
} from "@/lib/mock-data"
import { useCatalogue } from "@/components/shop/catalogue-store"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ManageCatalogueDialog({
  product,
  open,
  onOpenChange,
}: {
  /** When set, the dialog edits this product; otherwise it creates one. */
  product?: CatalogueProduct | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { addProduct, updateProduct } = useCatalogue()
  const isEdit = Boolean(product)

  const [name, setName] = useState("")
  const [category, setCategory] = useState<ShopCategory>(shopCategories[0])
  const [description, setDescription] = useState("")
  const [minPrice, setMinPrice] = useState("")
  const [maxPrice, setMaxPrice] = useState("")

  const categoryItems = Object.fromEntries(shopCategories.map((c) => [c, c]))

  useEffect(() => {
    if (!open) return
    setName(product?.name ?? "")
    setCategory(product?.category ?? shopCategories[0])
    setDescription(product?.description ?? "")
    setMinPrice(product ? String(product.minPrice) : "")
    setMaxPrice(product ? String(product.maxPrice) : "")
  }, [open, product])

  const min = Number.parseFloat(minPrice)
  const max = Number.parseFloat(maxPrice)
  const rangeValid = min > 0 && max > 0 && max >= min
  const canSubmit = name.trim().length > 0 && rangeValid

  function handleSubmit() {
    if (!canSubmit) return

    const input = {
      name,
      category,
      description,
      minPrice: min,
      maxPrice: max,
    }

    if (isEdit && product) {
      updateProduct(product.id, input)
      toast.success("Catalogue product updated", {
        description: `${name.trim()} saved.`,
      })
    } else {
      const id = addProduct(input)
      toast.success("Catalogue product added", {
        description: `${name.trim()} — ${id}.`,
      })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit catalogue product" : "Add catalogue product"}
          </DialogTitle>
          <DialogDescription>
            Reference price ranges for bespoke builds — used to guide bargaining
            on quotes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mc-name">Product name</Label>
            <Input
              id="mc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Custom Dining Table"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select
              items={categoryItems}
              value={category}
              onValueChange={(v) => setCategory(v as ShopCategory)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {shopCategories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mc-desc">Description</Label>
            <Textarea
              id="mc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Materials, size options, finishes…"
              rows={3}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mc-min">Min price ($)</Label>
              <Input
                id="mc-min"
                type="number"
                min="0"
                step="0.01"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mc-max">Max price ($)</Label>
              <Input
                id="mc-max"
                type="number"
                min="0"
                step="0.01"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {minPrice !== "" && maxPrice !== "" && !rangeValid && (
            <p className="text-sm text-destructive">
              Max price must be greater than or equal to min price.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEdit ? "Save changes" : "Add product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
