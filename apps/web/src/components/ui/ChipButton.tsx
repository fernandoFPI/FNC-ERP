import { useState, type ReactNode } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { isKeyboardFocus } from './keyboardFocus'

interface ChipButtonProps {
  children: ReactNode
  onClick: () => void
  /** For a chip that is one choice of several: marks the current one and tells a screen reader. */
  selected?: boolean
  /** A chip that adds something new rather than picking: dashed edge. */
  dashed?: boolean
  disabled?: boolean
}

/** A small rounded button for a quick pick (a recent vendor, "Cash") or a quick add ("+ New vendor"). */
export function ChipButton({
  children,
  onClick,
  selected,
  dashed = false,
  disabled = false,
}: ChipButtonProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const [focused, setFocused] = useState(false)
  const isChoice = selected !== undefined
  // picked, or a "+ add" chip: both read in the accent
  const emphasised = selected === true || dashed

  return (
    <button
      type="button"
      aria-pressed={isChoice ? selected : undefined}
      disabled={disabled}
      onClick={onClick}
      onFocus={(e) => {
        setFocused(isKeyboardFocus(e.currentTarget))
      }}
      onBlur={() => {
        setFocused(false)
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: isPhone ? '36px' : '30px',
        padding: '0 12px',
        borderRadius: '999px',
        border: `1px ${dashed ? 'dashed' : 'solid'} ${selected ? theme.accent : theme.borderStrong}`,
        background: selected ? theme.accentBg : theme.bgSurfaceHover,
        // accentSolid, not accent: the pale accent on the chip's tint is under 4.5:1 in the light theme
        color: emphasised ? theme.accentSolid : theme.textPrimary,
        fontSize: '13px',
        fontWeight: selected ? 600 : 500,
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        boxShadow: focused ? `0 0 0 3px ${theme.accent}59` : 'none',
        outline: 'none',
      }}
    >
      {selected && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {children}
    </button>
  )
}
