import { useEffect } from 'react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../store/toastStore'
import { useBreakpoint } from '../../hooks/useBreakpoint'

const ADMIN_NAV = [
  { label: 'Users', path: '/admin/users' },
  { label: 'Role Templates', path: '/admin/role-templates' },
  { label: 'System Health', path: '/admin/health' },
  { label: 'Outbox Monitor', path: '/admin/outbox' },
  { label: 'Dead Letter Queue', path: '/admin/dlq' },
  { label: 'Event Configs', path: '/admin/event-configs' },
  { label: 'Audit Log', path: '/admin/audit' },
  { label: 'Bank Accounts', path: '/admin/bank-accounts' },
]

export default function AdminLayout() {
  const { theme } = useTheme()
  const { isMobile } = useBreakpoint()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)

  const isAdmin = user?.role === 'system_admin'

  useEffect(() => {
    if (user && !isAdmin) {
      addToast({ type: 'error', message: 'Access denied: system administrator only' })
    }
  }, [user, isAdmin, addToast])

  if (!isAdmin) {
    return <Navigate to="/dashboard" />
  }

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{
          display: 'flex',
          overflowX: 'auto',
          borderBottom: `0.5px solid ${theme.border}`,
          flexShrink: 0,
        }}>
          {ADMIN_NAV.map(item => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
            return (
              <NavLink key={item.path} to={item.path} style={{ textDecoration: 'none', flexShrink: 0 }}>
                <div style={{
                  padding: '10px 14px',
                  fontSize: '12px',
                  color: isActive ? theme.accent : theme.textSecondary,
                  fontWeight: isActive ? 500 : 400,
                  borderBottom: isActive ? `2px solid ${theme.accent}` : '2px solid transparent',
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
      <div style={{
        width: '180px',
        minWidth: '180px',
        borderRight: `0.5px solid ${theme.border}`,
        overflowY: 'auto',
        padding: '12px 0',
        flexShrink: 0,
      }}>
        {ADMIN_NAV.map(item => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/')
          return (
            <NavLink key={item.path} to={item.path} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                padding: '7px 16px',
                fontSize: '12px',
                color: isActive ? theme.accent : theme.textSecondary,
                fontWeight: isActive ? 500 : 400,
                background: isActive ? theme.accentBg : 'transparent',
                borderLeft: isActive ? `2px solid ${theme.accent}` : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
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
