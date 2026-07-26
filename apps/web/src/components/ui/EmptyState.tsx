import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface EmptyStateProps {
  title?: string
  message?: string
  action?: React.ReactNode
  children?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}

export function EmptyState({
  title = 'Nothing here',
  message,
  action,
  children,
  icon,
  className = '',
}: EmptyStateProps) {
  const { theme } = useTheme()

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon ?? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.textMuted}
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}
      </div>
      <div>
        <p
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: theme.textSecondary,
            marginBottom: '4px',
          }}
        >
          {title}
        </p>
        {message && <p style={{ fontSize: '13px', color: theme.textMuted }}>{message}</p>}
      </div>
      {action}
      {children}
    </div>
  )
}
