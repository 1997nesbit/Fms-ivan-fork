import { RoleGuard } from "@/components/auth/role-guard"
import { AssignmentsManager } from "@/components/operations/assignments-manager"

export default function AssignmentsPage() {
  return (
    <RoleGuard allowedRole="OPS_MANAGER">
      <AssignmentsManager />
    </RoleGuard>
  )
}
