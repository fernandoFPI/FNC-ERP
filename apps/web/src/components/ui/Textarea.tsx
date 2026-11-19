import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { fieldRestingBorder, fieldTextareaStyle } from './fieldStyles'

interface TextareaProps {
  label?: string
  error?: string
  placeholder?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  rows?: number
  disabled?: boolean
  required?: boolean
  readOnly?: boolean
  className?: string
  style?: React.CSSProperties
  /** Opt-in: the same box as the newer form controls (readable edge, 10 px corners). Off, nothing changes. */
  field?: boolean
  /** Put the cursor in the box as soon as it appears (a reason box opened by a button). */
  autoFocus?: boolean
}

export function Textarea({
  label,
  error,
  placeholder,
  value,
  onChange,
  rows = 4,
  disabled = false,
  required = false,
  readOnly,
  className = '',
  style,
  field = false,
  autoFocus = false,
}: TextareaProps) {
  const { theme, themeKey } = useTheme()
  const { isPhone } = useBreakpoint()
  const restingBorder = field
    ? fieldRestingBorder(theme, !!error)
    : error
      ? theme.dangerBorder
      : theme.borderInput

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && (
        <label
          style={{
            fontSize: isPhone ? '13px' : '12px',
            fontWeight: 500,
            color: error ? theme.danger : theme.textSecondary,
          }}
        >
          {label}
          {required && <span style={{ color: theme.danger }}> *</span>}
        </label>
      )}
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        required={required}
        readOnly={readOnly}
        autoFocus={autoFocus}
        style={{
          ...(field
            ? {
                ...fieldTextareaStyle(theme, { error: !!error, dark: themeKey === 'black' }),
                fontSize: isPhone ? '16px' : '13px',
              }
            : {
                padding: isPhone ? '12px' : '10px 12px',
                fontSize: isPhone ? '16px' : '13px',
                background: theme.bgSurface,
                border: `1px solid ${error ? theme.dangerBorder : theme.borderInput}`,
                borderRadius: isPhone ? '10px' : '8px',
                color: theme.textPrimary,
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                minHeight: isPhone ? '88px' : undefined,
                width: '100%',
              }),
          opacity: disabled ? 0.5 : 1,
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = theme.accent
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = restingBorder
        }}
      />
      {error && <span style={{ fontSize: '11px', color: theme.danger }}>{error}</span>}
    </div>
  )
}
