import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { useAuthStore } from '../../store/authStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface NavItem {
  label: string
  path: string
  match?: (pathname: string) => boolean
}

interface NavGroup {
  group: string
  items: NavItem[]
}

const USERS_CHILDREN = [
  '/settings/users/po-positions',
  '/settings/users/role-templates',
  '/settings/users/invites',
]

function buildNav(role: string | undefined): NavGroup[] {
  const isSysAdmin = role === 'system_admin'
  const isAdmin = isSysAdmin || role === 'company_admin'

  const groups: NavGroup[] = [
    {
      group: 'PERSONAL',
      items: [
        { label: 'Profile', path: '/settings/profile' },
        { label: 'Password', path: '/settings/password' },
        { label: 'Two-Factor Auth', path: '/settings/two-factor' },
        { label: 'Sessions', path: '/settings/sessions' },
        { label: 'Appearance', path: '/settings/appearance' },
        { label: 'Notifications', path: '/settings/notifications' },
      ],
    },
  ]

  if (isAdmin) {
    groups.push({
      group: 'COMPANY',
      items: [
        { label: 'General', path: '/settings/company/general' },
        { label: 'Bank Accounts', path: '/settings/company/bank-accounts' },
        { label: 'Tax & WHT', path: '/settings/company/tax' },
        { label: 'Accounting', path: '/settings/company/accounting' },
        { label: 'Integrations', path: '/settings/company/integrations' },
        { label: 'Document Numbering', path: '/settings/company/numbering' },
        { label: 'Project Lifecycle', path: '/settings/company/lifecycle' },
      ],
    })
    groups.push({
      group: 'FINANCE CONFIG',
      items: [
        { label: 'Cost Centers',       path: '/finance/cost-centers' },
        { label: 'Analytic Accounts',  path: '/finance/analytic-accounts' },
        { label: 'FX Rates',           path: '/finance/fx-rates' },
        { label: 'Accounting Periods', path: '/finance/periods' },
        { label: 'Payment Terms',      path: '/finance/payment-terms' },
      ],
    })
  }

  if (isSysAdmin) {
    groups.push({
      group: 'USERS & ROLES',
      items: [
        {
          label: 'Users',
          path: '/settings/users',
          match: (p) =>
            p === '/settings/users' ||
            (p.startsWith('/settings/users/') && !USERS_CHILDREN.some((c) => p.startsWith(c))),
        },
        { label: 'PO Positions', path: '/settings/users/po-positions' },
        { label: 'Role Templates', path: '/settings/users/role-templates' },
        { label: 'Invite History', path: '/settings/users/invites' },
      ],
    })
    groups.push({
      group: 'SYSTEM',
      items: [
        {
          label: 'Companies',
          path: '/settings/system/companies',
          match: (p) => p.startsWith('/settings/system/companies'),
        },
        { label: 'System Health', path: '/settings/system/health' },
        { label: 'Outbox Monitor', path: '/settings/system/outbox' },
        { label: 'Dead Letter Queue', path: '/settings/system/dlq' },
        { label: 'Event Configs', path: '/settings/system/events' },
        { label: 'Notification Routing', path: '/settings/system/notification-routing' },
        { label: 'Job History', path: '/settings/system/job-history' },
        { label: 'Audit Log', path: '/settings/system/audit' },
        { label: 'Inventory Import', path: '/settings/system/inventory-import' },
        { label: 'Workflow Import', path: '/settings/system/workflow-import' },
      ],
    })
  }

  return groups
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname)
  return pathname === item.path || pathname.startsWith(item.path + '/')
}

export default function SettingsLayout() {
  const { theme } = useTheme()
  const { isMobile } = useBreakpoint()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const groups = buildNav(user?.role)
  const allItems = groups.flatMap((g) => g.items)

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          borderBottom: `0.5px solid ${theme.border}`,
          flexShrink: 0,
          WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
          scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
        }}>
          {allItems.map((item) => {
            const active = isItemActive(item, location.pathname)
            return (
              <NavLink key={item.path + item.label} to={item.path} style={{ textDecoration: 'none', flexShrink: 0 }}>
                <div style={{
                  padding: '10px 14px',
                  fontSize: '12px',
                  color: active ? theme.accent : theme.textSecondary,
                  fontWeight: active ? 500 : 400,
                  borderBottom: active ? `2px solid ${theme.accent}` : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}>
                  {item.label}
                </div>
              </NavLink>
            )
          })}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left sub-nav */}
      <div style={{
        width: '200px',
        minWidth: '200px',
        borderRight: `0.5px solid ${theme.border}`,
        overflowY: 'auto',
        padding: '16px 0',
        flexShrink: 0,
        background: theme.bgSidebar,
      }}>
        {groups.map((group) => (
          <div key={group.group} style={{ marginBottom: '20px' }}>
            <div style={{
              padding: '4px 16px 6px',
              fontSize: '10px',
              fontWeight: 700,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              {group.group}
            </div>
            {group.items.map((item) => {
              const active = isItemActive(item, location.pathname)
              return (
                <NavLink key={item.path + item.label} to={item.path} style={{ textDecoration: 'none', display: 'block' }}>
                  <div
                    style={{
                      padding: '6px 16px',
                      fontSize: '12px',
                      color: active ? theme.accent : theme.textSecondary,
                      fontWeight: active ? 500 : 400,
                      background: active ? theme.accentBg : 'transparent',
                      borderLeft: active ? `2px solid ${theme.accent}` : '2px solid transparent',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = theme.bgSurfaceHover }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    {item.label}
                  </div>
                </NavLink>
              )
            })}
          </div>
        ))}
      </div>

      {/* Right content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
