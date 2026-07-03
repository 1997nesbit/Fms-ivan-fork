"use client"

import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ImagePlus, Loader2, Plus, X } from "lucide-react"
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

type FieldErrors = Record<string, string[]>

const today = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateOrderDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [customerName, setCustomerName]         = useState("")
  const [contact, setContact]                   = useState("")
  const [furnitureType, setFurnitureType]       = useState("")
  const [size, setSize]                         = useState("")
  const [quotedPrice, setQuotedPrice]           = useState("")
  const [expectedDelivery, setExpectedDelivery] = useState("")
  const [notes, setNotes]                       = useState("")
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [images, setImages]                     = useState<ImagePreview[]>([])
  const [dragActive, setDragActive]             = useState(false)
  const [fieldErrors, setFieldErrors]           = useState<FieldErrors>({})

  function resetForm() {
    setCustomerName("")
    setContact("")
    setFurnitureType("")
    setSize("")
    setQuotedPrice("")
    setExpectedDelivery("")
    setNotes("")
    setRequiresApproval(false)
    setImages([])
    setFieldErrors({})
  }

  function addImages(files: FileList | null) {
    if (!files) return
    const previews: ImagePreview[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      url: URL.createObjectURL(file),
    }))
    setImages((prev) => [...prev, ...previews])
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const removed = prev.find((img) => img.id === id)
      if (removed) URL.revokeObjectURL(removed.url)
      return prev.filter((img) => img.id !== id)
    })
  }

  const create = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append("customer_name", customerName.trim())
      form.append("customer_phone", contact.trim())
      form.append(
        "item_description",
        size.trim() ? `${furnitureType.trim()} — ${size.trim()}` : furnitureType.trim()
      )
      if (quotedPrice) form.append("quoted_price", quotedPrice)
      form.append("delivery_date", expectedDelivery)
      if (notes.trim()) form.append("notes", notes.trim())
      form.append("requires_approval", String(requiresApproval))
      for (const img of images) form.append("images", img.file)
      return api.post("/orders/", form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] })
      toast.success("Order created", {
        description: requiresApproval
          ? `${furnitureType} sent for Director approval.`
          : `${furnitureType} added to the ops queue.`,
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

      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create new order</DialogTitle>
          <DialogDescription>
            Capture the customer&apos;s details and quote. The order goes straight
            to the ops queue unless Director price approval is needed.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate() }}
        >
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

            <Field orientation="responsive">
              <Field>
                <FieldLabel htmlFor="furnitureType">Furniture type</FieldLabel>
                <Input
                  id="furnitureType"
                  required
                  value={furnitureType}
                  onChange={(e) => setFurnitureType(e.target.value)}
                  placeholder="e.g. 6-Seater Dining Table"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="size">Size / dimensions</FieldLabel>
                <Input
                  id="size"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="e.g. 180 × 90 × 76 cm"
                />
              </Field>
            </Field>
            <FieldError errors={fieldErrors.item_description?.map((m) => ({ message: m }))} />

            <Field>
              <FieldLabel htmlFor="quotedPrice">Quoted customer price</FieldLabel>
              <Input
                id="quotedPrice"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={quotedPrice}
                onChange={(e) => setQuotedPrice(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
              />
              <FieldError errors={fieldErrors.quoted_price?.map((m) => ({ message: m }))} />
            </Field>

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
              <FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any extra detail for the workshop or Director…"
                rows={3}
              />
              <FieldError errors={fieldErrors.notes?.map((m) => ({ message: m }))} />
            </Field>

            {/* Image upload */}
            <Field>
              <FieldLabel htmlFor="reference-upload">Reference photos</FieldLabel>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => { e.preventDefault(); setDragActive(false); addImages(e.dataTransfer.files) }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/40 px-4 py-6 text-center transition-colors hover:bg-muted/70",
                  dragActive && "border-primary bg-primary/5"
                )}
              >
                <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <ImagePlus className="size-4" />
                </span>
                <span className="text-sm font-medium">Drag &amp; drop or click to add photos</span>
                <span className="text-xs text-muted-foreground">JPEG, PNG, WEBP</span>
              </button>
              <input
                ref={fileInputRef}
                id="reference-upload"
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => addImages(e.target.files)}
              />

              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="group relative size-16 overflow-hidden rounded-md border border-border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.file.name} className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        aria-label={`Remove ${img.file.name}`}
                        className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Field>

            {/* Approval checkbox */}
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
