"use client"

import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImagePreview {
  id: string
  file: File
  url: string
}

interface ItemDraft {
  id: string
  name: string
  notes: string
  measurements: string
  quotedPrice: string
  images: ImagePreview[]
}

type FieldErrors = Record<string, string[]>

const today = () => new Date().toISOString().slice(0, 10)

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8MB

function newItem(): ItemDraft {
  return {
    id: `${Date.now()}-${Math.random()}`,
    name: "",
    notes: "",
    measurements: "",
    quotedPrice: "",
    images: [],
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateOrderDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const [customerName, setCustomerName]         = useState("")
  const [contact, setContact]                   = useState("")
  const [expectedDelivery, setExpectedDelivery] = useState("")
  const [advancePayment, setAdvancePayment]     = useState("")
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [items, setItems]                       = useState<ItemDraft[]>([newItem()])
  const [fieldErrors, setFieldErrors]           = useState<FieldErrors>({})

  function resetForm() {
    setCustomerName("")
    setContact("")
    setExpectedDelivery("")
    setAdvancePayment("")
    setRequiresApproval(false)
    setItems([newItem()])
    setFieldErrors({})
  }

  function updateItem(id: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, newItem()])
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const removed = prev.find((it) => it.id === id)
      removed?.images.forEach((img) => URL.revokeObjectURL(img.url))
      const next = prev.filter((it) => it.id !== id)
      return next.length > 0 ? next : [newItem()]
    })
  }

  function addImagesToItem(id: string, files: FileList | null) {
    if (!files) return

    const accepted: File[] = []
    const rejected: string[] = []
    for (const file of Array.from(files)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        rejected.push(`${file.name} (unsupported format)`)
      } else if (file.size > MAX_IMAGE_BYTES) {
        rejected.push(`${file.name} (over 8MB)`)
      } else {
        accepted.push(file)
      }
    }

    if (rejected.length > 0) {
      toast.error(
        rejected.length === 1 ? "Photo not added" : "Some photos not added",
        { description: rejected.join(", ") },
      )
    }

    if (accepted.length === 0) return
    const previews: ImagePreview[] = accepted.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      url: URL.createObjectURL(file),
    }))
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, images: [...it.images, ...previews] } : it))
    )
  }

  function removeImageFromItem(itemId: string, imageId: string) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it
        const removed = it.images.find((img) => img.id === imageId)
        if (removed) URL.revokeObjectURL(removed.url)
        return { ...it, images: it.images.filter((img) => img.id !== imageId) }
      })
    )
  }

  const create = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append("customer_name", customerName.trim())
      form.append("customer_phone", contact.trim())
      form.append("delivery_date", expectedDelivery)
      form.append("requires_approval", String(requiresApproval))
      if (advancePayment) form.append("advance_payment", advancePayment)

      const itemsJson = items.map((it) => ({
        name: it.name.trim(),
        notes: it.notes.trim(),
        measurements: it.measurements.trim(),
        quoted_price: it.quotedPrice || undefined,
      }))
      form.append("items", JSON.stringify(itemsJson))
      items.forEach((it, i) => {
        it.images.forEach((img) => form.append(`item_images_${i}`, img.file))
      })

      return api.post("/orders/", form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      toast.success("Order created", {
        description: requiresApproval
          ? "Sent for Director approval."
          : `${items.length} item${items.length !== 1 ? "s" : ""} added to the ops queue.`,
      })
      resetForm()
      setOpen(false)
    },
    onError: (err: { response?: { data?: { errors?: FieldErrors; detail?: string } } }) => {
      const data = err.response?.data
      if (data?.errors) {
        setFieldErrors(data.errors)
      } else {
        toast.error(data?.detail ?? "Failed to create order.")
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm() }}>
      <DialogTrigger render={<Button><Plus data-icon="inline-start" />New Order</Button>} />

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create new order</DialogTitle>
          <DialogDescription>
            Capture the customer&apos;s details, then add every item for this order.
            The batch goes straight to the ops queue unless Director price approval is needed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="customerName">Customer name</FieldLabel>
              <Input
                id="customerName"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Amina Yusuf"
              />
              <FieldError errors={fieldErrors.customer_name?.map((m) => ({ message: m }))} />
            </Field>

            <Field>
              <FieldLabel htmlFor="contact">Phone / contact</FieldLabel>
              <Input
                id="contact"
                required
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="+255 7xx xxx xxx"
              />
              <FieldError errors={fieldErrors.customer_phone?.map((m) => ({ message: m }))} />
            </Field>

            {fieldErrors.items && (
              <p className="text-sm text-destructive">{fieldErrors.items[0]}</p>
            )}

            <div className="flex flex-col gap-4">
              {items.map((item, index) => (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">Item {index + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove item ${index + 1}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>

                  <FieldGroup>
                    <Field orientation="responsive">
                      <Field>
                        <FieldLabel htmlFor={`name-${item.id}`}>Item name</FieldLabel>
                        <Input
                          id={`name-${item.id}`}
                          required
                          value={item.name}
                          onChange={(e) => updateItem(item.id, { name: e.target.value })}
                          placeholder="e.g. 6-Seater Dining Table"
                        />
                        <FieldError errors={fieldErrors[`items[${index}].name`]?.map((m) => ({ message: m }))} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`measurements-${item.id}`}>Measurements</FieldLabel>
                        <Input
                          id={`measurements-${item.id}`}
                          value={item.measurements}
                          onChange={(e) => updateItem(item.id, { measurements: e.target.value })}
                          placeholder="e.g. 180 × 90 × 76 cm"
                        />
                      </Field>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`notes-${item.id}`}>Brief notes</FieldLabel>
                      <Textarea
                        id={`notes-${item.id}`}
                        value={item.notes}
                        onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                        placeholder="Fabric, finish, any workshop-specific detail…"
                        rows={2}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor={`price-${item.id}`}>Quoted price</FieldLabel>
                      <Input
                        id={`price-${item.id}`}
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={item.quotedPrice}
                        onChange={(e) => updateItem(item.id, { quotedPrice: e.target.value.replace(/\D/g, "") })}
                        placeholder="0"
                      />
                      <FieldError errors={fieldErrors[`items[${index}].quoted_price`]?.map((m) => ({ message: m }))} />
                    </Field>

                    <ItemPhotoField
                      item={item}
                      onAdd={(files) => addImagesToItem(item.id, files)}
                      onRemove={(imageId) => removeImageFromItem(item.id, imageId)}
                    />
                  </FieldGroup>
                </div>
              ))}
            </div>

            <Button type="button" variant="outline" onClick={addItem} className="self-start">
              <Plus data-icon="inline-start" />
              Add another item
            </Button>

            <Field>
              <FieldLabel htmlFor="expectedDelivery">Expected delivery</FieldLabel>
              <Input
                id="expectedDelivery"
                type="date"
                required
                min={today()}
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
              />
              <FieldError errors={fieldErrors.delivery_date?.map((m) => ({ message: m }))} />
            </Field>

            <Field>
              <FieldLabel htmlFor="advancePayment">Advance payment received (optional)</FieldLabel>
              <Input
                id="advancePayment"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={advancePayment}
                onChange={(e) => setAdvancePayment(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
              />
              <FieldDescription>Recorded as the first payment on this order&apos;s invoice.</FieldDescription>
            </Field>

            <FieldLabel className="rounded-lg border border-border p-3">
              <Checkbox
                checked={requiresApproval}
                onCheckedChange={(checked) => setRequiresApproval(checked === true)}
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Requires Director price approval</span>
                <FieldDescription>
                  Tick for bargained or non-catalogue pricing.
                </FieldDescription>
              </div>
            </FieldLabel>

            {fieldErrors.non_field && (
              <p className="text-sm text-destructive">{fieldErrors.non_field[0]}</p>
            )}
          </FieldGroup>

          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Create order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Per-item photo field
// ---------------------------------------------------------------------------

function ItemPhotoField({
  item,
  onAdd,
  onRemove,
}: {
  item: ItemDraft
  onAdd: (files: FileList | null) => void
  onRemove: (imageId: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  return (
    <Field>
      <FieldLabel htmlFor={`upload-${item.id}`}>Reference photos</FieldLabel>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); onAdd(e.dataTransfer.files) }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/40 px-4 py-4 text-center transition-colors hover:bg-muted/70",
          dragActive && "border-primary bg-primary/5"
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <ImagePlus className="size-4" />
        </span>
        <span className="text-xs font-medium">Drag &amp; drop or click to add photos for this item</span>
      </button>
      <input
        ref={fileInputRef}
        id={`upload-${item.id}`}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => onAdd(e.target.files)}
      />

      {item.images.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {item.images.map((img) => (
            <div
              key={img.id}
              className="group relative size-16 overflow-hidden rounded-md border border-border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.file.name} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(img.id)}
                aria-label={`Remove ${img.file.name}`}
                className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background opacity-80 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Field>
  )
}
