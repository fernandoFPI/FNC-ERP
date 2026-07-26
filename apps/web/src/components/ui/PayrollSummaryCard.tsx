import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface PayrollSummaryCardProps {
  label: string
  amount: number
  currency: string
  subLabel?: string
  variant?: 'default' | 'highlight' | 'deduction' | 'net'
}

export function PayrollSummaryCard({
  label,
  amount,
  currency,
  subLabel,
  variant = 'default',
}: PayrollSummaryCardProps) {
  const { theme } = useTheme()

  const amountColor =
    variant === 'net'
      ? theme.accent
      : variant === 'deduction'
        ? theme.danger
        : variant === 'highlight'
          ? theme.info
          : theme.textPrimary

  const borderColor =
    variant === 'net'
      ? theme.accent
      : variant === 'deduction'
        ? theme.dangerBorder
        : variant === 'highlight'
          ? theme.infoBorder
          : theme.border

  const bg =
    variant === 'net'
      ? theme.accentBg
      : variant === 'deduction'
        ? theme.dangerBg
        : variant === 'highlight'
          ? theme.infoBg
          : theme.bgSurface

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: '10px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 500,
          color: theme.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: variant === 'net' ? '22px' : '18px',
          fontWeight: 700,
          color: amountColor,
          fontFamily: 'monospace',
        }}
      >
        {variant === 'deduction' && amount > 0 ? '-' : ''}
        {amount.toLocaleString()}{' '}
        <span style={{ fontSize: '13px', fontWeight: 500, color: theme.textMuted }}>
          {currency}
        </span>
      </div>
      {subLabel && <div style={{ fontSize: '11px', color: theme.textMuted }}>{subLabel}</div>}
    </div>
  )
}
