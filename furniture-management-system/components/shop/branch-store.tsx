"use client"

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { branches, getBranchById, type Branch } from "@/lib/mock-data"

interface BranchContextValue {
  branches: Branch[]
  activeBranchId: string
  activeBranch: Branch
  setActiveBranchId: (id: string) => void
}

const BranchContext = createContext<BranchContextValue | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
  const [activeBranchId, setActiveBranchId] = useState(branches[0].id)

  const value = useMemo<BranchContextValue>(() => {
    const activeBranch = getBranchById(activeBranchId) ?? branches[0]
    return { branches, activeBranchId, activeBranch, setActiveBranchId }
  }, [activeBranchId])

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
