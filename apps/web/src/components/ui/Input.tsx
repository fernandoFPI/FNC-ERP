import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface InputProps {
  label?: string
  error?: string
  placeholder?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  disabled?: boolean
  required?: boolean
  autoComplete?: string
  className?: string
  style?: React.CSSProperties
  suffix?: React.ReactNode
  prefix?: React.ReactNode
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
  min?: string | number
  max?: string | number
  step?: string | number
  readOnly?: boolean
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  autoCapitalize?: string
  autoCorrect?: string
  maxLength?: number
}

export function Input({
  label,
  error,
  placeholder,
  value,
  onChange,
  type = 'text',
  disabled = false,
  required = false,
  autoComplete,
  className = '',
  style,
  suffix,
  prefix,
  onKeyDown,
  onBlur: onBlurProp,
  min,
  max,
  step,
  readOnly,
  inputMode,
  autoCapitalize,
  autoCorrect,
  maxLength,
}: InputProps) {
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
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <span style={{ position: 'absolute', left: '10px', color: theme.textMuted, fontSize: '13px' }}>
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          readOnly={readOnly}
          autoComplete={autoComplete}
          onKeyDown={onKeyDown}
          min={min}
          max={max}
          step={step}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          maxLength={maxLength}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error ? theme.dangerBorder : theme.borderInput
            onBlurProp?.(e)
          }}
          style={{
            width: '100%',
            minHeight: isPhone ? '44px' : '36px',
            height: isPhone ? 'auto' : '36px',
            padding: `${isPhone ? '10px' : '0'} ${suffix ? '36px' : '12px'} ${isPhone ? '10px' : '0'} ${prefix ? '32px' : '12px'}`,
            fontSize: isPhone ? '16px' : '13px',
            background: theme.bgSurface,
            border: `1px solid ${error ? theme.dangerBorder : theme.borderInput}`,
            borderRadius: isPhone ? '10px' : '8px',
            color: theme.textPrimary,
            backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
            outline: 'none',
            fontFamily: 'inherit',
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'text',
            ...style,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = theme.accent
          }}
        />
        {suffix && (
          <span style={{ position: 'absolute', right: '10px', color: theme.textMuted, fontSize: '13px' }}>
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <span style={{ fontSize: '11px', color: theme.danger }}>{error}</span>
      )}
    </div>
  )
}
