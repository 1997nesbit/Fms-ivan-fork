"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

import {
  additionalIssuances as seedAdditional,
  inventory as seedInventory,
  orderIssuances as seedOrderIssuances,
  reorders as seedReorders,
  type AdditionalIssuance,
  type InventoryCategory,
  type InventoryItem,
  type OrderIssuance,
  type Reorder,
  type ReorderStatus,
} from "@/lib/mock-data"

// --------------------------------------------------------------------------
// Input / patch types
// --------------------------------------------------------------------------

export interface NewInventoryInput {
  name: string
  category: InventoryCategory
  quantity: number
  unit: string
  reorderLevel: number
  unitCost: number
}

export interface InventoryPatch {
  name?: string
  quantity?: number
  unitCost?: number
  reorderLevel?: number
}

export interface RaiseReorderInput {
  inventoryItemId: string
  materialName: string
  unit: string
  qtyOnHand: number
  reorderLevel: number
  qtyOrdered: number
  supplierNote?: string
}

/** An Ops-Manager-approved extra-material request handed to the Stock Keeper. */
export interface NewAdditionalIssuanceInput {
  orderId: string
  technicianName: string
  materialName: string
  unit: string
  approvedQty: number
}

/** A line on a completed issuance, captured for traceability. */
export interface IssuanceRecordLine {
  materialName: string
  quantity: number
  unit: string
}

export interface IssuanceRecord {
  id: string
  ref: string // order id
  kind: "Order" | "Additional"
  detail: string // e.g. furniture type or technician name
  lines: IssuanceRecordLine[]
  date: string // ISO date
}

// --------------------------------------------------------------------------
// Context type
// --------------------------------------------------------------------------

interface StockContextValue {
  items: InventoryItem[]
  orderIssuances: OrderIssuance[]
  additionalIssuances: AdditionalIssuance[]
  records: IssuanceRecord[]
  reorders: Reorder[]
  lowStockCount: number
  pendingIssuanceCount: number
  // Inventory CRUD
  addItem: (input: NewInventoryInput) => void
  updateItem: (id: string, patch: InventoryPatch) => void
  deleteItem: (id: string) => void
  // Issuances
  issueOrder: (issuanceId: string, actuals: Record<string, number>) => void
  issueAdditional: (id: string) => void
  /** Queue an approved extra-material request for physical release. */
  addAdditionalIssuance: (input: NewAdditionalIssuanceInput) => void
  // Reorders
  raiseReorder: (input: RaiseReorderInput) => void
  markOrdered: (id: string, supplierNote?: string) => void
  receiveReorder: (id: string, qtyReceived: number) => void
  deleteReorder: (id: string) => void
}

// --------------------------------------------------------------------------
// Provider
// --------------------------------------------------------------------------

const StockContext = createContext<StockContextValue | null>(null)

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function makeId(prefix: string, list: { id: string }[]): string {
  return `${prefix}-${list.length + 1}-${Date.now()}`
}

