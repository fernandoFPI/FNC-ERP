import { useId, useState, type ReactNode } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { isKeyboardFocus } from './keyboardFocus'

interface ChoiceTileProps {
  title: string
  /** One line saying why a person would switch it on. Read aloud as the tile's description. */
  description?: string
  icon?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** What the tile opens while it is on. Drawn inside the tile, under the title, and only while it is on. */
  children?: ReactNode
}

/**
 * An on/off choice drawn as a tile: an icon, the title, a line saying why, and a round tick at the corner. The
 * whole header is the tap target (a real checkbox for the keyboard and a screen reader), and what the choice opens
 * sits inside the tile once it is on. Opt-in: the shared `Checkbox` is untouched.
 */
export function ChoiceTile({
  title,
  description,
  icon,
  checked,
  onChange,
  disabled = false,
  children,
}: ChoiceTileProps) {
  const { theme } = useTheme()
  const titleId = useId()
  const descriptionId = useId()
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)

  return (
    <div
      data-checked={checked}
      style={{
        minWidth: 0,
        border: `1.5px solid ${checked ? theme.accentSolid : theme.borderStrong}`,
        borderRadius: '12px',
        background: checked
          ? theme.accentBg
          : hover && !disabled
            ? theme.bgSurfaceHover
            : theme.bgSurface,
        opacity: disabled ? 0.55 : 1,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => {
          onChange(!checked)
        }}
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
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
          width: '100%',
          textAlign: 'start',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          borderRadius: '10px',
          color: theme.textPrimary,
          fontFamily: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${theme.accent}59` : 'none',
        }}
      >
        {icon && (
          <span
            aria-hidden="true"
            style={{
              flex: 'none',
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              display: 'grid',
              placeItems: 'center',
              background: theme.accentHover,
              color: theme.accentSolid,
            }}
          >
            {icon}
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span id={titleId} style={{ display: 'block', fontSize: '14px', fontWeight: 600 }}>
            {title}
          </span>
          {description && (
            <span
              id={descriptionId}
              style={{
                display: 'block',
                fontSize: '13px',
                color: theme.textSecondary,
                marginTop: '2px',
              }}
            >
              {description}
            </span>
          )}
        </span>
        <span
          aria-hidden="true"
          data-tick={checked ? 'on' : 'off'}
          style={{
            flex: 'none',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            border: `1.5px solid ${checked ? theme.accentSolid : theme.borderField}`,
            background: checked ? theme.accentSolid : theme.bgSurface,
            color: theme.accentSolidText,
          }}
        >
          {checked && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
      </button>
      {checked && children && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  )
}
