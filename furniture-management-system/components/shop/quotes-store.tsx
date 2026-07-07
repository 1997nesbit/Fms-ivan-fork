"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import api from "@/lib/api"
import type { Quote, QuoteStatus } from "@/lib/mock-data"

export interface NewQuoteInput {
  branchId: string
  customerName: string
  contact: string
  productName: string
  catalogueId?: string
  category?: string
  size?: string
  refMin: number
  refMax: number
  quotedPrice: number
  notes?: string
}

interface ApiQuote {
  id: number
  reference: string
  branch_id: number
  customer_name: string
  customer_phone: string
  catalogue_item_id: number | null
  product_name: string
  size: string
  ref_min: string
  ref_max: string
  quoted_price: string
  within_range: boolean
  notes: string
  status: "APPROVED" | "PENDING_DIRECTOR" | "REJECTED"
  director_note: string
  decided_at: string | null
  converted_order_id: number | null
  created_at: string
}

const STATUS_MAP: Record<string, QuoteStatus> = {
  APPROVED: "Approved",
  PENDING_DIRECTOR: "Pending Director",
  REJECTED: "Rejected",
}

function mapQuote(raw: ApiQuote): Quote {
  return {
    id: raw.reference,
    branchId: String(raw.branch_id),
    customerName: raw.customer_name,
    contact: raw.customer_phone,
    productName: raw.product_name,
    catalogueId: raw.catalogue_item_id ? String(raw.catalogue_item_id) : undefined,
    category: "Living Room",
    size: raw.size || undefined,
    refMin: Number(raw.ref_min),
    refMax: Number(raw.ref_max),
    quotedPrice: Number(raw.quoted_price),
    withinRange: raw.within_range,
    notes: raw.notes || undefined,
    status: STATUS_MAP[raw.status] ?? "Pending Director",
    createdAt: raw.created_at.slice(0, 10),
    decidedAt: raw.decided_at ? raw.decided_at.slice(0, 10) : undefined,
    directorNote: raw.director_note || undefined,
    convertedOrderId: raw.converted_order_id ? String(raw.converted_order_id) : undefined,
  }
}

interface QuotesContextValue {
  quotes: Quote[]
  isLoading: boolean
  createQuote: (input: NewQuoteInput) => Promise<Quote>
  convertQuote: (quoteRef: string) => Promise<void>
  approveQuote: (quoteRef: string, note?: string) => Promise<void>
  rejectQuote: (quoteRef: string, note?: string) => Promise<void>
}

const QuotesContext = createContext<QuotesContextValue | null>(null)

export function QuotesProvider({ children }: Readonly<{ children: ReactNode }>) {
  const qc = useQueryClient()

  const { data: rawQuotes = [], isLoading } = useQuery<ApiQuote[]>({
    queryKey: ["quotes"],
    queryFn: () => api.get<ApiQuote[]>("/shop/quotes/").then((r) => r.data),
  })

  const quotes = useMemo(() => rawQuotes.map(mapQuote), [rawQuotes])
  const refToId = useMemo(
    () => Object.fromEntries(rawQuotes.map((q) => [q.reference, q.id])),
    [rawQuotes],
  )

  const createMutation = useMutation({
    mutationFn: (input: NewQuoteInput) =>
      api
        .post<ApiQuote>("/shop/quotes/", {
          customer_name: input.customerName,
          customer_phone: input.contact,
          product_name: input.productName,
          catalogue_item_id: input.catalogueId ? Number(input.catalogueId) : null,
          size: input.size ?? "",
          ref_min: input.refMin,
          ref_max: input.refMax,
          quoted_price: input.quotedPrice,
          notes: input.notes ?? "",
        })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  })

  const convertMutation = useMutation({
    mutationFn: (numericId: number) =>
      api.post(`/shop/quotes/${numericId}/convert/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  })

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      api.post(`/shop/quotes/${id}/approve/`, { director_note: note ?? "" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      api.post(`/shop/quotes/${id}/reject/`, { director_note: note ?? "" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  })

  const createQuote = useMemo(
    () => async (input: NewQuoteInput): Promise<Quote> => {
      const raw = await createMutation.mutateAsync(input)
      return mapQuote(raw)
    },
    [createMutation],
  )

  const convertQuote = useMemo(
    () => async (quoteRef: string): Promise<void> => {
      const numericId = refToId[quoteRef]
      if (!numericId) throw new Error(`Quote ${quoteRef} not found`)
      await convertMutation.mutateAsync(numericId)
    },
    [convertMutation, refToId],
  )

  const approveQuote = useMemo(
    () => async (quoteRef: string, note?: string): Promise<void> => {
      const numericId = refToId[quoteRef]
      if (!numericId) throw new Error(`Quote ${quoteRef} not found`)
      await approveMutation.mutateAsync({ id: numericId, note })
    },
    [approveMutation, refToId],
  )

  const rejectQuote = useMemo(
    () => async (quoteRef: string, note?: string): Promise<void> => {
      const numericId = refToId[quoteRef]
      if (!numericId) throw new Error(`Quote ${quoteRef} not found`)
      await rejectMutation.mutateAsync({ id: numericId, note })
    },
    [rejectMutation, refToId],
  )

  const value = useMemo<QuotesContextValue>(
    () => ({ quotes, isLoading, createQuote, convertQuote, approveQuote, rejectQuote }),
    [quotes, isLoading, createQuote, convertQuote, approveQuote, rejectQuote],
  )

  return <QuotesContext.Provider value={value}>{children}</QuotesContext.Provider>
}

export function useQuotes(): QuotesContextValue {
  const ctx = useContext(QuotesContext)
  if (!ctx) throw new Error("useQuotes must be used within a QuotesProvider")
  return ctx
}
