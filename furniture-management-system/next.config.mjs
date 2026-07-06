const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000"

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Proxies /api/* to the Django backend so the browser only ever talks to
  // this app's own domain. That keeps auth cookies (set by the backend
  // response) scoped to this domain even when the backend lives elsewhere,
  // which is what middleware.ts needs to see them.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
