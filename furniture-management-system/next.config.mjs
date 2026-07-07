/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Every Django endpoint requires a trailing slash (path("login/", ...)).
  // Next's default behaviour redirects away any trailing slash before
  // middleware ever sees the request, which would 404 every proxied POST
  // (Django can't safely auto-append a slash on non-safe methods). This
  // disables that normalization so the path reaches the proxy intact.
  // The API proxy itself lives in middleware.ts — config rewrites strip
  // trailing slashes from :path* captures, middleware preserves them.
  skipTrailingSlashRedirect: true,
}

export default nextConfig
