import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { fieldControlStyle, fieldRestingBorder } from './fieldStyles'

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
  inputRef?: React.RefObject<HTMLInputElement>
  /**
   * Opt-in: draw the box like the newer form controls (40 px, 10 px corners, the readable `borderField` edge) so a
   * form's text, number and date boxes line up with its searchable pickers. Off, nothing changes.
   */
  field?: boolean
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
  inputRef,
  field = false,
}: InputProps) {
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
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {prefix && (
          <span
            style={{ position: 'absolute', insetInlineStart: '10px', color: theme.textMuted, fontSize: '13px' }}
          >
            {prefix}
          </span>
        )}
        <input
          ref={inputRef}
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
            e.currentTarget.style.borderColor = restingBorder
            onBlurProp?.(e)
          }}
          style={{
            ...(field
              ? {
                  // the shared field look (40px, 10px corners, the readable edge); same height on a phone so the
                  // boxes of a form line up with its searchable pickers
                  ...fieldControlStyle(theme, { error: !!error, dark: themeKey === 'black' }),
                  fontSize: isPhone ? '16px' : '13px',
                }
              : {
                  width: '100%',
                  minHeight: isPhone ? '44px' : '36px',
                  height: isPhone ? 'auto' : '36px',
                  paddingBlock: isPhone ? '10px' : '0',
                  fontSize: isPhone ? '16px' : '13px',
                  background: theme.bgSurface,
                  border: `1px solid ${error ? theme.dangerBorder : theme.borderInput}`,
                  borderRadius: isPhone ? '10px' : '8px',
                  color: theme.textPrimary,
                  outline: 'none',
                  fontFamily: 'inherit',
                }),
            paddingInlineEnd: suffix ? '36px' : '12px',
            paddingInlineStart: prefix ? '32px' : '12px',
            backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? 'not-allowed' : 'text',
            ...style,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = theme.accent
          }}
        />
        {suffix && (
          <span
            style={{
              position: 'absolute',
              insetInlineEnd: '10px',
              color: theme.textMuted,
              fontSize: '13px',
            }}
          >
            {suffix}
          </span>
        )}
      </div>
      {error && <span style={{ fontSize: '11px', color: theme.danger }}>{error}</span>}
    </div>
  )
}
