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

const SEED_BATCHES: PayBatch[] = []

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
