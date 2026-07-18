"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
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
import type { OpsOrder, OrderItemPlan, Technician } from "@/components/operations/types"

interface StageRow {
  stage_name: string
  technician_id: string
  allotted_time: string
  wage: string
}

function blankRow(): StageRow {
  return { stage_name: "", technician_id: "", allotted_time: "", wage: "" }
}

function initRows(item: OrderItemPlan): StageRow[] {
  if (item.stages.length > 0) {
    return item.stages.map((s) => ({
      stage_name: s.stage_name,
      technician_id: String(s.assigned_technician?.id ?? ""),
      allotted_time: s.allotted_time,
      wage: s.agreed_wage ? String(Math.round(Number(s.agreed_wage))) : "",
    }))
  }
  return [blankRow()]
}

interface AssignStagesDialogProps {
  order: OpsOrder
  technicians: Technician[]
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function AssignStagesDialog({
  order,
  technicians,
  open,
  onOpenChange,
}: AssignStagesDialogProps) {
  const queryClient = useQueryClient()
  const [activeItemId, setActiveItemId] = useState<number>(order.items[0]?.id ?? 0)
  const [rowsByItem, setRowsByItem] = useState<Record<number, StageRow[]>>(() =>
    Object.fromEntries(order.items.map((it) => [it.id, initRows(it)]))
  )

  const activeItem = order.items.find((it) => it.id === activeItemId) ?? order.items[0]
  const rows = rowsByItem[activeItemId] ?? [blankRow()]

  function setRows(next: StageRow[]) {
    setRowsByItem((prev) => ({ ...prev, [activeItemId]: next }))
  }

  function updateRow(i: number, field: keyof StageRow, val: string) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)))
  }

  function addRow() {
    setRows([...rows, blankRow()])
  }

  function removeRow(i: number) {
    if (rows.length === 1) return
    setRows(rows.filter((_, idx) => idx !== i))
  }

  const allStagesValid = (r: StageRow[]) =>
    r.length > 0 && r.every((row) => row.stage_name.trim().length > 0 && row.technician_id.length > 0)
  const allWagesSet = (r: StageRow[]) =>
    r.length > 0 && r.every((row) => row.wage.trim().length > 0 && Number(row.wage) >= 0)

  const everyItemReady = order.items.every(
    (it) => allStagesValid(rowsByItem[it.id] ?? []) && allWagesSet(rowsByItem[it.id] ?? [])
  )

  async function saveItemPlan(item: OrderItemPlan) {
    const itemRows = rowsByItem[item.id] ?? []
    const assignBody = itemRows.map((r) => ({
      stage_name: r.stage_name.trim(),
      technician_id: Number(r.technician_id),
      allotted_time: r.allotted_time || "00:00:00",
    }))
    const { data: updatedItem } = await api.post<OrderItemPlan>(
      `/production/items/${item.id}/assign-stages/`,
      assignBody
    )
    const wageBody = updatedItem.stages.map((s, i) => ({
      stage_id: s.id,
      wage: itemRows[i]?.wage ?? "0",
    }))
    await api.patch(`/production/items/${item.id}/set-wages/`, wageBody)
  }

  const savePlan = useMutation({
    mutationFn: async () => {
      for (const item of order.items) await saveItemPlan(item)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] })
      toast.success("Production plan saved.")
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      toast.error(err.response?.data?.detail ?? "Failed to save plan.")
    },
  })

  const startWork = useMutation({
    mutationFn: async () => {
      // Always save the current plan + wages first, so Start Work works
      // whether or not "Save plan" was clicked beforehand.
      for (const item of order.items) await saveItemPlan(item)
      await api.post(`/production/orders/${order.id}/start-work/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] })
      queryClient.invalidateQueries({ queryKey: ["pipeline"] })
      toast.success(`${order.reference_number} is now in production.`)
      onOpenChange(false)
    },
    onError: (err: {
      response?: { data?: { detail?: string } }
    }) => {
      toast.error(err.response?.data?.detail ?? "Failed to start work.")
    },
  })

  if (!activeItem) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) {
          setRowsByItem(Object.fromEntries(order.items.map((it) => [it.id, initRows(it)])))
          setActiveItemId(order.items[0]?.id ?? 0)
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <ClipboardList data-icon="inline-start" />
            {order.items.every((it) => it.stages.length === 0) ? "Assign Stages" : "Edit Plan"}
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plan production — {order.reference_number}</DialogTitle>
          <DialogDescription>
            {order.customer_name}&apos;s order has {order.items.length} item
            {order.items.length !== 1 ? "s" : ""}. Plan each item&apos;s stages
            separately — items can go to different artisans and progress
            independently once started.
          </DialogDescription>
        </DialogHeader>

        {order.items.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
            {order.items.map((it) => {
              const ready = allStagesValid(rowsByItem[it.id] ?? []) && allWagesSet(rowsByItem[it.id] ?? [])
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setActiveItemId(it.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    it.id === activeItemId
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {it.name || "Untitled item"}
                  {ready && " ✓"}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">
                  Stage {i + 1}
                  {i === 0 && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      first in {activeItem.name || "this item"}&apos;s workflow
                    </span>
                  )}
                </span>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 data-icon="inline-start" />
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`stage-name-${activeItemId}-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Stage name
                  </label>
                  <Input
                    id={`stage-name-${activeItemId}-${i}`}
                    placeholder="e.g. Frame Assembly"
                    value={row.stage_name}
                    onChange={(e) => updateRow(i, "stage_name", e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`tech-${activeItemId}-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Technician
                  </label>
                  <select
                    id={`tech-${activeItemId}-${i}`}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm w-full"
                    value={row.technician_id}
                    onChange={(e) => updateRow(i, "technician_id", e.target.value)}
                  >
                    <option value="">Select technician</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`time-${activeItemId}-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Allotted time
                  </label>
                  <Input
                    id={`time-${activeItemId}-${i}`}
                    placeholder="e.g. 2 days"
                    value={row.allotted_time}
                    onChange={(e) => updateRow(i, "allotted_time", e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`wage-${activeItemId}-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Agreed wage (TZS)
                  </label>
                  <Input
                    id={`wage-${activeItemId}-${i}`}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    placeholder="0"
                    value={row.wage}
                    onChange={(e) => updateRow(i, "wage", e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>
            </div>
          ))}

          <div>
            <Button
              type="button"
              variant="outline"
              onClick={addRow}
            >
              <Plus data-icon="inline-start" />
              Add another stage to {activeItem.name || "this item"}
            </Button>
          </div>
        </div>

        <Separator />

        <DialogFooter className="-mx-4 -mb-4">
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant="outline"
            disabled={savePlan.isPending}
            onClick={() => savePlan.mutate()}
          >
            {savePlan.isPending && <Loader2 className="size-4 animate-spin" />}
            Save plan
          </Button>
          {everyItemReady && (
            <Button
              disabled={startWork.isPending || savePlan.isPending}
              onClick={() => startWork.mutate()}
            >
              {startWork.isPending && <Loader2 className="size-4 animate-spin" />}
              Start Work
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
