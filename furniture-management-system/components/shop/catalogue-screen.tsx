"use client"

import { useMemo, useState } from "react"
import { BookOpen, Search } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import api from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShowroomItem {
  id: number
  sku: string
  name: string
  category: string
  price: string
  status: string
  branch_id: number
  branch_name: string
  description: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
})

// ---------------------------------------------------------------------------
// Component
//
// NOTE: There is no separate catalogue API. This screen shows all showroom
// items from all branches as a read-only catalogue reference.
// ---------------------------------------------------------------------------

export function CatalogueScreen() {
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("All")

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["catalogue-items"],
    queryFn: async () => {
      const { data } = await api.get<{ results: ShowroomItem[] }>("/shop/items/?page_size=500")
      return data.results
    },
    staleTime: 60_000,
  })

  // Distinct categories across all items
  const categories = useMemo(() => {
    const cats = new Set(items.map((i) => i.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [items])

  const matches = useMemo(() => {
    return items.filter((i) => {
      if (categoryFilter !== "All" && i.category !== categoryFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (
          !i.name.toLowerCase().includes(q) &&
          !i.sku.toLowerCase().includes(q) &&
          !i.description?.toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [items, search, categoryFilter])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <BookOpen className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Showroom catalogue
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Browse all items across every showroom branch. This is a read-only reference
            view — visit the Showroom Stock tab to record sales at your branch.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the catalogue…"
            className="h-9 pl-8"
          />
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant={categoryFilter === "All" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setCategoryFilter("All")}
            >
              All
            </Button>
            {categories.map((c) => (
              <Button
                key={c}
                variant={categoryFilter === c ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setCategoryFilter(c)}
              >
                {c}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading catalogue…</p>
      ) : matches.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Search className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              No catalogue items match your search.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                  {item.category && <Badge variant="secondary">{item.category}</Badge>}
                </div>
                <CardTitle className="text-base text-balance">{item.name}</CardTitle>
                {item.description && (
                  <CardDescription className="text-pretty">{item.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-end gap-1">
                <span className="text-xs text-muted-foreground">{item.branch_name}</span>
                <span className="text-xl font-semibold tabular-nums">
                  {currency.format(Number(item.price))}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
