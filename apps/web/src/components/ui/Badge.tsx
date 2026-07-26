import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'

interface BadgeProps {
  variant: BadgeVariant
  children: React.ReactNode
  dot?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function Badge({ variant, children, dot = false, size = 'md', className = '' }: BadgeProps) {
  const { theme } = useTheme()

  const styles: Record<
    BadgeVariant,
    { bg: string; color: string; border: string; dotColor: string }
  > = {
    success: {
      bg: theme.successBg,
      color: theme.success,
      border: theme.successBorder,
      dotColor: theme.success,
    },
    warning: {
      bg: theme.warningBg,
      color: theme.warning,
      border: theme.warningBorder,
      dotColor: theme.warning,
    },
    danger: {
      bg: theme.dangerBg,
      color: theme.danger,
      border: theme.dangerBorder,
      dotColor: theme.danger,
    },
    info: { bg: theme.infoBg, color: theme.info, border: theme.infoBorder, dotColor: theme.info },
    neutral: {
      bg: theme.bgSurface,
      color: theme.textSecondary,
      border: theme.border,
      dotColor: theme.textMuted,
    },
    accent: {
      bg: theme.accentBg,
      color: theme.accent,
      border: theme.accentBorder,
      dotColor: theme.accent,
    },
  }

  const s = styles[variant]

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: size === 'sm' ? '1px 6px' : '2px 8px',
        fontSize: size === 'sm' ? '10px' : '11px',
        fontWeight: 500,
        borderRadius: '20px',
        background: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        letterSpacing: '0.02em',
      }}
    >
      {dot && (
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: s.dotColor,
            flexShrink: 0,
            boxShadow: `0 0 4px ${s.dotColor}`,
          }}
        />
      )}
      {children}
    </span>
  )
}
