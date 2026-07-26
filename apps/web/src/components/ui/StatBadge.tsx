import { useTheme } from '../../theme/ThemeContext'

interface StatBadgeProps {
  value: string | number
  label: string
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md'
}

export function StatBadge({ value, label, variant = 'default', size = 'md' }: StatBadgeProps) {
  const { theme } = useTheme()

  const valueColor = {
    default: theme.textPrimary,
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
    info: theme.info,
  }[variant]

  const valueFontSize = size === 'md' ? '20px' : '15px'
  const labelFontSize = size === 'md' ? '11px' : '10px'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
      <span
        style={{ fontSize: valueFontSize, fontWeight: 700, color: valueColor, lineHeight: 1.2 }}
      >
        {String(value)}
      </span>
      <span
        style={{
          fontSize: labelFontSize,
          color: theme.textMuted,
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
    </div>
  )
}
