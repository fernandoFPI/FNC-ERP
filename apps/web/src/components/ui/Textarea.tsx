import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

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
}: TextareaProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

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
        style={{
          padding: isPhone ? '12px' : '10px 12px',
          fontSize: isPhone ? '16px' : '13px',
          background: theme.bgSurface,
          border: `1px solid ${error ? theme.dangerBorder : theme.borderInput}`,
          borderRadius: isPhone ? '10px' : '8px',
          color: theme.textPrimary,
          fontFamily: 'inherit',
          resize: 'vertical',
          opacity: disabled ? 0.5 : 1,
          outline: 'none',
          minHeight: isPhone ? '88px' : undefined,
          width: '100%',
          ...style,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = theme.accent
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error ? theme.dangerBorder : theme.borderInput
        }}
      />
      {error && <span style={{ fontSize: '11px', color: theme.danger }}>{error}</span>}
    </div>
  )
}
