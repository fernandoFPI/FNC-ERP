import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  rimHighlight?: boolean
  style?: React.CSSProperties
  onClick?: () => void
  fullWidthOnMobile?: boolean
  // Onboarding-tour anchor — TypeScript allows any data-* prop on a JSX
  // element regardless of its declared props (bypasses excess-property
  // checking), which silently masked that this was never actually
  // forwarded to the rendered <div>: every existing `<Card data-tour="…">`
  // call site (this form's own PO tour included) was a no-op until now.
  'data-tour'?: string
}

export function Card({
  children,
  className = '',
  padding = 'md',
  rimHighlight = false,
  style,
  onClick,
  fullWidthOnMobile = false,
  'data-tour': dataTour,
}: CardProps) {
  const { theme } = useTheme()
  const { isPhone, isTablet } = useBreakpoint()

  const paddingValues: Record<string, string> = {
    none: '0',
    sm: isPhone ? '10px' : '12px',
    md: isPhone ? '14px' : isTablet ? '16px' : '20px',
    lg: isPhone ? '16px' : isTablet ? '20px' : '28px',
  }

  const mobileFullWidthStyles: React.CSSProperties =
    fullWidthOnMobile && isPhone
      ? {
          borderRadius: 0,
          marginLeft: '-12px',
          marginRight: '-12px',
          borderLeft: 'none',
          borderRight: 'none',
        }
      : {}

  return (
    <div
      className={className}
      onClick={onClick}
      data-tour={dataTour}
      style={{
        position: 'relative',
        background: theme.bgSurface,
        backdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
        WebkitBackdropFilter: theme.hasBlur ? theme.blurAmount : 'none',
        border: `${theme.hasBlur ? '0.5px' : '1px'} solid ${theme.border}`,
        borderRadius: '14px',
        padding: paddingValues[padding],
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : undefined,
        WebkitTapHighlightColor: onClick ? 'transparent' : undefined,
        ...mobileFullWidthStyles,
        ...style,
      }}
    >
      {rimHighlight && theme.topRim !== 'none' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '0.5px',
            background: theme.topRim,
          }}
        />
      )}
      {children}
    </div>
  )
}
