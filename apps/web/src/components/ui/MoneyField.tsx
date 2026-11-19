import { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface MoneyFieldProps {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  currency: string
  onCurrencyChange: (currency: string) => void
  currencies: string[]
  currencyAriaLabel: string
  invalid?: boolean
  disabled?: boolean
}

/**
 * An amount box with its currency chosen inside it, as a small pill on the right. The amount and its
 * currency are one thing, so they are one control; the pill is a native select, so every currency is in
 * the page for a screen reader and the phone's own picker.
 */
export function MoneyField({
  value,
  onChange,
  ariaLabel,
  currency,
  onCurrencyChange,
  currencies,
  currencyAriaLabel,
  invalid = false,
  disabled = false,
}: MoneyFieldProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const [focused, setFocused] = useState(false)
  const edge = invalid ? theme.danger : focused ? theme.accent : theme.borderField

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        height: `${isPhone ? 44 : 40}px`,
        boxSizing: 'border-box',
        padding: '0 8px 0 12px',
        border: `1px solid ${edge}`,
        borderRadius: '10px',
        background: theme.bgSurface,
        boxShadow: focused ? `0 0 0 3px ${theme.accent}47` : 'none',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        aria-label={ariaLabel}
        aria-invalid={invalid ? true : undefined}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        onFocus={() => {
          setFocused(true)
        }}
        onBlur={() => {
          setFocused(false)
        }}
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          // 16px on a phone stops the browser zooming the page in when the box gets focus
          fontSize: isPhone ? '16px' : '14px',
          fontFamily: 'inherit',
          fontVariantNumeric: 'tabular-nums',
          color: theme.textPrimary,
          padding: 0,
        }}
      />
      <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
        <select
          aria-label={currencyAriaLabel}
          value={currency}
          disabled={disabled}
          onChange={(e) => {
            onCurrencyChange(e.target.value)
          }}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            height: '28px',
            padding: '0 24px 0 10px',
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            background: theme.bgSurfaceHover,
            color: theme.textPrimary,
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.textSecondary}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{
            position: 'absolute',
            insetInlineEnd: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </div>
  )
}
