import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface QuantityStepperProps {
  /** The text in the box. Empty is allowed (nothing typed yet). */
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  decreaseLabel: string
  increaseLabel: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}

// 1.1 + 0.1 must read 1.2, not 1.2000000000000002.
const tidy = (n: number) => String(Math.round(n * 10000) / 10000)

/**
 * A number box with a minus and a plus beside it. Typing still works (the middle is a real number input);
 * the buttons step by `step` and stop at `min` / `max`.
 */
export function QuantityStepper({
  value,
  onChange,
  ariaLabel,
  decreaseLabel,
  increaseLabel,
  min = 0,
  max,
  step = 1,
  disabled = false,
}: QuantityStepperProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const current = parseFloat(value)
  const base = Number.isNaN(current) ? 0 : current
  const atMin = base <= min
  const atMax = max !== undefined && base >= max
  const height = isPhone ? 44 : 40

  const stepBy = (delta: number) => {
    const next = Math.min(max ?? Infinity, Math.max(min, base + delta))
    onChange(tidy(next))
  }
  const stepButton = (label: string, glyph: string, delta: number, blocked: boolean) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled || blocked}
      onClick={() => {
        stepBy(delta)
      }}
      style={{
        width: '36px',
        height: '100%',
        border: 'none',
        background: theme.bgSurfaceHover,
        color: theme.textPrimary,
        fontSize: '18px',
        fontFamily: 'inherit',
        cursor: disabled || blocked ? 'not-allowed' : 'pointer',
        opacity: disabled || blocked ? 0.4 : 1,
        padding: 0,
      }}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  )

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: `${height}px`,
        boxSizing: 'border-box',
        border: `1px solid ${theme.borderField}`,
        borderRadius: '10px',
        background: theme.bgSurface,
        overflow: 'hidden',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {stepButton(decreaseLabel, '−', -step, atMin)}
      <input
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step="any"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        style={{
          width: '64px',
          height: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          textAlign: 'center',
          // 16px on a phone stops the browser zooming the page in when the box gets focus
          fontSize: isPhone ? '16px' : '15px',
          fontWeight: 600,
          fontFamily: 'inherit',
          fontVariantNumeric: 'tabular-nums',
          color: theme.textPrimary,
          MozAppearance: 'textfield',
        }}
      />
      {stepButton(increaseLabel, '+', step, atMax)}
    </div>
  )
}
