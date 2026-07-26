import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useEffect, useState } from 'react'
import { Spinner } from '../components/ui/Spinner'

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return Date.now() >= payload.exp * 1000 - 30000
  } catch {
    return true
  }
}

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, accessToken, refreshToken, setAccessToken, clearAuth } = useAuthStore()
  const location = useLocation()
  const [checking, setChecking] = useState(true)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    async function check() {
      if (!isAuthenticated || !accessToken) {
        setAuthed(false)
        setChecking(false)
        return
      }
      if (!isTokenExpired(accessToken)) {
        setAuthed(true)
        setChecking(false)
        return
      }
      if (!refreshToken) {
        clearAuth()
        setAuthed(false)
        setChecking(false)
        return
      }
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!response.ok) throw new Error('Refresh failed')
        const data = await response.json()
        const newToken = data.data?.accessToken
        if (newToken) {
          setAccessToken(newToken)
          setAuthed(true)
        } else throw new Error('No token in response')
      } catch {
        clearAuth()
        setAuthed(false)
      } finally {
        setChecking(false)
      }
    }
    check()
  }, [isAuthenticated, accessToken, refreshToken, setAccessToken, clearAuth])

  const user = useAuthStore((s) => s.user)

  if (checking) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg-canvas)',
        }}
      >
        <Spinner size="lg" />
      </div>
    )
  }
  if (!authed) return <Navigate to="/login" state={{ from: location }} replace />
  if (authed && user && !user.profileCompleted && location.pathname !== '/complete-profile') {
    return <Navigate to="/complete-profile" replace />
  }
  return <>{children}</>
}
