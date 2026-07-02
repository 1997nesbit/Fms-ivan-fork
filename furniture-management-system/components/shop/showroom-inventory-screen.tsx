"use client"

import { useMemo, useState } from "react"
import { Loader2, MapPin, Package, Plus, Search, ShoppingBag, Store, X } from "lucide-react"
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShowroomItem {
  id: number
  sku: string
  name: string
  category: string
  price: string
  status: string
  branch_id: number
  branch_name: string
  description: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
})

type StatusFilter = "AVAILABLE" | "SOLD" | "all"
const STATUS_FILTERS: StatusFilter[] = ["AVAILABLE", "SOLD", "all"]

type ApiError = {
  response?: { data?: { errors?: Record<string, string[]>; detail?: string } }
}

// ---------------------------------------------------------------------------
// Add item dialog
// ---------------------------------------------------------------------------

function AddItemDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [sku, setSku] = useState("")
  const [serialNumber, setSerialNumber] = useState("")
  const [price, setPrice] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  function reset() {
    setName(""); setCategory(""); setSku(""); setSerialNumber(""); setPrice(""); setErrors({})
  }

  const add = useMutation({
    mutationFn: () =>
      api.post("/shop/items/", { name, category, sku, serial_number: serialNumber, price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-items"] })
      toast.success("Item added to showroom", { description: `${name} is now AVAILABLE.` })
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add showroom item</DialogTitle>
        </DialogHeader>
        <form
          id="add-item-form"
          onSubmit={(e) => { e.preventDefault(); setErrors({}); add.mutate() }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="item-name">Item name</FieldLabel>
              <Input
                id="item-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Teak Coffee Table"
                required
              />
              {errors.name && <FieldError errors={[{ message: errors.name }]} />}
            </Field>

            <Field>
              <FieldLabel htmlFor="item-category">Category</FieldLabel>
              <Input
                id="item-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Tables, Chairs, Beds"
              />
              {errors.category && <FieldError errors={[{ message: errors.category }]} />}
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="item-sku">SKU</FieldLabel>
                <Input
                  id="item-sku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="e.g. TBL-001"
                  required
                />
                {errors.sku && <FieldError errors={[{ message: errors.sku }]} />}
              </Field>
              <Field>
                <FieldLabel htmlFor="item-serial">Serial number</FieldLabel>
                <Input
                  id="item-serial"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="e.g. SN-20260001"
                  required
                />
                {errors.serial_number && <FieldError errors={[{ message: errors.serial_number }]} />}
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="item-price">Set price (TZS)</FieldLabel>
              <Input
                id="item-price"
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

            {errors.non_field && (
              <p className="text-sm text-destructive">{errors.non_field}</p>
            )}
          </FieldGroup>
        </form>
        <div className="flex justify-end gap-2 pt-2">
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button
            type="submit"
            form="add-item-form"
            disabled={add.isPending || !name.trim() || !sku.trim() || !serialNumber.trim() || !price}
          >
            {add.isPending && <Loader2 className="size-4 animate-spin" />}
            <Plus data-icon="inline-start" />
            Add item
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

  const sell = useMutation({
    mutationFn: () => api.post("/shop/sales/", { item_id: item.id, sale_price: item.price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showroom-items"] })
      toast.success("Sale recorded", { description: `${item.sku} — ${item.name} marked as sold.` })
      onOpenChange(false)
    },
    onError: (err: {
      response?: { data?: { errors?: Record<string, string[]>; detail?: string } }
    }) => {
      const data = err.response?.data
      toast.error(data?.detail ?? "Failed to record sale.")
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm sale</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 rounded-lg bg-muted/50 px-4 py-3">
          <p className="font-medium">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.sku}</p>
          <p className="text-lg font-semibold tabular-nums pt-1">
            {currency.format(Number(item.price))}
          </p>
          <p className="text-xs text-muted-foreground">Set price — cannot be changed at point of sale.</p>
        </div>
        <div className="flex justify-end gap-2">
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button onClick={() => sell.mutate()} disabled={sell.isPending}>
            {sell.isPending && <Loader2 className="size-4 animate-spin" />}
            Confirm sale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
  const [sellItem, setSellItem] = useState<ShowroomItem | null>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["showroom-items", user?.branch_id],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "200" })
      if (user?.branch_id) params.set("branch_id", String(user.branch_id))
      const { data } = await api.get<{ results: ShowroomItem[] }>(`/shop/items/?${params}`)
      return data.results
    },
    staleTime: 30_000,
    enabled: !!user,
  })

  const visibleItems = useMemo(() => {
    return items.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!i.name.toLowerCase().includes(q) && !i.sku.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [items, statusFilter, search])

  const availableCount = items.filter((i) => i.status === "AVAILABLE").length

  const branchLabel = items[0]?.branch_name ?? (user?.branch_id ? `Branch ${user.branch_id}` : "Your branch")

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
              Browse your branch&apos;s showroom items and record sales.{" "}
              {availableCount} available now.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
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
          {STATUS_FILTERS.map((f) => (
            <Button
              key={f}
              variant={statusFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f)}
            >
              {f === "all" ? "All" : f === "AVAILABLE" ? "Available" : "Sold"}
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
            const sellable = item.status === "AVAILABLE"
            return (
              <Card
                key={item.id}
                className={cn("flex flex-col transition-colors", !sellable && "opacity-70")}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "border",
                        sellable
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-muted text-muted-foreground border-border",
                      )}
                    >
                      {item.status === "AVAILABLE" ? "Available" : item.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="space-y-0.5 pt-1">
                    <p className="text-base font-medium leading-tight text-balance">{item.name}</p>
                    {item.category && (
                      <p className="text-xs text-muted-foreground">{item.category}</p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-end">
                  <span className="text-2xl font-semibold tabular-nums">
                    {currency.format(Number(item.price))}
                  </span>
                </CardContent>
                <CardFooter>
                  {sellable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5"
                      onClick={() => setSellItem(item)}
                    >
                      <ShoppingBag className="size-3.5" />
                      Sell item
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {item.status.replace("_", " ")}
                    </span>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} />

      {sellItem && (
        <SellDialog
          item={sellItem}
          open={!!sellItem}
          onOpenChange={(v) => {
            if (!v) setSellItem(null)
          }}
        />
      )}
    </div>
  )
}
