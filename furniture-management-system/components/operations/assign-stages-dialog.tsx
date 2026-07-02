"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ClipboardList, Loader2, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
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
import type { OpsOrder, Technician } from "@/components/operations/types"

interface StageRow {
  stage_name: string
  technician_id: string
  allotted_time: string
  wage: string
}

function blankRow(): StageRow {
  return { stage_name: "", technician_id: "", allotted_time: "", wage: "" }
}

function initRows(order: OpsOrder): StageRow[] {
  if (order.stages.length > 0) {
    return order.stages.map((s) => ({
      stage_name: s.stage_name,
      technician_id: String(s.assigned_technician?.id ?? ""),
      allotted_time: s.allotted_time,
      wage: s.agreed_wage ?? "",
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
  const [rows, setRows] = useState<StageRow[]>(() => initRows(order))

  function updateRow(i: number, field: keyof StageRow, val: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()])
  }

  function removeRow(i: number) {
    if (rows.length === 1) return
    setRows((prev) => prev.filter((_, idx) => idx !== i))
  }

  const allStagesValid =
    rows.length > 0 &&
    rows.every((r) => r.stage_name.trim().length > 0 && r.technician_id.length > 0)

  const allWagesSet =
    rows.length > 0 && rows.every((r) => r.wage.trim().length > 0 && Number(r.wage) >= 0)

  // Phase: after save plan succeeds, we can start work
  const [savedOrderId, setSavedOrderId] = useState<number | null>(
    order.stages.length > 0 ? order.id : null
  )

  const savePlan = useMutation({
    mutationFn: async () => {
      // 1. Assign stages
      const assignBody = rows.map((r) => ({
        stage_name: r.stage_name.trim(),
        technician_id: Number(r.technician_id),
        allotted_time: r.allotted_time || "00:00:00",
      }))
      const { data: updatedOrder } = await api.post<OpsOrder>(
        `/production/orders/${order.id}/assign-stages/`,
        assignBody
      )

      // 2. Set wages using returned stage IDs
      const wageBody = updatedOrder.stages.map((s, i) => ({
        stage_id: s.id,
        wage: rows[i]?.wage ?? "0",
      }))
      await api.patch(`/production/orders/${order.id}/set-wages/`, wageBody)

      return updatedOrder
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-queue"] })
      setSavedOrderId(order.id)
      toast.success("Production plan saved.")
    },
    onError: (err: {
      response?: { data?: { errors?: Record<string, unknown>; detail?: string } }
    }) => {
      toast.error(err.response?.data?.detail ?? "Failed to save plan.")
    },
  })

  const startWork = useMutation({
    mutationFn: () => api.post(`/production/orders/${order.id}/start-work/`),
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

  const canStart = savedOrderId !== null && allWagesSet

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) setRows(initRows(order))
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <ClipboardList data-icon="inline-start" />
            {order.stages.length === 0 ? "Assign Stages" : "Edit Plan"}
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plan production — {order.reference_number}</DialogTitle>
          <DialogDescription>
            {order.item_description} for {order.customer_name}. Break the build
            into stages, assign a technician, set a wage, and an allotted time
            for each.
          </DialogDescription>
        </DialogHeader>

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
                      first in the workflow
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
                    htmlFor={`stage-name-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Stage name
                  </label>
                  <Input
                    id={`stage-name-${i}`}
                    placeholder="e.g. Frame Assembly"
                    value={row.stage_name}
                    onChange={(e) => updateRow(i, "stage_name", e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`tech-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Technician
                  </label>
                  <select
                    id={`tech-${i}`}
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
                    htmlFor={`time-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Allotted time
                  </label>
                  <Input
                    id={`time-${i}`}
                    placeholder="e.g. 2 days"
                    value={row.allotted_time}
                    onChange={(e) => updateRow(i, "allotted_time", e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`wage-${i}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Agreed wage (TZS)
                  </label>
                  <Input
                    id={`wage-${i}`}
                    type="number"
                    min="0"
                    placeholder="0"
                    value={row.wage}
                    onChange={(e) => updateRow(i, "wage", e.target.value)}
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
              Add another stage
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
            disabled={!allStagesValid || savePlan.isPending}
            onClick={() => savePlan.mutate()}
          >
            {savePlan.isPending && <Loader2 className="size-4 animate-spin" />}
            Save plan
          </Button>
          {canStart && (
            <Button
              disabled={startWork.isPending}
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
