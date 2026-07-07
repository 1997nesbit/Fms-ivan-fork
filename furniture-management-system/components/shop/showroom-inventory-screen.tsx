"use client"

import { useRef, useState } from "react"
import {
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Star,
  Store,
  X,
} from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { useAuth } from "@/app/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ImageLightbox } from "@/components/shop/image-lightbox"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ItemImage {
  id: number
  image: string
}

interface CategoryItem {
  id: number
  name: string
  is_active: boolean
  item_count: number
}

interface ShowroomItem {
  id: number
  sku: string
  name: string
  category_id: number | null
  category: string
  price: string
  quantity: number
  status: "AVAILABLE" | "OUT_OF_STOCK"
  branch_id: number
  branch_name: string
  branch_code: string
  description: string
  is_set: boolean
  is_discontinued: boolean
  images: ItemImage[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
})

type StatusFilter = "AVAILABLE" | "OUT_OF_STOCK" | "all" | "DISCONTINUED"

type ApiError = {
  response?: { data?: { errors?: Record<string, string[]>; detail?: string } }
}

const SELECT_CLS =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm"

interface RoomItem     { id: number; name: string; code: string; is_active: boolean }
interface ItemTypeItem { id: number; name: string; code: string; is_active: boolean }

/** Compute the next unused sequence number for a given SKU pattern from the loaded cache. */
function nextSkuNum(
  items: ShowroomItem[],
  room: string,
  type: string,
  flag: "X" | "S",
  branchCode: string,
): number {
  const prefix = `${room}-${type}-${flag}`
  const suffix = `-${branchCode}`
  let max = 0
  for (const item of items) {
    if (item.sku.startsWith(prefix) && item.sku.endsWith(suffix)) {
      const mid = item.sku.slice(prefix.length, item.sku.length - suffix.length)
      const n = parseInt(mid, 10)
      if (!isNaN(n) && n > max) max = n
    }
  }
  return max + 1
}

function skuPreview(
  items: ShowroomItem[],
  room: string,
  type: string,
  isSet: boolean,
  branchCode: string,
): string {
  if (!room || (!isSet && !type) || !branchCode) return ""
  const effectiveType = isSet ? "SET" : type
  const flag: "X" | "S" = isSet ? "S" : "X"
  const num = nextSkuNum(items, room, effectiveType, flag, branchCode)
  return `${room}-${effectiveType}-${flag}${String(num).padStart(3, "0")}-${branchCode}`
}

// ---------------------------------------------------------------------------
// Image picker
// ---------------------------------------------------------------------------

