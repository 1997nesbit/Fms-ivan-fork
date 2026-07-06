import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = new Set(["/login"])

export function middleware(request: NextRequest) {
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
  // Runs on the Node.js runtime instead of Edge. Next.js's Edge runtime has
  // a known bug where next/server transitively bundles ua-parser-js, which
  // references __dirname — a Node-only global that doesn't exist on Edge.
  // Node.js runtime doesn't have that restriction.
  runtime: "nodejs",
  matcher: [
    // Skip Next.js internals, static assets, and RSC navigation requests
    "/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*).*)",
  ],
}