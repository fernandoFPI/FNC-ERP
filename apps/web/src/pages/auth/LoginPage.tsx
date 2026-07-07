import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useTheme } from '../../theme/ThemeContext'
import { useAuth } from '../../hooks/useAuth'
import axios from 'axios'

// ── Recent accounts (localStorage) ───────────────────────────────────────────

const STORAGE_KEY = 'fnc_recent_accounts'
const MAX_ACCOUNTS = 5

interface RecentAccount { email: string; addedAt: string }

function readAccounts(): RecentAccount[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as RecentAccount[] }
  catch { return [] }
}

function persistAccounts(list: RecentAccount[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

function addAccount(email: string) {
  const updated = [
    { email, addedAt: new Date().toISOString() },
    ...readAccounts().filter((a) => a.email !== email),
  ].slice(0, MAX_ACCOUNTS)
  persistAccounts(updated)
}

// Deterministic avatar colour from email
const AVATAR_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
function avatarColor(email: string): string {
  let h = 0
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) | 0
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

// ── Credential Management API (Chrome/Edge) ───────────────────────────────────
// Silently fetch a stored password for a specific email.
// Returns the password string or null if unavailable/unsupported.
async function getSavedPassword(email: string): Promise<string | null> {
  if (!('credentials' in navigator)) return null
  try {
    const cred = await navigator.credentials.get({
      password: true,
      mediation: 'silent',
    } as CredentialRequestOptions)
    if (cred && cred.type === 'password' && cred.id === email) {
      return (cred as unknown as { password: string }).password
    }
  } catch {
    // API blocked or unavailable
  }
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { login } = useAuth()

  const [accounts, setAccounts] = useState<RecentAccount[]>(readAccounts)
  const [view, setView] = useState<'accounts' | 'form'>(() =>
    readAccounts().length > 0 ? 'accounts' : 'form',
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [autoLoggingIn, setAutoLoggingIn] = useState<string | null>(null) // email currently being auto-logged in
  const [error, setError] = useState<string | null>(null)

  const passwordRef = useRef<HTMLInputElement>(null)
  const [focusPassword, setFocusPassword] = useState(false)

  useEffect(() => {
    if (focusPassword) {
      passwordRef.current?.focus()
      setFocusPassword(false)
    }
  }, [focusPassword])

  async function handleAccountClick(acctEmail: string) {
    setError(null)

    // Try to auto-login silently using browser-saved credentials
    setAutoLoggingIn(acctEmail)
    const savedPassword = await getSavedPassword(acctEmail)

    if (savedPassword) {
      try {
        const result = await login(acctEmail, savedPassword)
        addAccount(acctEmail)
        if (result.requiresMFA && result.tempToken) {
          navigate('/mfa', { state: { tempToken: result.tempToken, email: acctEmail } })
        } else {
          navigate('/dashboard')
        }
        return
      } catch {
        // Stored password is outdated or account locked — fall through to form
      }
    }

    setAutoLoggingIn(null)
    // Open form with email pre-filled; browser will auto-fill the password field
    setEmail(acctEmail)
    setPassword('')
    setView('form')
    setFocusPassword(true)
  }

  function removeAccount(acctEmail: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = accounts.filter((a) => a.email !== acctEmail)
    persistAccounts(updated)
    setAccounts(updated)
    if (updated.length === 0) setView('form')
  }

  function useAnotherAccount() {
    setEmail('')
    setPassword('')
    setError(null)
    setView('form')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await login(email, password)
      addAccount(email)
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
      backgroundImage: 'url(/login-background.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Dark overlay so the card stays readable against the photo */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.15)',
        backdropFilter: 'blur(1px)',
      }} />

      <div style={{ width: '100%', maxWidth: '400px', padding: '24px', position: 'relative', zIndex: 1 }}>
        <Card padding="lg" rimHighlight>

          {/* Logo / Brand */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ margin: '0 auto 12px', width: '72px', height: '72px' }}>
              <img
                src="/fnc_logo.gif"
                alt="FNC Group"
                style={{ width: '110%', height: '110%', objectFit: 'contain', display: 'block' }}
              />
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, color: theme.textPrimary, margin: '0 0 4px' }}>FNC GROUP</h1>
            <p style={{ fontSize: '13px', color: theme.textSecondary, margin: 0 }}>
              {view === 'accounts' ? 'Welcome back' : 'Sign in to your account'}
            </p>
          </div>

          {/* ── Account chooser ──────────────────────────────────────────── */}
          {view === 'accounts' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                {accounts.map((acct) => {
                  const isLoggingIn = autoLoggingIn === acct.email
                  return (
                    <button
                      key={acct.email}
                      onClick={() => { if (!autoLoggingIn) void handleAccountClick(acct.email) }}
                      disabled={!!autoLoggingIn}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: `1px solid ${isLoggingIn ? theme.accent : 'transparent'}`,
                        background: isLoggingIn ? (theme.accentBg ?? `${theme.accent}14`) : 'transparent',
                        cursor: autoLoggingIn ? 'default' : 'pointer',
                        textAlign: 'left',
                        transition: 'background 120ms, border-color 120ms',
                        opacity: autoLoggingIn && !isLoggingIn ? 0.4 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!autoLoggingIn) {
                          e.currentTarget.style.background = theme.tableRowHover
                          e.currentTarget.style.borderColor = theme.border
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isLoggingIn) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.borderColor = 'transparent'
                        }
                      }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: avatarColor(acct.email),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                        position: 'relative',
                      }}>
                        {isLoggingIn ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                          </svg>
                        ) : (
                          acct.email[0].toUpperCase()
                        )}
                      </div>

                      {/* Email + status */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'block',
                          fontSize: '13px',
                          color: theme.textPrimary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {acct.email}
                        </span>
                        {isLoggingIn && (
                          <span style={{ display: 'block', fontSize: '11px', color: theme.accent, marginTop: '1px' }}>
                            Signing in…
                          </span>
                        )}
                      </div>

                      {/* Remove */}
                      {!autoLoggingIn && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Remove ${acct.email}`}
                          onClick={(e) => removeAccount(acct.email, e)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              removeAccount(acct.email, e as unknown as React.MouseEvent)
                            }
                          }}
                          style={{
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: theme.textMuted,
                            flexShrink: 0,
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = theme.textPrimary }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = theme.textMuted }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {!autoLoggingIn && (
                <div style={{ textAlign: 'center', borderTop: `1px solid ${theme.border}`, paddingTop: '14px' }}>
                  <button
                    onClick={useAnotherAccount}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: theme.accent,
                      padding: '4px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    Use another account
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Login form ───────────────────────────────────────────────── */}
          {view === 'form' && (
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
                inputRef={passwordRef}
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

              {accounts.length > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setView('accounts')}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: theme.textMuted,
                      padding: '2px 6px',
                    }}
                  >
                    ← Back to accounts
                  </button>
                </div>
              )}
            </form>
          )}

        </Card>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
