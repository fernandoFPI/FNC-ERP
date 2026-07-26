import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { EntitySwitcher } from './EntitySwitcher'
import { ThemeSwitcher } from './ThemeSwitcher'
import { NotificationsDrawer } from './NotificationsDrawer'
import { useTheme } from '../../theme/ThemeContext'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { api } from '../../lib/axios'

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  finance: 'Finance',
  accounts: 'Chart of Accounts',
  ledger: 'General Ledger',
  journals: 'Journal Entries',
  invoicing: 'Invoicing',
  'fx-rates': 'FX Rates',
  periods: 'Periods',
  ar: 'Accounts Receivable',
  ap: 'Accounts Payable',
  'cost-centers': 'Cost Centers',
  'analytic-accounts': 'Analytic Accounts',
  reports: 'Reports',
  'trial-balance': 'Trial Balance',
  'profit-loss': 'Profit & Loss',
  'balance-sheet': 'Balance Sheet',
  interco: 'Inter-company',
  transactions: 'Transactions',
  'stock-transfers': 'Stock Transfers',
  pricing: 'Transfer Pricing',
  procurement: 'Procurement',
  vendors: 'Vendors',
  'purchase-orders': 'Purchase Orders',
  'approval-queue': 'Approval Queue',
  queue: 'My PO Queue',
  receipts: 'Receipts',
  positions: 'PO Positions',
  inventory: 'Inventory',
  products: 'Products',
  locations: 'Locations',
  balances: 'Stock Balances',
  moves: 'Stock Moves',
  lots: 'Lots',
  manufacturing: 'Manufacturing',
  orders: 'Orders',
  boms: 'Bills of Materials',
  'work-centers': 'Work Centers',
  projects: 'Projects',
  contracts: 'Contracts',
  invoices: 'Invoices',
  rental: 'Rental',
  fleet: 'Fleet',
  assets: 'Assets',
  maintenance: 'Maintenance',
  hr: 'HR',
  employees: 'Employees',
  departments: 'Departments',
  shifts: 'Shifts',
  leave: 'Leave',
  overtime: 'Overtime',
  attendance: 'Attendance',
  payroll: 'Payroll',
  runs: 'Payroll Runs',
  payslips: 'Payslips',
  salary: 'Salary Config',
  reporting: 'Reporting',
  executive: 'Executive',
  consolidated: 'Consolidated',
  pl: 'Profit & Loss',
  bs: 'Balance Sheet',
  compliance: 'Compliance',
  wht: 'WHT Report',
  admin: 'Admin',
  companies: 'Companies',
  users: 'Users',
  health: 'System Health',
  outbox: 'Outbox Monitor',
  dlq: 'Dead Letter Queue',
  'event-configs': 'Event Configs',
  audit: 'Audit Log',
  'bank-accounts': 'Bank Accounts',
  'role-templates': 'Role Templates',
  settings: 'Settings',
  profile: 'Profile',
  appearance: 'Appearance',
  notifications: 'Notifications',
  company: 'Company',
  profitability: 'Project Profitability',
  valuation: 'Inventory Valuation',
  costs: 'Payroll Costs',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function segmentLabel(seg: string): string {
  if (SEGMENT_LABELS[seg]) return SEGMENT_LABELS[seg]
  if (UUID_RE.test(seg)) return `#${seg.slice(0, 8)}`
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function buildCrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean)
  return segments.map((seg, i) => ({
    label: segmentLabel(seg),
    path: '/' + segments.slice(0, i + 1).join('/'),
    isLast: i === segments.length - 1,
    isId: UUID_RE.test(seg) || /^\d+$/.test(seg),
  }))
}

function getInitials(email: string): string {
  const parts = email.split('@')[0]?.split('.') ?? []
  if (parts.length >= 2) return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (parts[0]?.slice(0, 2) ?? 'U').toUpperCase()
}

interface TopbarProps {
  // compact=true on phone+tablet: shows hamburger, uses compact EntitySwitcher on phone
  compact?: boolean
  onMenuToggle?: () => void
}