export function StockProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<InventoryItem[]>(seedInventory)
  const [orderIssuances, setOrderIssuances] =
    useState<OrderIssuance[]>(seedOrderIssuances)
  const [additionalIssuances, setAdditionalIssuances] =
    useState<AdditionalIssuance[]>(seedAdditional)
  const [records, setRecords] = useState<IssuanceRecord[]>([])
  const [reorderList, setReorderList] = useState<Reorder[]>(seedReorders)

  // ---------- helpers -------------------------------------------------------

  // Deduct a set of {inventoryItemId: qty} from on-hand balances.
  const deduct = useCallback((amounts: Record<string, number>) => {
    setItems((prev) =>
      prev.map((item) => {
        const amount = amounts[item.id]
        if (!amount) return item
        return { ...item, quantity: Math.max(0, item.quantity - amount) }
      })
    )
  }, [])

  // ---------- inventory CRUD ------------------------------------------------

  const addItem = useCallback((input: NewInventoryInput) => {
    setItems((prev) => [
      ...prev,
      { id: `inv-${prev.length + 1}-${Date.now()}`, ...input },
    ])
  }, [])

  const updateItem = useCallback((id: string, patch: InventoryPatch) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }, [])

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  // ---------- issuances -----------------------------------------------------

  // NOTE: side effects (deduct / record) must stay OUT of the issuance state
  // updater — React StrictMode double-invokes updaters, which would otherwise
  // deduct stock twice and log duplicate records.
  const issueOrder = useCallback(
    (issuanceId: string, actuals: Record<string, number>) => {
      const issuance = orderIssuances.find((i) => i.id === issuanceId)
      if (!issuance || issuance.status !== "Pending") return

      deduct(actuals)
      setRecords((r) => [
        {
          id: makeId("rec", r),
          ref: issuance.orderId,
          kind: "Order",
          detail: issuance.furnitureType,
          date: today(),
          lines: issuance.lines.map((line) => ({
            materialName: line.materialName,
            quantity: actuals[line.inventoryItemId] ?? line.estimatedQty,
            unit: line.unit,
          })),
        },
        ...r,
      ])
      setOrderIssuances((prev) =>
        prev.map((i) =>
          i.id === issuanceId
            ? { ...i, status: "Done" as const, issuedAt: today() }
            : i
        )
      )
    },
    [orderIssuances, deduct]
  )

  const issueAdditional = useCallback(
    (id: string) => {
      const issuance = additionalIssuances.find((i) => i.id === id)
      if (!issuance || issuance.status !== "Pending") return

      deduct({ [issuance.inventoryItemId]: issuance.approvedQty })
      setRecords((r) => [
        {
          id: makeId("rec", r),
          ref: issuance.orderId,
          kind: "Additional",
          detail: issuance.technicianName,
          date: today(),
          lines: [
            {
              materialName: issuance.materialName,
              quantity: issuance.approvedQty,
              unit: issuance.unit,
            },
          ],
        },
        ...r,
      ])
      setAdditionalIssuances((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, status: "Done" as const, issuedAt: today() }
            : i
        )
      )
    },
    [additionalIssuances, deduct]
  )

  // Create a pending additional issuance from an approved request. The
  // material name is matched (case-insensitively) to a catalogue item so the
  // Stock Keeper can see the on-hand balance; unknown items still queue with
  // an empty id so the shortfall is surfaced.
  const addAdditionalIssuance = useCallback(
    (input: NewAdditionalIssuanceInput) => {
      const matchedId =
        items.find(
          (i) => i.name.toLowerCase() === input.materialName.toLowerCase()
        )?.id ?? ""
      setAdditionalIssuances((prev) => [
        {
          id: `add-${prev.length + 1}-${Date.now()}`,
          orderId: input.orderId,
          technicianName: input.technicianName,
          inventoryItemId: matchedId,
          materialName: input.materialName,
          unit: input.unit,
          approvedQty: input.approvedQty,
          status: "Pending" as const,
        },
        ...prev,
      ])
    },
    [items]
  )

  // ---------- reorders ------------------------------------------------------

  const raiseReorder = useCallback((input: RaiseReorderInput) => {
    setReorderList((prev) => [
      ...prev,
      {
        id: `RO-${String(prev.length + 1).padStart(3, "0")}`,
        inventoryItemId: input.inventoryItemId,
        materialName: input.materialName,
        unit: input.unit,
        qtyOnHand: input.qtyOnHand,
        reorderLevel: input.reorderLevel,
        qtyOrdered: input.qtyOrdered,
        supplierNote: input.supplierNote,
        status: "Raised" as ReorderStatus,
        raisedAt: today(),
      },
    ])
  }, [])

  const markOrdered = useCallback((id: string, supplierNote?: string) => {
    setReorderList((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "Ordered" as ReorderStatus,
              orderedAt: today(),
              ...(supplierNote ? { supplierNote } : {}),
            }
          : r
      )
    )
  }, [])

  const receiveReorder = useCallback(
    (id: string, qtyReceived: number) => {
      const order = reorderList.find((r) => r.id === id)
      if (!order) return
      // Credit the inventory
      setItems((prev) =>
        prev.map((item) =>
          item.id === order.inventoryItemId
            ? { ...item, quantity: item.quantity + qtyReceived }
            : item
        )
      )
      setReorderList((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: "Received" as ReorderStatus,
                receivedAt: today(),
                qtyReceived,
              }
            : r
        )
      )
    },
    [reorderList]
  )

  const deleteReorder = useCallback((id: string) => {
    setReorderList((prev) => prev.filter((r) => r.id !== id))
  }, [])

  // ---------- context value -------------------------------------------------

  const value = useMemo<StockContextValue>(
    () => ({
      items,
      orderIssuances,
      additionalIssuances,
      records,
      reorders: reorderList,
      lowStockCount: items.filter((i) => i.quantity <= i.reorderLevel).length,
      pendingIssuanceCount:
        orderIssuances.filter((i) => i.status === "Pending").length +
        additionalIssuances.filter((i) => i.status === "Pending").length,
      addItem,
      updateItem,
      deleteItem,
      issueOrder,
      issueAdditional,
      addAdditionalIssuance,
      raiseReorder,
      markOrdered,
      receiveReorder,
      deleteReorder,
    }),
    [
      items,
      orderIssuances,
      additionalIssuances,
      records,
      reorderList,
      addItem,
      updateItem,
      deleteItem,
      issueOrder,
      issueAdditional,
      addAdditionalIssuance,
      raiseReorder,
      markOrdered,
      receiveReorder,
      deleteReorder,
    ]
  )

  return <StockContext.Provider value={value}>{children}</StockContext.Provider>
}

export function useStock(): StockContextValue {
  const ctx = useContext(StockContext)
  if (!ctx) {
    throw new Error("useStock must be used within a StockProvider")
  }
  return ctx
}
