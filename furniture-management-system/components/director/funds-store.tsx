"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

export type FundRequestStatus = "Pending" | "Approved" | "Declined"

export interface FundRequest {
  id: string
  materialName?: string
  amount: number
  reason: string
  requestedBy: string
  createdAt: string
  status: FundRequestStatus
  resolvedAt?: string
  note?: string
}

export interface NewFundRequestInput {
  materialName?: string
  amount: number
  reason: string
  requestedBy?: string
}

interface FundsContextValue {
  requests: FundRequest[]
  pendingCount: number
  requestFunds: (input: NewFundRequestInput) => void
  approveFunds: (id: string, note?: string) => void
  declineFunds: (id: string, note?: string) => void
}

const FundsContext = createContext<FundsContextValue | null>(null)

const seedRequests: FundRequest[] = [
  {
    id: "FR-001",
    materialName: "Oak Boards (20mm)",
    amount: 4800,
    reason: "Oak stock exhausted — need to restock 30 boards for pending orders.",
    requestedBy: "Stock Keeper",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    status: "Pending",
  },
]

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function FundsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<FundRequest[]>(seedRequests)

  const requestFunds = useCallback((input: NewFundRequestInput) => {
    setRequests((prev) => [
      {
        id: `FR-${String(prev.length + 1).padStart(3, "0")}`,
        materialName: input.materialName,
        amount: input.amount,
        reason: input.reason,
        requestedBy: input.requestedBy ?? "Stock Keeper",
        createdAt: today(),
        status: "Pending" as FundRequestStatus,
      },
      ...prev,
    ])
  }, [])

  const approveFunds = useCallback((id: string, note?: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: "Approved" as FundRequestStatus, resolvedAt: today(), note }
          : r
      )
    )
  }, [])

  const declineFunds = useCallback((id: string, note?: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: "Declined" as FundRequestStatus, resolvedAt: today(), note }
          : r
      )
    )
  }, [])

  const value = useMemo<FundsContextValue>(
    () => ({
      requests,
      pendingCount: requests.filter((r) => r.status === "Pending").length,
      requestFunds,
      approveFunds,
      declineFunds,
    }),
    [requests, requestFunds, approveFunds, declineFunds]
  )

  return <FundsContext.Provider value={value}>{children}</FundsContext.Provider>
}

export function useFunds(): FundsContextValue {
  const ctx = useContext(FundsContext)
  if (!ctx) {
    throw new Error("useFunds must be used within a FundsProvider")
  }
  return ctx
}