export function Topbar({ compact = false, onMenuToggle }: TopbarProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const [notifOpen, setNotifOpen] = useState(false)
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)

  const crumbs = buildCrumbs(location.pathname)
  const initials = user ? getInitials(user.email) : 'U'
  const displayName = (user?.firstName && user?.lastName)
    ? `${user.firstName} ${user.lastName}`
    : null

  // Bootstrap and refresh unread notification count
  useEffect(() => {
    const { setUnreadCount } = useNotificationStore.getState()
    const fetchCount = () => {
      api.get<{ count: number }>('/notifications/unread-count')
        .then((r) => { if (typeof r.data.count === 'number') setUnreadCount(r.data.count) })
        .catch(() => { /* non-critical */ })
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Fetch profile picture + name on mount. profilePicture is a time-limited
  // presigned URL, so it can't be treated as "already loaded" and cached
  // indefinitely (it's persisted in the auth store) — always refetch it fresh.
  useEffect(() => {
    if (!user || !user.profileCompleted) return
    api.get<{ firstName: string | null; lastName: string | null; profilePicture: string | null }>(
      '/users/me/profile',
    ).then(r => {
      setUser({
        firstName: r.data.firstName ?? undefined,
        lastName: r.data.lastName ?? undefined,
        profilePicture: r.data.profilePicture ?? null,
      })
    }).catch(() => {/* non-critical */})
  }, [user?.id])

  function handleSignOut() {
    clearAuth()
    navigate('/login')
  }

  return (
    <>
      <div
        className="fnc-topbar"
        style={{
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '10px',
          background: theme.bgTopbar,
          backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
          WebkitBackdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
          borderBottom: `0.5px solid ${theme.border}`,
          flexShrink: 0,
          position: 'relative',
          zIndex: 5,
        }}
      >
        {/* Hamburger — phone and tablet */}
        {compact && (
          <button
            onClick={onMenuToggle}
            aria-label="Open menu"
            style={{
              width: '36px', height: '36px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: theme.textSecondary,
              cursor: 'pointer',
              flexShrink: 0,
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, overflow: 'hidden', minWidth: 0 }}>
          {crumbs.map((crumb, i) => (
            <span key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: i < crumbs.length - 1 ? 0 : 1, overflow: 'hidden' }}>
              {i > 0 && (
                <span style={{ fontSize: '12px', color: theme.textMuted, userSelect: 'none' }}>›</span>
              )}
              {crumb.isLast || crumb.isId ? (
                <span style={{ fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {crumb.label}
                </span>
              ) : (
                <button
                  onClick={() => navigate(crumb.path)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontSize: '13px', color: theme.textMuted, whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = theme.accent }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = theme.textMuted }}
                >
                  {crumb.label}
                </button>
              )}
            </span>
          ))}
        </div>

        {/* EntitySwitcher — compact pill on phone, full on tablet+desktop */}
        <EntitySwitcher compact={compact && isPhone} />

        {/* Search — hidden on phone to save space */}
        {!isPhone && (
          <button
            aria-label="Search"
            title="Search (Ctrl+K)"
            onClick={() => window.dispatchEvent(new CustomEvent('fnc:open-search', { detail: { prefill: '' } }))}
            style={{
              height: '34px',
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '0 10px 0 8px',
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              color: theme.textMuted,
              cursor: 'pointer',
              backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Search</span>
            <kbd style={{
              fontSize: '10px',
              padding: '1px 4px',
              borderRadius: '4px',
              background: theme.bgCanvas,
              border: `1px solid ${theme.border}`,
              fontFamily: 'inherit',
              lineHeight: '1.4',
            }}>
              Ctrl K
            </kbd>
          </button>
        )}

        <ThemeSwitcher />

        {/* Notifications */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => isPhone ? navigate('/notifications') : setNotifOpen(true)}
            aria-label="Notifications"
            style={{
              width: '34px', height: '34px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              color: theme.textSecondary,
              cursor: 'pointer',
              position: 'relative',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '4px', right: '4px',
                width: '8px', height: '8px',
                borderRadius: '50%',
                background: theme.danger,
                boxShadow: `0 0 4px ${theme.danger}`,
              }} />
            )}
          </button>
        </div>

        {/* Avatar */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setAvatarMenuOpen((v) => !v)}
            aria-label="User menu"
            style={{
              width: '34px', height: '34px',
              borderRadius: '50%',
              background: theme.accentBg,
              border: `1px solid ${theme.accentBorder}`,
              color: theme.accent,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.02em',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
              WebkitTapHighlightColor: 'transparent',
              overflow: 'hidden',
              padding: 0,
            }}
          >
            {user?.profilePicture
              ? <img src={user.profilePicture} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initials
            }
          </button>
          {avatarMenuOpen && (
            <div
              style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 500, minWidth: '180px' }}
              onMouseLeave={() => setAvatarMenuOpen(false)}
            >
              <div style={{
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
                borderRadius: '10px',
                backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 14px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                    background: theme.accentBg, border: `1px solid ${theme.accentBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', fontSize: '12px', fontWeight: 700, color: theme.accent,
                  }}>
                    {user?.profilePicture
                      ? <img src={user.profilePicture} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : initials
                    }
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {displayName && (
                      <p style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, margin: '0 0 1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {displayName}
                      </p>
                    )}
                    <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email ?? ''}</p>
                  </div>
                </div>
                <div style={{ padding: '4px' }}>
                  {[
                    { label: 'Profile', path: '/settings/profile' },
                    { label: 'Settings', path: '/settings' },
                  ].map((item) => (
                    <button
                      key={item.path}
                      onClick={() => { navigate(item.path); setAvatarMenuOpen(false) }}
                      style={{
                        display: 'block', width: '100%', padding: '8px 10px',
                        fontSize: '13px', color: theme.textSecondary,
                        background: 'none', border: 'none', borderRadius: '6px',
                        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = theme.bgSurfaceHover }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                    >
                      {item.label}
                    </button>
                  ))}
                  <button
                    onClick={handleSignOut}
                    style={{
                      display: 'block', width: '100%', padding: '8px 10px',
                      fontSize: '13px', color: theme.danger,
                      background: 'none', border: 'none', borderRadius: '6px',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = theme.dangerBg }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}
