"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2, Plus, Search, Pencil } from "lucide-react"

import api from "@/lib/api"
import { cn, formatQty } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InventoryItem {
  id: number
  name: string
  unit: string
  current_quantity: string
  minimum_threshold: string
  is_low_stock: boolean
  last_updated: string
}

type ApiError = {
  response?: { data?: { errors?: Record<string, string[]>; detail?: string } }
}

// ---------------------------------------------------------------------------
// Query hook
// ---------------------------------------------------------------------------

function useInventory() {
  return useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data } = await api.get<{ results: InventoryItem[] }>("/stock/items/")
      return data.results
    },
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  })
}

// ---------------------------------------------------------------------------
// Add Item Dialog
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
  const [unit, setUnit] = useState("")
  const [qty, setQty] = useState("0")
  const [threshold, setThreshold] = useState("0")
  const [errors, setErrors] = useState<Record<string, string>>({})

  function reset() {
    setName(""); setUnit(""); setQty("0"); setThreshold("0"); setErrors({})
  }

  const add = useMutation({
    mutationFn: () =>
      api.post("/stock/items/", {
        name,
        unit,
        current_quantity: qty,
        minimum_threshold: threshold,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] })
      toast.success("Item added to inventory.", {
        description: `${name} is now tracked in the ledger.`,
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add inventory item</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); setErrors({}); add.mutate() }}
          id="add-item-form"
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="item-name">Material name</FieldLabel>
              <Input
                id="item-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Teak Plank"
                required
              />
              {errors.name && <FieldError errors={[{ message: errors.name }]} />}
            </Field>
            <Field>
              <FieldLabel htmlFor="item-unit">Unit</FieldLabel>
              <Input
                id="item-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. boards, kg, m"
                required
              />
              {errors.unit && <FieldError errors={[{ message: errors.unit }]} />}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="item-qty">Quantity on hand</FieldLabel>
                <Input
                  id="item-qty"
                  type="number"
                  min="0"
                  step="0.001"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0"
                />
                {errors.current_quantity && (
                  <FieldError errors={[{ message: errors.current_quantity }]} />
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="item-threshold">Low-stock level</FieldLabel>
                <Input
                  id="item-threshold"
                  type="number"
                  min="0"
                  step="0.001"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="0"
                />
                {errors.minimum_threshold && (
                  <FieldError errors={[{ message: errors.minimum_threshold }]} />
                )}
              </Field>
            </div>
          </FieldGroup>
        </form>
        <div className="flex justify-end gap-2 pt-2">
          <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          <Button type="submit" form="add-item-form" disabled={add.isPending || !name.trim() || !unit.trim()}>
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
// Edit Item Dialog (inline: qty + threshold + name/unit)
// ---------------------------------------------------------------------------

function EditItemDialog({
  item,
  open,
  onOpenChange,
}: {
  item: InventoryItem
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [qty, setQty] = useState(formatQty(item.current_quantity))
  const [threshold, setThreshold] = useState(formatQty(item.minimum_threshold))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setQty(formatQty(item.current_quantity))
      setThreshold(formatQty(item.minimum_threshold))
      setError(null)
    }
  }, [open, item])

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/stock/items/${item.id}/`, {
        current_quantity: qty,
        minimum_threshold: threshold,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] })
      toast.success("Inventory updated.")
      onOpenChange(false)
    },
    onError: (err: ApiError) => {
      const data = err.response?.data
      const msg =
        data?.errors?.current_quantity?.[0] ??
        data?.errors?.minimum_threshold?.[0] ??
        data?.detail ?? "Failed to update."
      setError(msg)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Edit — {item.name}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate() }}
          className="flex flex-col gap-4"
        >
          <Field>
            <FieldLabel htmlFor="edit-qty">Current quantity ({item.unit})</FieldLabel>
            <Input
              id="edit-qty"
              type="number"
              min="0"
              step="0.001"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="edit-threshold">Low-stock level ({item.unit})</FieldLabel>
            <Input
              id="edit-threshold"
              type="number"
              min="0"
              step="0.001"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InventoryLedger() {
  const { data: items = [], isLoading } = useInventory()
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItem | null>(null)

  const lowCount = items.filter((i) => i.is_low_stock).length

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return items
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.unit.toLowerCase().includes(q)
    )
  }, [items, search])

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-48 pl-8"
              placeholder="Search materials..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {filtered.length} of {items.length}
            {lowCount > 0 && (
              <Badge variant="destructive" className="ml-2 gap-1">
                <AlertTriangle className="size-3" />
                {lowCount} low
              </Badge>
            )}
          </span>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus data-icon="inline-start" />
          Add item
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">On hand</TableHead>
              <TableHead className="text-right">Low-stock level</TableHead>
              <TableHead className="text-right">Status</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {search ? "No materials match your search." : "No inventory items yet."}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((item) => (
              <TableRow
                key={item.id}
                className={cn(
                  item.is_low_stock &&
                    "bg-destructive/5 hover:bg-destructive/10"
                )}
              >
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatQty(item.current_quantity)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {formatQty(item.minimum_threshold)}
                </TableCell>
                <TableCell className="text-right">
                  {item.is_low_stock ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="size-3" />
                      Low stock
                    </Badge>
                  ) : (
                    <Badge variant="secondary">In stock</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => setEditItem(item)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Edit on-hand quantity or low-stock level by clicking the pencil icon. Rows
        at or below their threshold are flagged in red.
      </p>

      <AddItemDialog open={addOpen} onOpenChange={setAddOpen} />
      {editItem && (
        <EditItemDialog
          item={editItem}
          open={!!editItem}
          onOpenChange={(v) => { if (!v) setEditItem(null) }}
        />
      )}
    </div>
  )
}
