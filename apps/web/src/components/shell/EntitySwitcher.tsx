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

  // ── Compact pill (phone) ─────────────────────────────────────────────────────
  const compactButton = (
    <button
      onClick={() => {
        setError(null)
        setOpen((v) => !v)
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '4px 8px',
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: '16px',
        color: theme.textPrimary,
        cursor: 'pointer',
        fontSize: '12px',
        fontFamily: 'inherit',
        fontWeight: 500,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 5px ${color}`,
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          maxWidth: '56px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {(activeCompany?.name ?? 'Co').split(' ')[0]}
      </span>
      <svg
        width="8"
        height="8"
        viewBox="0 0 24 24"
        fill="none"
        stroke={theme.textMuted}
        strokeWidth="2"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  )

  // ── Full pill (tablet + desktop) ─────────────────────────────────────────────
  const fullButton = (
    <button
      onClick={() => {
        setError(null)
        setOpen((v) => !v)
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
            left: 0,
            zIndex: 500,
            minWidth: '220px',
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
