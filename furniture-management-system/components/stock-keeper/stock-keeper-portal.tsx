"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Warehouse } from "lucide-react"

import api from "@/lib/api"
import { toArray } from "@/lib/utils"
import { StockOverview } from "@/components/stock-keeper/stock-overview"
import { InventoryLedger } from "@/components/stock-keeper/inventory-ledger"
import { IssueMaterialsScreen } from "@/components/stock-keeper/issue-materials-screen"
import { ReordersScreen } from "@/components/stock-keeper/reorders-screen"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// ---------------------------------------------------------------------------
// Shared page shell
// ---------------------------------------------------------------------------

function PageShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  const { data: items = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const { data } = await api.get<{
        results: Array<{ id: number; is_low_stock: boolean }>
      }>("/stock/items/")
      return data.results
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  const { data: requests = [] } = useQuery({
    queryKey: ["material-requests"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Array<{ id: number }> }>(
        "/stock/material-requests/"
      )
      return data.results
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const lowStockCount = useMemo(
    () => toArray(items).filter((i) => i.is_low_stock).length,
    [items]
  )
  const pendingIssuanceCount = toArray(requests).length

  const metaItems = useMemo(
    () => [
      { label: "low stock", value: lowStockCount, alert: lowStockCount > 0 },
      {
        label: "pending issuances",
        value: pendingIssuanceCount,
        alert: pendingIssuanceCount > 0,
      },
    ],
    [lowStockCount, pendingIssuanceCount]
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Portal header */}
      <div className="flex flex-wrap items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Warehouse className="size-5" />
        </span>
        <div className="flex-1 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          <p className="max-w-2xl text-pretty text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        {/* Live stats strip */}
        <div className="flex items-center gap-4 self-start rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          {metaItems.map((m) => (
            <span
              key={m.label}
              className={
                m.alert ? "font-semibold text-destructive" : "text-muted-foreground"
              }
            >
              <span className="tabular-nums">{m.value}</span>{" "}
              <span className="hidden sm:inline">{m.label}</span>
            </span>
          ))}
        </div>
      </div>

      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Portal — single-page tabbed layout
// ---------------------------------------------------------------------------

export function StockKeeperPortal() {
  return (
    <PageShell
      title="Stock Keeper Portal"
      description="Manage the inventory ledger, fulfil approved material requests, and submit restock requests for Director approval."
    >
      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="issue">Issue Materials</TabsTrigger>
          <TabsTrigger value="reorders">Reorder Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <StockOverview />
        </TabsContent>

        <TabsContent value="inventory" className="mt-6">
          <InventoryLedger />
        </TabsContent>

        <TabsContent value="issue" className="mt-6">
          <IssueMaterialsScreen />
        </TabsContent>

        <TabsContent value="reorders" className="mt-6">
          <ReordersScreen />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}
