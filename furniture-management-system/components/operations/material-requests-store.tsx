"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import {
  materialRequests as seedRequests,
  type MaterialRequest,
  type MaterialRequestStatus,
} from "@/lib/mock-data"

export interface NewMaterialRequestInput {
  orderId: string
  technicianId: string
  technicianName: string
  materialName: string
  quantity: number
  unit: string
}

interface MaterialRequestsContextValue {
  requests: MaterialRequest[]
  pendingCount: number
  setStatus: (id: string, status: MaterialRequestStatus) => void
  addRequest: (input: NewMaterialRequestInput) => void
}

const MaterialRequestsContext =
  createContext<MaterialRequestsContextValue | null>(null)

export function MaterialRequestsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [requests, setRequests] = useState<MaterialRequest[]>(seedRequests)

  const setStatus = useCallback(
    (id: string, status: MaterialRequestStatus) => {
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      )
    },
    []
  )

  const addRequest = useCallback((input: NewMaterialRequestInput) => {
    setRequests((prev) => {
      const id = `req-${prev.length + 1}-${Date.now()}`
      const newRequest: MaterialRequest = {
        id,
        orderId: input.orderId,
        technicianId: input.technicianId,
        technicianName: input.technicianName,
        materialName: input.materialName,
        quantity: input.quantity,
        unit: input.unit,
        requestedAt: new Date().toISOString().slice(0, 10),
        status: "Pending",
      }
      return [newRequest, ...prev]
    })
  }, [])

  const value = useMemo<MaterialRequestsContextValue>(
    () => ({
      requests,
      pendingCount: requests.filter((r) => r.status === "Pending").length,
      setStatus,
      addRequest,
    }),
    [requests, setStatus, addRequest]
  )

  return (
    <MaterialRequestsContext.Provider value={value}>
      {children}
    </MaterialRequestsContext.Provider>
  )
}

export function useMaterialRequests(): MaterialRequestsContextValue {
  const ctx = useContext(MaterialRequestsContext)
  if (!ctx) {
    throw new Error(
      "useMaterialRequests must be used within a MaterialRequestsProvider"
    )
  }
  return ctx
}
