import { RoleGuard } from "@/components/auth/role-guard"
import { IssueMaterialsScreen } from "@/components/stock-keeper/issue-materials-screen"
import { Warehouse } from "lucide-react"

export default function StockKeeperIssueMaterialsPage() {
  return (
    <RoleGuard allowedRole="STOCK_KEEPER">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Warehouse className="size-5" />
          </span>
          <div className="flex-1 space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Stock Keeper — Issue Materials
            </h1>
            <p className="max-w-2xl text-pretty text-sm text-muted-foreground">
              Issue materials against approved requests. Every issuance deducts
              from the ledger automatically.
            </p>
          </div>
        </div>
        <IssueMaterialsScreen />
      </div>
    </RoleGuard>
  )
}
