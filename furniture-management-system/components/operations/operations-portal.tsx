"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Factory } from "lucide-react"

import api from "@/lib/api"
import { toArray } from "@/lib/utils"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OpsQueue } from "@/components/operations/ops-queue"
import { PipelineBoard } from "@/components/operations/pipeline-board"
import { MaterialRequestInbox } from "@/components/operations/material-request-inbox"
import { TechnicianRoster } from "@/components/operations/technician-roster"
import { LowStockBanner } from "@/components/stock-keeper/issue-materials-screen"
import type { OpsOrder, MaterialRequest } from "@/components/operations/types"

type OpsTab = "pipeline" | "queue" | "requests" | "technicians"

export function OperationsPortal() {
  const [tab, setTab] = useState<OpsTab>("pipeline")

  const { data: queueOrders = [] } = useQuery<OpsOrder[]>({
    queryKey: ["ops-queue"],
    queryFn: async () => {
      const { data } = await api.get<OpsOrder[]>("/production/ops-queue/")
      return data
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: materialRequests = [] } = useQuery<MaterialRequest[]>({
    queryKey: ["material-requests"],
    queryFn: async () => {
      const { data } = await api.get<{ results: MaterialRequest[] }>(
        "/stock/material-requests/?status=PENDING"
      )
      return data.results
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: lowStockCount = 0 } = useQuery({
    queryKey: ["low-stock-count"],
    queryFn: async () => {
      const { data } = await api.get<{ results: { is_low_stock: boolean }[] }>("/stock/items/")
      return data.results.filter((i) => i.is_low_stock).length
    },
    staleTime: 60_000,
  })

  const queueCount = toArray(queueOrders).length
  const pendingCount = toArray(materialRequests).length

  return (
    <div className="flex flex-col gap-6">
      <LowStockBanner count={lowStockCount} />

      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Factory className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Operations Manager Portal
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Plan production for confirmed orders, assign technicians and
            wages, and track the workshop pipeline.
          </p>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as OpsTab)}
        className="gap-6"
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5">
            Ops queue
            {queueCount > 0 && (
              <span className="rounded-full bg-foreground/10 px-1.5 text-xs font-medium tabular-nums">
                {queueCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-1.5">
            Material requests
            {pendingCount > 0 && (
              <span className="rounded-full bg-foreground/10 px-1.5 text-xs font-medium tabular-nums">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="technicians">Technicians</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "pipeline" && <PipelineBoard />}
      {tab === "queue" && <OpsQueue />}
      {tab === "requests" && <MaterialRequestInbox />}
      {tab === "technicians" && <TechnicianRoster />}
    </div>
  )
}
