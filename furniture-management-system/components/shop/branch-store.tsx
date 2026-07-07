"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import api from "@/lib/api"
import type { Branch } from "@/lib/mock-data"

interface BranchContextValue {
  branches: Branch[]
  activeBranchId: string
  activeBranch: Branch | null
  setActiveBranchId: (id: string) => void
}

const BranchContext = createContext<BranchContextValue | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [activeBranchId, setActiveBranchId] = useState("")

  useEffect(() => {
    api
      .get<{ results: Array<{ id: number; name: string; code: string }> }>(
        "/branches/"
      )
      .then(({ data }) => {
        const mapped: Branch[] = data.results.map((b) => ({
          id: String(b.id),
          code: b.code,
          name: b.name,
        }))
        setBranches(mapped)
        setActiveBranchId((prev) => prev || mapped[0]?.id || "")
      })
      .catch(() => {})
  }, [])

  const value = useMemo<BranchContextValue>(() => {
    const activeBranch =
      branches.find((b) => b.id === activeBranchId) ?? branches[0] ?? null
    return { branches, activeBranchId, activeBranch, setActiveBranchId }
  }, [branches, activeBranchId])

  return (
    <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
  )
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext)
  if (!ctx) {
    throw new Error("useBranch must be used within a BranchProvider")
  }
  return ctx
}
