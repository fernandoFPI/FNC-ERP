import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { EntitySwitcher } from './EntitySwitcher'
import { ThemeSwitcher } from './ThemeSwitcher'
import { LanguageSwitcher } from './LanguageSwitcher'
import { MenuRow, ShellMenuPanel, TopbarButton, shellFocusRing, useShellMenu } from './shellParts'
import { navLabel } from '../../i18n'
import { NotificationsDrawer } from './NotificationsDrawer'
import { useTheme } from '../../theme/ThemeContext'
import { useAuthStore } from '../../store/authStore'
import { useNotificationStore } from '../../store/notificationStore'
import { useBreadcrumbStore } from '../../store/breadcrumbStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useFocusRing } from '../ui/keyboardFocus'
import { menuSeparatorStyle } from '../ui/menuStyles'
import { api } from '../../lib/axios'
import { getInitials } from '../../lib/userDisplay'

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
  categories: 'Expense Categories',
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
  queue: 'My Queue',
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
  if (SEGMENT_LABELS[seg]) return navLabel(SEGMENT_LABELS[seg])
  if (UUID_RE.test(seg)) return `#${seg.slice(0, 8)}`
  return navLabel(seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
}

// `titles` are the names record pages registered for their ids (useBreadcrumbTitle); an id with no name keeps the "#3f2b8c1e" fallback.
function buildCrumbs(pathname: string, titles: Record<string, string>) {
  const segments = pathname.split('/').filter(Boolean)
  return segments.map((seg, i) => {
    const isId = UUID_RE.test(seg) || /^\d+$/.test(seg)
    return {
      label: (isId ? titles[seg] : undefined) ?? segmentLabel(seg),
      path: '/' + segments.slice(0, i + 1).join('/'),
      isLast: i === segments.length - 1,
      isId,
    }
  })
}

interface TopbarProps {
  // compact=true on phone+tablet: shows hamburger, uses compact EntitySwitcher on phone
  compact?: boolean
  onMenuToggle?: () => void
}

// A page in the trail you can go back to: a real link (middle-click and the keyboard work), quiet until it is hovered.
function CrumbLink({ to, children }: { to: string; children: string }) {
  const { theme } = useTheme()
  const { ring, handlers } = useFocusRing()
  const [hover, setHover] = useState(false)
  return (
    <Link
      to={to}
      {...handlers}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      style={{
        padding: '2px 4px',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        textDecoration: hover ? 'underline' : 'none',
        color: hover ? theme.textPrimary : theme.textSecondary,
        boxShadow: ring ? shellFocusRing(theme) : 'none',
        outline: 'none',
      }}
    >
      {children}
    </Link>
  )
}

