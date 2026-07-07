"use client"

import { useMemo, useRef, useState } from "react"
import { ImagePlus, PackagePlus, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  shopCategories,
  type ShopCategory,
} from "@/lib/mock-data"
import { useShowroom } from "@/components/shop/showroom-store"
import { useBranch } from "@/components/shop/branch-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

interface PhotoDraft {
  id: string
  name: string
  url: string
}

const today = () => new Date().toISOString().slice(0, 10)

// Deterministic counter (no Date.now) so server and client render identical
// initial IDs and avoid a hydration mismatch.
let counter = 0
const uid = (prefix: string) => `${prefix}-${counter++}`

export function EnterStockScreen() {
  const { items, addItem } = useShowroom()
  const { branches, activeBranchId } = useBranch()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState("")
  const [category, setCategory] = useState<ShopCategory>(shopCategories[0])
  const [branchId, setBranchId] = useState(activeBranchId)
  const [price, setPrice] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [isSet, setIsSet] = useState(false)
  const [quantity, setQuantity] = useState("1")
  const [dateEntered, setDateEntered] = useState(today())
  const [photo, setPhoto] = useState<PhotoDraft | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const branchItems = Object.fromEntries(
    branches.map((b) => [b.id, `Branch ${b.code} — ${b.name}`])
  )
  const categoryItems = Object.fromEntries(
    shopCategories.map((c) => [c, c])
  )

  const qty = Math.max(1, Number.parseInt(quantity, 10) || 1)

  // Preview the ID the store will mint for the chosen branch.
  const previewItemId = useMemo(() => {
    const code = branches.find((b) => b.id === branchId)?.code ?? "X"
    const prefix = `ITEM-${code}-`
    const maxSeq = items
      .filter((i) => i.id.startsWith(prefix))
      .reduce((max, i) => {
        const seq = Number.parseInt(i.id.slice(prefix.length), 10)
        return Number.isNaN(seq) ? max : Math.max(max, seq)
      }, 0)
    return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`
  }, [branchId, items])

  function addMockPhoto(files: FileList | null) {
    const file = files?.[0]
    setPhoto({
      id: uid("photo"),
      name: file?.name ?? "photo.jpg",
      url: file ? URL.createObjectURL(file) : "",
    })
  }

  const canSubmit =
    name.trim().length > 0 && Number.parseFloat(price) > 0 && qty >= 1

  const parsedCost = costPrice.trim() ? Number.parseFloat(costPrice) : null

  function reset() {
    setName("")
    setCategory(shopCategories[0])
    setBranchId(activeBranchId)
    setPrice("")
    setCostPrice("")
    setIsSet(false)
    setQuantity("1")
    setDateEntered(today())
    setPhoto(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    const ids: string[] = []
    for (let n = 0; n < qty; n++) {
      const id = addItem({
        name,
        category,
        branchId,
        price: Number.parseFloat(price) || 0,
        costPrice: parsedCost,
        isSet,
        dateEntered,
        photo: photo?.url || undefined,
      })
      ids.push(id)
    }

    toast.success(
      qty === 1 ? "Unit entered into showroom" : `${qty} units entered`,
      {
        description: `${name.trim()} — ${ids[0]}${
          qty > 1 ? ` … ${ids[ids.length - 1]}` : ""
        } (${branches.find((b) => b.id === branchId)?.name}).`,
      }
    )
    reset()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <PackagePlus className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Enter ready-made stock
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Register furniture as individual units at a fixed price. Each unit
            can later be sold on its own or grouped into a set at checkout. Enter
            a quantity to add several identical pieces at once.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unit details</CardTitle>
            <CardDescription>
              Next ID:{" "}
              <span className="font-mono font-medium text-foreground">
                {previewItemId}
              </span>
              {qty > 1 && (
                <span className="text-muted-foreground">
                  {" "}
                  and {qty - 1} more
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="item-name">Item name</FieldLabel>
              <Input
                id="item-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mahogany Dining Chair"
              />
            </Field>
            <Field orientation="responsive">
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Select
                  items={categoryItems}
                  value={category}
                  onValueChange={(v) => setCategory(v as ShopCategory)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {shopCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Branch assigned to</FieldLabel>
                <Select
                  items={branchItems}
                  value={branchId}
                  onValueChange={(v) => setBranchId(v as string)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        Branch {b.code} — {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </Field>
            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="item-price">Retail price per unit</FieldLabel>
                <Input
                  id="item-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-cost">Cost price (optional)</FieldLabel>
                <Input
                  id="item-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="What we paid"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-qty">Quantity</FieldLabel>
                <Input
                  id="item-qty"
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="1"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-date">Date entered</FieldLabel>
                <Input
                  id="item-date"
                  type="date"
                  value={dateEntered}
                  onChange={(e) => setDateEntered(e.target.value)}
                />
              </Field>
            </Field>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="item-is-set" className="text-sm font-medium">
                  Furniture set
                </Label>
                <span className="text-xs text-muted-foreground">
                  Mark as a set of multiple pieces sold together
                </span>
              </div>
              <Switch
                id="item-is-set"
                checked={isSet}
                onCheckedChange={setIsSet}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reference photo</CardTitle>
            <CardDescription>
              Optional — mock upload shown locally only.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                addMockPhoto(e.dataTransfer.files)
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/40 px-4 py-6 text-center transition-colors hover:bg-muted/70",
                dragActive && "border-primary bg-primary/5"
              )}
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <ImagePlus className="size-4" />
              </span>
              <span className="text-sm font-medium">
                Drag &amp; drop or click to add a photo
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => addMockPhoto(e.target.files)}
            />

            {photo && (
              <div className="group relative size-16 overflow-hidden rounded-md border border-border bg-muted">
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.url || "/placeholder.svg"}
                    alt={photo.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground">
                    <ImagePlus className="size-4" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  aria-label={`Remove ${photo.name}`}
                  className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={reset}>
            Reset
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            <PackagePlus data-icon="inline-start" />
            Add to showroom
          </Button>
        </div>
      </form>
    </div>
  )
}