function ImagePicker({
  previews,
  onAdd,
  onRemove,
}: {
  previews: string[]
  onAdd: (files: File[], previews: string[]) => void
  onRemove: (index: number) => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  function handleFiles(selected: FileList | null) {
    if (!selected) return
    const newFiles: File[] = []
    const newPreviews: string[] = []
    Array.from(selected).forEach((f) => {
      if (f.size > 5 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 5 MB — skipped.`)
        return
      }
      newFiles.push(f)
      newPreviews.push(URL.createObjectURL(f))
    })
    onAdd(newFiles, newPreviews)
  }

  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}>
        <Plus className="size-3.5" />
        Add photos
      </Button>
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt="" className="size-16 rounded object-cover" />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
              >
                <X className="size-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Add item dialog  (combined item + set)
// ---------------------------------------------------------------------------

function AddItemDialog({
  open,
  onOpenChange,
  items,
  branchCode,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: ShowroomItem[]
  branchCode: string
}) {
  const queryClient = useQueryClient()

  const [isSet, setIsSet] = useState(false)
  const [name, setName] = useState("")
  const [room, setRoom] = useState("")
  const [typeCode, setTypeCode] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [price, setPrice] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [description, setDescription] = useState("")
  const [components, setComponents] = useState("")
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: categories = [] } = useQuery<CategoryItem[]>({
    queryKey: ["categories", "active"],
    queryFn: async () => {
      const { data } = await api.get<CategoryItem[]>("/shop/categories/?active_only=1")
      return data
    },
    staleTime: 60_000,
  })

  const { data: rooms = [] } = useQuery<RoomItem[]>({
    queryKey: ["rooms", "active"],
    queryFn: async () => {
      const { data } = await api.get<RoomItem[]>("/shop/rooms/?active_only=1")
      return data
    },
    staleTime: 60_000,
  })

  const { data: itemTypes = [] } = useQuery<ItemTypeItem[]>({
    queryKey: ["item-types", "active"],
    queryFn: async () => {
      const { data } = await api.get<ItemTypeItem[]>("/shop/item-types/?active_only=1")
      return data
    },
    staleTime: 60_000,
  })

  const preview = skuPreview(items, room, typeCode, isSet, branchCode)

  function reset() {
    setIsSet(false)
    setName(""); setRoom(""); setTypeCode(""); setCategoryId("")
    setPrice(""); setQuantity("1"); setDescription(""); setComponents("")
    setImageFiles([]); setImagePreviews([]); setErrors({})
  }

  function addImages(files: File[], previews: string[]) {
    setImageFiles((p) => [...p, ...files])
    setImagePreviews((p) => [...p, ...previews])
  }
  function removeImage(i: number) {
    setImageFiles((p) => p.filter((_, idx) => idx !== i))
    setImagePreviews((p) => p.filter((_, idx) => idx !== i))
  }

  const add = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append("name", name)
      fd.append("room_code", room)
      fd.append("type_code", typeCode)
      fd.append("is_set", String(isSet))
      if (categoryId) fd.append("category_id", categoryId)
      fd.append("price", price)
      fd.append("quantity", quantity)
      fd.append("description", isSet ? components : description)
      imageFiles.forEach((f) => fd.append("images", f))
      return api.post("/shop/items/", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["showroom-items"] })
      queryClient.invalidateQueries({ queryKey: ["catalogue-items"] })
      const created = res.data as ShowroomItem
      toast.success(`${isSet ? "Set" : "Item"} added`, {
        description: `${created.name} · ${created.sku} · ${quantity} in stock`,
      })
      reset()
      onOpenChange(false)
    },
    onError: (err: ApiError) => {
      const data = err.response?.data
      if (data?.errors) {
        setErrors(Object.fromEntries(Object.entries(data.errors).map(([k, v]) => [k, v[0]])))
      } else {
        toast.error(data?.detail ?? "Failed to add item.")
      }
    },
  })

  const canSubmit =
    !add.isPending &&
    name.trim() &&
    room &&
    (isSet || typeCode) &&
    price &&
    parseInt(quantity, 10) >= 1 &&
    (!isSet || components.trim())

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add showroom item</DialogTitle>
        </DialogHeader>

        {/* Item / Set toggle */}
        <div className="flex rounded-lg border border-input p-1 gap-1">
          <button
            type="button"
            onClick={() => setIsSet(false)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
              !isSet
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Standalone item
          </button>
          <button
            type="button"
            onClick={() => setIsSet(true)}
            className={cn(
              "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
              isSet
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Set
          </button>
        </div>

        <form
          id="add-item-form"
          onSubmit={(e) => { e.preventDefault(); setErrors({}); add.mutate() }}
        >
          <FieldGroup>
            {/* Name */}
            <Field>
              <FieldLabel htmlFor="ai-name">
                {isSet ? "Set name" : "Item name"}
              </FieldLabel>
              <Input
                id="ai-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isSet ? "e.g. Mahogany Dining Set" : "e.g. Teak Coffee Table"}
                required
              />
              {errors.name && <FieldError errors={[{ message: errors.name }]} />}
            </Field>

            {/* Room + Type */}
            <div className={cn("grid gap-3", isSet ? "grid-cols-1" : "grid-cols-2")}>
              <Field>
                <FieldLabel htmlFor="ai-room">Room</FieldLabel>
                <select
                  id="ai-room"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  className={SELECT_CLS}
                  required
                >
                  <option value="">Select room</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.code}>{r.name} — {r.code}</option>
                  ))}
                </select>
                {errors.room_code && <FieldError errors={[{ message: errors.room_code }]} />}
              </Field>

              {!isSet && (
                <Field>
                  <FieldLabel htmlFor="ai-type">Item type</FieldLabel>
                  <select
                    id="ai-type"
                    value={typeCode}
                    onChange={(e) => setTypeCode(e.target.value)}
                    className={SELECT_CLS}
                    required
                  >
                    <option value="">Select type</option>
                    {itemTypes.map((t) => (
                      <option key={t.id} value={t.code}>{t.name} — {t.code}</option>
                    ))}
                  </select>
                  {errors.type_code && <FieldError errors={[{ message: errors.type_code }]} />}
                </Field>
              )}
            </div>

            {/* SKU preview */}
            {preview && (
              <div className="rounded-md bg-muted/60 px-3 py-2">
                <p className="text-xs text-muted-foreground mb-0.5">Auto-generated SKU</p>
                <p className="font-mono text-sm font-medium">{preview}</p>
              </div>
            )}

            {/* Category */}
            <Field>
              <FieldLabel htmlFor="ai-category">
                Category <span className="text-muted-foreground font-normal">(optional)</span>
              </FieldLabel>
              <select
                id="ai-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>

            {/* Price + Quantity */}
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="ai-price">Price (TZS)</FieldLabel>
                <Input
                  id="ai-price"
                  type="number"
                  min="1"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  required
                />
                {errors.price && <FieldError errors={[{ message: errors.price }]} />}
              </Field>
              <Field>
                <FieldLabel htmlFor="ai-qty">
                  {isSet ? "Sets in stock" : "Units in stock"}
                </FieldLabel>
                <Input
                  id="ai-qty"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                {errors.quantity && <FieldError errors={[{ message: errors.quantity }]} />}
              </Field>
            </div>

            {/* What's included — set only */}
            {isSet ? (
              <Field>
                <FieldLabel htmlFor="ai-components">What&apos;s included</FieldLabel>
                <textarea
                  id="ai-components"
                  value={components}
                  onChange={(e) => setComponents(e.target.value)}
                  rows={3}
                  required
                  placeholder="e.g. 1× dining table, 6× dining chairs, 1× sideboard"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="ai-desc">Description</FieldLabel>
                <textarea
                  id="ai-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional — materials, dimensions, finish…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </Field>
            )}

            {/* Photos */}
            <Field>
              <FieldLabel>Photos</FieldLabel>
              <ImagePicker
                previews={imagePreviews}
                onAdd={addImages}
                onRemove={removeImage}
              />
            </Field>

            {errors.non_field && (
              <p className="text-sm text-destructive">{errors.non_field}</p>
            )}
          </FieldGroup>
        </form>

        <div className="flex justify-end gap-2 pt-2">
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" form="add-item-form" disabled={!canSubmit}>
            {add.isPending && <Loader2 className="size-4 animate-spin" />}
            <Plus data-icon="inline-start" />
            {isSet ? "Add set" : "Add item"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Sell dialog
// ---------------------------------------------------------------------------

function SellDialog({
  item,
  open,
  onOpenChange,
}: {
  item: ShowroomItem
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [qtySold, setQtySold] = useState("1")
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const qty = Math.max(1, Math.min(parseInt(qtySold, 10) || 1, item.quantity))
  const remaining = item.quantity - qty

  const sell = useMutation({
    mutationFn: () =>
      api.post("/shop/sales/", {
        item_id: item.id,
        sale_price: item.price,
        quantity_sold: qty,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-items"] })
      toast.success("Sale recorded", {
        description: `${item.name} — ${qty} unit${qty > 1 ? "s" : ""} sold. ${remaining} remaining.`,
      })
      onOpenChange(false)
    },
    onError: (err: ApiError) => {
      toast.error(err.response?.data?.detail ?? "Failed to record sale.")
    },
  })

  function handleOpen(v: boolean) {
    if (!v) setQtySold("1")
    onOpenChange(v)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm {item.is_set ? "set sale" : "sale"}</DialogTitle>
          </DialogHeader>

          {item.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {item.images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => { setLightboxIndex(i); setLightboxOpen(true) }}
                  className="shrink-0"
                >
                  <img
                    src={img.image}
                    alt=""
                    className="size-[72px] rounded-lg object-cover ring-1 ring-border hover:ring-primary transition-all"
                  />
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1 rounded-lg bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="font-medium flex-1">{item.name}</p>
              {item.is_set && <Badge variant="secondary">SET</Badge>}
            </div>
            <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
            <p className="text-lg font-semibold tabular-nums pt-1">
              {currency.format(Number(item.price))}
            </p>
            <p className="text-xs text-muted-foreground">Fixed price — cannot be changed at sale.</p>
            {item.is_set && item.description && (
              <div className="mt-2 border-t border-border pt-2">
                <p className="text-xs font-medium text-muted-foreground mb-0.5">What&apos;s included</p>
                <p className="text-sm">{item.description}</p>
              </div>
            )}
          </div>

          {!item.is_set && (
            <Field>
              <FieldLabel htmlFor="sell-qty">Units to sell</FieldLabel>
              <Input
                id="sell-qty"
                type="number"
                min={1}
                max={item.quantity}
                value={qtySold}
                onChange={(e) => setQtySold(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {remaining > 0
                  ? `After this sale: ${remaining} remaining`
                  : "This will mark the item as out of stock."}
              </p>
            </Field>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button
              onClick={() => sell.mutate()}
              disabled={sell.isPending || qty < 1 || qty > item.quantity}
            >
              {sell.isPending && <Loader2 className="size-4 animate-spin" />}
              {item.is_set ? "Confirm set sale" : "Confirm sale"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        images={item.images}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Restock dialog
// ---------------------------------------------------------------------------

function RestockDialog({
  item,
  open,
  onOpenChange,
}: {
  item: ShowroomItem
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [qty, setQty] = useState("1")

  const restock = useMutation({
    mutationFn: () =>
      api.post(`/shop/items/${item.id}/restock/`, { quantity: parseInt(qty, 10) }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["showroom-items"] })
      const updated = res.data as ShowroomItem
      toast.success("Restocked", {
        description: `${item.name} — ${updated.quantity} in stock.`,
      })
      onOpenChange(false)
    },
    onError: (err: ApiError) => {
      toast.error(err.response?.data?.detail ?? "Failed to restock.")
    },
  })

  function handleOpen(v: boolean) {
    if (!v) setQty("1")
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Restock — {item.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Currently out of stock. Enter how many units are being added.
        </p>
        <Field>
          <FieldLabel htmlFor="restock-qty">Units to add</FieldLabel>
          <Input
            id="restock-qty"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            autoFocus
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button
            onClick={() => restock.mutate()}
            disabled={restock.isPending || parseInt(qty, 10) < 1}
          >
            {restock.isPending && <Loader2 className="size-4 animate-spin" />}
            <RefreshCw className="size-3.5" />
            Restock
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Item preview dialog
// ---------------------------------------------------------------------------

function ItemPreviewDialog({
  item,
  open,
  onClose,
  onSell,
  onRestock,
  onUpdated,
}: {
  item: ShowroomItem
  open: boolean
  onClose: () => void
  onSell: () => void
  onRestock: () => void
  onUpdated: () => void
}) {
  const queryClient = useQueryClient()
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [editingPrice, setEditingPrice] = useState(false)
  const [newPrice, setNewPrice] = useState(item.price)
  const [confirmDiscontinue, setConfirmDiscontinue] = useState(false)

  const inStock = item.status === "AVAILABLE"

  const setCover = useMutation({
    mutationFn: (imageId: number) =>
      api.post(`/shop/items/${item.id}/images/${imageId}/set-cover/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-items"] })
      toast.success("Cover image updated")
      onUpdated()
    },
    onError: (err: ApiError) => {
      toast.error(err.response?.data?.detail ?? "Failed to update cover.")
    },
  })

  const updatePrice = useMutation({
    mutationFn: () => api.patch(`/shop/items/${item.id}/price/`, { price: newPrice }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-items"] })
      queryClient.invalidateQueries({ queryKey: ["catalogue-items"] })
      toast.success("Price updated")
      setEditingPrice(false)
      onUpdated()
    },
    onError: (err: ApiError) => {
      toast.error(err.response?.data?.detail ?? "Failed to update price.")
    },
  })

  const discontinue = useMutation({
    mutationFn: () => api.post(`/shop/items/${item.id}/discontinue/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-items"] })
      queryClient.invalidateQueries({ queryKey: ["catalogue-items"] })
      toast.success(`${item.name} discontinued`)
      onClose()
    },
    onError: (err: ApiError) => {
      toast.error(err.response?.data?.detail ?? "Failed to discontinue.")
    },
  })

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setEditingPrice(false); setConfirmDiscontinue(false); onClose() } }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-balance">{item.name}</DialogTitle>
          </DialogHeader>

          {/* Images */}
          {item.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {item.images.map((img, i) => (
                <div key={img.id} className="relative shrink-0 group">
                  <button
                    type="button"
                    onClick={() => { setLightboxIndex(i); setLightboxOpen(true) }}
                  >
                    <img
                      src={img.image}
                      alt=""
                      className="size-[72px] rounded-lg object-cover ring-1 ring-border hover:ring-primary transition-all"
                    />
                  </button>
                  {/* Cover badge / set-cover button */}
                  {i === 0 ? (
                    <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary/90">
                      <Star className="size-2.5 fill-white text-white" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      title="Set as cover"
                      onClick={() => setCover.mutate(img.id)}
                      disabled={setCover.isPending}
                      className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/90"
                    >
                      <Star className="size-2.5 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Details */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {item.is_set && <Badge variant="secondary">SET</Badge>}
              {item.category && <Badge variant="outline">{item.category}</Badge>}
              <Badge
                variant="outline"
                className={cn(
                  "border",
                  inStock
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground border-border",
                )}
              >
                {inStock ? `${item.quantity} in stock` : "Out of stock"}
              </Badge>
            </div>

            <div className="rounded-lg bg-muted/50 px-4 py-3 space-y-1">
              <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
              <p className="text-xs text-muted-foreground">{item.branch_name}</p>

              {/* Price row — inline edit */}
              {editingPrice ? (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="h-8 w-40 tabular-nums"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => updatePrice.mutate()} disabled={updatePrice.isPending}>
                    {updatePrice.isPending && <Loader2 className="size-3 animate-spin" />}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingPrice(false); setNewPrice(item.price) }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-baseline gap-2 pt-1">
                  <p className="text-2xl font-semibold tabular-nums">
                    {currency.format(Number(item.price))}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setNewPrice(item.price); setEditingPrice(true) }}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Correct price
                  </button>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Fixed sale price</p>
            </div>

            {item.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  {item.is_set ? "What's included" : "Description"}
                </p>
                <p className="text-sm">{item.description}</p>
              </div>
            )}
          </div>

          {/* Discontinue confirmation */}
          {confirmDiscontinue && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-destructive">Discontinue this item?</p>
              <p className="text-xs text-muted-foreground">
                It will be hidden from active inventory. Sales history is preserved. This cannot be undone from the UI.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => discontinue.mutate()}
                  disabled={discontinue.isPending}
                >
                  {discontinue.isPending && <Loader2 className="size-3 animate-spin" />}
                  Yes, discontinue
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDiscontinue(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            {/* Discontinue trigger — left side */}
            {!confirmDiscontinue && (
              <button
                type="button"
                onClick={() => setConfirmDiscontinue(true)}
                className="text-xs text-muted-foreground hover:text-destructive underline underline-offset-2 transition-colors"
              >
                Discontinue item
              </button>
            )}
            {confirmDiscontinue && <span />}

            {/* Primary actions — right side */}
            <div className="flex gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>Close</DialogClose>
              <Button variant="outline" onClick={() => { onClose(); onRestock() }}>
                <RefreshCw className="size-3.5" />
                {inStock ? "Add stock" : "Restock"}
              </Button>
              {inStock && (
                <Button onClick={() => { onClose(); onSell() }}>
                  <ShoppingBag className="size-3.5" />
                  {item.is_set ? "Sell set" : "Sell"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        images={item.images}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ShowroomInventoryScreen() {
  const { user } = useAuth()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("AVAILABLE")
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<ShowroomItem | null>(null)
  const [sellItem, setSellItem] = useState<ShowroomItem | null>(null)
  const [restockItem, setRestockItem] = useState<ShowroomItem | null>(null)

  const fetchDiscontinued = statusFilter === "DISCONTINUED"

  const { data: rawItems = [], isLoading } = useQuery({
    queryKey: ["showroom-items", user?.branch_id, fetchDiscontinued],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "200" })
      if (user?.branch_id) params.set("branch_id", String(user.branch_id))
      if (fetchDiscontinued) params.set("include_discontinued", "1")
      const { data } = await api.get<{ results: ShowroomItem[] }>(`/shop/items/?${params}`)
      return data.results
    },
    staleTime: 30_000,
    enabled: !!user,
  })

  const items = fetchDiscontinued
    ? rawItems.filter((i) => i.is_discontinued)
    : rawItems.filter((i) => !i.is_discontinued)

  const branchCode = items[0]?.branch_code ?? "A"

  const visibleItems = items.filter((i) => {
    if (statusFilter !== "all" && statusFilter !== "DISCONTINUED" && i.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!i.name.toLowerCase().includes(q) && !i.sku.toLowerCase().includes(q)) return false
    }
    return true
  })

  const availableCount  = items.filter((i) => i.status === "AVAILABLE").length
  const outOfStockCount = items.filter((i) => i.status === "OUT_OF_STOCK").length
  const branchLabel     = items[0]?.branch_name ?? (user?.branch_id ? `Branch ${user.branch_id}` : "Your branch")

  const FILTER_LABELS: Record<StatusFilter, string> = {
    AVAILABLE:    "In stock",
    OUT_OF_STOCK: "Out of stock",
    all:          "All",
    DISCONTINUED: "Discontinued",
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Store className="size-5" />
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Showroom inventory
            </h1>
            <p className="max-w-2xl text-pretty text-muted-foreground">
              {availableCount} product{availableCount !== 1 ? "s" : ""} in stock
              {outOfStockCount > 0 && ` · ${outOfStockCount} out of stock`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <Badge variant="secondary" className="gap-1.5">
            <MapPin className="size-3.5" />
            {branchLabel}
          </Badge>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" />
            Add item
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {(["AVAILABLE", "OUT_OF_STOCK", "all", "DISCONTINUED"] as StatusFilter[]).map((f) => (
            <Button
              key={f}
              variant={statusFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f)}
            >
              {FILTER_LABELS[f]}
            </Button>
          ))}
        </div>
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or SKU…"
            className="h-9 pl-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : visibleItems.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Package className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              No items match your filters at {branchLabel}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((item) => {
            const inStock = item.status === "AVAILABLE"
            const discontinued = item.is_discontinued
            return (
              <Card
                key={item.id}
                className={cn(
                  "flex flex-col transition-colors cursor-pointer hover:border-primary/40",
                  !inStock && !discontinued && "opacity-70",
                  discontinued && "opacity-50 pointer-events-none",
                )}
                onClick={() => !discontinued && setPreviewItem(item)}
              >
                {item.images.length > 0 && (
                  <div className="px-4 pt-4">
                    <img
                      src={item.images[0].image}
                      alt={item.name}
                      className={cn("h-36 w-full rounded-md object-cover", discontinued && "grayscale")}
                    />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                    <div className="flex items-center gap-1">
                      {item.is_set && <Badge variant="secondary">SET</Badge>}
                      {discontinued ? (
                        <Badge variant="outline" className="border bg-muted text-muted-foreground border-border">
                          Discontinued
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn(
                            "border",
                            inStock
                              ? "bg-primary/10 text-primary border-primary/20"
                              : "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {inStock ? `${item.quantity} in stock` : "Out of stock"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="space-y-0.5 pt-1">
                    <p className={cn("text-base font-medium leading-tight text-balance", discontinued && "line-through text-muted-foreground")}>
                      {item.name}
                    </p>
                    {item.category && (
                      <p className="text-xs text-muted-foreground">{item.category}</p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-end">
                  <span className={cn("text-2xl font-semibold tabular-nums", discontinued && "text-muted-foreground")}>
                    {currency.format(Number(item.price))}
                  </span>
                </CardContent>
                {!discontinued && (
                  <CardFooter onClick={(e) => e.stopPropagation()}>
                    {inStock ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5"
                        onClick={() => setSellItem(item)}
                      >
                        <ShoppingBag className="size-3.5" />
                        {item.is_set ? "Sell set" : "Sell item"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5"
                        onClick={() => setRestockItem(item)}
                      >
                        <RefreshCw className="size-3.5" />
                        Restock
                      </Button>
                    )}
                  </CardFooter>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        items={items}
        branchCode={branchCode}
      />

      {previewItem && (
        <ItemPreviewDialog
          item={previewItem}
          open={!!previewItem}
          onClose={() => setPreviewItem(null)}
          onSell={() => setSellItem(previewItem)}
          onRestock={() => setRestockItem(previewItem)}
          onUpdated={() => setPreviewItem(null)}
        />
      )}

      {sellItem && (
        <SellDialog
          item={sellItem}
          open={!!sellItem}
          onOpenChange={(v) => { if (!v) setSellItem(null) }}
        />
      )}
      {restockItem && (
        <RestockDialog
          item={restockItem}
          open={!!restockItem}
          onOpenChange={(v) => { if (!v) setRestockItem(null) }}
        />
      )}

    </div>
  )
}
