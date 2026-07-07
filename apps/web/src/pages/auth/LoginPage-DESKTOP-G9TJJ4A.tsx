import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useTheme } from '../../theme/ThemeContext'
import { useAuth } from '../../hooks/useAuth'
import axios from 'axios'

export default function LoginPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result.requiresMFA && result.tempToken) {
        navigate('/mfa', { state: { tempToken: result.tempToken, email } })
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status
        if (status === 429) {
          const retryAfter = err.response?.headers?.['retry-after'] ?? '60'
          setError(`Too many attempts. Please wait ${retryAfter} seconds.`)
        } else {
          const msg = (err.response?.data as { message?: string })?.message
          setError(msg ?? 'Invalid email or password.')
        }
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: theme.bgCanvas,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {theme.hasOrbs && (
        <>
          <div className="orb orb-1" style={{ background: theme.orb1 }} />
          <div className="orb orb-2" style={{ background: theme.orb2 }} />
          <div className="orb orb-3" style={{ background: theme.orb3 }} />
        </>
      )}

      <div style={{ width: '100%', maxWidth: '400px', padding: '24px', position: 'relative', zIndex: 1 }}>
        <Card padding="lg" rimHighlight>
          {/* Logo / Brand */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: theme.accentBg,
              border: `1px solid ${theme.accentBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <span style={{ fontSize: '20px', fontWeight: 800, color: theme.accent, letterSpacing: '-0.05em' }}>F</span>
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: theme.textPrimary, margin: '0 0 4px' }}>FNC ERP</h1>
            <p style={{ fontSize: '13px', color: theme.textSecondary, margin: 0 }}>Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@fnc-group.com"
              autoComplete="email"
              required
              disabled={loading}
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={loading}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, display: 'flex', alignItems: 'center' }}
                >
                  {showPassword ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              }
            />

            {error && (
              <div style={{
                padding: '10px 12px',
                background: theme.dangerBg,
                border: `1px solid ${theme.dangerBorder}`,
                borderRadius: '8px',
                fontSize: '13px',
                color: theme.danger,
              }}>
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={loading}
              disabled={loading || !email || !password}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Sign in
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
