// Weekly payroll & cost-report calculations for mock data components.
// UI-only — no backend.

import {
  getInventoryById,
  getTechnicianById,
  type Order,
  type Technician,
} from "@/lib/mock-data"

export type WeekKey = "this" | "last"

const REFERENCE_DATE = new Date("2026-06-24T12:00:00")

export interface WeekRange {
  start: Date
  end: Date
  label: string
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function getWeekRange(week: WeekKey): WeekRange {
  const thisStart = startOfWeek(REFERENCE_DATE)
  const start = new Date(thisStart)
  if (week === "last") start.setDate(start.getDate() - 7)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return {
    start,
    end,
    label: `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`,
  }
}

function inRange(dateStr: string | undefined, range: WeekRange): boolean {
  if (!dateStr) return false
  const t = new Date(dateStr).getTime()
  return t >= range.start.getTime() && t <= range.end.getTime()
}

export interface PayrollRow {
  technician: Technician
  stagesCompleted: number
  rate: number
  payout: number
}

export function getPayroll(orders: Order[], range: WeekRange): {
  rows: PayrollRow[]
  total: number
} {
  const counts = new Map<string, number>()
  for (const order of orders) {
    for (const stage of order.stages) {
      if (stage.status === "Done" && inRange(stage.completedAt, range)) {
        counts.set(stage.headTechId, (counts.get(stage.headTechId) ?? 0) + 1)
      }
    }
  }

  const rows: PayrollRow[] = []
  for (const [techId, stagesCompleted] of counts) {
    const technician = getTechnicianById(techId)
    if (!technician) continue
    rows.push({
      technician,
      stagesCompleted,
      rate: technician.rate,
      payout: stagesCompleted * technician.rate,
    })
  }
  rows.sort((a, b) => b.payout - a.payout)
  const total = rows.reduce((sum, r) => sum + r.payout, 0)
  return { rows, total }
}

export interface MaterialUsageRow {
  name: string
  unit: string
  quantity: number
  cost: number
}

export interface WeeklyReport {
  materials: MaterialUsageRow[]
  materialsTotalCost: number
  totalLabour: number
  totalRevenue: number
  completedOrders: number
}

function orderCompletionDate(order: Order): string | undefined {
  if (order.stages.length === 0) return undefined
  if (!order.stages.every((s) => s.status === "Done")) return undefined
  const dates = order.stages
    .map((s) => s.completedAt)
    .filter((d): d is string => Boolean(d))
  if (dates.length !== order.stages.length) return undefined
  return dates.reduce((latest, d) => (d > latest ? d : latest), dates[0])
}

export function getWeeklyReport(orders: Order[], range: WeekRange): WeeklyReport {
  const usage = new Map<string, MaterialUsageRow>()
  for (const order of orders) {
    for (const stage of order.stages) {
      if (stage.status !== "Done" || !inRange(stage.completedAt, range)) continue
      for (const m of stage.materials) {
        const item = getInventoryById(m.inventoryItemId)
        const unitCost = item?.unitCost ?? 0
        const existing = usage.get(m.inventoryItemId)
        if (existing) {
          existing.quantity += m.quantity
          existing.cost += unitCost * m.quantity
        } else {
          usage.set(m.inventoryItemId, {
            name: m.name,
            unit: m.unit,
            quantity: m.quantity,
            cost: unitCost * m.quantity,
          })
        }
      }
    }
  }
  const materials = [...usage.values()].sort((a, b) => b.cost - a.cost)
  const materialsTotalCost = materials.reduce((s, m) => s + m.cost, 0)
  const totalLabour = getPayroll(orders, range).total

  let totalRevenue = 0
  let completedOrders = 0
  for (const order of orders) {
    if (inRange(orderCompletionDate(order), range)) {
      totalRevenue += order.quotedPrice
      completedOrders += 1
    }
  }

  return {
    materials,
    materialsTotalCost,
    totalLabour,
    totalRevenue,
    completedOrders,
  }
}
