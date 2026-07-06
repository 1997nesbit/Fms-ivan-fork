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

export type BranchCode = "A" | "B" | "C"

export interface Branch {
  id: string
  code: BranchCode
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

export const technicians: Technician[] = [
  {
    id: "tech-1",
    name: "Daniel Okoye",
    specialty: "Cabinetry & Joinery",
    phone: "+234 803 111 2233",
    activeOrders: 3,
    rate: 140,
    pin: "4821",
    active: true,
  },
  {
    id: "tech-2",
    name: "Grace Mensah",
    specialty: "Upholstery",
    phone: "+234 805 444 5566",
    activeOrders: 2,
    rate: 110,
    pin: "7390",
    active: true,
  },
  {
    id: "tech-3",
    name: "Samuel Adeyemi",
    specialty: "Finishing & Polish",
    phone: "+234 807 777 8899",
    activeOrders: 1,
    rate: 90,
    pin: "1265",
    active: true,
  },
  {
    id: "tech-4",
    name: "Fatima Bello",
    specialty: "Frame Assembly",
    phone: "+234 809 222 3344",
    activeOrders: 2,
    rate: 105,
    pin: "5078",
    active: true,
  },
]

// --- Inventory -----------------------------------------------------------

export const inventory: InventoryItem[] = [
  { id: "inv-1", name: "Mahogany Plank", category: "Wood", quantity: 48, unit: "boards", reorderLevel: 20, unitCost: 18.5 },
  { id: "inv-2", name: "Oak Plank", category: "Wood", quantity: 12, unit: "boards", reorderLevel: 15, unitCost: 22.0 },
  { id: "inv-3", name: "Plywood Sheet 18mm", category: "Wood", quantity: 30, unit: "sheets", reorderLevel: 10, unitCost: 14.75 },
  { id: "inv-4", name: "Brass Hinges", category: "Hardware", quantity: 220, unit: "pcs", reorderLevel: 50, unitCost: 1.2 },
  { id: "inv-5", name: "Drawer Slides", category: "Hardware", quantity: 64, unit: "pairs", reorderLevel: 25, unitCost: 3.4 },
  { id: "inv-6", name: "Wood Screws 40mm", category: "Hardware", quantity: 8, unit: "boxes", reorderLevel: 10, unitCost: 4.9 },
  { id: "inv-7", name: "Foam Padding", category: "Upholstery", quantity: 18, unit: "rolls", reorderLevel: 8, unitCost: 9.6 },
  { id: "inv-8", name: "Linen Fabric", category: "Upholstery", quantity: 35, unit: "meters", reorderLevel: 20, unitCost: 6.25 },
  { id: "inv-9", name: "Matte Lacquer", category: "Finishing", quantity: 14, unit: "liters", reorderLevel: 6, unitCost: 12.0 },
  { id: "inv-10", name: "Wood Glue", category: "Adhesive", quantity: 5, unit: "liters", reorderLevel: 6, unitCost: 7.8 },
]

// --- Shop sets -----------------------------------------------------------

export const shopSets: ShopSet[] = [
  { id: "set-1", name: "Central Workshop", branch: "Lagos - Ikeja", manager: "Operations Manager", activeOrders: 4 },
  { id: "set-2", name: "Lekki Showroom", branch: "Lagos - Lekki", manager: "Front Desk", activeOrders: 2 },
  { id: "set-3", name: "Abuja Branch", branch: "Abuja - Wuse", manager: "Front Desk", activeOrders: 1 },
]

// --- Orders --------------------------------------------------------------

export const orders: Order[] = [
  {
    id: "ORD-1001",
    customerName: "Amina Yusuf",
    contact: "+234 802 555 0101",
    furnitureType: "6-Seater Dining Table",
    size: "180 x 90 x 76 cm",
    quotedPrice: 1450,
    orderDate: "2026-06-10",
    expectedDelivery: "2026-07-05",
    status: "Pending Approval",
    originatingBranch: "Lekki Showroom",
    referenceImages: ["/reference/dining-table-1.png", "/reference/dining-table-2.png"],
    stages: [
      { name: "Material Sourcing", headTechId: "tech-1", status: "Pending", materials: [{ inventoryItemId: "inv-1", name: "Mahogany Plank", quantity: 8, unit: "boards" }] },
      { name: "Frame Assembly", headTechId: "tech-4", status: "Pending", materials: [{ inventoryItemId: "inv-6", name: "Wood Screws 40mm", quantity: 1, unit: "boxes" }] },
      { name: "Finishing", headTechId: "tech-3", status: "Pending", materials: [{ inventoryItemId: "inv-9", name: "Matte Lacquer", quantity: 2, unit: "liters" }] },
    ],
  },
  {
    id: "ORD-1002",
    customerName: "Chidi Okonkwo",
    contact: "+234 806 555 0202",
    furnitureType: "Wardrobe (3-Door)",
    size: "150 x 60 x 210 cm",
    quotedPrice: 980,
    orderDate: "2026-06-02",
    expectedDelivery: "2026-06-28",
    status: "In Workshop",
    originatingBranch: "Central Workshop",
    stages: [
      { name: "Material Sourcing", headTechId: "tech-1", status: "Done", completedAt: "2026-06-23", materials: [{ inventoryItemId: "inv-3", name: "Plywood Sheet 18mm", quantity: 6, unit: "sheets" }] },
      { name: "Carcass Build", headTechId: "tech-1", status: "Active", materials: [{ inventoryItemId: "inv-4", name: "Brass Hinges", quantity: 12, unit: "pcs" }, { inventoryItemId: "inv-5", name: "Drawer Slides", quantity: 3, unit: "pairs" }] },
      { name: "Finishing", headTechId: "tech-3", status: "Pending", materials: [{ inventoryItemId: "inv-9", name: "Matte Lacquer", quantity: 3, unit: "liters" }] },
    ],
  },
  {
    id: "ORD-1003",
    customerName: "Blessing Eze",
    contact: "+234 803 555 0303",
    furnitureType: "3-Seater Sofa",
    size: "210 x 95 x 85 cm",
    quotedPrice: 1620,
    orderDate: "2026-05-20",
    expectedDelivery: "2026-06-22",
    status: "In Workshop",
    originatingBranch: "Central Workshop",
    stages: [
      { name: "Frame Assembly", headTechId: "tech-4", status: "Done", completedAt: "2026-06-24", materials: [{ inventoryItemId: "inv-2", name: "Oak Plank", quantity: 5, unit: "boards" }] },
      { name: "Upholstery", headTechId: "tech-2", status: "Active", materials: [{ inventoryItemId: "inv-7", name: "Foam Padding", quantity: 2, unit: "rolls" }, { inventoryItemId: "inv-8", name: "Linen Fabric", quantity: 12, unit: "meters" }] },
      { name: "Quality Check", headTechId: "tech-3", status: "Pending", materials: [] },
    ],
  },
  {
    id: "ORD-1004",
    customerName: "Tunde Bakare",
    contact: "+234 807 555 0404",
    furnitureType: "Office Desk",
    size: "140 x 70 x 75 cm",
    quotedPrice: 720,
    orderDate: "2026-05-12",
    expectedDelivery: "2026-06-18",
    status: "Ready for Collection",
    originatingBranch: "Abuja Branch",
    stages: [
      { name: "Material Sourcing", headTechId: "tech-1", status: "Done", completedAt: "2026-06-16", materials: [{ inventoryItemId: "inv-3", name: "Plywood Sheet 18mm", quantity: 3, unit: "sheets" }] },
      { name: "Assembly", headTechId: "tech-4", status: "Done", completedAt: "2026-06-18", materials: [{ inventoryItemId: "inv-5", name: "Drawer Slides", quantity: 2, unit: "pairs" }] },
      { name: "Finishing", headTechId: "tech-3", status: "Done", completedAt: "2026-06-23", materials: [{ inventoryItemId: "inv-9", name: "Matte Lacquer", quantity: 1, unit: "liters" }] },
    ],
  },
  {
    id: "ORD-1005",
    customerName: "Ngozi Okafor",
    contact: "+234 805 555 0505",
    furnitureType: "Bookshelf",
    size: "90 x 30 x 200 cm",
    quotedPrice: 540,
    orderDate: "2026-04-28",
    expectedDelivery: "2026-05-30",
    status: "Collected",
    collectedAt: "2026-06-20T14:20:00",
    originatingBranch: "Lekki Showroom",
    stages: [
      { name: "Material Sourcing", headTechId: "tech-1", status: "Done", completedAt: "2026-06-15", materials: [{ inventoryItemId: "inv-1", name: "Mahogany Plank", quantity: 4, unit: "boards" }] },
      { name: "Assembly", headTechId: "tech-4", status: "Done", completedAt: "2026-06-17", materials: [] },
      { name: "Finishing", headTechId: "tech-3", status: "Done", completedAt: "2026-06-19", materials: [{ inventoryItemId: "inv-9", name: "Matte Lacquer", quantity: 1, unit: "liters" }] },
    ],
  },
  {
    id: "ORD-1006",
    customerName: "Ibrahim Sani",
    contact: "+234 809 555 0606",
    furnitureType: "King Bed Frame",
    size: "200 x 180 x 120 cm",
    quotedPrice: 1320,
    orderDate: "2026-06-15",
    expectedDelivery: "2026-07-12",
    status: "Pending Approval",
    originatingBranch: "Central Workshop",
    referenceImages: ["/reference/bed-frame-1.png", "/reference/bed-frame-2.png"],
    stages: [
      { name: "Material Sourcing", headTechId: "tech-1", status: "Pending", materials: [{ inventoryItemId: "inv-2", name: "Oak Plank", quantity: 7, unit: "boards" }] },
      { name: "Frame Assembly", headTechId: "tech-4", status: "Pending", materials: [{ inventoryItemId: "inv-6", name: "Wood Screws 40mm", quantity: 2, unit: "boxes" }] },
      { name: "Upholstery", headTechId: "tech-2", status: "Pending", materials: [{ inventoryItemId: "inv-7", name: "Foam Padding", quantity: 1, unit: "rolls" }] },
    ],
  },
  {
    id: "ORD-1007",
    customerName: "Zainab Lawal",
    contact: "+234 802 555 0707",
    furnitureType: "TV Console Unit",
    size: "200 x 45 x 50 cm",
    quotedPrice: 870,
    orderDate: "2026-06-18",
    expectedDelivery: "2026-07-15",
    status: "In Workshop",
    originatingBranch: "Lekki Showroom",
    stages: [],
  },
  {
    id: "ORD-1008",
    customerName: "Emeka Nwosu",
    contact: "+234 806 555 0808",
    furnitureType: "Dining Chairs (Set of 4)",
    size: "45 x 45 x 95 cm each",
    quotedPrice: 640,
    orderDate: "2026-06-20",
    expectedDelivery: "2026-07-18",
    status: "In Workshop",
    originatingBranch: "Central Workshop",
    stages: [],
  },
  {
    id: "ORD-1009",
    customerName: "Amaka Obi",
    contact: "+234 808 555 0909",
    furnitureType: "Coffee Table",
    size: "110 x 60 x 45 cm",
    quotedPrice: 430,
    orderDate: "2026-05-30",
    expectedDelivery: "2026-06-25",
    status: "Awaiting Return",
    originatingBranch: "Ikeja Showroom",
    stages: [
      { name: "Material Sourcing", headTechId: "tech-1", status: "Done", completedAt: "2026-06-20", materials: [{ inventoryItemId: "inv-2", name: "Oak Plank", quantity: 3, unit: "boards" }] },
      { name: "Assembly", headTechId: "tech-4", status: "Done", completedAt: "2026-06-22", materials: [] },
      { name: "Finishing", headTechId: "tech-3", status: "Done", completedAt: "2026-06-24", materials: [{ inventoryItemId: "inv-9", name: "Matte Lacquer", quantity: 1, unit: "liters" }] },
    ],
  },
]

// --- Material requests ---------------------------------------------------

export const materialRequests: MaterialRequest[] = [
  {
    id: "req-1",
    orderId: "ORD-1002",
    technicianId: "tech-1",
    technicianName: "Daniel Okoye",
    materialName: "Brass Hinges",
    quantity: 6,
    unit: "pcs",
    requestedAt: "2026-06-23",
    status: "Pending",
  },
  {
    id: "req-2",
    orderId: "ORD-1003",
    technicianId: "tech-2",
    technicianName: "Grace Mensah",
    materialName: "Linen Fabric",
    quantity: 4,
    unit: "meters",
    requestedAt: "2026-06-24",
    status: "Pending",
  },
  {
    id: "req-3",
    orderId: "ORD-1002",
    technicianId: "tech-1",
    technicianName: "Daniel Okoye",
    materialName: "Wood Glue",
    quantity: 2,
    unit: "liters",
    requestedAt: "2026-06-22",
    status: "Pending",
  },
  {
    id: "req-4",
    orderId: "ORD-1003",
    technicianId: "tech-4",
    technicianName: "Fatima Bello",
    materialName: "Oak Plank",
    quantity: 2,
    unit: "boards",
    requestedAt: "2026-06-19",
    status: "Approved",
  },
  {
    id: "req-5",
    orderId: "ORD-1002",
    technicianId: "tech-3",
    technicianName: "Samuel Adeyemi",
    materialName: "Matte Lacquer",
    quantity: 5,
    unit: "liters",
    requestedAt: "2026-06-18",
    status: "Rejected",
  },
]

// --- Issuances -----------------------------------------------------------

export const orderIssuances: OrderIssuance[] = [
  {
    id: "iss-1",
    orderId: "ORD-1002",
    furnitureType: "Wardrobe (3-Door)",
    status: "Pending",
    lines: [
      { inventoryItemId: "inv-3", materialName: "Plywood Sheet 18mm", unit: "sheets", estimatedQty: 6 },
      { inventoryItemId: "inv-4", materialName: "Brass Hinges", unit: "pcs", estimatedQty: 12 },
      { inventoryItemId: "inv-5", materialName: "Drawer Slides", unit: "pairs", estimatedQty: 3 },
      { inventoryItemId: "inv-9", materialName: "Matte Lacquer", unit: "liters", estimatedQty: 3 },
    ],
  },
  {
    id: "iss-2",
    orderId: "ORD-1003",
    furnitureType: "3-Seater Sofa",
    status: "Pending",
    lines: [
      { inventoryItemId: "inv-2", materialName: "Oak Plank", unit: "boards", estimatedQty: 5 },
      { inventoryItemId: "inv-7", materialName: "Foam Padding", unit: "rolls", estimatedQty: 2 },
      { inventoryItemId: "inv-8", materialName: "Linen Fabric", unit: "meters", estimatedQty: 12 },
    ],
  },
  {
    id: "iss-3",
    orderId: "ORD-1007",
    furnitureType: "TV Console Unit",
    status: "Pending",
    lines: [
      { inventoryItemId: "inv-3", materialName: "Plywood Sheet 18mm", unit: "sheets", estimatedQty: 4 },
      { inventoryItemId: "inv-6", materialName: "Wood Screws 40mm", unit: "boxes", estimatedQty: 1 },
    ],
  },
]

export const additionalIssuances: AdditionalIssuance[] = [
  {
    id: "add-1",
    orderId: "ORD-1003",
    technicianName: "Fatima Bello",
    inventoryItemId: "inv-2",
    materialName: "Oak Plank",
    unit: "boards",
    approvedQty: 2,
    status: "Pending",
  },
  {
    id: "add-2",
    orderId: "ORD-1002",
    technicianName: "Daniel Okoye",
    inventoryItemId: "inv-4",
    materialName: "Brass Hinges",
    unit: "pcs",
    approvedQty: 6,
    status: "Pending",
  },
]

// --- Branches ------------------------------------------------------------

export const branches: Branch[] = [
  { id: "branch-a", code: "A", name: "Ikeja Showroom" },
  { id: "branch-b", code: "B", name: "Lekki Showroom" },
  { id: "branch-c", code: "C", name: "Abuja Showroom" },
]

// --- Shop inventory (individual units) -----------------------------------

export const shopItems: ShopItem[] = [
  { id: "ITEM-A-001", name: "Mahogany Dining Table", category: "Dining", branchId: "branch-a", price: 900, status: "Available", dateEntered: "2026-05-14", photo: "/reference/dining-table-1.png" },
  { id: "ITEM-A-002", name: "Mahogany Dining Chair", category: "Dining", branchId: "branch-a", price: 260, status: "Available", dateEntered: "2026-05-14" },
  { id: "ITEM-A-003", name: "Mahogany Dining Chair", category: "Dining", branchId: "branch-a", price: 260, status: "Available", dateEntered: "2026-05-14" },
  { id: "ITEM-A-004", name: "Mahogany Dining Chair", category: "Dining", branchId: "branch-a", price: 260, status: "Available", dateEntered: "2026-05-14" },
  { id: "ITEM-A-005", name: "Mahogany Dining Chair", category: "Dining", branchId: "branch-a", price: 260, status: "Available", dateEntered: "2026-05-14" },
  { id: "ITEM-A-006", name: "Heritage 4-Door Wardrobe", category: "Bedroom", branchId: "branch-a", price: 1150, status: "Available", dateEntered: "2026-06-01" },
  { id: "ITEM-A-007", name: "Compact Study Desk", category: "Office", branchId: "branch-a", price: 480, status: "Sold", dateEntered: "2026-05-02", soldAt: "2026-06-15T11:20:00" },
  { id: "ITEM-B-001", name: "3-Seater Linen Sofa", category: "Living Room", branchId: "branch-b", price: 1500, status: "Available", dateEntered: "2026-05-28", photo: "/reference/bed-frame-1.png" },
  { id: "ITEM-B-002", name: "Matching Armchair", category: "Living Room", branchId: "branch-b", price: 600, status: "Available", dateEntered: "2026-05-28" },
  { id: "ITEM-B-003", name: "Matching Armchair", category: "Living Room", branchId: "branch-b", price: 600, status: "Available", dateEntered: "2026-05-28" },
  { id: "ITEM-B-004", name: "Glass Coffee Table", category: "Living Room", branchId: "branch-b", price: 400, status: "Available", dateEntered: "2026-05-28" },
  { id: "ITEM-B-005", name: "Stacking Bookshelf", category: "Storage", branchId: "branch-b", price: 300, status: "Sold", dateEntered: "2026-04-19", soldAt: "2026-06-10T15:00:00" },
  { id: "ITEM-B-006", name: "Stacking Bookshelf", category: "Storage", branchId: "branch-b", price: 300, status: "Available", dateEntered: "2026-04-19" },
  { id: "ITEM-C-001", name: "King Bed Frame", category: "Bedroom", branchId: "branch-c", price: 1400, status: "Available", dateEntered: "2026-06-05" },
  { id: "ITEM-C-002", name: "Oak Nightstand", category: "Bedroom", branchId: "branch-c", price: 350, status: "Available", dateEntered: "2026-06-05" },
  { id: "ITEM-C-003", name: "Oak Nightstand", category: "Bedroom", branchId: "branch-c", price: 350, status: "Available", dateEntered: "2026-06-05" },
  { id: "ITEM-C-004", name: "6-Drawer Dresser", category: "Bedroom", branchId: "branch-c", price: 700, status: "Available", dateEntered: "2026-06-05" },
  { id: "ITEM-C-005", name: "Walnut Side Table", category: "Living Room", branchId: "branch-c", price: 280, status: "Available", dateEntered: "2026-06-12" },
  { id: "ITEM-C-006", name: "Walnut Side Table", category: "Living Room", branchId: "branch-c", price: 280, status: "Available", dateEntered: "2026-06-12" },
  { id: "ITEM-C-007", name: "Teak Patio Bench", category: "Outdoor", branchId: "branch-c", price: 520, status: "Available", dateEntered: "2026-06-18" },
]

// --- Custom-piece catalogue ----------------------------------------------

export const catalogue: CatalogueProduct[] = [
  { id: "CAT-001", name: "Custom Dining Table", category: "Dining", description: "Solid hardwood dining table, 4–8 seats, choice of finish.", minPrice: 700, maxPrice: 1400, photo: "/reference/dining-table-2.png" },
  { id: "CAT-002", name: "Custom Wardrobe", category: "Bedroom", description: "Fitted wardrobe, 2–5 doors, optional mirror and internal drawers.", minPrice: 800, maxPrice: 1800 },
  { id: "CAT-003", name: "Custom Sofa", category: "Living Room", description: "Bespoke upholstered sofa, 2–4 seats, choice of fabric.", minPrice: 1200, maxPrice: 2600 },
  { id: "CAT-004", name: "Custom Office Desk", category: "Office", description: "Executive desk with cable management and drawer unit.", minPrice: 500, maxPrice: 1100 },
  { id: "CAT-005", name: "Custom Bed Frame", category: "Bedroom", description: "Upholstered or timber bed frame, Queen or King.", minPrice: 900, maxPrice: 1900 },
  { id: "CAT-006", name: "Custom Bookshelf", category: "Storage", description: "Floor-to-ceiling shelving, adjustable spacing.", minPrice: 350, maxPrice: 900 },
  { id: "CAT-007", name: "Custom TV Console", category: "Living Room", description: "Media unit with storage, up to 240cm wide.", minPrice: 500, maxPrice: 1200 },
]

// --- Quotes ---------------------------------------------------------------

export const quotes: Quote[] = [
  {
    id: "Q-001",
    branchId: "branch-a",
    customerName: "Adaeze Nwankwo",
    contact: "+234 803 555 0710",
    productName: "Custom Dining Table",
    catalogueId: "CAT-001",
    category: "Dining",
    size: "8-seater, 240cm",
    refMin: 700,
    refMax: 1400,
    quotedPrice: 1250,
    withinRange: true,
    notes: "Walnut finish, customer confirmed.",
    status: "Approved",
    createdAt: "2026-06-20",
  },
  {
    id: "Q-002",
    branchId: "branch-c",
    customerName: "Musa Danjuma",
    contact: "+234 805 555 0822",
    productName: "Custom Sofa",
    catalogueId: "CAT-003",
    category: "Living Room",
    size: "4-seater L-shape",
    refMin: 1200,
    refMax: 2600,
    quotedPrice: 1050,
    withinRange: false,
    notes: "Customer bargaining hard — below floor price.",
    status: "Pending Director",
    createdAt: "2026-06-24",
  },
]

export const shopSales: ShopSale[] = [
  {
    id: "SALE-0001",
    branchId: "branch-a",
    kind: "Single",
    lineItems: [{ itemId: "ITEM-A-007", name: "Compact Study Desk", price: 480 }],
    customerName: "Ngozi Eze",
    contact: "+234 802 555 0110",
    total: 480,
    paymentMethod: "Bank Transfer",
    soldAt: "2026-06-15T11:20:00",
  },
  {
    id: "SALE-0002",
    branchId: "branch-b",
    kind: "Single",
    lineItems: [{ itemId: "ITEM-B-005", name: "Stacking Bookshelf", price: 300 }],
    customerName: "Kunle Adebayo",
    contact: "+234 807 555 0330",
    total: 300,
    paymentMethod: "Cash",
    soldAt: "2026-06-10T15:00:00",
  },
]

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

export const reorders: Reorder[] = [
  {
    id: "RO-001",
    inventoryItemId: "inv-2",
    materialName: "Oak Plank",
    unit: "boards",
    qtyOnHand: 12,
    reorderLevel: 15,
    qtyOrdered: 30,
    supplierNote: "Timber House Ltd",
    status: "Ordered",
    raisedAt: "2026-06-22",
    orderedAt: "2026-06-23",
  },
  {
    id: "RO-002",
    inventoryItemId: "inv-6",
    materialName: "Wood Screws 40mm",
    unit: "boxes",
    qtyOnHand: 8,
    reorderLevel: 10,
    qtyOrdered: 20,
    status: "Raised",
    raisedAt: "2026-06-25",
  },
  {
    id: "RO-003",
    inventoryItemId: "inv-10",
    materialName: "Wood Glue",
    unit: "liters",
    qtyOnHand: 5,
    reorderLevel: 6,
    qtyOrdered: 15,
    supplierNote: "CraftSupply Co",
    status: "Raised",
    raisedAt: "2026-06-26",
  },
]

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
