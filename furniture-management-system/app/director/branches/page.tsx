import { RoleGuard } from "@/components/auth/role-guard"
import { BranchesView } from "@/components/director/branches-view"

export default function DirectorBranchesPage() {
  return (
    <RoleGuard allowedRole="DIRECTOR">
      <div className="p-6">
        <BranchesView />
      </div>
    </RoleGuard>
  )
}
