"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import {
  shopItems as seedItems,
  shopSales as seedSales,
  getBranchById,
  type PaymentMethod,
  type ShopCategory,
  type ShopItem,
  type ShopSale,
  type ShopSaleLine,
} from "@/lib/mock-data"

export interface NewItemInput {
  name: string
  category: ShopCategory
  branchId: string
  price: number
  costPrice?: number | null
  isSet?: boolean
  dateEntered: string
  photo?: string
}

export interface SellItemsInput {
  itemIds: string[]
  branchId: string
  customerName: string
  contact: string
  paymentMethod: PaymentMethod
}

export interface UpdateItemInput {
  name: string
  category: ShopCategory
  branchId: string
  price: number
  costPrice?: number | null
  isSet?: boolean
  photo?: string
}

interface ShowroomContextValue {
  items: ShopItem[]
  sales: ShopSale[]
  addItem: (input: NewItemInput) => string
  updateItem: (id: string, input: UpdateItemInput) => void
  deleteItem: (id: string) => void
  sellItems: (input: SellItemsInput) => void
}

const ShowroomContext = createContext<ShowroomContextValue | null>(null)

function highestSeq(items: ShopItem[], branchId: string): number {
  const code = getBranchById(branchId)?.code ?? "X"
  const prefix = `ITEM-${code}-`
  return items
    .filter((i) => i.id.startsWith(prefix))
    .reduce((max, i) => {
      const seq = Number.parseInt(i.id.slice(prefix.length), 10)
      return Number.isNaN(seq) ? max : Math.max(max, seq)
    }, 0)
}

function nextItemId(items: ShopItem[], branchId: string): string {
  const code = getBranchById(branchId)?.code ?? "X"
  const seq = String(highestSeq(items, branchId) + 1).padStart(3, "0")
  return `ITEM-${code}-${seq}`
}

export function ShowroomProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ShopItem[]>(seedItems)
  const [sales, setSales] = useState<ShopSale[]>(seedSales)

  const addItem = useCallback(
    (input: NewItemInput): string => {
      const id = nextItemId(items, input.branchId)
      const newItem: ShopItem = {
        id,
        name: input.name.trim(),
        category: input.category,
        branchId: input.branchId,
        price: input.price,
        status: "Available",
        dateEntered: input.dateEntered,
        photo: input.photo,
      }
      setItems((prev) => [newItem, ...prev])
      return id
    },
    [items]
  )

  const updateItem = useCallback((id: string, input: UpdateItemInput) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              name: input.name.trim(),
              category: input.category,
              branchId: input.branchId,
              price: input.price,
              photo: input.photo,
            }
          : i
      )
    )
  }, [])

  const deleteItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const sellItems = useCallback(
    (input: SellItemsInput) => {
      const soldAt = new Date().toISOString().slice(0, 19)
      const sellable = items.filter(
        (i) => input.itemIds.includes(i.id) && i.status === "Available"
      )
      if (sellable.length === 0) return

      const lineItems: ShopSaleLine[] = sellable.map((i) => ({
        itemId: i.id,
        name: i.name,
        price: i.price,
      }))
      const total = lineItems.reduce((sum, l) => sum + l.price, 0)

      const sale: ShopSale = {
        id: `SALE-${Date.now()}`,
        branchId: input.branchId,
        kind: lineItems.length > 1 ? "Set" : "Single",
        lineItems,
        customerName: input.customerName.trim(),
        contact: input.contact.trim(),
        total,
        paymentMethod: input.paymentMethod,
        soldAt,
      }

      const soldIds = new Set(sellable.map((i) => i.id))
      setSales((prev) => [sale, ...prev])
      setItems((prev) =>
        prev.map((i) =>
          soldIds.has(i.id) ? { ...i, status: "Sold", soldAt } : i
        )
      )
    },
    [items]
  )

  const value = useMemo<ShowroomContextValue>(
    () => ({ items, sales, addItem, updateItem, deleteItem, sellItems }),
    [items, sales, addItem, updateItem, deleteItem, sellItems]
  )

  return (
    <ShowroomContext.Provider value={value}>
      {children}
    </ShowroomContext.Provider>
  )
}

export function useShowroom(): ShowroomContextValue {
  const ctx = useContext(ShowroomContext)
  if (!ctx) {
    throw new Error("useShowroom must be used within a ShowroomProvider")
  }
  return ctx
}
