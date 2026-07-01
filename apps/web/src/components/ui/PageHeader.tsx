import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface PageHeaderProps {
  title: string
  subtitle?: string
  status?: React.ReactNode
  actions?: React.ReactNode
  backPath?: string
  backLabel?: string
  badge?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  status,
  actions,
  backPath,
  backLabel,
  badge,
  className = '',
}: PageHeaderProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const navigate = useNavigate()

  return (
    <div className={className} style={{ marginBottom: isPhone ? '16px' : '24px' }}>
      {backPath && (
        <button
          onClick={() => navigate(backPath)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            color: isPhone ? theme.accent : theme.textMuted,
            fontSize: isPhone ? '14px' : '12px',
            padding: isPhone ? '0 0 10px 0' : '0 0 8px 0',
            fontFamily: 'inherit',
            width: 'fit-content',
            minHeight: isPhone ? '44px' : undefined,
            WebkitTapHighlightColor: 'transparent',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = theme.textSecondary }}
          onMouseLeave={(e) => { e.currentTarget.style.color = isPhone ? theme.accent : theme.textMuted }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {backLabel ?? 'Back'}
        </button>
      )}

      <div style={{
        display: 'flex',
        alignItems: isPhone ? 'flex-start' : 'flex-start',
        justifyContent: 'space-between',
        flexDirection: isPhone ? 'column' : 'row',
        gap: isPhone ? '12px' : '16px',
      }}>
        {/* Title block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{
                fontSize: isPhone ? '20px' : '24px',
                fontWeight: isPhone ? 700 : 600,
                color: theme.textPrimary,
                margin: 0,
                lineHeight: 1.2,
              }}>
                {title}
              </h1>
              {badge && <div>{badge}</div>}
            </div>
            {subtitle && (
              <p style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '3px', margin: '3px 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
          {status && <div>{status}</div>}
        </div>

        {/* Actions */}
        {actions && (
          <div style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexShrink: isPhone ? undefined : 0,
            width: isPhone ? '100%' : undefined,
            flexWrap: 'wrap',
          }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
