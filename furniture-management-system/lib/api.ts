import axios from "axios"

// Relative path — the browser always calls this app's own origin, which
// proxies through to the backend server-side (see next.config.mjs
// rewrites). Keeps auth cookies first-party instead of third-party.
const BASE_URL = "/api"

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // browser auto-sends access_token + refresh_token cookies
  timeout: 10_000,
})

// On 401: call /auth/refresh/ to rotate tokens, then retry the original request once.
// The refresh endpoint itself is excluded to avoid an infinite loop.
let refreshing: Promise<boolean> | null = null

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as { url?: string; _retry?: boolean; headers: Record<string, string> }
    const isAuthEndpoint =
      original.url?.includes("/auth/refresh/") ||
      original.url?.includes("/auth/login/")

    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true

      if (!refreshing) {
        refreshing = api
          .post("/auth/refresh/", {})
          .then(() => true)
          .catch(() => false)
          .finally(() => { refreshing = null })
      }

      const ok = await refreshing
      if (ok) return api(original)
    }

    throw error
  }
)

export default api
