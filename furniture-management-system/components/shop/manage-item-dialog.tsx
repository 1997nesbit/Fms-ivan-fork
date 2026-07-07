"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  shopCategories,
  type ShopCategory,
  type ShopItem,
} from "@/lib/mock-data"
import { useShowroom } from "@/components/shop/showroom-store"
import { useBranch } from "@/components/shop/branch-store"
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
import { Switch } from "@/components/ui/switch"

const today = () => new Date().toISOString().slice(0, 10)

export function ManageItemDialog({
  item,
  open,
  onOpenChange,
}: {
  /** When set, the dialog edits this unit; otherwise it creates a new one. */
  item?: ShopItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { addItem, updateItem } = useShowroom()
  const { branches, activeBranchId } = useBranch()
  const isEdit = Boolean(item)

  const [name, setName] = useState("")
  const [category, setCategory] = useState<ShopCategory>(shopCategories[0])
  const [branchId, setBranchId] = useState(activeBranchId)
  const [price, setPrice] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [isSet, setIsSet] = useState(false)

  const branchItems = Object.fromEntries(
    branches.map((b) => [b.id, `Branch ${b.code} — ${b.name}`])
  )
  const categoryItems = Object.fromEntries(shopCategories.map((c) => [c, c]))

  useEffect(() => {
    if (!open) return
    setName(item?.name ?? "")
    setCategory(item?.category ?? shopCategories[0])
    setBranchId(item?.branchId ?? activeBranchId)
    setPrice(item ? String(item.price) : "")
    setCostPrice(item?.costPrice != null ? String(item.costPrice) : "")
    setIsSet(item?.isSet ?? false)
  }, [open, item, activeBranchId])

  const parsedPrice = Number.parseFloat(price)
  const parsedCost = costPrice.trim() ? Number.parseFloat(costPrice) : null
  const canSubmit = name.trim().length > 0 && parsedPrice > 0

  function handleSubmit() {
    if (!canSubmit) return

    if (isEdit && item) {
      updateItem(item.id, {
        name,
        category,
        branchId,
        price: parsedPrice,
        costPrice: parsedCost,
        isSet,
        photo: item.photo,
      })
      toast.success("Unit updated", { description: `${name.trim()} saved.` })
    } else {
      const id = addItem({
        name,
        category,
        branchId,
        price: parsedPrice,
        costPrice: parsedCost,
        isSet,
        dateEntered: today(),
      })
      toast.success("Unit added", { description: `${name.trim()} — ${id}.` })
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit unit" : "Add showroom unit"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update the details for ${item?.id}.`
              : "Register a new individual unit at a fixed price."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mi-name">Item name</Label>
            <Input
              id="mi-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mahogany Dining Chair"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
              <Label htmlFor="mi-price">Retail price</Label>
              <Input
                id="mi-price"
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mi-cost">Cost price (optional)</Label>
              <Input
                id="mi-cost"
                type="number"
                min="0"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="What we paid"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Branch</Label>
              <Select
                items={branchItems}
                value={branchId}
                onValueChange={(v) => setBranchId(v as string)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      Branch {b.code} — {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="mi-is-set" className="text-sm font-medium">
                Furniture set
              </Label>
              <span className="text-xs text-muted-foreground">
                Mark as a set of multiple pieces sold together
              </span>
            </div>
            <Switch
              id="mi-is-set"
              checked={isSet}
              onCheckedChange={setIsSet}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEdit ? "Save changes" : "Add unit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
