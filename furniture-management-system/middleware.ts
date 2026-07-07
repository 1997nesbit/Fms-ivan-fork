import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = new Set(["/login"])

// Backend origin the API proxy forwards to. Read at runtime (middleware runs
// on the server), so Railway's service variables apply without a rebuild.
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

// Internal Next.js API routes that must NOT be proxied to Django. They also
// stay behind the session guard below — /api/sms/send has no auth check of
// its own and sends real SMS with a shared API key.
const INTERNAL_API_PREFIXES = ["/api/sms"]

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = request.cookies.has("refresh_token")

  // ── API proxy ─────────────────────────────────────────────────────────
  // Browser API calls go to this app's own origin and are forwarded to the
  // backend here, so auth cookies are first-party. up.railway.app is on the
  // public suffix list, which makes the frontend and backend subdomains
  // unrelated "sites" to the browser — calling the backend directly makes
  // its cookies third-party, and browsers block those outright regardless
  // of SameSite/Secure attributes.
  //
  // Proxying happens in middleware (not next.config rewrites) because
  // rewrite :path* captures strip the trailing slash Django requires;
  // NextResponse.rewrite forwards the path verbatim.
  if (pathname.startsWith("/api/")) {
    const isInternal = INTERNAL_API_PREFIXES.some((p) => pathname.startsWith(p))
    if (!isInternal) {
      // Django enforces its own auth (401s) — including login/refresh,
      // which must work with no session cookie yet.
      return NextResponse.rewrite(new URL(`${pathname}${search}`, BACKEND_URL))
    }
    // Internal Next API routes fall through to the session guard below.
  }

  // ── Page navigation guard ─────────────────────────────────────────────
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url)
    // Don't attach ?next=/ — the root page handles its own auth redirect
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Skip Next.js internals and static assets. /api/* stays in scope —
    // non-internal API paths are proxied to the backend above.
    "/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*).*)",
  ],
}
