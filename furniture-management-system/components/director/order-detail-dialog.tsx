"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { CheckCircle2, ImageIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"
import { StatusBadge } from "@/components/front-desk/status-badge"
import {
  getOrderCosting,
  formatCurrency,
} from "@/lib/costing"
import { getTechnicianById, type Order } from "@/lib/mock-data"

interface OrderDetailDialogProps {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: (orderId: string, customerPrice: number) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function OrderDetailDialog({
  order,
  open,
  onOpenChange,
  onApprove,
}: OrderDetailDialogProps) {
  const [price, setPrice] = useState("")

  // Seed the price field with the front desk's quoted price each time a new
  // order is opened.
  useEffect(() => {
    if (order) setPrice(order.quotedPrice ? String(order.quotedPrice) : "")
  }, [order])

  if (!order) return null

  const costing = getOrderCosting(order)
  const numericPrice = Number.parseFloat(price)
  const canApprove = !Number.isNaN(numericPrice) && numericPrice > 0
  const projectedMargin = canApprove ? numericPrice - costing.totalCost : null

  function handleApprove() {
    if (!order || !canApprove) return
    onApprove(order.id, numericPrice)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{order.furnitureType}</DialogTitle>
            <StatusBadge status={order.status} />
          </div>
          <DialogDescription>
            {order.id} · received from {order.originatingBranch}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          {/* Order details */}
          <section className="grid grid-cols-2 gap-4 text-sm">
            <Detail label="Customer" value={order.customerName} />
            <Detail label="Contact" value={order.contact} />
            <Detail label="Furniture type" value={order.furnitureType} />
            <Detail label="Size / dimensions" value={order.size} />
            <Detail label="Order date" value={formatDate(order.orderDate)} />
            <Detail
              label="Expected delivery"
              value={formatDate(order.expectedDelivery)}
            />
          </section>

          <Separator />

          {/* Reference images */}
          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <ImageIcon className="size-4 text-muted-foreground" />
              Reference images
            </h3>
            {order.referenceImages && order.referenceImages.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {order.referenceImages.map((src, i) => (
                  <div
                    key={src}
                    className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  >
                    <Image
                      src={src || "/placeholder.svg"}
                      alt={`${order.furnitureType} reference ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, 200px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No reference images were uploaded for this order.
              </p>
            )}
          </section>

          <Separator />

          {/* Stage / material summary */}
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-foreground">
              Planned stages
            </h3>
            <ul className="flex flex-col gap-2">
              {order.stages.map((stage) => {
                const tech = getTechnicianById(stage.headTechId)
                return (
                  <li
                    key={stage.name}
                    className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-foreground">
                      {stage.name}
                    </span>
                    <span className="text-muted-foreground">
                      {tech ? tech.name : "Unassigned"}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>

          <Separator />

          {/* Cost preview + price approval */}
          <section className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <CostStat label="Materials" value={formatCurrency(costing.materialsCost)} />
              <CostStat label="Labour" value={formatCurrency(costing.labourCost)} />
              <CostStat label="Total cost" value={formatCurrency(costing.totalCost)} />
            </div>

            <Field>
              <FieldLabel htmlFor="approve-price">
                Confirm customer price
              </FieldLabel>
              <Input
                id="approve-price"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Enter approved price"
              />
              <FieldDescription>
                {projectedMargin !== null ? (
                  <>
                    Projected gross margin:{" "}
                    <span
                      className={
                        projectedMargin >= 0
                          ? "font-medium text-green-600 dark:text-green-400"
                          : "font-medium text-destructive"
                      }
                    >
                      {formatCurrency(projectedMargin)}
                    </span>
                  </>
                ) : (
                  "Enter a price to see the projected margin."
                )}
              </FieldDescription>
            </Field>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApprove} disabled={!canApprove}>
            <CheckCircle2 data-icon="inline-start" />
            Approve &amp; Release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

function CostStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/50 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  )
}
