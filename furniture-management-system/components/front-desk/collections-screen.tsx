"use client"

import { useMemo, useState } from "react"
import {
  CheckCircle2,
  Clock,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { Order } from "@/lib/mock-data"
import { useOrders } from "@/components/front-desk/orders-store"
import { StatusBadge } from "@/components/front-desk/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function CollectionsScreen() {
  const { orders, markCollected } = useOrders()
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const match = (o: Order) =>
    !q ||
    o.id.toLowerCase().includes(q) ||
    o.customerName.toLowerCase().includes(q) ||
    o.furnitureType.toLowerCase().includes(q)

  const awaitingReturn = useMemo(
    () => orders.filter((o) => o.status === "Awaiting Return" && match(o)),
    [orders, q]
  )
  const readyForCollection = useMemo(
    () => orders.filter((o) => o.status === "Ready for Collection" && match(o)),
    [orders, q]
  )
  const collected = useMemo(
    () =>
      orders
        .filter((o) => o.status === "Collected" && match(o))
        .sort((a, b) =>
          (b.collectedAt ?? "").localeCompare(a.collectedAt ?? "")
        ),
    [orders, q]
  )

  function handleCollect(order: Order) {
    markCollected(order.id)
    toast.success("Marked as collected", {
      description: `${order.id} · ${order.customerName} — recorded just now.`,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <PackageCheck className="size-5" />
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Collections
            </h1>
            <p className="max-w-2xl text-pretty text-muted-foreground">
              Follow finished orders from the workshop to the customer&apos;s
              hands — receive returns from technicians and close them out on
              pick-up.
            </p>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order, customer or item…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Awaiting return</CardDescription>
              <Truck className="size-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl tabular-nums">
              {awaitingReturn.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Finished in the workshop, not yet handed back to the desk.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Ready for collection</CardDescription>
              <PackageCheck className="size-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl tabular-nums">
              {readyForCollection.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Back at the desk — call the customer to pick up.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-2 pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Collected</CardDescription>
              <CheckCircle2 className="size-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl tabular-nums">
              {collected.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Completed hand-offs on record.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Awaiting return from technicians */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Clock className="size-4 text-teal-600" />
          Awaiting return from the workshop
        </h2>
        {awaitingReturn.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nothing waiting to come back right now.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {awaitingReturn.map((order) => (
              <Card key={order.id} className="border-teal-500/30">
                <CardHeader className="gap-1 pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {order.furnitureType}
                    </CardTitle>
                    <span className="font-mono text-xs text-muted-foreground">
                      {order.id}
                    </span>
                  </div>
                  <CardDescription>{order.customerName}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <StatusBadge status={order.status} />
                  <p className="text-xs text-muted-foreground">
                    The last technician still needs to hand this piece back to
                    the Front Desk.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Ready for collection */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <PackageCheck className="size-4 text-green-600" />
          Ready for the customer
        </h2>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Furniture</TableHead>
                  <TableHead className="text-right">Quoted</TableHead>
                  <TableHead>Returned</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyForCollection.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No orders are ready for collection.
                    </TableCell>
                  </TableRow>
                ) : (
                  readyForCollection.map((order) => (
                    <TableRow
                      key={order.id}
                      className="bg-green-50/70 hover:bg-green-50 dark:bg-green-950/30"
                    >
                      <TableCell className="font-medium tabular-nums">
                        {order.id}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {order.customerName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {order.contact}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{order.furnitureType}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {currency.format(order.quotedPrice)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {order.returnedAt
                          ? formatDateTime(order.returnedAt)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => handleCollect(order)}>
                          <CheckCircle2 data-icon="inline-start" />
                          Mark Collected
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>

      {/* Collected history */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Collected history ({collected.length})
        </h2>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Furniture</TableHead>
                  <TableHead>Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collected.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No collections recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  collected.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium tabular-nums">
                        {order.id}
                      </TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>{order.furnitureType}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {order.collectedAt ? (
                          <Badge
                            variant="outline"
                            className="border-border bg-muted text-muted-foreground"
                          >
                            {formatDateTime(order.collectedAt)}
                          </Badge>
                        ) : (
                          formatDate(order.orderDate)
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>
    </div>
  )
}
