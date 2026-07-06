"use client"

import { useState } from "react"
import { PackageCheck, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useStock } from "@/components/stock-keeper/stock-store"
import type { OrderIssuance } from "@/lib/mock-data"

function IssuanceCard({ issuance }: { issuance: OrderIssuance }) {
  const { items, issueOrder } = useStock()
  // Adjustable quantity per line, seeded from the estimate.
  const [actuals, setActuals] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      issuance.lines.map((l) => [l.inventoryItemId, String(l.estimatedQty)])
    )
  )

  function onHand(itemId: string): number {
    return items.find((i) => i.id === itemId)?.quantity ?? 0
  }

  function handleIssue() {
    const parsed: Record<string, number> = {}
    for (const line of issuance.lines) {
      const value = Number.parseFloat(actuals[line.inventoryItemId])
      parsed[line.inventoryItemId] = Number.isNaN(value) ? 0 : Math.max(0, value)
    }
    issueOrder(issuance.id, parsed)
    const totalLines = issuance.lines.length
    toast.success(`Materials issued for ${issuance.orderId}`, {
      description: `${totalLines} material${totalLines > 1 ? "s" : ""} deducted from inventory.`,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {issuance.orderId}
            </span>
            <span>{issuance.furnitureType}</span>
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {issuance.lines.length} lines
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Estimated</TableHead>
              <TableHead>On hand</TableHead>
              <TableHead>Issue qty</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issuance.lines.map((line) => {
              const available = onHand(line.inventoryItemId)
              const want = Number.parseFloat(actuals[line.inventoryItemId]) || 0
              const short = want > available
              return (
                <TableRow key={line.inventoryItemId}>
                  <TableCell className="font-medium">
                    {line.materialName}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {line.estimatedQty} {line.unit}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "tabular-nums",
                      short ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    <span className="flex items-center gap-1">
                      {short && <AlertTriangle className="size-3" />}
                      {available} {line.unit}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      value={actuals[line.inventoryItemId]}
                      onChange={(e) =>
                        setActuals((prev) => ({
                          ...prev,
                          [line.inventoryItemId]: e.target.value,
                        }))
                      }
                      aria-invalid={short}
                      className="h-8 w-20 tabular-nums"
                      aria-label={`Quantity to issue for ${line.materialName}`}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <div className="flex justify-end">
          <Button onClick={handleIssue}>
            <PackageCheck data-icon="inline-start" />
            Issue materials
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function PendingIssuances() {
  const { orderIssuances } = useStock()
  const pending = orderIssuances.filter((i) => i.status === "Pending")

  if (pending.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing to issue</EmptyTitle>
          <EmptyDescription>
            Per-order material estimates from the Operations Manager will appear
            here, ready for you to confirm and issue.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {pending.map((issuance) => (
        <IssuanceCard key={issuance.id} issuance={issuance} />
      ))}
    </div>
  )
}
