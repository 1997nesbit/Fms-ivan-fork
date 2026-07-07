"use client"

import { useState } from "react"
import { Check, Loader2, Pencil, Plus, Settings, X } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import api from "@/lib/api"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryItem { id: number; name: string; is_active: boolean; item_count: number }
interface RoomItem     { id: number; name: string; code: string; is_active: boolean; item_count: number }
interface ItemTypeItem { id: number; name: string; code: string; is_active: boolean; item_count: number }

type ApiError = {
  response?: { data?: { errors?: Record<string, string[]>; detail?: string } }
}

// ---------------------------------------------------------------------------
// Shared row component
// ---------------------------------------------------------------------------

function SettingRow({
  label,
  sublabel,
  isActive,
  canRename,
  editingId,
  rowId,
  editName,
  onEditStart,
  onEditName,
  onEditCommit,
  onEditCancel,
  onToggle,
  saving,
}: {
  label: string
  sublabel?: string
  isActive: boolean
  canRename: boolean
  editingId: number | null
  rowId: number
  editName: string
  onEditStart: () => void
  onEditName: (v: string) => void
  onEditCommit: () => void
  onEditCancel: () => void
  onToggle: () => void
  saving: boolean
}) {
  const isEditing = editingId === rowId

  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", !isActive && "opacity-50")}>
      {isEditing ? (
        <div className="flex flex-1 items-center gap-2">
          <Input
            autoFocus
            value={editName}
            onChange={(e) => onEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEditCommit()
              if (e.key === "Escape") onEditCancel()
            }}
            className="h-7 max-w-[200px] text-sm"
          />
          <button
            type="button"
            onClick={onEditCommit}
            disabled={saving}
            className="text-primary hover:text-primary/80"
            title="Save"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onEditCancel}
            className="text-muted-foreground hover:text-foreground"
            title="Cancel"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <span className="text-sm font-medium">{label}</span>
          {sublabel && (
            <span className="font-mono text-xs text-muted-foreground">{sublabel}</span>
          )}
        </div>
      )}

      <Badge
        variant="outline"
        className={cn(
          "w-20 justify-center text-xs",
          isActive
            ? "bg-primary/10 text-primary border-primary/20"
            : "bg-muted text-muted-foreground border-border",
        )}
      >
        {isActive ? "Active" : "Inactive"}
      </Badge>

      {!isEditing && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={canRename ? onEditStart : undefined}
            disabled={!canRename}
            className={cn(
              "rounded p-1 transition-colors",
              canRename
                ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                : "text-muted-foreground/30 cursor-not-allowed",
            )}
            title={canRename ? "Rename" : "Cannot rename — items are using this"}
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={saving}
            className="rounded p-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Categories tab
// ---------------------------------------------------------------------------

function CategoriesTab() {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)

  const { data: categories = [], isLoading } = useQuery<CategoryItem[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await api.get<CategoryItem[]>("/shop/categories/")
      return data
    },
    staleTime: 30_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["categories"] })
    queryClient.invalidateQueries({ queryKey: ["categories", "active"] })
  }

  const create = useMutation({
    mutationFn: () => api.post("/shop/categories/", { name: newName }),
    onSuccess: () => { toast.success("Category created"); setNewName(""); setCreating(false); invalidate() },
    onError: (err: ApiError) => {
      toast.error(err.response?.data?.errors?.name?.[0] ?? err.response?.data?.detail ?? "Failed to create.")
    },
  })

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      api.patch(`/shop/categories/${id}/`, payload),
    onSuccess: () => { toast.success("Category updated"); setEditingId(null); invalidate() },
    onError: (err: ApiError) => { toast.error(err.response?.data?.detail ?? "Failed to update.") },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Front Desk picks a category when adding items. Deactivating hides it from the dropdown without affecting existing items.
        </p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-3.5" />
            New
          </Button>
        )}
      </div>

      {creating && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create.mutate()
              if (e.key === "Escape") { setCreating(false); setNewName("") }
            }}
            placeholder="Category name…"
            className="h-8 max-w-xs"
          />
          <Button size="sm" onClick={() => create.mutate()} disabled={!newName.trim() || create.isPending}>
            {create.isPending && <Loader2 className="size-3 animate-spin" />}
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName("") }}>Cancel</Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {categories.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">No categories yet.</li>
              )}
              {categories.map((cat) => (
                <SettingRow
                  key={cat.id}
                  rowId={cat.id}
                  label={cat.name}
                  sublabel={`${cat.item_count} item${cat.item_count === 1 ? "" : "s"}`}
                  isActive={cat.is_active}
                  canRename={cat.item_count === 0}
                  editingId={editingId}
                  editName={editName}
                  onEditStart={() => { setEditingId(cat.id); setEditName(cat.name) }}
                  onEditName={setEditName}
                  onEditCommit={() => { if (editName.trim()) update.mutate({ id: cat.id, payload: { name: editName.trim() } }) }}
                  onEditCancel={() => setEditingId(null)}
                  onToggle={() => update.mutate({ id: cat.id, payload: { is_active: !cat.is_active } })}
                  saving={update.isPending}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rooms tab
// ---------------------------------------------------------------------------

function RoomsTab() {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [newName, setNewName] = useState("")
  const [newCode, setNewCode] = useState("")
  const [creating, setCreating] = useState(false)
  const [codeError, setCodeError] = useState("")

  const { data: rooms = [], isLoading } = useQuery<RoomItem[]>({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data } = await api.get<RoomItem[]>("/shop/rooms/")
      return data
    },
    staleTime: 30_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["rooms"] })
    queryClient.invalidateQueries({ queryKey: ["rooms", "active"] })
  }

  const create = useMutation({
    mutationFn: () => api.post("/shop/rooms/", { name: newName, code: newCode.toUpperCase() }),
    onSuccess: () => {
      toast.success("Room created")
      setNewName(""); setNewCode(""); setCreating(false); setCodeError("")
      invalidate()
    },
    onError: (err: ApiError) => {
      const errs = err.response?.data?.errors
      if (errs?.code) setCodeError(errs.code[0])
      else toast.error(err.response?.data?.detail ?? "Failed to create.")
    },
  })

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      api.patch(`/shop/rooms/${id}/`, payload),
    onSuccess: () => { toast.success("Room updated"); setEditingId(null); invalidate() },
    onError: (err: ApiError) => { toast.error(err.response?.data?.detail ?? "Failed to update.") },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          The room code is embedded permanently in every SKU (e.g. <span className="font-mono">DR</span> in <span className="font-mono">DR-TBL-X001-A</span>). You can rename the display label at any time, but the code cannot be changed once created.
        </p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)} className="shrink-0 ml-4">
            <Plus className="size-3.5" />
            New
          </Button>
        )}
      </div>

      {creating && (
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex flex-col gap-1">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name (e.g. Hallway)"
              className="h-8 w-48"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Input
              value={newCode}
              onChange={(e) => { setNewCode(e.target.value.toUpperCase()); setCodeError("") }}
              placeholder="Code (e.g. HL)"
              className="h-8 w-28 font-mono uppercase"
              maxLength={10}
            />
            {codeError && <p className="text-xs text-destructive">{codeError}</p>}
          </div>
          <Button size="sm" onClick={() => create.mutate()} disabled={!newName.trim() || !newCode.trim() || create.isPending}>
            {create.isPending && <Loader2 className="size-3 animate-spin" />}
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(""); setNewCode(""); setCodeError("") }}>Cancel</Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {rooms.map((room) => (
                <SettingRow
                  key={room.id}
                  rowId={room.id}
                  label={room.name}
                  sublabel={`${room.code} · ${room.item_count} item${room.item_count === 1 ? "" : "s"}`}
                  isActive={room.is_active}
                  canRename={room.item_count === 0}
                  editingId={editingId}
                  editName={editName}
                  onEditStart={() => { setEditingId(room.id); setEditName(room.name) }}
                  onEditName={setEditName}
                  onEditCommit={() => { if (editName.trim()) update.mutate({ id: room.id, payload: { name: editName.trim() } }) }}
                  onEditCancel={() => setEditingId(null)}
                  onToggle={() => update.mutate({ id: room.id, payload: { is_active: !room.is_active } })}
                  saving={update.isPending}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Item Types tab
// ---------------------------------------------------------------------------

function ItemTypesTab() {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [newName, setNewName] = useState("")
  const [newCode, setNewCode] = useState("")
  const [creating, setCreating] = useState(false)
  const [codeError, setCodeError] = useState("")

  const { data: itemTypes = [], isLoading } = useQuery<ItemTypeItem[]>({
    queryKey: ["item-types"],
    queryFn: async () => {
      const { data } = await api.get<ItemTypeItem[]>("/shop/item-types/")
      return data
    },
    staleTime: 30_000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["item-types"] })
    queryClient.invalidateQueries({ queryKey: ["item-types", "active"] })
  }

  const create = useMutation({
    mutationFn: () => api.post("/shop/item-types/", { name: newName, code: newCode.toUpperCase() }),
    onSuccess: () => {
      toast.success("Item type created")
      setNewName(""); setNewCode(""); setCreating(false); setCodeError("")
      invalidate()
    },
    onError: (err: ApiError) => {
      const errs = err.response?.data?.errors
      if (errs?.code) setCodeError(errs.code[0])
      else toast.error(err.response?.data?.detail ?? "Failed to create.")
    },
  })

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: object }) =>
      api.patch(`/shop/item-types/${id}/`, payload),
    onSuccess: () => { toast.success("Item type updated"); setEditingId(null); invalidate() },
    onError: (err: ApiError) => { toast.error(err.response?.data?.detail ?? "Failed to update.") },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          The type code is embedded permanently in every SKU (e.g. <span className="font-mono">TBL</span> in <span className="font-mono">DR-TBL-X001-A</span>). You can rename the display label, but the code is locked once set.
        </p>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)} className="shrink-0 ml-4">
            <Plus className="size-3.5" />
            New
          </Button>
        )}
      </div>

      {creating && (
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex flex-col gap-1">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Display name (e.g. Recliner)"
              className="h-8 w-48"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Input
              value={newCode}
              onChange={(e) => { setNewCode(e.target.value.toUpperCase()); setCodeError("") }}
              placeholder="Code (e.g. RCL)"
              className="h-8 w-28 font-mono uppercase"
              maxLength={10}
            />
            {codeError && <p className="text-xs text-destructive">{codeError}</p>}
          </div>
          <Button size="sm" onClick={() => create.mutate()} disabled={!newName.trim() || !newCode.trim() || create.isPending}>
            {create.isPending && <Loader2 className="size-3 animate-spin" />}
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(""); setNewCode(""); setCodeError("") }}>Cancel</Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {itemTypes.map((t) => (
                <SettingRow
                  key={t.id}
                  rowId={t.id}
                  label={t.name}
                  sublabel={`${t.code} · ${t.item_count} item${t.item_count === 1 ? "" : "s"}`}
                  isActive={t.is_active}
                  canRename={t.item_count === 0}
                  editingId={editingId}
                  editName={editName}
                  onEditStart={() => { setEditingId(t.id); setEditName(t.name) }}
                  onEditName={setEditName}
                  onEditCommit={() => { if (editName.trim()) update.mutate({ id: t.id, payload: { name: editName.trim() } }) }}
                  onEditCancel={() => setEditingId(null)}
                  onToggle={() => update.mutate({ id: t.id, payload: { is_active: !t.is_active } })}
                  saving={update.isPending}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root screen
// ---------------------------------------------------------------------------

type SettingsTab = "rooms" | "item-types" | "categories"

export function ShowroomSettingsScreen() {
  const [tab, setTab] = useState<SettingsTab>("rooms")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Settings className="size-5" />
        </span>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">Catalogue settings</h2>
          <p className="text-sm text-muted-foreground">
            Manage the rooms, item types, and categories that Front Desk picks from when adding showroom items.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)}>
        <TabsList>
          <TabsTrigger value="rooms">Rooms</TabsTrigger>
          <TabsTrigger value="item-types">Item types</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "rooms"      && <RoomsTab />}
      {tab === "item-types" && <ItemTypesTab />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  )
}
