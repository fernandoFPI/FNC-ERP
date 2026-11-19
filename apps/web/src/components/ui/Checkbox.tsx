import React, { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { isKeyboardFocus } from './keyboardFocus'

interface CheckboxProps {
  label?: string
  checked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  /** Names the box for a screen reader when it has no visible `label` (a tick box in a table row). */
  ariaLabel?: string
  /** A 22px box with a bigger tap area, for a phone. */
  large?: boolean
  /** Some, not all: the box shows a dash. Only for an unticked box (a ticked one is all). */
  indeterminate?: boolean
}

export function Checkbox({
  label,
  checked = false,
  onChange,
  disabled = false,
  className = '',
  ariaLabel,
  large = false,
  indeterminate = false,
}: CheckboxProps) {
  const { theme } = useTheme()
  const [focused, setFocused] = useState(false)
  const box = large ? 22 : 16
  const mixed = indeterminate && !checked
  const inputRef = useRef<HTMLInputElement>(null)
  // the browser's own indeterminate flag is a property, not an attribute: a screen reader reads it from here
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = mixed
  }, [mixed])

  return (
    <label
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontSize: '13px',
        color: theme.textSecondary,
        userSelect: 'none',
        // the label is the tap target: a bigger one around a large box
        padding: large ? '10px' : undefined,
      }}
    >
      <input
        ref={inputRef}
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.checked)}
        onFocus={(e) => {
          setFocused(isKeyboardFocus(e.currentTarget))
        }}
        onBlur={() => {
          setFocused(false)
        }}
        disabled={disabled}
        // Kept in the page and in the Tab order, only not drawn: the box beside it is the visible control.
        // `display: none` would take it out of both, so a keyboard user could not reach or toggle it.
        style={{
          position: 'absolute',
          insetInlineStart: large ? '10px' : 0,
          width: `${box}px`,
          height: `${box}px`,
          margin: 0,
          opacity: 0,
          cursor: 'inherit',
        }}
      />
      <span
        aria-hidden="true"
        style={{
          width: `${box}px`,
          height: `${box}px`,
          borderRadius: large ? '6px' : '4px',
          border: `1.5px solid ${checked || mixed ? theme.accent : theme.borderInput}`,
          background: checked || mixed ? theme.accentBg : 'transparent',
          outline: focused ? `2px solid ${theme.accent}` : 'none',
          outlineOffset: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {mixed && (
          <svg width={large ? 12 : 10} height="2" viewBox="0 0 10 2" fill="none">
            <path d="M1 1h8" stroke={theme.accentSolid} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
        {checked && (
          <svg width={large ? 13 : 10} height={large ? 10 : 8} viewBox="0 0 10 8" fill="none">
            <path
              d="M1 4l3 3 5-6"
              stroke={theme.accentSolid}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {label}
    </label>
  )
}
