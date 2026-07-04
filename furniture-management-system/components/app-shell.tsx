"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Armchair, ChevronsUpDown, LogOut, Settings, User } from "lucide-react"

import api from "@/lib/api"
import { roles, getRoleByHref, type RoleId } from "@/lib/roles"
import { cn, toArray } from "@/lib/utils"
import { useAuth } from "@/app/providers"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === "/login") {
    return <>{children}</>
  }

  return <AuthenticatedShell>{children}</AuthenticatedShell>
}

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const activeRole = getRoleByHref(pathname) ?? roles[0]

  // Stock Keeper: how many approved material requests are still waiting to
  // be issued. This deliberately shares the "material-requests" query key
  // with the portal pages so it reuses their cached fetch instead of firing
  // an extra request — which means it MUST resolve to the same array shape
  // they all expect (TanStack Query shares one cache entry per key across
  // every component that reads it, regardless of that component's own
  // queryFn). Returning anything else here — a count, an object — silently
  // corrupts every other screen's data the next time this query re-runs.
  const { data: pendingIssuanceRequests = [] } = useQuery({
    queryKey: ["material-requests"],
    queryFn: async () => {
      const { data } = await api.get<{ results: unknown[] }>("/stock/material-requests/")
      return toArray(data)
    },
    enabled: !!user && activeRole.id === "stock-keeper",
    staleTime: 30_000,
  })

  const navBadges: Partial<Record<string, number>> = {
    "/stock-keeper/issue-materials": pendingIssuanceRequests.length,
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Armchair className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight sm:text-base">
                Furniture Management
              </p>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Workshop operations
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="gap-2">
                  <User data-icon="inline-start" className="size-4" />
                  <span className="max-w-28 truncate sm:max-w-none">
                    {user?.full_name || user?.username || activeRole.label}
                  </span>
                  <ChevronsUpDown
                    data-icon="inline-end"
                    className="opacity-60"
                  />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium">{user?.full_name || user?.username}</p>
                  <p className="text-xs text-muted-foreground">{activeRole.label}</p>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2" onClick={() => router.push("/settings")}>
                <Settings className="size-4" />
                Account settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-destructive focus:text-destructive"
                onClick={() => logout()}
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="border-t border-border/60 bg-card">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
            {activeRole.nav.map((item) => {
              const isActive = item.href ? pathname === item.href : false
              const badgeCount = item.href ? navBadges[item.href] : undefined

              if (item.href) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {item.label}
                    {!!badgeCount && badgeCount > 0 && (
                      <span className="rounded-full bg-destructive px-1.5 text-[10px] font-semibold tabular-nums text-destructive-foreground">
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                )
              }

              return (
                <span
                  key={item.label}
                  className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground"
                >
                  {item.label}
                  <Badge variant="secondary" className="text-[10px]">
                    Soon
                  </Badge>
                </span>
              )
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  )
}

export type { RoleId }
