"use client"

import { useMemo } from "react"
import { FileText, Plus } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import type { QuoteStatus } from "@/lib/mock-data"
import { useBranch } from "@/components/shop/branch-store"
import { useQuotes } from "@/components/shop/quotes-store"
import { useOrders } from "@/components/front-desk/orders-store"
import { NewQuoteDialog } from "@/components/shop/new-quote-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DialogTrigger } from "@/components/ui/dialog"

const STATUS_STYLES: Record<QuoteStatus, string> = {
  Approved: "bg-primary/10 text-primary border-primary/20",
  "Pending Director": "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Rejected: "bg-destructive/10 text-destructive border-destructive/20",
}

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function QuotesScreen() {
  const { activeBranch } = useBranch()
  const { quotes, markConverted } = useQuotes()
  const { addOrder } = useOrders()

  const branchQuotes = useMemo(
    () =>
      quotes
        .filter((q) => q.branchId === activeBranch.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [quotes, activeBranch.id]
  )

  const pendingCount = branchQuotes.filter(
    (q) => q.status === "Pending Director"
  ).length

  function handleConvert(quoteId: string) {
    const quote = branchQuotes.find((q) => q.id === quoteId)
    if (!quote) return
    const order = addOrder({
      customerName: quote.customerName,
      contact: quote.contact,
      furnitureType: quote.productName,
      size: quote.size ?? "Custom",
      quotedPrice: quote.quotedPrice,
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDelivery: addDays(28),
      requiresApproval: false,
      referenceImages: [],
      originatingBranch: `Branch ${activeBranch.code} — ${activeBranch.name}`,
      quoteId: quote.id,
    })
    markConverted(quote.id, order.id)
    toast.success(`Workshop order ${order.id} created`, {
      description: `${quote.productName} for ${quote.customerName} is now in production.`,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <FileText className="size-5" />
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Custom quotes
            </h1>
            <p className="max-w-2xl text-pretty text-muted-foreground">
              Bargained prices for bespoke builds. In-range quotes confirm
              instantly; out-of-range quotes wait on the Director&apos;s verdict.
              {pendingCount > 0
                ? ` ${pendingCount} awaiting a verdict.`
                : ""}
            </p>
          </div>
        </div>
        <NewQuoteDialog
          trigger={
            <DialogTrigger
              render={
                <Button className="gap-1.5 self-start">
                  <Plus className="size-4" />
                  New quote
                </Button>
              }
            />
          }
        />
      </div>

      {branchQuotes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FileText className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              No quotes yet. Start one from the catalogue or the button above.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {branchQuotes.map((q) => (
            <Card key={q.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {q.id}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("border", STATUS_STYLES[q.status])}
                  >
                    {q.status}
                  </Badge>
                </div>
                <CardTitle className="text-base text-balance">
                  {q.productName}
                </CardTitle>
                <CardDescription>
                  {q.customerName}
                  {q.contact ? ` · ${q.contact}` : ""}
                  {q.size ? ` · ${q.size}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-2 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">Quoted</span>
                  <span className="text-lg font-semibold tabular-nums">
                    ${q.quotedPrice.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>Reference range</span>
                  <span className="tabular-nums">
                    ${q.refMin.toLocaleString()} – $
                    {q.refMax.toLocaleString()}
                  </span>
                </div>
                {!q.withinRange && (
                  <p className="text-xs text-amber-600">
                    Outside range — routed to the Director.
                  </p>
                )}
                {q.notes && (
                  <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                    {q.notes}
                  </p>
                )}
                {q.directorNote && (
                  <p className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                    <span className="font-medium">Director:</span>{" "}
                    {q.directorNote}
                  </p>
                )}
              </CardContent>
              <CardFooter>
                {q.status === "Approved" && !q.convertedOrderId && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleConvert(q.id)}
                  >
                    Convert to workshop order
                  </Button>
                )}
                {q.convertedOrderId && (
                  <p className="text-xs text-muted-foreground">
                    Workshop order{" "}
                    <span className="font-mono">{q.convertedOrderId}</span>{" "}
                    created.
                  </p>
                )}
                {q.status === "Pending Director" && (
                  <p className="text-xs text-muted-foreground">
                    Waiting for the Director&apos;s verdict.
                  </p>
                )}
                {q.status === "Rejected" && (
                  <p className="text-xs text-destructive">
                    Rejected by the Director.
                  </p>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
