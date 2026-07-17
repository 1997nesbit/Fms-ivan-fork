"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckCircle2,
  Clock,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react"
import { toast } from "sonner"

import api from "@/lib/api"
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

interface ApiOrder {
  id: number
  reference_number: string
  customer_name: string
  customer_phone: string
  item_description: string
  quoted_price: string | null
  status: string
  updated_at: string
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function useCollections() {
  const qc = useQueryClient()

  const { data: ready = [], isLoading: loadingReady } = useQuery<ApiOrder[]>({
    queryKey: ["orders", "WORKSHOP_COMPLETE"],
    queryFn: () =>
      api
        .get<ApiOrder[]>("/orders/", { params: { status: "WORKSHOP_COMPLETE" } })
        .then((r) => r.data),
  })

  const { data: done = [], isLoading: loadingDone } = useQuery<ApiOrder[]>({
    queryKey: ["orders", "DISPATCHED"],
    queryFn: () =>
      api
        .get<ApiOrder[]>("/orders/", { params: { status: "DISPATCHED" } })
        .then((r) => r.data),
  })

  const collectMutation = useMutation({
    mutationFn: (orderId: number) => api.post(`/orders/${orderId}/collect/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders", "WORKSHOP_COMPLETE"] })
      qc.invalidateQueries({ queryKey: ["orders", "DISPATCHED"] })
    },
  })

  return {
    ready,
    done,
    isLoading: loadingReady || loadingDone,
    collect: collectMutation,
  }
}

export function CollectionsScreen() {
  const { ready, done, isLoading, collect } = useCollections()
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const match = (o: ApiOrder) =>
    !q ||
    o.reference_number.toLowerCase().includes(q) ||
    o.customer_name.toLowerCase().includes(q) ||
    o.item_description.toLowerCase().includes(q)

  const readyFiltered = ready.filter(match)
  const doneFiltered = done
    .filter(match)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  function handleCollect(order: ApiOrder) {
    collect.mutate(order.id, {
      onSuccess: () =>
        toast.success("Marked as collected", {
          description: `${order.reference_number} · ${order.customer_name} — recorded just now.`,
        }),
      onError: () => toast.error("Failed to record collection. Please try again."),
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
            <p className="max-w-xl text-pretty text-muted-foreground">
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
            <CardTitle className="text-2xl tabular-nums">0</CardTitle>
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
              {isLoading ? "—" : ready.length}
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
              {isLoading ? "—" : done.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Completed hand-offs on record.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Awaiting return from technicians — placeholder until a backend status exists */}
      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Clock className="size-4 text-teal-600" />
          Awaiting return from the workshop
        </h2>
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nothing waiting to come back right now.
          </CardContent>
        </Card>
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
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Quoted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyFiltered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No orders are ready for collection.
                    </TableCell>
                  </TableRow>
                ) : (
                  readyFiltered.map((order) => (
                    <TableRow
                      key={order.id}
                      className="bg-green-50/70 hover:bg-green-50 dark:bg-green-950/30"
                    >
                      <TableCell className="font-medium tabular-nums">
                        {order.reference_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {order.customer_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {order.customer_phone}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{order.item_description}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {order.quoted_price
                          ? currency.format(Number(order.quoted_price))
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          disabled={collect.isPending}
                          onClick={() => handleCollect(order)}
                        >
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
          Collected history ({doneFiltered.length})
        </h2>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doneFiltered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No collections recorded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  doneFiltered.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium tabular-nums">
                        {order.reference_number}
                      </TableCell>
                      <TableCell>{order.customer_name}</TableCell>
                      <TableCell>{order.item_description}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        <Badge
                          variant="outline"
                          className="border-border bg-muted text-muted-foreground"
                        >
                          {formatDateTime(order.updated_at)}
                        </Badge>
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
