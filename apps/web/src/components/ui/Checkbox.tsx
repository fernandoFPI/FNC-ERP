import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface CheckboxProps {
  label?: string
  checked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function Checkbox({ label, checked = false, onChange, disabled = false, className = '' }: CheckboxProps) {
  const { theme } = useTheme()

  return (
    <label
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: '13px',
        color: theme.textSecondary,
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked)}
        disabled={disabled}
        style={{ display: 'none' }}
      />
      <span
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          border: `1.5px solid ${checked ? theme.accent : theme.borderInput}`,
          background: checked ? theme.accentBg : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke={theme.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </label>
  )
}
