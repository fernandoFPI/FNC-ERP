import React from 'react'
import { Card } from './Card'
import { useTheme } from '../../theme/ThemeContext'

interface KPICardProps {
  label?: string
  title?: string
  subtitle?: string
  value: string | number
  delta?: {
    value: string
    direction: 'up' | 'down' | 'neutral'
  }
  icon?: React.ReactNode
  iconColor?: 'success' | 'warning' | 'danger' | 'info' | 'accent'
  loading?: boolean
  className?: string
}

export function KPICard({ label, title, subtitle, value, delta, icon, iconColor = 'accent', loading = false, className = '' }: KPICardProps) {
  const resolvedLabel = label ?? title ?? ''
  const { theme } = useTheme()

  const iconBg: Record<string, string> = {
    success: theme.successBg,
    warning: theme.warningBg,
    danger: theme.dangerBg,
    info: theme.infoBg,
    accent: theme.accentBg,
  }
  const iconBorder: Record<string, string> = {
    success: theme.successBorder,
    warning: theme.warningBorder,
    danger: theme.dangerBorder,
    info: theme.infoBorder,
    accent: theme.accentBorder,
  }
  const iconColor2: Record<string, string> = {
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
    info: theme.info,
    accent: theme.accent,
  }

  const deltaColor = delta
    ? delta.direction === 'up' ? theme.success
    : delta.direction === 'down' ? theme.danger
    : theme.textMuted
    : theme.textMuted

  return (
    <Card className={className} padding="md" rimHighlight>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        {icon && (
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: iconBg[iconColor],
            border: `1px solid ${iconBorder[iconColor]}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: iconColor2[iconColor],
            flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '11px', fontWeight: 500, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            {resolvedLabel}
          </p>
          {loading ? (
            <div className="skeleton" style={{ height: '22px', width: '70%', borderRadius: '4px', marginBottom: '6px' }} />
          ) : (
            <p style={{ fontSize: '22px', fontWeight: 500, color: theme.textPrimary, lineHeight: 1 }}>{value}</p>
          )}
          {subtitle && !loading && (
            <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>{subtitle}</p>
          )}
          {loading ? (
            <div className="skeleton" style={{ height: '12px', width: '40%', borderRadius: '4px', marginTop: '6px' }} />
          ) : delta ? (
            <p style={{ fontSize: '11px', color: deltaColor, marginTop: '4px' }}>
              {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '→'} {delta.value}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
