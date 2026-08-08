import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useAuth } from '../../hooks/useAuth'
import { useTheme } from '../../theme/ThemeContext'

export function ImpersonationBanner() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { exitImpersonation } = useAuth()
  const impersonatedBy = useAuthStore((s) => s.impersonatedBy)
  const user = useAuthStore((s) => s.user)

  if (!impersonatedBy || !user) return null

  const displayName =
    user.firstName || user.lastName ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : user.email

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '40px',
        background: theme.warningBg,
        borderBottom: `2px solid ${theme.warning}`,
        color: theme.textPrimary,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 100002,
        fontSize: '13px',
        fontWeight: 500,
        gap: '12px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.18)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <span style={{ fontSize: '15px' }}>🕵️</span>
        <span style={{ fontWeight: 700, color: theme.warning }}>Viewing as {displayName}</span>
        <span style={{ color: theme.textMuted }}>—</span>
        <span style={{ color: theme.textSecondary }}>
          Actions are logged under this user, not you
        </span>
      </div>

      <button
        onClick={() => {
          exitImpersonation()
          navigate('/dashboard')
        }}
        style={{
          background: `${theme.warning}18`,
          border: `1px solid ${theme.warning}40`,
          borderRadius: '6px',
          color: theme.warning,
          padding: '4px 12px',
          fontSize: '12px',
          cursor: 'pointer',
          fontWeight: 600,
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        Exit impersonation
      </button>
    </div>
  )
}
