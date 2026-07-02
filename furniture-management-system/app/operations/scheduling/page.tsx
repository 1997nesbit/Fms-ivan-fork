import { RoleGuard } from "@/components/auth/role-guard"
import { SchedulingBoard } from "@/components/operations/scheduling-board"

export default function SchedulingPage() {
  return (
    <RoleGuard allowedRole="OPS_MANAGER">
      <SchedulingBoard />
    </RoleGuard>
  )
}
