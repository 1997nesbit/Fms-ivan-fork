"use client"

import { useMemo, useState } from "react"
import { Gavel, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { getBranchById, type QuoteStatus } from "@/lib/mock-data"
import { useQuotes } from "@/components/shop/quotes-store"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const STATUS_STYLES: Record<QuoteStatus, string> = {
  Approved: "bg-primary/10 text-primary border-primary/20",
  "Pending Director": "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Rejected: "bg-destructive/10 text-destructive border-destructive/20",
}

export function QuoteVerdictsScreen() {
  const { quotes, approveQuote, rejectQuote } = useQuotes()
  const [notes, setNotes] = useState<Record<string, string>>({})

  const pending = useMemo(
    () => quotes.filter((q) => q.status === "Pending Director"),
    [quotes]
  )
  const decided = useMemo(
    () =>
      quotes
        .filter((q) => q.status !== "Pending Director" && q.decidedAt)
        .sort((a, b) => ((a.decidedAt ?? "") < (b.decidedAt ?? "") ? 1 : -1))
        .slice(0, 8),
    [quotes]
  )

  function handleApprove(id: string, name: string) {
    approveQuote(id, notes[id])
    toast.success(`Quote ${id} approved`, {
      description: `${name} can proceed at the bargained price.`,
    })
  }

  function handleReject(id: string, name: string) {
    rejectQuote(id, notes[id])
    toast.info(`Quote ${id} rejected`, {
      description: `${name}'s bargained price was declined.`,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Gavel className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Custom quote verdicts
          </h1>
          <p className="max-w-xl text-pretty text-muted-foreground">
            Front Desk bargains that fell outside the catalogue range. Give the
            final verdict on the price.
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Awaiting verdict ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No quotes waiting on you right now.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {pending.map((q) => {
              const branch = getBranchById(q.branchId)
              const belowFloor = q.quotedPrice < q.refMin
              return (
                <Card key={q.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {q.id}
                      </span>
                      <Badge variant="secondary">
                        {branch ? `Branch ${branch.code}` : q.branchId}
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
                  <CardContent className="flex flex-1 flex-col gap-3 text-sm">
                    <div className="flex items-baseline justify-between">
                      <span className="text-muted-foreground">
                        Bargained price
                      </span>
                      <span className="text-lg font-semibold tabular-nums">
                        ${q.quotedPrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <TriangleAlert className="size-3.5 shrink-0" />
                      {belowFloor ? "Below" : "Above"} the $
                      {q.refMin.toLocaleString()}–$
                      {q.refMax.toLocaleString()} reference range.
                    </div>
                    {q.notes && (
                      <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                        {q.notes}
                      </p>
                    )}
                    <Input
                      value={notes[q.id] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder="Add a note (optional)…"
                      className="h-9"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleApprove(q.id, q.customerName)}
                      >
                        Approve price
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleReject(q.id, q.customerName)}
                      >
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Recent verdicts
          </h2>
          <Card>
            <CardContent className="flex flex-col gap-2 py-4">
              {decided.map((q) => {
                const branch = getBranchById(q.branchId)
                return (
                  <div
                    key={q.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {q.productName}{" "}
                        <span className="font-mono text-xs text-muted-foreground">
                          {q.id}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {q.customerName} ·{" "}
                        {branch ? branch.name : q.branchId} · $
                        {q.quotedPrice.toLocaleString()}
                        {q.directorNote ? ` · "${q.directorNote}"` : ""}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("border", STATUS_STYLES[q.status])}
                    >
                      {q.status}
                    </Badge>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
