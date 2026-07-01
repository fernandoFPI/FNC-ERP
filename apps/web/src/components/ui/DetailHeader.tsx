import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from './Badge'
import type { BadgeVariant } from './Badge'
import { useTheme } from '../../theme/ThemeContext'

interface DetailHeaderProps {
  title: string
  subtitle?: string
  status?: string
  statusVariant?: BadgeVariant
  actions?: React.ReactNode
  backPath?: string
  backLabel?: string
}

export function DetailHeader({ title, subtitle, status, statusVariant = 'neutral', actions, backPath, backLabel }: DetailHeaderProps) {
  const { theme } = useTheme()
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {backPath && (
        <button
          onClick={() => navigate(backPath)}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '4px',
            color: theme.textMuted, fontSize: '12px', padding: 0,
            fontFamily: 'inherit', width: 'fit-content',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = theme.textSecondary }}
          onMouseLeave={(e) => { e.currentTarget.style.color = theme.textMuted }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {backLabel ?? 'Back'}
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary, margin: 0, lineHeight: 1.2 }}>{title}</h1>
            {subtitle && <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '2px 0 0' }}>{subtitle}</p>}
          </div>
          {status && <Badge variant={statusVariant}>{status}</Badge>}
        </div>
        {actions && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </div>
  )
}
