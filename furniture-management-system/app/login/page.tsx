"use client"

import { type FormEvent, Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle,
  Armchair,
  Delete,
  Eye,
  EyeOff,
  Hammer,
  Loader2,
  Lock,
  Users,
} from "lucide-react"

import { login, ROLE_PORTAL } from "@/lib/auth"
import { useAuth } from "@/app/providers"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApiError = { response?: { data?: { detail?: string } } }

const PIN_LENGTH = 4

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}

function LoginPageContent() {
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

        {/* Login tabs */}
        <Tabs defaultValue="staff" className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-auto p-1">
            <TabsTrigger
              value="staff"
              className="flex flex-col items-center gap-1 py-2.5 h-auto"
            >
              <Users className="size-4" />
              <span className="text-xs font-medium">Staff Login</span>
            </TabsTrigger>
            <TabsTrigger
              value="technician"
              className="flex flex-col items-center gap-1 py-2.5 h-auto"
            >
              <Hammer className="size-4" />
              <span className="text-xs font-medium">Technician PIN</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Staff tab ── */}
          <TabsContent
            value="staff"
            className="mt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
          >
            <div className="rounded-xl border border-border bg-card p-5 shadow-lg shadow-black/5 space-y-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Lock className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">Staff Portal</p>
                  <p className="text-xs text-muted-foreground">
                    Front Desk · Director · Operations · Stock Keeper
                  </p>
                </div>
              </div>
              <StaffLoginForm onLogin={handleLogin} />
            </div>
          </TabsContent>

          {/* ── Technician PIN tab ── */}
          <TabsContent
            value="technician"
            className="mt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300"
          >
            <div className="rounded-xl border border-border bg-card p-5 shadow-lg shadow-black/5 space-y-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Hammer className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">Workshop Floor</p>
                  <p className="text-xs text-muted-foreground">
                    Select your name and enter your 4-digit PIN
                  </p>
                </div>
              </div>
              <TechnicianPinForm onLogin={handleLogin} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Staff login form (username + password → JWT)
// ---------------------------------------------------------------------------

function StaffLoginForm({ onLogin }: { onLogin: (u: string, p: string) => Promise<void> }) {
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

// ---------------------------------------------------------------------------
// Technician PIN form (username + numeric keypad → JWT)
// ---------------------------------------------------------------------------

function TechnicianPinForm({ onLogin }: { onLogin: (u: string, p: string) => Promise<void> }) {
  const [username, setUsername] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const attemptLogin = useCallback(
    async (candidate: string) => {
      if (!username.trim()) {
        setError("Enter your username first.")
        setPin("")
        return
      }
      setSubmitting(true)
      setError(null)
      try {
        await onLogin(username.trim(), candidate)
      } catch {
        setError("Incorrect PIN. Try again.")
        setTimeout(() => setPin(""), 300)
      } finally {
        setSubmitting(false)
      }
    },
    [username, onLogin]
  )

  function pressDigit(digit: string) {
    if (submitting) return
    setError(null)
    setPin((prev) => {
      if (prev.length >= PIN_LENGTH) return prev
      const next = prev + digit
      if (next.length === PIN_LENGTH) {
        attemptLogin(next)
      }
      return next
    })
  }

  function backspace() {
    setError(null)
    setPin((prev) => prev.slice(0, -1))
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
  const canType = username.trim().length > 0 && !submitting

  return (
    <div className="space-y-5">
      <Field>
        <FieldLabel htmlFor="tech-username">Your username</FieldLabel>
        <Input
          id="tech-username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setPin("")
            setError(null)
          }}
          autoComplete="username"
          placeholder="e.g. juma.tech"
        />
      </Field>

      {/* PIN dots */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3" aria-label="PIN entry">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full border-2 transition-all duration-150",
                i < pin.length
                  ? "scale-110 border-amber-500 bg-amber-500"
                  : "border-muted-foreground/30 bg-transparent"
              )}
            />
          ))}
        </div>
        <p
          className={cn(
            "min-h-5 text-xs",
            error ? "text-destructive" : "text-muted-foreground"
          )}
          role={error ? "alert" : undefined}
        >
          {error ?? (canType ? "Enter your 4-digit PIN" : " ")}
        </p>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k) => (
          <Button
            key={k}
            type="button"
            variant="outline"
            className="h-14 text-xl font-medium transition-transform active:scale-95"
            onClick={() => pressDigit(k)}
            disabled={!canType}
          >
            {k}
          </Button>
        ))}
        <span aria-hidden />
        <Button
          type="button"
          variant="outline"
          className="h-14 text-xl font-medium transition-transform active:scale-95"
          onClick={() => pressDigit("0")}
          disabled={!canType}
        >
          0
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-14 transition-transform active:scale-95"
          onClick={backspace}
          disabled={pin.length === 0}
          aria-label="Delete last digit"
        >
          {submitting ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Delete className="size-5" />
          )}
        </Button>
      </div>
    </div>
  )
}
