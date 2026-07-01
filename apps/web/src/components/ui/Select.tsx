import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { SearchableSelect } from './SearchableSelect'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  label?: string
  error?: string
  options?: SelectOption[]
  children?: React.ReactNode
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  style?: React.CSSProperties
}

export function Select({
  label,
  error,
  options,
  children,
  value,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  className = '',
  style,
}: SelectProps) {
  const { theme, themeKey } = useTheme()
  const { isPhone } = useBreakpoint()
  const isDark = themeKey.startsWith('dark')

  // When options array is provided (no raw JSX children) use the searchable portal select
  if (options && !children) {
    const ssOptions = placeholder
      ? [{ value: '', label: placeholder }, ...options]
      : options

    function handleChange(val: string) {
      onChange?.({ target: { value: val } } as React.ChangeEvent<HTMLSelectElement>)
    }

    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
        <SearchableSelect
          label={label}
          error={error}
          value={value ?? ''}
          onChange={handleChange}
          options={ssOptions}
          placeholder={placeholder ?? 'Select…'}
          disabled={disabled}
          required={required}
        />
      </div>
    )
  }

  // Fallback: children-based native select (used when <option> JSX is passed directly)
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      {label && (
        <label style={{
          fontSize: isPhone ? '13px' : '12px',
          fontWeight: 500,
          color: error ? theme.danger : theme.textSecondary,
        }}>
          {label}
          {required && <span style={{ color: theme.danger }}> *</span>}
        </label>
      )}
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        style={{
          minHeight: isPhone ? '44px' : '36px',
          height: isPhone ? 'auto' : '36px',
          padding: isPhone ? '10px 12px' : '0 12px',
          fontSize: isPhone ? '16px' : '13px',
          background: theme.bgSurface,
          border: `1px solid ${error ? theme.dangerBorder : theme.borderInput}`,
          borderRadius: isPhone ? '10px' : '8px',
          color: value ? theme.textPrimary : theme.textMuted,
          fontFamily: 'inherit',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          width: '100%',
          colorScheme: isDark ? 'dark' : 'light',
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      {error && <span style={{ fontSize: '11px', color: theme.danger }}>{error}</span>}
    </div>
  )
}
