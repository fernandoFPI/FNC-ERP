import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { useAuthStore } from '../../store/authStore'

// ── Mini SVG icon set for BottomNav ──────────────────────────────────────────

const ICONS: Record<string, (color: string) => JSX.Element> = {
  home: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  briefcase: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  ),
  'bar-chart-2': (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
    </svg>
  ),
  bell: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  list: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <line x1="8" y1="6"  x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6"  x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  'arrow-down-circle': (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <polyline points="8 12 12 16 16 12" />
      <line x1="12" y1="8" x2="12" y2="16" />
    </svg>
  ),
  'arrow-up-circle': (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <polyline points="16 12 12 8 8 12" />
      <line x1="12" y1="16" x2="12" y2="8" />
    </svg>
  ),
  users: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  clock: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  settings: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  grid: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <rect x="3"  y="3"  width="7" height="7" rx="1.5" />
      <rect x="14" y="3"  width="7" height="7" rx="1.5" />
      <rect x="3"  y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  package: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
}

// ── Role-based nav sets ──────────────────────────────────────────────────────

interface BottomNavItem {
  label: string
  icon: string
  path: string
}

const NAV_SETS: Record<string, BottomNavItem[]> = {
  management: [
    { label: 'Home',    icon: 'home',        path: '/dashboard' },
    { label: 'Reports', icon: 'bar-chart-2', path: '/reporting/executive' },
    { label: 'Projects',icon: 'briefcase',   path: '/projects' },
    { label: 'Notifs',  icon: 'bell',        path: '/settings/notifications' },
  ],
  finance: [
    { label: 'Home',    icon: 'home',             path: '/dashboard' },
    { label: 'AR',      icon: 'arrow-down-circle', path: '/finance/ar' },
    { label: 'AP',      icon: 'arrow-up-circle',   path: '/finance/ap' },
    { label: 'Notifs',  icon: 'bell',              path: '/settings/notifications' },
  ],
  project_manager: [
    { label: 'Home',     icon: 'home',      path: '/dashboard' },
    { label: 'Projects', icon: 'briefcase', path: '/projects' },
    { label: 'Queue',    icon: 'list',      path: '/procurement/queue' },
    { label: 'Notifs',   icon: 'bell',      path: '/settings/notifications' },
  ],
  store_keeper: [
    { label: 'Home',  icon: 'home',    path: '/dashboard' },
    { label: 'Stock', icon: 'package', path: '/inventory/balances' },
    { label: 'Queue', icon: 'list',    path: '/procurement/queue' },
    { label: 'Notifs',icon: 'bell',    path: '/settings/notifications' },
  ],
  hr_admin: [
    { label: 'Home',   icon: 'home',     path: '/dashboard' },
    { label: 'Staff',  icon: 'users',    path: '/hr/employees' },
    { label: 'Attend.',icon: 'clock',    path: '/attendance' },
    { label: 'Notifs', icon: 'bell',     path: '/settings/notifications' },
  ],
  default: [
    { label: 'Home',    icon: 'home',     path: '/dashboard' },
    { label: 'Queue',   icon: 'list',     path: '/procurement/queue' },
    { label: 'Notifs',  icon: 'bell',     path: '/settings/notifications' },
    { label: 'Settings',icon: 'settings', path: '/settings' },
  ],
}

// ── Component ────────────────────────────────────────────────────────────────

export function BottomNav() {
  const { theme } = useTheme()
  const navigate  = useNavigate()
  const location  = useLocation()
  const user      = useAuthStore((s) => s.user)

  function getNavItems(): BottomNavItem[] {
    const role  = user?.role
    if (role === 'system_admin' || role === 'company_admin') return NAV_SETS.management
    const perms = user?.permissions ?? {}
    if (perms['finance.journals.view'])    return NAV_SETS.finance
    if (perms['projects.edit'])            return NAV_SETS.project_manager
    if (perms['inventory.stock_moves.edit']) return NAV_SETS.store_keeper
    if (perms['hr.employees.edit'])        return NAV_SETS.hr_admin
    return NAV_SETS.default
  }

  const items = getNavItems()

  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  return (
    <nav className="fnc-bottom-nav" style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '64px',
      background: theme.bgSurface,
      backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
      WebkitBackdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
      borderTop: `0.5px solid ${theme.border}`,
      display: 'flex',
      alignItems: 'stretch',
      zIndex: 40,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {items.map((item) => {
        const active = isActive(item.path)
        const color  = active ? theme.accent : theme.textMuted
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color,
              position: 'relative',
              minHeight: '44px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {active && (
              <div style={{
                position: 'absolute',
                top: '6px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '4px',
                height: '4px',
                borderRadius: '50%',
                background: theme.accent,
              }} />
            )}
            {ICONS[item.icon]?.(color)}
            <span style={{
              fontSize: '10px',
              fontWeight: active ? 600 : 400,
              letterSpacing: '0.02em',
            }}>
              {item.label}
            </span>
          </button>
        )
      })}

      {/* More — opens sidebar drawer via global event */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('fnc:open-sidebar'))}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '3px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: theme.textMuted,
          minHeight: '44px',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {ICONS.grid?.(theme.textMuted)}
        <span style={{ fontSize: '10px', fontWeight: 400 }}>More</span>
      </button>
    </nav>
  )
}
