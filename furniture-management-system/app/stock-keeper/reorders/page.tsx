import { RoleGuard } from "@/components/auth/role-guard"
import { ReordersScreen } from "@/components/stock-keeper/reorders-screen"
import { Warehouse } from "lucide-react"

export default function StockKeeperReordersPage() {
  return (
    <RoleGuard allowedRole="STOCK_KEEPER">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Warehouse className="size-5" />
          </span>
          <div className="flex-1 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Stock Keeper — Reorder Requests
            </h1>
            <p className="max-w-2xl text-pretty text-sm text-muted-foreground">
              Raise purchase requests for low-stock materials, track them from
              pending to Director approval.
            </p>
          </div>
        </div>
        <ReordersScreen />
      </div>
    </RoleGuard>
  )
}
