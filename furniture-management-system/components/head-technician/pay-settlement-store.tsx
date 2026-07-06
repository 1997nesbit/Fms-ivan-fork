"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

export interface PayBatch {
  id: string
  technicianId: string
  weekLabel: string
  weekStart: string
  stagesCompleted: number
  rate: number
  total: number
  settledAt?: string
}

interface PaySettlementContextValue {
  batches: PayBatch[]
  upsertBatch: (batch: Omit<PayBatch, "settledAt">) => void
  settleBatch: (batchId: string) => void
}

const PaySettlementContext = createContext<PaySettlementContextValue | null>(null)

const SEED_BATCHES: PayBatch[] = [
  {
    id: "tech-1::Jun 15 – Jun 21, 2026",
    technicianId: "tech-1",
    weekLabel: "Jun 15 – Jun 21, 2026",
    weekStart: "2026-06-15",
    stagesCompleted: 2,
    rate: 140,
    total: 280,
    settledAt: "2026-06-22T09:15:00",
  },
  {
    id: "tech-2::Jun 15 – Jun 21, 2026",
    technicianId: "tech-2",
    weekLabel: "Jun 15 – Jun 21, 2026",
    weekStart: "2026-06-15",
    stagesCompleted: 1,
    rate: 110,
    total: 110,
    settledAt: "2026-06-22T09:30:00",
  },
  {
    id: "tech-3::Jun 15 – Jun 21, 2026",
    technicianId: "tech-3",
    weekLabel: "Jun 15 – Jun 21, 2026",
    weekStart: "2026-06-15",
    stagesCompleted: 1,
    rate: 90,
    total: 90,
    settledAt: "2026-06-22T10:00:00",
  },
  {
    id: "tech-4::Jun 15 – Jun 21, 2026",
    technicianId: "tech-4",
    weekLabel: "Jun 15 – Jun 21, 2026",
    weekStart: "2026-06-15",
    stagesCompleted: 2,
    rate: 105,
    total: 210,
    settledAt: "2026-06-22T10:20:00",
  },
]

export function PaySettlementProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [batches, setBatches] = useState<PayBatch[]>(SEED_BATCHES)

  const upsertBatch = useCallback((batch: Omit<PayBatch, "settledAt">) => {
    setBatches((prev) => {
      const exists = prev.find((b) => b.id === batch.id)
      if (exists) {
        return prev.map((b) =>
          b.id === batch.id ? { ...b, ...batch, settledAt: b.settledAt } : b
        )
      }
      return [...prev, batch]
    })
  }, [])

  const settleBatch = useCallback((batchId: string) => {
    setBatches((prev) =>
      prev.map((b) =>
        b.id === batchId && !b.settledAt
          ? { ...b, settledAt: new Date().toISOString() }
          : b
      )
    )
  }, [])

  const value = useMemo<PaySettlementContextValue>(
    () => ({ batches, upsertBatch, settleBatch }),
    [batches, upsertBatch, settleBatch]
  )

  return (
    <PaySettlementContext.Provider value={value}>
      {children}
    </PaySettlementContext.Provider>
  )
}

export function usePaySettlement(): PaySettlementContextValue {
  const ctx = useContext(PaySettlementContext)
  if (!ctx) {
    throw new Error("usePaySettlement must be used within a PaySettlementProvider")
  }
  return ctx
}
