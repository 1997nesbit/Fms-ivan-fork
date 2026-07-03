import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

export type OrderStatus =
  | "PENDING"
  | "PRICE_REVIEW"
  | "OPS_QUEUE"
  | "IN_PRODUCTION"
  | "WORKSHOP_COMPLETE"
  | "DISPATCHED"
  | "CANCELLED"

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> = {
  PENDING: {
    label: "Pending",
    className: "border-border bg-muted text-muted-foreground",
  },
  PRICE_REVIEW: {
    label: "Pending Approval",
    className:
      "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  OPS_QUEUE: {
    label: "Ops Queue",
    className:
      "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  },
  IN_PRODUCTION: {
    label: "In Production",
    className:
      "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200",
  },
  WORKSHOP_COMPLETE: {
    label: "Ready for Collection",
    className:
      "border-green-300 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  },
  DISPATCHED: {
    label: "Dispatched",
    className: "border-border bg-muted text-muted-foreground",
  },
  CANCELLED: {
    label: "Cancelled",
    className:
      "border-red-300 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  },
}

export function StatusBadge({ status }: Readonly<{ status: string }>) {
  const config = STATUS_CONFIG[status as OrderStatus] ?? {
    label: status,
    className: "border-border bg-muted text-muted-foreground",
  }
  return (
    <Badge variant="outline" className={cn("font-medium", config.className)}>
      {config.label}
    </Badge>
  )
}
