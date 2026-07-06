"use client"

import { useMemo, useState } from "react"
import { Pencil, Plus, Search, Settings2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  getBranchById,
  type CatalogueProduct,
  type ShopItem,
} from "@/lib/mock-data"
import { useShowroom } from "@/components/shop/showroom-store"
import { useCatalogue } from "@/components/shop/catalogue-store"
import { ManageItemDialog } from "@/components/shop/manage-item-dialog"
import { ManageCatalogueDialog } from "@/components/shop/manage-catalogue-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type ManageTab = "stock" | "catalogue"

/** A pending deletion, tagged by which collection it belongs to. */
type PendingDelete =
  | { kind: "item"; id: string; label: string }
  | { kind: "product"; id: string; label: string }

export function ManageShopScreen() {
  const { items, deleteItem } = useShowroom()
  const { products, deleteProduct } = useCatalogue()

  const [tab, setTab] = useState<ManageTab>("stock")
  const [search, setSearch] = useState("")

  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null)

  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] =
    useState<CatalogueProduct | null>(null)

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const q = search.trim().toLowerCase()

  const filteredItems = useMemo(() => {
    if (!q) return items
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.id.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
    )
  }, [items, q])

  const filteredProducts = useMemo(() => {
    if (!q) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    )
  }, [products, q])

  function openNewItem() {
    setEditingItem(null)
    setItemDialogOpen(true)
  }
  function openEditItem(item: ShopItem) {
    setEditingItem(item)
    setItemDialogOpen(true)
  }
  function openNewProduct() {
    setEditingProduct(null)
    setProductDialogOpen(true)
  }
  function openEditProduct(product: CatalogueProduct) {
    setEditingProduct(product)
    setProductDialogOpen(true)
  }

  function confirmDelete() {
    if (!pendingDelete) return
    if (pendingDelete.kind === "item") {
      deleteItem(pendingDelete.id)
    } else {
      deleteProduct(pendingDelete.id)
    }
    toast.success("Deleted", { description: `${pendingDelete.label} removed.` })
    setPendingDelete(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Settings2 className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Manage shop data
          </h1>
          <p className="max-w-2xl text-pretty text-muted-foreground">
            Add, edit and remove showroom stock and custom-piece catalogue
            entries. Changes flow straight through to the shop, quotes and
            reports.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as ManageTab)}
          className="gap-0"
        >
          <TabsList>
            <TabsTrigger value="stock">Showroom stock</TabsTrigger>
            <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-9 w-44 pl-8"
            />
          </div>
          {tab === "stock" ? (
            <Button onClick={openNewItem}>
              <Plus data-icon="inline-start" />
              Add unit
            </Button>
          ) : (
            <Button onClick={openNewProduct}>
              <Plus data-icon="inline-start" />
              Add product
            </Button>
          )}
        </div>
      </div>

      {tab === "stock" && (
        <StockTable
          items={filteredItems}
          onEdit={openEditItem}
          onDelete={(item) =>
            setPendingDelete({
              kind: "item",
              id: item.id,
              label: `${item.name} (${item.id})`,
            })
          }
        />
      )}

      {tab === "catalogue" && (
        <CatalogueTable
          products={filteredProducts}
          onEdit={openEditProduct}
          onDelete={(product) =>
            setPendingDelete({
              kind: "product",
              id: product.id,
              label: `${product.name} (${product.id})`,
            })
          }
        />
      )}

      <ManageItemDialog
        item={editingItem}
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
      />
      <ManageCatalogueDialog
        product={editingProduct}
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
      />

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(v) => {
          if (!v) setPendingDelete(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.label} will be permanently removed. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StockTable({
  items,
  onEdit,
  onDelete,
}: {
  items: ShopItem[]
  onEdit: (item: ShopItem) => void
  onDelete: (item: ShopItem) => void
}) {
  if (items.length === 0) {
    return <EmptyState label="No showroom units match your search." />
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {item.id}
                </TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.category}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {getBranchById(item.branchId)?.name ?? item.branchId}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${item.price.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={item.status === "Sold" ? "outline" : "default"}
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <RowActions
                    onEdit={() => onEdit(item)}
                    onDelete={() => onDelete(item)}
                    editLabel={`Edit ${item.name}`}
                    deleteLabel={`Delete ${item.name}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function CatalogueTable({
  products,
  onEdit,
  onDelete,
}: {
  products: CatalogueProduct[]
  onEdit: (product: CatalogueProduct) => void
  onDelete: (product: CatalogueProduct) => void
}) {
  if (products.length === 0) {
    return <EmptyState label="No catalogue products match your search." />
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Reference range</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {product.id}
                </TableCell>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{product.category}</Badge>
                </TableCell>
                <TableCell className="max-w-xs text-pretty text-muted-foreground">
                  {product.description}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${product.minPrice.toLocaleString()} – $
                  {product.maxPrice.toLocaleString()}
                </TableCell>
                <TableCell>
                  <RowActions
                    onEdit={() => onEdit(product)}
                    onDelete={() => onDelete(product)}
                    editLabel={`Edit ${product.name}`}
                    deleteLabel={`Delete ${product.name}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function RowActions({
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
}: {
  onEdit: () => void
  onDelete: () => void
  editLabel: string
  deleteLabel: string
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={onEdit}
        aria-label={editLabel}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-destructive hover:text-destructive"
        onClick={onDelete}
        aria-label={deleteLabel}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Search className="size-5" />
        </span>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
