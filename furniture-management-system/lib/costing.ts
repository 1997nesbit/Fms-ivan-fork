// Cost & margin calculations for mock data components.
// UI-only — no backend.

import {
  getInventoryById,
  getTechnicianById,
  type Order,
} from "@/lib/mock-data"

export interface OrderCosting {
  hasStages: boolean
  materialsCost: number
  labourCost: number
  totalCost: number
  customerPrice: number
  grossMargin: number
}

export function materialsCost(order: Order): number {
  return order.stages.reduce((sum, stage) => {
    const stageTotal = stage.materials.reduce((s, m) => {
      const item = getInventoryById(m.inventoryItemId)
      return s + (item ? item.unitCost * m.quantity : 0)
    }, 0)
    return sum + stageTotal
  }, 0)
}

export function labourCost(order: Order): number {
  return order.stages.reduce((sum, stage) => {
    const tech = getTechnicianById(stage.headTechId)
    return sum + (tech ? tech.rate : 0)
  }, 0)
}

export function getOrderCosting(order: Order): OrderCosting {
  const hasStages = order.stages.length > 0
  const materials = materialsCost(order)
  const labour = labourCost(order)
  const total = materials + labour
  const customerPrice = order.quotedPrice
  return {
    hasStages,
    materialsCost: materials,
    labourCost: labour,
    totalCost: total,
    customerPrice,
    grossMargin: customerPrice - total,
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}
