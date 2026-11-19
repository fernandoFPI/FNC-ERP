import { useState, type ReactNode } from 'react'
import { Spinner } from './Spinner'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { isKeyboardFocus } from './keyboardFocus'

export type ActionButtonVariant = 'solid' | 'outline' | 'soft' | 'ghost' | 'danger'

interface ActionButtonProps {
  /**
   * solid: the one main action of an area. outline: the usual secondary. soft: a quiet tinted button.
   * ghost: a text-like action that must still look like a button. danger: a destructive action, tinted red.
   */
  variant?: ActionButtonVariant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  children?: ReactNode
  /** Only for a button with no text (an icon on its own). */
  ariaLabel?: string
  /** Fill the width of the row (the main action on a phone). */
  fullWidth?: boolean
  /** Anchor for the onboarding walkthrough (components/help/tours.ts), which finds its target by this attribute. */
  'data-tour'?: string
}

const HEIGHTS = { sm: 32, md: 40, lg: 44 }
const FONT_SIZES = { sm: 12, md: 13, lg: 14 }
const PADDINGS = { sm: '0 12px', md: '0 16px', lg: '0 22px' }

/**
 * The newer button: 40 px, 10 px corners, 600 weight, a real hierarchy (one solid action, the rest step down),
 * a focus ring for the keyboard and a spinner while it works. Opt-in: the shared `Button` is untouched, so only
 * the screens that choose this one change.
 */
export function ActionButton({
  variant = 'outline',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  onClick,
  type = 'button',
  children,
  ariaLabel,
  fullWidth = false,
  'data-tour': dataTour,
}: ActionButtonProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const inactive = disabled || loading

  const look: Record<
    ActionButtonVariant,
    { bg: string; bgHover: string; fg: string; border: string }
  > = {
    solid: {
      bg: theme.accentSolid,
      bgHover: theme.accentSolidHover,
      fg: theme.accentSolidText,
      border: theme.accentSolid,
    },
    outline: {
      bg: theme.bgSurface,
      bgHover: theme.bgSurfaceHover,
      fg: theme.textPrimary,
      border: theme.borderField,
    },
    soft: {
      bg: theme.accentBg,
      bgHover: theme.accentHover,
      // accentSolid, not accent: the pale accent on its own tint is 4.2:1 in the light theme (text needs 4.5)
      fg: theme.accentSolid,
      border: 'transparent',
    },
    ghost: {
      bg: 'transparent',
      bgHover: theme.bgSurfaceHover,
      fg: theme.textSecondary,
      border: 'transparent',
    },
    danger: {
      bg: theme.dangerBg,
      bgHover: theme.dangerBg,
      fg: theme.danger,
      border: theme.dangerBorder,
    },
  }
  const v = look[variant]
  const iconOnly = !children

  return (
    <button
      type={type}
      aria-label={ariaLabel}
      aria-busy={loading ? true : undefined}
      data-tour={dataTour}
      disabled={inactive}
      onClick={onClick}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      onFocus={(e) => {
        setFocused(isKeyboardFocus(e.currentTarget))
      }}
      onBlur={() => {
        setFocused(false)
      }}
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        width: fullWidth ? '100%' : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        height: `${isPhone ? Math.max(HEIGHTS[size], 44) : HEIGHTS[size]}px`,
        minWidth: iconOnly ? `${HEIGHTS[size]}px` : undefined,
        padding: iconOnly ? 0 : PADDINGS[size],
        fontSize: `${FONT_SIZES[size]}px`,
        fontWeight: 600,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        borderRadius: '10px',
        border: `1px solid ${v.border}`,
        background: hover && !inactive ? v.bgHover : v.bg,
        color: v.fg,
        boxShadow: focused
          ? `0 0 0 3px ${theme.accent}59`
          : variant === 'solid' && !inactive
            ? '0 1px 2px rgba(31, 41, 51, 0.18)'
            : 'none',
        outline: 'none',
        cursor: inactive ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : loading ? 0.8 : 1,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children && <span>{children}</span>}
    </button>
  )
}
