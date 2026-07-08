"use client"

import { Suspense, type FormEvent, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, Armchair, Eye, EyeOff, Loader2, Lock } from "lucide-react"

import { login, ROLE_PORTAL } from "@/lib/auth"
import { useAuth } from "@/app/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApiError = { response?: { data?: { detail?: string } } }

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, setUser } = useAuth()

  // Redirect if session is already active
  useEffect(() => {
    if (!loading && user) {
      const next = searchParams.get("next")
      router.replace(next && next !== "/" ? next : ROLE_PORTAL[user.role])
    }
  }, [user, loading, router, searchParams])

  async function handleLogin(username: string, password: string) {
    const authedUser = await login(username, password)
    setUser(authedUser)
    const next = searchParams.get("next")
    router.push(next && next !== "/" ? next : ROLE_PORTAL[authedUser.role])
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-7">

        {/* Brand */}
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Armchair className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Furniture Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Style My Space — workshop operations
            </p>
          </div>
        </div>

        {/* Login card */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-lg shadow-black/5 space-y-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Lock className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium">Sign in</p>
              <p className="text-xs text-muted-foreground">
                Enter your credentials to access your portal
              </p>
            </div>
          </div>
          <LoginForm onLogin={handleLogin} />
        </div>

      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------

function LoginForm({ onLogin }: { onLogin: (u: string, p: string) => Promise<void> }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await onLogin(username, password)
    } catch (err: unknown) {
      setError(
        (err as ApiError)?.response?.data?.detail ??
          "Invalid credentials. Please try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field>
        <FieldLabel htmlFor="username">Username</FieldLabel>
        <Input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      {error && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive animate-in fade-in-0"
          role="alert"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
      </Button>
    </form>
  )
}
