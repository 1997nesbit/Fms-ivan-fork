"use client"

import { Armchair, Hammer } from "lucide-react"

import type { AuthUser } from "@/lib/auth"

/**
 * User display component — shows the currently logged-in technician.
 * We use real username/password auth, so there is no PIN switching.
 * This component is kept for UI layout parity with the upstream design.
 */
export function UserDisplay({ user }: { user: AuthUser }) {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Hammer className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">
          Head Technician Portal
        </h1>
        <p className="text-sm text-muted-foreground text-balance">
          Signed in as <strong>{user.full_name || user.username}</strong>.
        </p>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Armchair className="size-3.5" />
        Furniture Management — workshop floor access
      </p>
    </div>
  )
}
