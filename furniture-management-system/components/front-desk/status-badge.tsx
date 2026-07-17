import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { statusBadgeTone, type StatusTone } from "@/components/shared/status"

export type OrderStatus =
  | "PENDING"
  | "PRICE_REVIEW"
  | "OPS_QUEUE"
  | "IN_PRODUCTION"
  | "WORKSHOP_COMPLETE"
  | "DISPATCHED"
  | "CANCELLED"

const STATUS_CONFIG: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: "Pending", tone: "neutral" },
  PRICE_REVIEW: { label: "Pending Approval", tone: "warning" },
  OPS_QUEUE: { label: "Ops Queue", tone: "info" },
  IN_PRODUCTION: { label: "In Production", tone: "accent" },
  WORKSHOP_COMPLETE: { label: "Ready for Collection", tone: "success" },
  DISPATCHED: { label: "Dispatched", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
}

export function StatusBadge({ status }: Readonly<{ status: string }>) {
  const config = STATUS_CONFIG[status as OrderStatus] ?? {
    label: status,
    tone: "neutral" as StatusTone,
  }
  return (
    <Badge variant="outline" className={cn("font-medium", statusBadgeTone(config.tone))}>
      {config.label}
    </Badge>
  )
}
