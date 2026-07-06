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
  quotes as seedQuotes,
  type Quote,
  type ShopCategory,
} from "@/lib/mock-data"

export interface NewQuoteInput {
  branchId: string
  customerName: string
  contact: string
  productName: string
  catalogueId?: string
  category: ShopCategory
  size?: string
  refMin: number
  refMax: number
  quotedPrice: number
  notes?: string
}

interface QuotesContextValue {
  quotes: Quote[]
  createQuote: (input: NewQuoteInput) => Quote
  approveQuote: (quoteId: string, note?: string) => void
  rejectQuote: (quoteId: string, note?: string) => void
  markConverted: (quoteId: string, orderId: string) => void
}

const QuotesContext = createContext<QuotesContextValue | null>(null)

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function makeQuoteId(existing: Quote[]): string {
  const maxNum = existing.reduce((max, q) => {
    const num = Number.parseInt(q.id.replace(/\D/g, ""), 10)
    return Number.isNaN(num) ? max : Math.max(max, num)
  }, 0)
  return `Q-${String(maxNum + 1).padStart(3, "0")}`
}

export function QuotesProvider({ children }: { children: ReactNode }) {
  const [quotes, setQuotes] = useState<Quote[]>(seedQuotes)

  const createQuote = useCallback((input: NewQuoteInput): Quote => {
    const withinRange =
      input.quotedPrice >= input.refMin && input.quotedPrice <= input.refMax
    const quote: Quote = {
      id: makeQuoteId(quotes),
      branchId: input.branchId,
      customerName: input.customerName.trim(),
      contact: input.contact.trim(),
      productName: input.productName.trim(),
      catalogueId: input.catalogueId,
      category: input.category,
      size: input.size?.trim() || undefined,
      refMin: input.refMin,
      refMax: input.refMax,
      quotedPrice: input.quotedPrice,
      withinRange,
      notes: input.notes?.trim() || undefined,
      status: withinRange ? "Approved" : "Pending Director",
      createdAt: today(),
      decidedAt: withinRange ? today() : undefined,
    }
    setQuotes((prev) => [quote, ...prev])
    return quote
  }, [quotes])

  const approveQuote = useCallback((quoteId: string, note?: string) => {
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === quoteId
          ? {
              ...q,
              status: "Approved" as const,
              decidedAt: today(),
              directorNote: note?.trim() || q.directorNote,
            }
          : q
      )
    )
  }, [])

  const rejectQuote = useCallback((quoteId: string, note?: string) => {
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === quoteId
          ? {
              ...q,
              status: "Rejected" as const,
              decidedAt: today(),
              directorNote: note?.trim() || q.directorNote,
            }
          : q
      )
    )
  }, [])

  const markConverted = useCallback((quoteId: string, orderId: string) => {
    setQuotes((prev) =>
      prev.map((q) =>
        q.id === quoteId ? { ...q, convertedOrderId: orderId } : q
      )
    )
  }, [])

  const value = useMemo<QuotesContextValue>(
    () => ({ quotes, createQuote, approveQuote, rejectQuote, markConverted }),
    [quotes, createQuote, approveQuote, rejectQuote, markConverted]
  )

  return (
    <QuotesContext.Provider value={value}>{children}</QuotesContext.Provider>
  )
}

export function useQuotes(): QuotesContextValue {
  const ctx = useContext(QuotesContext)
  if (!ctx) {
    throw new Error("useQuotes must be used within a QuotesProvider")
  }
  return ctx
}
