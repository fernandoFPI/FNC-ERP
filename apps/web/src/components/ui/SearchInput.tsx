import React from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface SearchInputProps {
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  style?: React.CSSProperties
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
  style,
}: SearchInputProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

  return (
    <div
      className={className}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', ...style }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={theme.textMuted}
        strokeWidth="2"
        style={{ position: 'absolute', insetInlineStart: '10px', pointerEvents: 'none', flexShrink: 0 }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        inputMode="search"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
        placeholder={placeholder ?? t('ui.searchInput.search')}
        style={{
          minHeight: isPhone ? '44px' : '34px',
          height: isPhone ? 'auto' : '34px',
          paddingBlock: isPhone ? '10px' : '0',
          paddingInlineEnd: '12px',
          paddingInlineStart: '32px',
          fontSize: isPhone ? '16px' : '13px',
          background: theme.bgSurface,
          border: `1px solid ${theme.borderInput}`,
          borderRadius: isPhone ? '10px' : '8px',
          color: theme.textPrimary,
          fontFamily: 'inherit',
          outline: 'none',
          width: '100%',
          backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = theme.accent
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = theme.borderInput
        }}
      />
    </div>
  )
}
