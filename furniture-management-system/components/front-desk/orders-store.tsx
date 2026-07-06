"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import {
  orders as seedOrders,
  type Order,
  type OrderStage,
  type OrderStatus,
} from "@/lib/mock-data"

export interface NewOrderInput {
  customerName: string
  contact: string
  furnitureType: string
  size: string
  quotedPrice: number
  orderDate: string
  expectedDelivery: string
  requiresApproval: boolean
  referenceImages: string[]
  originatingBranch?: string
  quoteId?: string
}

export type StagePlan = Omit<OrderStage, "status" | "completedAt">

interface OrdersContextValue {
  orders: Order[]
  addOrder: (input: NewOrderInput) => Order
  markCollected: (orderId: string) => void
  approveOrder: (orderId: string, customerPrice: number) => void
  assignStages: (orderId: string, stages: StagePlan[]) => void
  priceStages: (orderId: string, wages: number[]) => void
  startWork: (orderId: string) => void
  completeStage: (orderId: string, stageIndex: number) => void
  returnToFrontDesk: (orderId: string) => void
}

const OrdersContext = createContext<OrdersContextValue | null>(null)

function makeOrderId(existing: Order[]): string {
  const maxNum = existing.reduce((max, o) => {
    const num = Number.parseInt(o.id.replace(/\D/g, ""), 10)
    return Number.isNaN(num) ? max : Math.max(max, num)
  }, 1000)
  return `ORD-${maxNum + 1}`
}

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(seedOrders)

  const addOrder = useCallback((input: NewOrderInput): Order => {
    const status: OrderStatus = input.requiresApproval
      ? "Pending Approval"
      : "In Workshop"

    const newOrder: Order = {
      id: makeOrderId(orders),
      customerName: input.customerName,
      contact: input.contact,
      furnitureType: input.furnitureType,
      size: input.size,
      quotedPrice: input.quotedPrice,
      orderDate: input.orderDate,
      expectedDelivery: input.expectedDelivery,
      status,
      originatingBranch: input.originatingBranch ?? "Front Desk",
      referenceImages: input.referenceImages,
      quoteId: input.quoteId,
      stages: [],
    }

    setOrders((prev) => [newOrder, ...prev])
    return newOrder
  }, [orders])

  const markCollected = useCallback((orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, status: "Collected", collectedAt: new Date().toISOString() }
          : o
      )
    )
  }, [])

  const approveOrder = useCallback((orderId: string, customerPrice: number) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, quotedPrice: customerPrice, status: "In Workshop", stages: [] }
          : o
      )
    )
  }, [])

  const assignStages = useCallback((orderId: string, stages: StagePlan[]) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: "Planned",
              stages: stages.map((stage) => ({
                ...stage,
                status: "Pending" as const,
              })),
            }
          : o
      )
    )
  }, [])

  const priceStages = useCallback((orderId: string, wages: number[]) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              stages: o.stages.map((stage, index) => ({
                ...stage,
                wage: wages[index] ?? stage.wage,
              })),
            }
          : o
      )
    )
  }, [])

  const startWork = useCallback((orderId: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId || o.status !== "Planned" || o.stages.length === 0) {
          return o
        }
        return {
          ...o,
          status: "In Workshop",
          stages: o.stages.map((stage, index) => ({
            ...stage,
            status: index === 0 ? ("Active" as const) : ("Pending" as const),
          })),
        }
      })
    )
  }, [])

  const completeStage = useCallback((orderId: string, stageIndex: number) => {
    const today = new Date().toISOString().slice(0, 10)
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o
        const stages = o.stages.map((stage, index) => {
          if (index === stageIndex) {
            return { ...stage, status: "Done" as const, completedAt: today }
          }
          if (index === stageIndex + 1 && stage.status === "Pending") {
            return { ...stage, status: "Active" as const }
          }
          return stage
        })
        const allDone = stages.every((s) => s.status === "Done")
        return {
          ...o,
          stages,
          status: allDone ? ("Awaiting Return" as const) : o.status,
        }
      })
    )
  }, [])

  const returnToFrontDesk = useCallback((orderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId && o.status === "Awaiting Return"
          ? {
              ...o,
              status: "Ready for Collection",
              returnedAt: new Date().toISOString(),
            }
          : o
      )
    )
  }, [])

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders,
      addOrder,
      markCollected,
      approveOrder,
      assignStages,
      priceStages,
      startWork,
      completeStage,
      returnToFrontDesk,
    }),
    [
      orders,
      addOrder,
      markCollected,
      approveOrder,
      assignStages,
      priceStages,
      startWork,
      completeStage,
      returnToFrontDesk,
    ]
  )

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders(): OrdersContextValue {
  const ctx = useContext(OrdersContext)
  if (!ctx) {
    throw new Error("useOrders must be used within an OrdersProvider")
  }
  return ctx
}
