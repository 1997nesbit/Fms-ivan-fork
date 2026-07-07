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
  catalogue as seedCatalogue,
  type CatalogueProduct,
  type ShopCategory,
} from "@/lib/mock-data"

export interface CatalogueInput {
  name: string
  category: ShopCategory
  description: string
  minPrice: number
  maxPrice: number
  photo?: string
}

interface CatalogueContextValue {
  products: CatalogueProduct[]
  addProduct: (input: CatalogueInput) => string
  updateProduct: (id: string, input: CatalogueInput) => void
  deleteProduct: (id: string) => void
}

const CatalogueContext = createContext<CatalogueContextValue | null>(null)

function nextCatalogueId(products: CatalogueProduct[]): string {
  const maxSeq = products.reduce((max, p) => {
    const seq = Number.parseInt(p.id.replace(/^CAT-/, ""), 10)
    return Number.isNaN(seq) ? max : Math.max(max, seq)
  }, 0)
  return `CAT-${String(maxSeq + 1).padStart(3, "0")}`
}

export function CatalogueProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<CatalogueProduct[]>(seedCatalogue)

  const addProduct = useCallback(
    (input: CatalogueInput): string => {
      const id = nextCatalogueId(products)
      const product: CatalogueProduct = {
        id,
        name: input.name.trim(),
        category: input.category,
        description: input.description.trim(),
        minPrice: input.minPrice,
        maxPrice: input.maxPrice,
        photo: input.photo,
      }
      setProducts((prev) => [product, ...prev])
      return id
    },
    [products]
  )

  const updateProduct = useCallback((id: string, input: CatalogueInput) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              name: input.name.trim(),
              category: input.category,
              description: input.description.trim(),
              minPrice: input.minPrice,
              maxPrice: input.maxPrice,
              photo: input.photo,
            }
          : p
      )
    )
  }, [])

  const deleteProduct = useCallback((id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const value = useMemo<CatalogueContextValue>(
    () => ({ products, addProduct, updateProduct, deleteProduct }),
    [products, addProduct, updateProduct, deleteProduct]
  )

  return (
    <CatalogueContext.Provider value={value}>
      {children}
    </CatalogueContext.Provider>
  )
}

export function useCatalogue(): CatalogueContextValue {
  const ctx = useContext(CatalogueContext)
  if (!ctx) {
    throw new Error("useCatalogue must be used within a CatalogueProvider")
  }
  return ctx
}
