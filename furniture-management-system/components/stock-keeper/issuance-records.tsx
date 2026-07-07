"use client"

import { Badge } from "@/components/ui/badge"
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

export function IssuanceRecords() {
  const { records } = useStock()

  if (records.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No issuances yet</EmptyTitle>
          <EmptyDescription>
            Every batch of materials you issue is logged here with its order
            reference and quantities, keeping each order&apos;s materials cost
            traceable.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Materials issued</TableHead>
            <TableHead className="text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((rec) => (
            <TableRow key={rec.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-mono text-xs text-muted-foreground">
                    {rec.ref}
                  </span>
                  <span className="text-sm">{rec.detail}</span>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={rec.kind === "Additional" ? "outline" : "secondary"}
                  className={rec.kind === "Additional" ? "border-primary/50" : ""}
                >
                  {rec.kind}
                </Badge>
              </TableCell>
              <TableCell>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {rec.lines.map((line, i) => (
                    <li key={i} className="tabular-nums">
                      {line.quantity} {line.unit}{" "}
                      <span className="text-muted-foreground">
                        {line.materialName}
                      </span>
                    </li>
                  ))}
                </ul>
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                {rec.date}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
