"use client"

import { useState } from "react"
import { PackagePlus } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import api from "@/lib/api"
import { Button } from "@/components/ui/button"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const UNITS = ["pcs", "boards", "sheets", "meters", "liters", "rolls", "pairs"]

interface QueueStage {
  id: number
  stage_name: string
  order: {
    id: number
    reference_number: string
    item_description: string
  }
}

export function RequestMaterialDialog({ stage }: { stage: QueueStage }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [quantity, setQuantity] = useState("")
  const [unit, setUnit] = useState("pcs")

  const quantityNum = Number.parseInt(quantity, 10)
  const valid = name.trim().length > 0 && quantityNum > 0

  function reset() {
    setName("")
    setQuantity("")
    setUnit("pcs")
  }

  const submit = useMutation({
    mutationFn: () =>
      api.post("/stock/material-requests/", {
        stage_id: stage.id,
        material_name: name.trim(),
        quantity: quantityNum,
        unit,
      }),
    onSuccess: () => {
      toast.success("Request sent for approval.", {
        description: `${quantityNum} ${unit} of ${name.trim()} for ${stage.order.reference_number}.`,
      })
      queryClient.invalidateQueries({ queryKey: ["material-requests"] })
      reset()
      setOpen(false)
    },
    onError: () => {
      toast.error("Failed to submit request. Please try again.")
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" className="h-11 w-full">
            <PackagePlus data-icon="inline-start" />
            Request materials
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request materials</DialogTitle>
          <DialogDescription>
            For {stage.order.item_description} ({stage.order.reference_number}). Goes to the Operations
            Manager for approval.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="material-name">Material</FieldLabel>
            <Input
              id="material-name"
              className="h-11"
              placeholder="e.g. Brass Hinges"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="flex gap-3">
            <Field className="flex-1">
              <FieldLabel htmlFor="material-qty">Quantity</FieldLabel>
              <Input
                id="material-qty"
                className="h-11"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor="material-unit">Unit</FieldLabel>
              <select
                id="material-unit"
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </FieldGroup>

        <DialogFooter>
          <DialogClose
            render={
              <Button variant="ghost" className="h-11">
                Cancel
              </Button>
            }
          />
          <Button
            className="h-11"
            onClick={() => submit.mutate()}
            disabled={!valid || submit.isPending}
          >
            {submit.isPending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
