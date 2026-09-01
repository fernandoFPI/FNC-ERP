import { useEffect } from 'react'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { decodeJWT } from '../lib/jwt'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

// The axios interceptor only refreshes the access token reactively, when a
// plain REST call actually 401s -- a tab that mostly sits on WebSocket
// pushes/subscriptions can go a long time without making one, so it never
// hits that path. This is the REST-side counterpart to the gateway's
// per-connection session recheck (services/gateway/src/routes/websocket.ts):
// it proactively cycles the access token on a timer instead of waiting for a
// request to fail, and once the refresh token itself is actually expired or
// the session was revoked, this is what notices and logs the tab out instead
// of it just sitting there with dead credentials indefinitely.
export function SessionKeepAlive() {
  const refreshToken = useAuthStore((s) => s.refreshToken)

  useEffect(() => {
    if (!refreshToken) return

    async function refresh() {
      const currentRefreshToken = useAuthStore.getState().refreshToken
      if (!currentRefreshToken) return
      try {
        const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/v1/auth/refresh`, {
          refreshToken: currentRefreshToken,
        })
        const payload = (res.data?.data ?? res.data) as { accessToken: string }
        const { accessToken } = payload
        const store = useAuthStore.getState()
        store.setAccessToken(accessToken)
        const decoded = decodeJWT(accessToken)
        if (decoded) {
          store.setUser({ role: decoded.role, companyId: decoded.companyId })
        }
      } catch {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
      }
    }

    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS)
    return () => {
      clearInterval(interval)
    }
  }, [refreshToken])

  return null
}
