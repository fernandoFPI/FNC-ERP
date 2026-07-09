import React, { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface CurrencyInputProps {
  value: number | ''
  onChange: (value: number | '') => void
  currency: string
  label?: string
  error?: string
  disabled?: boolean
  placeholder?: string
  className?: string
}

function formatWithCommas(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

export function CurrencyInput({
  value,
  onChange,
  currency,
  label,
  error,
  disabled = false,
  placeholder = '0',
  className = '',
}: CurrencyInputProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const [focused, setFocused] = useState(false)

  const displayValue = focused
    ? value === '' ? '' : String(value)
    : value === '' ? '' : formatWithCommas(value as number)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/,/g, '')
    if (raw === '') { onChange(''); return }
    if (!/^\d*\.?\d{0,4}$/.test(raw)) return
    if (raw.length > 20) return
    const n = parseFloat(raw)
    if (!isNaN(n)) onChange(n)
  }

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && (
        <label style={{
          fontSize: isPhone ? '13px' : '12px',
          fontWeight: 500,
          color: error ? theme.danger : theme.textSecondary,
        }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          onFocus={(e) => { setFocused(true); e.currentTarget.style.borderColor = theme.accent }}
          onBlur={(e) => { setFocused(false); e.currentTarget.style.borderColor = error ? theme.dangerBorder : theme.borderInput }}
          style={{
            minHeight: isPhone ? '44px' : '36px',
            height: isPhone ? 'auto' : '36px',
            padding: isPhone ? '10px 50px 10px 12px' : '0 50px 0 12px',
            fontSize: isPhone ? '16px' : '13px',
            background: theme.bgSurface,
            border: `1px solid ${error ? theme.dangerBorder : theme.borderInput}`,
            borderRadius: isPhone ? '10px' : '8px',
            color: theme.textPrimary,
            fontFamily: 'inherit',
            outline: 'none',
            width: '100%',
            opacity: disabled ? 0.5 : 1,
          }}
        />
        <span style={{
          position: 'absolute',
          right: '12px',
          fontSize: '11px',
          fontWeight: 600,
          color: theme.textMuted,
          pointerEvents: 'none',
          letterSpacing: '0.04em',
        }}>
          {currency}
        </span>
      </div>
      {error && <span style={{ fontSize: '11px', color: theme.danger }}>{error}</span>}
    </div>
  )
}
