import { useNavigate, useLocation } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { useNotificationStore } from '../../store/notificationStore'

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
  bell: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  grid: (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  'shopping-cart': (c) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
}

// ── Nav items (same for every role) ──────────────────────────────────────────

interface BottomNavItem {
  label: string
  icon: string
  path: string
}

const NAV_ITEMS: BottomNavItem[] = [
  { label: 'Home', icon: 'home', path: '/dashboard' },
  { label: 'Projects', icon: 'briefcase', path: '/projects' },
  { label: 'PO', icon: 'shopping-cart', path: '/procurement/purchase-orders' },
  { label: 'Notifs', icon: 'bell', path: '/notifications' },
]

// ── Component ────────────────────────────────────────────────────────────────

export function BottomNav() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const unreadCount = useNotificationStore((s) => s.unreadCount)

  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  return (
    <nav
      className="fnc-bottom-nav"
      style={{
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
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.path)
        const color = active ? theme.accent : theme.textMuted
        return (
          <button
            key={item.path}
            onClick={() => {
              navigate(item.path)
            }}
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
              <div
                style={{
                  position: 'absolute',
                  top: '6px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: theme.accent,
                }}
              />
            )}
            {item.icon === 'bell' && unreadCount > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '50%',
                  transform: 'translateX(2px)',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: theme.danger,
                  border: `1.5px solid ${theme.bgSurface}`,
                }}
              />
            )}
            {ICONS[item.icon]?.(color)}
            <span
              style={{
                fontSize: '10px',
                fontWeight: active ? 600 : 400,
                letterSpacing: '0.02em',
              }}
            >
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