export function Topbar({ compact = false, onMenuToggle }: TopbarProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const [notifOpen, setNotifOpen] = useState(false)
  const userMenu = useShellMenu()

  const titles = useBreadcrumbStore((s) => s.titles)
  const crumbs = buildCrumbs(location.pathname, titles)
  const initials = user ? getInitials(user.email) : 'U'
  const displayName =
    user?.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : null

  // Bootstrap and refresh unread notification count
  useEffect(() => {
    const { setUnreadCount } = useNotificationStore.getState()
    const fetchCount = () => {
      api
        .get<{ count: number }>('/notifications/unread-count')
        .then((r) => {
          if (typeof r.data.count === 'number') setUnreadCount(r.data.count)
        })
        .catch(() => {
          /* non-critical */
        })
    }
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => {
      clearInterval(interval)
    }
  }, [])

  // Fetch profile picture + name on mount. profilePicture is a time-limited
  // presigned URL, so it can't be treated as "already loaded" and cached
  // indefinitely (it's persisted in the auth store) — always refetch it fresh.
  useEffect(() => {
    if (!user?.profileCompleted) return
    api
      .get<{ firstName: string | null; lastName: string | null; profilePicture: string | null }>(
        '/users/me/profile',
      )
      .then((r) => {
        setUser({
          firstName: r.data.firstName ?? undefined,
          lastName: r.data.lastName ?? undefined,
          profilePicture: r.data.profilePicture ?? null,
        })
      })
      .catch(() => {
        /* non-critical */
      })
  }, [user?.id])

  function handleSignOut() {
    userMenu.close()
    clearAuth()
    navigate('/login')
  }

  function goTo(path: string) {
    userMenu.close()
    navigate(path)
  }

  // The same side gutter as the page's own padding (phone 12, tablet 16, desktop 20), so the trail lines up with the page.
  const gutter = isPhone ? 12 : compact ? 16 : 20

  const avatarImage = (size: number) =>
    user?.profilePicture ? (
      <img
        src={user.profilePicture}
        alt={t('shell.avatar')}
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%' }}
      />
    ) : (
      initials
    )

  return (
    <>
      <header
        className="fnc-topbar"
        style={{
          // 56px, the same as the sidebar's header, so the two hairlines meet in one line; on a phone with a notch the bar
          // also owns the safe area above it (the inset is 0 everywhere else)
          boxSizing: 'border-box',
          height: 'calc(56px + var(--safe-top))',
          display: 'flex',
          alignItems: 'center',
          paddingTop: 'var(--safe-top)',
          paddingBottom: 0,
          paddingInline: `${gutter}px`,
          gap: '8px',
          background: theme.bgTopbar,
          backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
          WebkitBackdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
          borderBottom: `1px solid ${theme.border}`,
          flexShrink: 0,
          position: 'relative',
          zIndex: 5,
        }}
      >
        {/* Hamburger — phone and tablet */}
        {compact && (
          <TopbarButton
            onClick={onMenuToggle}
            aria-label={t('shell.openMenu')}
            style={{ width: '40px', height: '40px', marginInlineStart: '-6px' }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </TopbarButton>
        )}

        {/* Breadcrumb: where you are, and the pages above it. The current page is the strongest; the ones above are links. */}
        <nav aria-label={t('shell.breadcrumb')} style={{ flex: 1, minWidth: 0 }}>
          <ol
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              margin: 0,
              padding: 0,
              listStyle: 'none',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {crumbs.map((crumb, i) => (
              <li
                key={crumb.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  minWidth: 0,
                  flexShrink: crumb.isLast ? 1 : 0,
                }}
              >
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    style={{ fontSize: '13px', color: theme.textSecondary, userSelect: 'none' }}
                  >
                    ›
                  </span>
                )}
                {crumb.isLast ? (
                  <span
                    aria-current="page"
                    title={crumb.label}
                    style={{
                      padding: '2px 4px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: theme.textPrimary,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {crumb.label}
                  </span>
                ) : crumb.isId ? (
                  <span
                    style={{
                      padding: '2px 4px',
                      fontSize: '13px',
                      color: theme.textSecondary,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <CrumbLink to={crumb.path}>{crumb.label}</CrumbLink>
                )}
              </li>
            ))}
          </ol>
        </nav>

        {/* EntitySwitcher — compact badge on phone, full pill on tablet+desktop */}
        <EntitySwitcher compact={compact && isPhone} />

        {/* Search — hidden on phone to save space */}
        {!isPhone && (
          <TopbarButton
            aria-label={t('shell.search')}
            aria-keyshortcuts="Control+K"
            title={t('shell.searchTitle')}
            onClick={() =>
              window.dispatchEvent(new CustomEvent('fnc:open-search', { detail: { prefill: '' } }))
            }
            bordered
            style={{ padding: '0 8px 0 10px', fontWeight: 500 }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span style={{ whiteSpace: 'nowrap' }}>{t('shell.search')}</span>
            <kbd
              aria-hidden="true"
              style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '1px 5px',
                borderRadius: '5px',
                background: theme.bgCanvas,
                border: `1px solid ${theme.border}`,
                color: theme.textSecondary,
                fontFamily: 'inherit',
                lineHeight: '1.4',
              }}
            >
              Ctrl K
            </kbd>
          </TopbarButton>
        )}

        {/* Theme, notifications, and the avatar menu are all reachable via the
            phone drawer (More → Sidebar footer) and BottomNav's Notifs tab —
            dropping them here keeps the phone topbar to hamburger + breadcrumb
            + company badge. */}
        {!isPhone && (
          <span
            aria-hidden="true"
            style={{ width: '1px', height: '20px', background: theme.border, margin: '0 4px' }}
          />
        )}
        {!isPhone && <LanguageSwitcher />}
        {!isPhone && <ThemeSwitcher />}

        {/* Notifications */}
        {!isPhone && (
          <TopbarButton
            onClick={() => {
              setNotifOpen(true)
            }}
            aria-label={
              unreadCount > 0
                ? t('shell.notificationsUnread', { count: unreadCount })
                : t('shell.notifications')
            }
            active={notifOpen}
            style={{ position: 'relative' }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '1px',
                  insetInlineEnd: '0',
                  minWidth: '17px',
                  height: '17px',
                  boxSizing: 'border-box',
                  padding: '0 4px',
                  borderRadius: '9px',
                  background: theme.danger,
                  // the page colour behind it, so the badge reads on top of the bell on either theme
                  color: theme.bgSurface,
                  boxShadow: `0 0 0 2px ${theme.bgTopbar}`,
                  fontSize: '10px',
                  fontWeight: 700,
                  lineHeight: '17px',
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </TopbarButton>
        )}

        {/* Avatar */}
        {!isPhone && (
          <div ref={userMenu.containerRef} style={{ position: 'relative' }}>
            <TopbarButton
              ref={userMenu.triggerRef}
              onClick={userMenu.toggle}
              aria-label={t('shell.userMenu')}
              aria-haspopup="menu"
              aria-expanded={userMenu.open}
              style={{
                width: '36px',
                padding: 0,
                borderRadius: '50%',
                background: theme.accentBg,
                border: `1px solid ${userMenu.open ? theme.accentSolid : theme.accentBorder}`,
                color: theme.accentSolid,
                fontSize: '12px',
                letterSpacing: '0.02em',
                overflow: 'hidden',
              }}
            >
              {avatarImage(34)}
            </TopbarButton>
            {userMenu.open && (
              <ShellMenuPanel
                align="end"
                label={t('shell.userMenu')}
                panelRef={userMenu.panelRef}
                onKeyDown={userMenu.onKeyDown}
                minWidth={240}
                header={
                  <div
                    style={{
                      padding: '12px 14px',
                      borderBottom: `1px solid ${theme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: theme.accentBg,
                        border: `1px solid ${theme.accentBorder}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: theme.accentSolid,
                      }}
                    >
                      {avatarImage(36)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      {displayName && (
                        <p
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: theme.textPrimary,
                            margin: '0 0 1px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {displayName}
                        </p>
                      )}
                      <p
                        style={{
                          fontSize: '12px',
                          color: theme.textSecondary,
                          margin: 0,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {user?.email ?? ''}
                      </p>
                    </div>
                  </div>
                }
              >
                {[
                  { label: navLabel('Profile'), path: '/settings/profile' },
                  { label: navLabel('Settings'), path: '/settings' },
                ].map((item) => (
                  <MenuRow
                    key={item.path}
                    onSelect={() => {
                      goTo(item.path)
                    }}
                  >
                    {item.label}
                  </MenuRow>
                ))}
                <div role="separator" style={menuSeparatorStyle(theme)} />
                <MenuRow danger onSelect={handleSignOut}>
                  {t('shell.signOut')}
                </MenuRow>
              </ShellMenuPanel>
            )}
          </div>
        )}
      </header>

      <NotificationsDrawer
        open={notifOpen}
        onClose={() => {
          setNotifOpen(false)
        }}
      />
    </>
  )
}
