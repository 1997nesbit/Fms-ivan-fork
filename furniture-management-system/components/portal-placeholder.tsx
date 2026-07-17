import { getRoleById, type RoleId } from "@/lib/roles"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function PortalPlaceholder({ roleId }: { roleId: RoleId }) {
  const role = getRoleById(roleId)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <role.icon className="size-5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {role.label} Portal
          </h1>
          <p className="max-w-xl text-pretty text-muted-foreground">
            {role.description}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {role.nav
          .filter((item) => item.label !== "Overview")
          .map((item) => (
            <Card key={item.label} className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">{item.label}</CardTitle>
                <CardDescription>Coming soon</CardDescription>
              </CardHeader>
            </Card>
          ))}
      </div>

      <p className="text-sm text-muted-foreground">
        This portal is a placeholder. We&apos;ll build out its screens next.
      </p>
    </div>
  )
}
