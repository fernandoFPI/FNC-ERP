import { useTranslation } from 'react-i18next'
import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useIsRtl } from '../../i18n'
import { SearchableSelect } from './SearchableSelect'
import { fieldControlStyle, fieldRestingBorder } from './fieldStyles'

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
  // Minimum width of the popup list when `options` is used (it is never narrower than the
  // field itself). Raise it for pickers whose entries are long, e.g. a project's name.
  minDropdownWidth?: number
  /**
   * Opt-in: the same box as the newer form controls (40 px, 10 px corners, the readable edge, the searchable select's
   * chevron on a native one). Off, nothing changes for the screens that already use it.
   */
  field?: boolean
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
  minDropdownWidth,
  field = false,
}: SelectProps) {
  const { t } = useTranslation()
  const { theme, themeKey } = useTheme()
  const { isPhone } = useBreakpoint()
  const isDark = themeKey === 'black'
  const rtl = useIsRtl()

  // When options array is provided (no raw JSX children) use the searchable portal select
  if (options && !children) {
    const ssOptions = placeholder ? [{ value: '', label: placeholder }, ...options] : options

    const handleChange = (val: string) => {
      onChange?.({ target: { value: val } } as React.ChangeEvent<HTMLSelectElement>)
    }

    return (
      <div
        className={className}
        style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}
      >
        <SearchableSelect
          label={label}
          error={error}
          value={value ?? ''}
          onChange={handleChange}
          options={ssOptions}
          placeholder={placeholder ?? t('ui.generic.select')}
          disabled={disabled}
          required={required}
          field={field}
          {...(minDropdownWidth != null ? { minDropdownWidth } : {})}
        />
      </div>
    )
  }

  // Fallback: children-based native select (used when <option> JSX is passed directly)
  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}
    >
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
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        onFocus={
          field
            ? (e) => {
                e.currentTarget.style.borderColor = theme.accent
              }
            : undefined
        }
        onBlur={
          field
            ? (e) => {
                e.currentTarget.style.borderColor = fieldRestingBorder(theme, !!error)
              }
            : undefined
        }
        style={
          field
            ? {
                ...fieldControlStyle(theme, { error: !!error, select: true, rtl, dark: isDark }),
                fontSize: isPhone ? '16px' : '13px',
                // an empty choice reads as a hint, not as a value
                color: value ? theme.textPrimary : theme.textMuted,
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }
            : {
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
              }
        }
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      {error && <span style={{ fontSize: '11px', color: theme.danger }}>{error}</span>}
    </div>
  )
}
