"use client"

import { PackagePlus, AlertTriangle, Check } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { useStock } from "@/components/stock-keeper/stock-store"

export function AdditionalIssuances() {
  const { additionalIssuances, items, issueAdditional } = useStock()

  if (additionalIssuances.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No additional requests</EmptyTitle>
          <EmptyDescription>
            Extra-material requests approved by the Operations Manager will
            appear here for physical issue.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <PackagePlus className="size-4 text-primary" />
        Extras approved mid-build — issued on top of the original per-order
        estimate.
      </p>

      {additionalIssuances.map((issuance) => {
        const available =
          items.find((i) => i.id === issuance.inventoryItemId)?.quantity ?? 0
        const short = issuance.status === "Pending" && issuance.approvedQty > available
        const done = issuance.status === "Done"

        return (
          <div
            key={issuance.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-dashed p-4",
              done
                ? "border-border bg-muted/40"
                : "border-primary/40 bg-accent/40"
            )}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {issuance.orderId}
                </span>
                <Badge variant="outline" className="border-primary/50">
                  Additional
                </Badge>
              </div>
              <span className="font-medium">
                {issuance.approvedQty} {issuance.unit} — {issuance.materialName}
              </span>
              <span className="text-xs text-muted-foreground">
                Requested by {issuance.technicianName}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {!done && (
                <span
                  className={cn(
                    "flex items-center gap-1 text-sm tabular-nums",
                    short ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {short && <AlertTriangle className="size-3" />}
                  {available} {issuance.unit} on hand
                </span>
              )}
              {done ? (
                <Badge variant="secondary" className="gap-1">
                  <Check className="size-3" />
                  Issued
                </Badge>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    issueAdditional(issuance.id)
                    toast.success(`Issued for ${issuance.orderId}`, {
                      description: `${issuance.approvedQty} ${issuance.unit} of ${issuance.materialName} deducted from inventory.`,
                    })
                  }}
                >
                  <PackagePlus data-icon="inline-start" />
                  Issue
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
