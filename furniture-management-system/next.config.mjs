const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000"

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Without this, Next.js's own trailing-slash redirect (strips the slash)
  // fights with Django's APPEND_SLASH (adds it back) on every /api/* call
  // proxied below, looping forever. Django's URLs are slash-terminated by
  // convention, so proxied requests need to keep whatever slash they had.
  skipTrailingSlashRedirect: true,
  // Proxies /api/* to the Django backend so the browser only ever talks to
  // this app's own domain. That keeps auth cookies (set by the backend
  // response) scoped to this domain even when the backend lives elsewhere,
  // which is what proxy.ts needs to see them.
  async rewrites() {
    return [
      {
        // A named parameter with a custom `.*` regex (rather than the
        // :path* segmented wildcard) preserves a trailing slash literally
        // instead of normalizing it away — Django's URLs require that slash.
        source: "/api/:path(.*)",
        destination: `${BACKEND_URL}/api/:path`,
      },
    ]
  },
}

export default nextConfig
