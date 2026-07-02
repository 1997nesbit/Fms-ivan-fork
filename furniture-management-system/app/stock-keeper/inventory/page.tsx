import { RoleGuard } from "@/components/auth/role-guard"
import { InventoryLedger } from "@/components/stock-keeper/inventory-ledger"
import { Warehouse } from "lucide-react"

export default function StockKeeperInventoryPage() {
  return (
    <RoleGuard allowedRole="STOCK_KEEPER">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Warehouse className="size-5" />
          </span>
          <div className="flex-1 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Stock Keeper — Inventory
            </h1>
            <p className="max-w-2xl text-pretty text-sm text-muted-foreground">
              Full material ledger. Edit on-hand quantity or reorder threshold
              inline. Add new materials as needed.
            </p>
          </div>
        </div>
        <InventoryLedger />
      </div>
    </RoleGuard>
  )
}
