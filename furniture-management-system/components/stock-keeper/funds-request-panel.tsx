"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Banknote, Check, Clock, Send, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/costing"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStock } from "@/components/stock-keeper/stock-store"
import { useFunds, type FundRequestStatus } from "@/components/director/funds-store"

const STATUS_STYLES: Record<
  FundRequestStatus,
  { label: string; badge: string; row: string; Icon: typeof Check }
> = {
  Pending: {
    label: "Awaiting Director",
    badge:
      "border-transparent bg-blue-600 text-white dark:bg-blue-500",
    row: "border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20",
    Icon: Clock,
  },
  Approved: {
    label: "Approved",
    badge: "border-transparent bg-green-600 text-white dark:bg-green-500",
    row: "border-l-green-500 bg-green-50/40 dark:bg-green-950/20",
    Icon: Check,
  },
  Declined: {
    label: "Declined",
    badge: "border border-border bg-muted text-muted-foreground",
    row: "border-l-muted-foreground/40 bg-muted/40",
    Icon: X,
  },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

export function FundsRequestPanel() {
  const { items } = useStock()
  const { requests, requestFunds } = useFunds()

  const lowStock = useMemo(
    () => items.filter((i) => i.quantity <= i.reorderLevel),
    [items]
  )

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="size-5 text-primary" />
              Director funding
            </CardTitle>
            <CardDescription>
              When stock is insufficient and there is no budget to reorder,
              request funds from the Director here.
            </CardDescription>
          </div>
          <RequestFundsDialog
            lowStockNames={lowStock.map((i) => i.name)}
            onSubmit={requestFunds}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {lowStock.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-400/60 bg-yellow-50/60 px-3 py-2 text-sm dark:bg-yellow-950/20">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <span className="text-yellow-900 dark:text-yellow-200">
              <strong>{lowStock.length}</strong> material
              {lowStock.length === 1 ? " is" : "s are"} at or below reorder
              level. Request funds to restock.
            </span>
          </div>
        )}

        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No funding requests yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((req) => {
              const cfg = STATUS_STYLES[req.status]
              const { Icon } = cfg
              return (
                <div
                  key={req.id}
                  className={cn(
                    "flex flex-col gap-1 rounded-md border-l-4 px-3 py-2",
                    cfg.row
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(req.amount)}
                    </span>
                    <Badge className={cn("gap-1", cfg.badge)}>
                      <Icon className="size-3" />
                      {cfg.label}
                    </Badge>
                  </div>
                  {req.materialName && (
                    <span className="text-sm font-medium">
                      {req.materialName}
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {req.reason}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Requested {formatDate(req.createdAt)}
                    {req.resolvedAt ? ` · Resolved ${formatDate(req.resolvedAt)}` : ""}
                  </span>
                  {req.note && (
                    <span className="mt-1 rounded bg-background/60 px-2 py-1 text-xs italic text-muted-foreground">
                      Director: {req.note}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------- Request dialog --------------------------------------------------

function RequestFundsDialog({
  lowStockNames,
  onSubmit,
}: {
  lowStockNames: string[]
  onSubmit: (input: {
    materialName?: string
    amount: number
    reason: string
  }) => void
}) {
  const [open, setOpen] = useState(false)
  const [material, setMaterial] = useState<string>("none")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")

  const amountNum = Number.parseFloat(amount)
  const valid = amountNum > 0 && reason.trim().length > 0

  function reset() {
    setMaterial("none")
    setAmount("")
    setReason("")
  }

  function handleSubmit() {
    if (!valid) return
    onSubmit({
      materialName: material === "none" ? undefined : material,
      amount: amountNum,
      reason: reason.trim(),
    })
    toast.success("Funds requested", {
      description: `${formatCurrency(amountNum)} request sent to the Director.`,
    })
    reset()
    setOpen(false)
  }

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
          <Button>
            <Send data-icon="inline-start" />
            Request funds
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request funds from Director</DialogTitle>
          <DialogDescription>
            Ask the Director to release money to restock inventory. They will
            approve or decline.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fund-material">
              Material (optional)
            </FieldLabel>
            <Select value={material} onValueChange={(v) => setMaterial(v ?? "none")}>
              <SelectTrigger id="fund-material" className="h-11">
                <SelectValue placeholder="Select a low-stock material" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not material-specific</SelectItem>
                {lowStockNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="fund-amount">Amount</FieldLabel>
            <Input
              id="fund-amount"
              className="h-11"
              type="number"
              inputMode="decimal"
              min={1}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="fund-reason">Reason</FieldLabel>
            <Textarea
              id="fund-reason"
              placeholder="e.g. Oak stock exhausted, need 30 boards for pending orders."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <DialogClose
            render={
              <Button variant="ghost" className="h-11">
                Cancel
              </Button>
            }
          />
          <Button className="h-11" onClick={handleSubmit} disabled={!valid}>
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
