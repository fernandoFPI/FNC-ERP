import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { isKeyboardFocus } from '../ui/keyboardFocus'

export interface PurposeCardOption<V extends string = string> {
  value: V
  title: string
  /** One short line saying when a person picks this one. Read aloud as the card's description. */
  description: string
  icon: ReactNode
}

interface PurposeCardsProps<V extends string> {
  options: PurposeCardOption<V>[]
  value: V
  onChange: (value: V) => void
  /** Names the whole group for a screen reader ("Purpose"). */
  label: string
  'data-tour'?: string
}

// Kept in the page (not display:none) so the radio stays in the Tab order and a screen reader still finds it.
const VISUALLY_HIDDEN: CSSProperties = {
  position: 'absolute',
  opacity: 0,
  width: '1px',
  height: '1px',
  margin: 0,
  pointerEvents: 'none',
}

// Text a screen reader still reads (it is the radio's description) but that is not drawn.
const SCREEN_READER_ONLY: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}

interface CardProps<V extends string> {
  option: PurposeCardOption<V>
  name: string
  checked: boolean
  onChange: (value: V) => void
  isPhone: boolean
}

function PurposeCard<V extends string>({ option, name, checked, onChange, isPhone }: CardProps<V>) {
  const { theme } = useTheme()
  const titleId = useId()
  const descriptionId = useId()
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)

  const iconSize = isPhone ? '30px' : '38px'

  return (
    <label
      data-checked={checked}
      onMouseEnter={() => {
        setHover(true)
      }}
      onMouseLeave={() => {
        setHover(false)
      }}
      style={{
        position: 'relative',
        display: 'grid',
        // Desktop: icon, then title over description, then the tick. Phone: the icon and the tick on one row and the
        // title under them across the whole card (a word like "Manufacturing" does not fit beside an icon and a tick
        // in half a phone); the description is shown once, under the group, for the chosen card only.
        gridTemplateColumns: isPhone ? 'auto minmax(0, 1fr)' : 'auto minmax(0, 1fr) auto',
        columnGap: isPhone ? '8px' : '12px',
        rowGap: '8px',
        alignItems: 'start',
        minWidth: 0,
        padding: isPhone ? '10px 12px' : '14px 16px',
        border: `1.5px solid ${checked ? theme.accentSolid : theme.borderStrong}`,
        borderRadius: '12px',
        background: checked ? theme.accentBg : hover ? theme.bgSurfaceHover : theme.bgSurface,
        boxShadow: focused ? `0 0 0 3px ${theme.accent}59` : 'none',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <input
        type="radio"
        name={name}
        value={option.value}
        checked={checked}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onChange={() => {
          onChange(option.value)
        }}
        onFocus={(e) => {
          setFocused(isKeyboardFocus(e.currentTarget))
        }}
        onBlur={() => {
          setFocused(false)
        }}
        style={VISUALLY_HIDDEN}
      />
      <span
        aria-hidden="true"
        style={{
          gridColumn: 1,
          gridRow: 1,
          width: iconSize,
          height: iconSize,
          borderRadius: '10px',
          display: 'grid',
          placeItems: 'center',
          background: theme.accentHover,
          color: theme.accentSolid,
        }}
      >
        {option.icon}
      </span>
      {/* On a phone the title and the description are grid items of their own (display: contents). */}
      <span style={{ display: isPhone ? 'contents' : 'block', minWidth: 0 }}>
        <span
          id={titleId}
          style={{
            display: 'block',
            gridColumn: isPhone ? '1 / -1' : 2,
            gridRow: isPhone ? 2 : 1,
            fontSize: '14px',
            fontWeight: 600,
            lineHeight: 1.25,
            color: theme.textPrimary,
            minWidth: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {option.title}
        </span>
        <span
          id={descriptionId}
          style={
            isPhone
              ? SCREEN_READER_ONLY
              : {
                  display: 'block',
                  fontSize: '13px',
                  lineHeight: 1.4,
                  color: theme.textSecondary,
                  marginTop: '2px',
                  minWidth: 0,
                }
          }
        >
          {option.description}
        </span>
      </span>
      <span
        aria-hidden="true"
        data-tick={checked ? 'on' : 'off'}
        style={{
          gridColumn: isPhone ? 2 : 3,
          gridRow: 1,
          justifySelf: 'end',
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
    </label>
  )
}

/**
 * The "what is this request for?" choice drawn as a grid of cards: an icon, the name and one line saying when to pick
 * it. One real radio per card (so the arrow keys move between them and a screen reader announces "1 of 6"), the whole
 * card is the tap target. Desktop: up to three to a row, each with its description. Phone: two to a row with only the
 * icon and the name, and the chosen purpose's description once under the group. Opt-in: the shared `Select` is
 * untouched.
 */
export function PurposeCards<V extends string>({
  options,
  value,
  onChange,
  label,
  'data-tour': dataTour,
}: PurposeCardsProps<V>) {
  const { isPhone } = useBreakpoint()
  const { theme } = useTheme()
  const name = useId()
  const chosen = options.find((o) => o.value === value)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div
        role="radiogroup"
        aria-label={label}
        data-tour={dataTour}
        style={{
          display: 'grid',
          gridTemplateColumns: isPhone
            ? 'repeat(2, minmax(0, 1fr))'
            : // As many as fit, but never more than three to a row, so six purposes sit as 3 x 2 and not 4 + 2.
              'repeat(auto-fit, minmax(max(240px, calc((100% - 24px) / 3)), 1fr))',
          gap: isPhone ? '10px' : '12px',
        }}
      >
        {options.map((option) => (
          <PurposeCard
            key={option.value}
            option={option}
            name={name}
            checked={option.value === value}
            onChange={onChange}
            isPhone={isPhone}
          />
        ))}
      </div>
      {isPhone && chosen && (
        // The radio's own description already says this to a screen reader, so the drawn copy is hidden from it.
        <div
          aria-hidden="true"
          data-testid="purpose-caption"
          style={{ fontSize: '13px', lineHeight: 1.4, color: theme.textSecondary }}
        >
          {chosen.description}
        </div>
      )}
    </div>
  )
}
