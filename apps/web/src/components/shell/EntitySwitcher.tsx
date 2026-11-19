import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '../ui/Spinner'
import { useTheme } from '../../theme/ThemeContext'
import { useCompanyStore } from '../../store/companyStore'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/axios'
import { decodeJWT } from '../../lib/jwt'
import { apolloClient } from '../../lib/apollo'
import {
  MenuCaption,
  MenuRow,
  MenuTick,
  ShellMenuPanel,
  TopbarButton,
  useShellMenu,
} from './shellParts'

function getCompanyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0]?.slice(0, 2) ?? 'Co').toUpperCase()
}

// Each company has its own identity colour (a dot beside the name; never used for text).
function getCompanyColor(companyName: string): string {
  const name = companyName.toLowerCase()
  if (name.includes('yakam')) return '#3de8c8'
  if (name.includes('factory') || name.includes('nishtimani f')) return '#5eb3ff'
  if (name.includes('watanyia') || name.includes('al w')) return '#ffb347'
  return '#88b4cc'
}

function CompanyDot({ color, size }: { color: string; size: number }) {
  const { theme } = useTheme()
  return (
    <span
      aria-hidden="true"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: color,
        // a hairline so a pale colour still reads on a white bar
        boxShadow: `inset 0 0 0 1px ${theme.borderStrong}`,
        flexShrink: 0,
      }}
    />
  )
}

interface EntitySwitcherProps {
  compact?: boolean
}

export function EntitySwitcher({ compact = false }: EntitySwitcherProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { activeCompany, companies, setActiveCompany } = useCompanyStore()
  const { setAccessToken, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const menu = useShellMenu(refreshCompanies)

  async function switchCompany(company: typeof activeCompany) {
    if (!company || company.id === activeCompany?.id) {
      menu.close()
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.post<{ accessToken: string; employeeId: string | null }>(
        '/auth/company/switch',
        { companyId: company.id },
      )
      const newToken = res.data.accessToken
      setAccessToken(newToken)
      const decoded = decodeJWT(newToken)
      if (decoded)
        setUser({
          companyId: decoded.companyId,
          role: decoded.role,
          employeeId: res.data.employeeId,
        })
      await apolloClient.clearStore()
      setActiveCompany(company)
      menu.close()
      menu.triggerRef.current?.focus()
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
  const companyName = activeCompany?.name ?? t('shell.selectCompany')

  function toggle() {
    setError(null)
    menu.toggle()
  }

  // ── Compact badge (phone): a circular initials badge instead of a wide truncated pill, so it does not compete with
  // the breadcrumb for space. ────────────────────────────────────────────────
  const compactButton = (
    <TopbarButton
      ref={menu.triggerRef}
      onClick={toggle}
      aria-label={`${t('shell.switchCompany')} (${companyName})`}
      aria-haspopup="menu"
      aria-expanded={menu.open}
      title={companyName}
      bordered
      active={menu.open}
      style={{
        width: '36px',
        padding: 0,
        borderRadius: '50%',
        border: `1.5px solid ${color}`,
        color: theme.textPrimary,
        fontSize: '11px',
        letterSpacing: '0.02em',
      }}
    >
      {loading ? <Spinner size="sm" /> : getCompanyInitials(activeCompany?.name ?? 'Co')}
    </TopbarButton>
  )

  // ── Full pill (tablet + desktop) ─────────────────────────────────────────────
  const fullButton = (
    <TopbarButton
      ref={menu.triggerRef}
      onClick={toggle}
      aria-haspopup="menu"
      aria-expanded={menu.open}
      title={t('shell.switchCompany')}
      bordered
      active={menu.open}
      style={{ padding: '0 10px 0 12px', color: theme.textPrimary }}
    >
      {loading ? <Spinner size="sm" /> : <CompanyDot color={color} size={9} />}
      <span
        style={{
          maxWidth: '160px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {companyName}
      </span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{
          flexShrink: 0,
          color: theme.textSecondary,
          transform: menu.open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s ease',
        }}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </TopbarButton>
  )

  return (
    <div ref={menu.containerRef} style={{ position: 'relative' }}>
      {compact ? compactButton : fullButton}

      {menu.open && (
        <ShellMenuPanel
          align={compact ? 'end' : 'start'}
          label={t('shell.switchCompany')}
          panelRef={menu.panelRef}
          onKeyDown={menu.onKeyDown}
          minWidth={248}
          header={
            <>
              <MenuCaption>{t('shell.switchCompany')}</MenuCaption>
              {error && (
                <p
                  role="alert"
                  style={{
                    fontSize: '12px',
                    color: theme.danger,
                    padding: '6px 14px 0',
                    margin: 0,
                  }}
                >
                  {error}
                </p>
              )}
            </>
          }
        >
          {companies.map((company) => {
            const isActive = company.id === activeCompany?.id
            return (
              <MenuRow
                key={company.id}
                role="menuitemradio"
                checked={isActive}
                onSelect={() => void switchCompany(company)}
              >
                <CompanyDot color={getCompanyColor(company.name)} size={9} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span>{company.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 400, color: theme.textSecondary }}>
                    {company.currencyCode}
                  </span>
                </span>
                {isActive && <MenuTick />}
              </MenuRow>
            )
          })}
        </ShellMenuPanel>
      )}
    </div>
  )
}
