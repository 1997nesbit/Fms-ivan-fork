"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { PackageCheck } from "lucide-react"

import api from "@/lib/api"
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
import { AssignStagesDialog } from "@/components/operations/assign-stages-dialog"
import type { OpsOrder, Technician } from "@/components/operations/types"

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function OpsQueue() {
  const [selected, setSelected] = useState<OpsOrder | null>(null)

  const { data: queue = [], isLoading } = useQuery<OpsOrder[]>({
    queryKey: ["ops-queue"],
    queryFn: async () => {
      const { data } = await api.get<OpsOrder[]>("/production/ops-queue/")
      return data
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: technicians = [] } = useQuery<Technician[]>({
    queryKey: ["technicians"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Technician[] }>("/stock/technicians/")
      return data.results
    },
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (queue.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Queue is clear</EmptyTitle>
          <EmptyDescription>
            Every confirmed order has a production plan. New approved orders will
            appear here for stage assignment.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <PackageCheck className="size-4 shrink-0 text-primary" />
          {queue.length} order{queue.length === 1 ? "" : "s"} awaiting a production
          plan. Assign stages and technicians to start the build.
        </p>

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {order.reference_number}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{order.customer_name}</span>
                      <span className="text-xs text-muted-foreground">{order.customer_phone}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-40 truncate">{order.item_description}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(order.delivery_date)}
                  </TableCell>
                  <TableCell className="text-right">
                    <AssignStagesDialog
                      order={order}
                      technicians={technicians}
                      open={selected?.id === order.id}
                      onOpenChange={(v) => setSelected(v ? order : null)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  )
}
