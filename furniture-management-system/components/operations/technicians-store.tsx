"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import { technicians as seedTechnicians, type Technician } from "@/lib/mock-data"

export interface NewTechnicianInput {
  name: string
  specialty: string
  pin: string
  rate: number
}

interface TechniciansContextValue {
  technicians: Technician[]
  activeTechnicians: Technician[]
  addTechnician: (input: NewTechnicianInput) => void
  removeTechnician: (id: string) => void
  setActive: (id: string, active: boolean) => void
}

const TechniciansContext = createContext<TechniciansContextValue | null>(null)

function makeTechId(existing: Technician[]): string {
  const maxNum = existing.reduce((max, t) => {
    const num = Number.parseInt(t.id.replace(/\D/g, ""), 10)
    return Number.isNaN(num) ? max : Math.max(max, num)
  }, 0)
  return `tech-${maxNum + 1}`
}

export function TechniciansProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [technicians, setTechnicians] = useState<Technician[]>(seedTechnicians)

  const addTechnician = useCallback((input: NewTechnicianInput) => {
    setTechnicians((prev) => [
      ...prev,
      {
        id: makeTechId(prev),
        name: input.name,
        specialty: input.specialty || "General",
        phone: "—",
        activeOrders: 0,
        rate: input.rate,
        pin: input.pin,
        active: true,
      },
    ])
  }, [])

  const removeTechnician = useCallback((id: string) => {
    setTechnicians((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const setActive = useCallback((id: string, active: boolean) => {
    setTechnicians((prev) =>
      prev.map((t) => (t.id === id ? { ...t, active } : t))
    )
  }, [])

  const value = useMemo<TechniciansContextValue>(
    () => ({
      technicians,
      activeTechnicians: technicians.filter((t) => t.active),
      addTechnician,
      removeTechnician,
      setActive,
    }),
    [technicians, addTechnician, removeTechnician, setActive]
  )

  return (
    <TechniciansContext.Provider value={value}>
      {children}
    </TechniciansContext.Provider>
  )
}

export function useTechnicians(): TechniciansContextValue {
  const ctx = useContext(TechniciansContext)
  if (!ctx) {
    throw new Error("useTechnicians must be used within a TechniciansProvider")
  }
  return ctx
}
