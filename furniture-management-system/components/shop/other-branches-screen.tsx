"use client"

import { useMemo, useState } from "react"
import { Eye, Globe, MapPin, PackageSearch, Search } from "lucide-react"
import { useQuery } from "@tanstack/react-query"

import api from "@/lib/api"
import { useAuth } from "@/app/providers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Branch {
  id: number
  name: string
  location: string
}

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
// ---------------------------------------------------------------------------

export function OtherBranchesScreen() {
  const { user } = useAuth()
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("All")

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await api.get<{ results: Branch[] }>("/branches/")
      return data.results
    },
    staleTime: 60_000,
  })

  const { data: items = [] } = useQuery({
    queryKey: ["all-shop-items"],
    queryFn: async () => {
      const { data } = await api.get<{ results: ShowroomItem[] }>("/shop/items/?page_size=500")
      return data.results
    },
    staleTime: 30_000,
  })

  // Items at other branches that are available
  const otherItems = useMemo(
    () => items.filter((i) => i.branch_id !== user?.branch_id && i.status === "AVAILABLE"),
    [items, user?.branch_id],
  )

  // Collect distinct categories from other-branch items
  const categories = useMemo(() => {
    const cats = new Set(otherItems.map((i) => i.category).filter(Boolean))
    return Array.from(cats).sort()
  }, [otherItems])

  const matches = useMemo(() => {
    return otherItems.filter((i) => {
      if (categoryFilter !== "All" && i.category !== categoryFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!i.name.toLowerCase().includes(q) && !i.sku.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [otherItems, search, categoryFilter])

  // Group by branch
  const otherBranches = branches.filter((b) => b.id !== user?.branch_id)
  const groups = useMemo(
    () =>
      otherBranches
        .map((b) => ({
          branch: b,
          items: matches.filter((i) => i.branch_id === b.id),
        }))
        .filter((g) => g.items.length > 0),
    [otherBranches, matches],
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Globe className="size-5" />
          </span>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Check other branches
            </h1>
            <p className="max-w-xl text-pretty text-muted-foreground">
              Search available stock at other showrooms. Direct the customer to that branch
              to pay and collect — stock is not moved between branches.
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1.5 self-start">
          <Eye className="size-3.5" />
          Read-only
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all other branches…"
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
      {groups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <PackageSearch className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              No matching stock at other branches right now.
            </p>
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.branch.id} className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <MapPin className="size-3.5" />
              {group.branch.name}
              {group.branch.location ? ` — ${group.branch.location}` : ""}
              {" "}({group.items.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => (
                <Card key={item.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                      {item.category && (
                        <Badge variant="secondary">{item.category}</Badge>
                      )}
                    </div>
                    <CardTitle className="text-base text-balance">{item.name}</CardTitle>
                    <CardDescription>Available at {group.branch.name}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-end">
                    <span className="text-2xl font-semibold tabular-nums">
                      {currency.format(Number(item.price))}
                    </span>
                  </CardContent>
                  <CardFooter>
                    <p className="text-xs text-muted-foreground text-pretty">
                      Direct the customer to {group.branch.name} to pay and collect.
                    </p>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
