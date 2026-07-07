import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = new Set(["/login"])

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has("refresh_token")

  // Always let public pages through
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
    // Skip Next.js internals, static assets, RSC navigation requests, and
    // /api/* — those are proxied straight to Django (see next.config.mjs),
    // which has its own cookie-based auth. Gating them here would redirect
    // unauthenticated API calls (e.g. the login POST itself) to /login
    // instead of ever reaching the backend.
    "/((?!api|_next/static|_next/image|favicon.*|icon.*|apple-icon.*).*)",
  ],
}
