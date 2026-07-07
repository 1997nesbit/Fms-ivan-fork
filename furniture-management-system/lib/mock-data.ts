// Shared mock data for the Furniture Management System.
// UI-only scaffold — the real backend will be built in Django.

export type OrderStatus =
  | "Pending Approval"
  | "Planned" // stages assigned & priced, awaiting the Ops Manager to Start Work
  | "In Workshop"
  | "Awaiting Return" // all stages done; last technician must hand back to Front Desk
  | "Ready for Collection"
  | "Collected"

export type StageStatus = "Pending" | "Active" | "Done"

export interface StageMaterial {
  inventoryItemId: string
  name: string
  quantity: number
  unit: string
}

export interface OrderStage {
  name: string
  headTechId: string
  status: StageStatus
  materials: StageMaterial[]
  /** Bargained labour wage for this stage, added by the Ops Manager before
   * work starts. Undefined until priced. */
  wage?: number
  completedAt?: string // ISO date, set when a stage is marked Done
}

export interface Order {
  id: string
  customerName: string
  contact: string
  furnitureType: string
  size: string
  quotedPrice: number
  orderDate: string // ISO date
  expectedDelivery: string // ISO date
  status: OrderStatus
  stages: OrderStage[]
  originatingBranch: string
  referenceImages?: string[]
  returnedAt?: string // ISO date-time, set when the last technician returns it to Front Desk
  collectedAt?: string // ISO date-time, set when collected
  /** Set when this order was created from an approved custom quote. */
  quoteId?: string
}

export interface Technician {
  id: string
  name: string
  specialty: string
  phone: string
  activeOrders: number
  rate: number // labour cost charged per stage this technician leads
  pin: string // 4-digit login PIN
  active: boolean // inactive techs cannot be assigned to new stages
}

export type InventoryCategory =
  | "Wood"
  | "Hardware"
  | "Upholstery"
  | "Finishing"
  | "Adhesive"

export interface InventoryItem {
  id: string
  name: string
  category: InventoryCategory
  quantity: number
  unit: string
  reorderLevel: number
  unitCost: number
}

export interface ShopSet {
  id: string
  name: string
  branch: string
  manager: string
  activeOrders: number
}

export type MaterialRequestStatus = "Pending" | "Approved" | "Rejected"

export interface MaterialRequest {
  id: string
  orderId: string
  technicianId: string
  technicianName: string
  materialName: string
  quantity: number
  unit: string
  requestedAt: string // ISO date
  status: MaterialRequestStatus
}

export type IssuanceStatus = "Pending" | "Done"

export interface IssuanceLine {
  inventoryItemId: string
  materialName: string
  unit: string
  estimatedQty: number
}

/** A per-order materials estimate sent from the Ops Manager's stage plan. */
export interface OrderIssuance {
  id: string
  orderId: string
  furnitureType: string
  lines: IssuanceLine[]
  status: IssuanceStatus
  issuedAt?: string // ISO date
}

/** An approved extra-material request the Stock Keeper physically issues. */
export interface AdditionalIssuance {
  id: string
  orderId: string
  technicianName: string
  inventoryItemId: string
  materialName: string
  unit: string
  approvedQty: number
  status: IssuanceStatus
  issuedAt?: string // ISO date
}

// --- Shop / Showroom module ----------------------------------------------

export interface Branch {
  id: string
  code: string
  name: string
}

export type ShopCategory =
  | "Living Room"
  | "Dining"
  | "Bedroom"
  | "Storage"
  | "Office"
  | "Outdoor"

export const shopCategories: ShopCategory[] = [
  "Living Room",
  "Dining",
  "Bedroom",
  "Storage",
  "Office",
  "Outdoor",
]

export type ShopItemStatus = "Available" | "Sold"

/** A single showroom unit carrying its own fixed price. */
export interface ShopItem {
  id: string // e.g. ITEM-A-001
  name: string
  category: ShopCategory
  branchId: string
  price: number
  status: ShopItemStatus
  dateEntered: string // ISO date
  photo?: string
  soldAt?: string // ISO datetime, set when sold
}

export type PaymentMethod = "Cash" | "Card" | "Bank Transfer" | "Mobile Money"

export interface ShopSaleLine {
  itemId: string
  name: string
  price: number
}

/** A completed showroom sale — one unit (single) or several grouped (set). */
export interface ShopSale {
  id: string
  branchId: string
  kind: "Single" | "Set"
  lineItems: ShopSaleLine[]
  customerName: string
  contact: string
  total: number
  paymentMethod: PaymentMethod
  soldAt: string // ISO datetime
}

// --- Custom-piece catalogue ----------------------------------------------

export interface CatalogueProduct {
  id: string // e.g. CAT-001
  name: string
  category: ShopCategory
  description: string
  minPrice: number
  maxPrice: number
  photo?: string
}

// --- Quotes ---------------------------------------------------------------

export type QuoteStatus = "Approved" | "Pending Director" | "Rejected"

export interface Quote {
  id: string // e.g. Q-001
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
  withinRange: boolean
  notes?: string
  status: QuoteStatus
  createdAt: string // ISO date
  decidedAt?: string // ISO date the Director ruled
  directorNote?: string
  convertedOrderId?: string // set once turned into a workshop order
}

// --- Technicians ---------------------------------------------------------

export const technicians: Technician[] = []

// --- Inventory -----------------------------------------------------------

export const inventory: InventoryItem[] = []

// --- Shop sets -----------------------------------------------------------

export const shopSets: ShopSet[] = []

// --- Orders --------------------------------------------------------------

export const orders: Order[] = []

// --- Material requests ---------------------------------------------------

export const materialRequests: MaterialRequest[] = []

// --- Issuances -----------------------------------------------------------

export const orderIssuances: OrderIssuance[] = []

export const additionalIssuances: AdditionalIssuance[] = []

// --- Branches ------------------------------------------------------------

export const branches: Branch[] = []

// --- Shop inventory (individual units) -----------------------------------

export const shopItems: ShopItem[] = []

// --- Custom-piece catalogue ----------------------------------------------

export const catalogue: CatalogueProduct[] = []

// --- Quotes ---------------------------------------------------------------

export const quotes: Quote[] = []

export const shopSales: ShopSale[] = []

// --- Reorders ------------------------------------------------------------

export type ReorderStatus = "Raised" | "Ordered" | "Received"

export interface Reorder {
  id: string
  inventoryItemId: string
  materialName: string
  unit: string
  qtyOnHand: number
  reorderLevel: number
  qtyOrdered: number
  supplierNote?: string
  status: ReorderStatus
  raisedAt: string
  orderedAt?: string
  receivedAt?: string
  qtyReceived?: number
}

export const reorders: Reorder[] = []

export const orderStatuses: OrderStatus[] = [
  "Pending Approval",
  "In Workshop",
  "Awaiting Return",
  "Ready for Collection",
  "Collected",
]

// --- Helpers -------------------------------------------------------------

export function getTechnicianById(id: string): Technician | undefined {
  return technicians.find((t) => t.id === id)
}

export function getBranchById(id: string): Branch | undefined {
  return branches.find((b) => b.id === id)
}

export function getShopItemById(id: string): ShopItem | undefined {
  return shopItems.find((i) => i.id === id)
}

export function getCatalogueById(id: string): CatalogueProduct | undefined {
  return catalogue.find((c) => c.id === id)
}

export function getInventoryById(id: string): InventoryItem | undefined {
  return inventory.find((i) => i.id === id)
}
