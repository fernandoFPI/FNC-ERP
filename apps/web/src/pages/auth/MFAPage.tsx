import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useTheme } from '../../theme/ThemeContext'
import { useAuth } from '../../hooks/useAuth'
import axios from 'axios'

export default function MFAPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { tempToken?: string; email?: string } | null
  const { verifyMFA } = useAuth()

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [trustDevice, setTrustDevice] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // TOTP 30-second window countdown
  useEffect(() => {
    function update() {
      const now = Math.floor(Date.now() / 1000)
      setSecondsLeft(30 - (now % 30))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit(totpCode: string) {
    if (!state?.tempToken) { navigate('/login'); return }
    setLoading(true)
    setError(null)
    try {
      await verifyMFA(state.tempToken, totpCode, trustDevice)
      navigate('/dashboard')
    } catch (err) {
      setCode('')
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { message?: string })?.message
        setError(msg ?? 'Invalid code. Please try again.')
      } else {
        setError('An error occurred. Please try again.')
      }
      inputRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(val)
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
        </>
      )}

      <div style={{ width: '100%', maxWidth: '380px', padding: '24px', position: 'relative', zIndex: 1 }}>
        <Card padding="lg" rimHighlight>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: theme.accentBg, border: `1px solid ${theme.accentBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={theme.accent} strokeWidth="1.8">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: theme.textPrimary, margin: '0 0 4px' }}>
              Two-factor authentication
            </h1>
            {state?.email && (
              <p style={{ fontSize: '12px', color: theme.textMuted, margin: 0 }}>{state.email}</p>
            )}
          </div>

          <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '20px', textAlign: 'center' }}>
            Enter the 6-digit code from your authenticator app.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Trust device — above input so it's visible before keyboard opens */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${trustDevice ? theme.accentBorder : theme.border}`, background: trustDevice ? theme.accentBg : 'transparent', transition: 'all 0.15s' }}>
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: theme.accent, cursor: 'pointer', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>Trust this device for 30 days</div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px' }}>Skip 2FA on this browser for 30 days</div>
              </div>
            </label>

            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={code}
              onChange={handleChange}
              placeholder="000000"
              disabled={loading}
              maxLength={6}
              style={{
                height: '48px',
                textAlign: 'center',
                fontSize: '24px',
                letterSpacing: '0.3em',
                fontFamily: 'monospace',
                background: theme.bgSurface,
                border: `1px solid ${error ? theme.dangerBorder : theme.borderInput}`,
                borderRadius: '10px',
                color: theme.textPrimary,
                outline: 'none',
                width: '100%',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = theme.accent }}
              onBlur={(e) => { e.currentTarget.style.borderColor = error ? theme.dangerBorder : theme.borderInput }}
            />

            {/* Countdown */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                border: `2px solid ${theme.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
              }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: theme.textMuted }}>{secondsLeft}</span>
              </div>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>seconds until code expires</span>
            </div>

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
              type="button"
              variant="primary"
              size="md"
              loading={loading}
              disabled={loading || code.length !== 6}
              onClick={() => submit(code)}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Verify
            </Button>

            <Link
              to="/login"
              style={{ textAlign: 'center', fontSize: '13px', color: theme.textMuted, textDecoration: 'none' }}
            >
              ← Back to sign in
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
