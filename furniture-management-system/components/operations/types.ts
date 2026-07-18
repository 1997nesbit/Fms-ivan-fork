export interface Technician {
  id: number
  name: string
}

export interface Stage {
  id: number
  stage_name: string
  sequence_number: number
  status: "PENDING" | "ACTIVE" | "DONE"
  assigned_technician: { id: number; name: string } | null
  agreed_wage: string | null
  allotted_time: string
  payment_status: "PENDING" | "PAID" | null
  activated_at: string | null
  completed_at: string | null
  order: {
    id: number
    reference_number: string
    customer_name: string
    item_description: string
    delivery_date: string | null
  }
}

export interface OrderItemPlan {
  id: number
  name: string
  notes: string
  measurements: string
  stages: Omit<Stage, "order">[]
}

export interface OpsOrder {
  id: number
  reference_number: string
  customer_name: string
  customer_phone: string
  item_description: string
  delivery_date: string | null
  status: string
  created_at: string
  items: OrderItemPlan[]
  stages: Stage[]
}

export interface MaterialRequest {
  id: number
  stage_id: number
  order_id: number
  order_reference: string
  material_name: string
  quantity: number
  unit: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "ISSUED"
  requested_by_name: string
  reviewed_by_name: string | null
  review_reason: string | null
  created_at: string
}
