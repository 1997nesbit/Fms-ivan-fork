"use client"

import { useMemo, useState } from "react"
import { BookOpen, Search, X } from "lucide-react"
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ImageLightbox } from "@/components/shop/image-lightbox"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ItemImage {
  id: number
  image: string
}

interface CategoryItem {
  id: number
  name: string
  is_active: boolean
  item_count: number
}

interface ShowroomItem {
  id: number
  sku: string
  name: string
  category_id: number | null
  category: string
  price: string
  quantity: number
  status: "AVAILABLE" | "OUT_OF_STOCK"
  branch_id: number
  branch_name: string
  description: string
  is_set: boolean
  is_discontinued: boolean
  images: ItemImage[]
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
// Item preview modal
// ---------------------------------------------------------------------------

function ItemPreviewModal({
  item,
  open,
  onClose,
}: {
  item: ShowroomItem
  open: boolean
  onClose: () => void
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const inStock = item.status === "AVAILABLE"

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-balance">{item.name}</DialogTitle>
          </DialogHeader>

          {/* Image strip */}
          {item.images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {item.images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => { setLightboxIndex(i); setLightboxOpen(true) }}
                  className="shrink-0"
                >
                  <img
                    src={img.image}
                    alt=""
                    className="size-[72px] rounded-lg object-cover ring-1 ring-border hover:ring-primary transition-all"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Details */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {item.category && <Badge variant="secondary">{item.category}</Badge>}
              {item.is_set && <Badge variant="outline">SET</Badge>}
              <Badge
                variant="outline"
                className={
                  inStock
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-muted text-muted-foreground border-border"
                }
              >
                {inStock ? `${item.quantity} in stock` : "Out of stock"}
              </Badge>
            </div>

            <div className="rounded-lg bg-muted/50 px-4 py-3 space-y-1">
              <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
              <p className="text-xs text-muted-foreground">{item.branch_name}</p>
              <p className="text-2xl font-semibold tabular-nums">
                {currency.format(Number(item.price))}
              </p>
              <p className="text-xs text-muted-foreground">Fixed sale price</p>
            </div>

            {item.description && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
                  {item.is_set ? "What's included" : "Description"}
                </p>
                <p className="text-sm">{item.description}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <DialogClose render={<Button type="button" variant="outline" />}>Close</DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      <ImageLightbox
        images={item.images}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CatalogueScreen() {
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("All")
  const [previewItem, setPreviewItem] = useState<ShowroomItem | null>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["catalogue-items"],
    queryFn: async () => {
      const { data } = await api.get<{ results: ShowroomItem[] }>("/shop/items/?page_size=500")
      return data.results
    },
    staleTime: 60_000,
  })

  const { data: categories = [] } = useQuery<CategoryItem[]>({
    queryKey: ["categories", "active"],
    queryFn: async () => {
      const { data } = await api.get<CategoryItem[]>("/shop/categories/?active_only=1")
      return data
    },
    staleTime: 60_000,
  })

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
            Browse all items across every showroom branch. Click an item to preview details.
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
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
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
                key={c.id}
                variant={categoryFilter === c.name ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setCategoryFilter(c.name)}
              >
                {c.name}
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
          {matches.map((item) => {
            const inStock = item.status === "AVAILABLE"
            return (
              <Card
                key={item.id}
                className="flex flex-col cursor-pointer transition-colors hover:border-primary/40"
                onClick={() => setPreviewItem(item)}
              >
                {item.images.length > 0 && (
                  <div className="px-4 pt-4">
                    <img
                      src={item.images[0].image}
                      alt={item.name}
                      className="h-36 w-full rounded-md object-cover"
                    />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                    <div className="flex items-center gap-1">
                      {item.is_set && <Badge variant="secondary">SET</Badge>}
                      {item.category && <Badge variant="secondary">{item.category}</Badge>}
                    </div>
                  </div>
                  <CardTitle className="text-base text-balance">{item.name}</CardTitle>
                  {item.description && (
                    <CardDescription className="text-pretty line-clamp-2">
                      {item.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-end gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{item.branch_name}</span>
                    <Badge
                      variant="outline"
                      className={
                        inStock
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-muted text-muted-foreground border-border"
                      }
                    >
                      {inStock ? `${item.quantity} in stock` : "Out of stock"}
                    </Badge>
                  </div>
                  <span className="text-xl font-semibold tabular-nums">
                    {currency.format(Number(item.price))}
                  </span>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {previewItem && (
        <ItemPreviewModal
          item={previewItem}
          open={!!previewItem}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </div>
  )
}
