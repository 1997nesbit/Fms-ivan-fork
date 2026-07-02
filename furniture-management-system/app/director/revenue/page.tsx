import { RoleGuard } from "@/components/auth/role-guard"
import { RevenueView } from "@/components/director/revenue-view"

export default function DirectorRevenuePage() {
  return (
    <RoleGuard allowedRole="DIRECTOR">
      <div className="p-6">
        <RevenueView />
      </div>
    </RoleGuard>
  )
}
