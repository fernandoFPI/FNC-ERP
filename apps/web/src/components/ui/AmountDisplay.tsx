import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface AmountDisplayProps {
  amount: number
  currency: string
  size?: 'sm' | 'md' | 'lg'
  showSign?: boolean
  colored?: boolean
}

const fontSizes = { sm: '12px', md: '13px', lg: '16px' }

export function AmountDisplay({
  amount,
  currency,
  size = 'md',
  showSign = false,
  colored = false,
}: AmountDisplayProps) {
  const { theme } = useTheme()
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(Math.abs(parseFloat(String(amount))))

  const sign = amount < 0 ? '−' : showSign && amount > 0 ? '+' : ''
  const color = colored
    ? amount < 0
      ? theme.danger
      : amount > 0
        ? theme.success
        : theme.textPrimary
    : 'inherit'

  return (
    <span
      style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: fontSizes[size],
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {sign}
      {formatted} <span style={{ opacity: 0.6, fontSize: '0.85em' }}>{currency}</span>
    </span>
  )
}
