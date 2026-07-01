import React from 'react'
import { Spinner } from './Spinner'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  children?: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  className?: string
  style?: React.CSSProperties
  fullWidthOnMobile?: boolean
}

const desktopHeights = { sm: '28px', md: '34px', lg: '40px' }
const fontSizes      = { sm: '12px', md: '13px', lg: '14px' }
const desktopPads    = { sm: '0 10px', md: '0 14px', lg: '0 18px' }

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  children,
  onClick,
  type = 'button',
  className = '',
  style: styleProp,
  fullWidthOnMobile = false,
}: ButtonProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: theme.accentBg,
      border: `1px solid ${theme.accentBorder}`,
      color: theme.accent,
    },
    secondary: {
      background: theme.bgSurface,
      border: `1px solid ${theme.border}`,
      color: theme.textSecondary,
      backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
    },
    ghost: {
      background: 'transparent',
      border: '1px solid transparent',
      color: theme.textSecondary,
    },
    danger: {
      background: theme.dangerBg,
      border: `1px solid ${theme.dangerBorder}`,
      color: theme.danger,
    },
  }

  const isDisabled = disabled || loading

  const mobileOverrides: React.CSSProperties = isPhone ? {
    minHeight: '44px',
    height: 'auto',
    fontSize: size === 'sm' ? '13px' : '15px',
    padding: size === 'sm' ? '10px 14px' : '12px 20px',
    width: fullWidthOnMobile ? '100%' : undefined,
    borderRadius: '10px',
  } : {}

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        height: desktopHeights[size],
        padding: desktopPads[size],
        fontSize: fontSizes[size],
        fontWeight: 500,
        borderRadius: '8px',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        fontFamily: 'inherit',
        WebkitTapHighlightColor: 'transparent',
        ...variantStyles[variant],
        ...mobileOverrides,
        ...styleProp,
      }}
      onMouseEnter={(e) => {
        if (!isDisabled && variant === 'ghost') {
          e.currentTarget.style.background = theme.bgSurfaceHover
        }
      }}
      onMouseLeave={(e) => {
        if (!isDisabled && variant === 'ghost') {
          e.currentTarget.style.background = 'transparent'
        }
      }}
    >
      {loading && <Spinner size={size === 'lg' ? 'md' : 'sm'} />}
      {!loading && icon && iconPosition === 'left' && icon}
      {children}
      {!loading && icon && iconPosition === 'right' && icon}
    </button>
  )
}

// ── Sticky action bar — sits above BottomNav on phone ────────────────────────

interface StickyActionBarProps {
  children: React.ReactNode
}

export function StickyActionBar({ children }: StickyActionBarProps) {
  const { isPhone } = useBreakpoint()
  const { theme } = useTheme()

  if (!isPhone) return <>{children}</>

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
      left: 0,
      right: 0,
      padding: '12px 16px',
      background: theme.bgSurface,
      borderTop: `0.5px solid ${theme.border}`,
      display: 'flex',
      gap: '10px',
      zIndex: 30,
      backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
      WebkitBackdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
    }}>
      {children}
    </div>
  )
}
