import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '../ui/Card'
import { Spinner } from '../ui/Spinner'
import { useTheme } from '../../theme/ThemeContext'
import { useCompanyStore } from '../../store/companyStore'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/axios'
import { decodeJWT } from '../../lib/jwt'
import { apolloClient } from '../../lib/apollo'

function getCompanyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0]?.slice(0, 2) ?? 'Co').toUpperCase()
}

function getCompanyColor(companyName: string): string {
  const name = companyName.toLowerCase()
  if (name.includes('yakam')) return '#3de8c8'
  if (name.includes('factory') || name.includes('nishtimani f')) return '#5eb3ff'
  if (name.includes('watanyia') || name.includes('al w')) return '#ffb347'
  return '#88b4cc'
}

interface EntitySwitcherProps {
  compact?: boolean
}

export function EntitySwitcher({ compact = false }: EntitySwitcherProps) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { activeCompany, companies, setActiveCompany } = useCompanyStore()
  const { setAccessToken, setUser } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
    }
  }, [])

  // Refreshes the switcher's own list from the source of truth — otherwise
  // this only ever gets set once at login, so a company the user was added
  // to mid-session would never show up here.
  function refreshCompanies() {
    void api
      .get<{ id: string; name: string; currency_code?: string }[]>('/auth/me/companies')
      .then((res) => {
        const mapped = res.data.map((c) => ({
          id: c.id,
          name: c.name,
          currencyCode: c.currency_code ?? '',
        }))
        if (mapped.length > 0) useCompanyStore.getState().setCompanies(mapped)
      })
      .catch(() => {
        /* best-effort — keep whatever's already cached */
      })
  }

  async function switchCompany(company: typeof activeCompany) {
    if (!company || company.id === activeCompany?.id) {
      setOpen(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.post<{ accessToken: string }>('/auth/company/switch', {
        companyId: company.id,
      })
      const newToken = res.data.accessToken
      setAccessToken(newToken)
      const decoded = decodeJWT(newToken)
      if (decoded) setUser({ companyId: decoded.companyId, role: decoded.role })
      await apolloClient.clearStore()
      setActiveCompany(company)
      setOpen(false)
      navigate('/dashboard')
      refreshCompanies()
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? ((e as { response?: { data?: { message?: string } } }).response?.data?.message ??
            'Switch failed')
          : 'Switch failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const color = getCompanyColor(activeCompany?.name ?? '')

  // ── Compact badge (phone) — a circular initials badge instead of a wide
  // truncated pill, so it doesn't compete with the breadcrumb for space. ────
  const compactButton = (
    <button
      onClick={() => {
        setError(null)
        setOpen((v) => {
          const next = !v
          if (next) refreshCompanies()
          return next
        })
      }}
      aria-label={activeCompany?.name ? `Switch company (${activeCompany.name})` : 'Select company'}
      title={activeCompany?.name ?? 'Select company'}
      style={{
        width: '34px',
        height: '34px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme.bgSurface,
        border: `1.5px solid ${color}`,
        borderRadius: '50%',
        color: theme.textPrimary,
        cursor: 'pointer',
        fontSize: '11px',
        fontFamily: 'inherit',
        fontWeight: 700,
        letterSpacing: '0.02em',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {loading ? <Spinner size="sm" /> : getCompanyInitials(activeCompany?.name ?? 'Co')}
    </button>
  )

  // ── Full pill (tablet + desktop) ─────────────────────────────────────────────
  const fullButton = (
    <button
      onClick={() => {
        setError(null)
        setOpen((v) => {
          const next = !v
          if (next) refreshCompanies()
          return next
        })
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '5px 12px',
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: '20px',
        color: theme.textPrimary,
        cursor: 'pointer',
        fontSize: '13px',
        fontFamily: 'inherit',
        fontWeight: 500,
        backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
      }}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}`,
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          maxWidth: '130px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {activeCompany?.name ?? 'Select company'}
      </span>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke={theme.textMuted}
        strokeWidth="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {compact ? compactButton : fullButton}

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            ...(compact ? { right: 0 } : { left: 0 }),
            zIndex: 500,
            minWidth: '220px',
            maxWidth: 'calc(100vw - 24px)',
          }}
        >
          <Card padding="none" rimHighlight>
            <div style={{ padding: '4px' }}>
              {error && (
                <p
                  style={{ fontSize: '12px', color: theme.danger, padding: '6px 12px', margin: 0 }}
                >
                  {error}
                </p>
              )}
              {companies.map((company) => {
                const isActive = company.id === activeCompany?.id
                const c = getCompanyColor(company.name)
                return (
                  <button
                    key={company.id}
                    onClick={() => switchCompany(company)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '10px 12px',
                      background: isActive ? theme.accentBg : 'none',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = theme.bgSurfaceHover
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        e.currentTarget.style.background = isActive ? theme.accentBg : 'none'
                    }}
                  >
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: c,
                        boxShadow: `0 0 6px ${c}`,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <p
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: isActive ? theme.accent : theme.textPrimary,
                          margin: 0,
                        }}
                      >
                        {company.name}
                      </p>
                      <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>
                        {company.currencyCode}
                      </p>
                    </div>
                    {isActive && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={theme.accent}
                        strokeWidth="2.5"
                        style={{ marginLeft: 'auto' }}
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
