import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

interface LinePriceInputProps {
  value: string
  onChange: (value: string) => void
  /** What the box is for, including which line, e.g. "Market price: Cement bags". No visible label sits beside it. */
  ariaLabel: string
  /** Blank or not a valid number: draws the box red. The message itself lives in the step's action bar. */
  invalid?: boolean
  width?: string
  /** The hint shown when the box is empty. A price box says 0.00; a quantity box says 0. */
  placeholder?: string
  /** The largest number the browser's own spinner offers (a quantity that cannot exceed what is in stock). */
  max?: string
}

/**
 * A price box that sits inside a Lines table row (store, market and verified price), so the
 * person types the number on the line it belongs to instead of in a separate panel.
 */
export function LinePriceInput({
  value,
  onChange,
  ariaLabel,
  invalid = false,
  width = '110px',
  placeholder = '0.00',
  max,
}: LinePriceInputProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const rest = invalid ? theme.dangerBorder : theme.borderInput

  return (
    <input
      type="number"
      min="0"
      max={max}
      step="any"
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      aria-label={ariaLabel}
      aria-invalid={invalid ? true : undefined}
      onChange={(e) => {
        onChange(e.target.value)
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = theme.accent
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = rest
      }}
      style={{
        width: isPhone ? '100%' : width,
        minHeight: isPhone ? '44px' : '34px',
        padding: isPhone ? '10px 12px' : '0 10px',
        // 16px on a phone stops the browser zooming the page in when the box gets focus
        fontSize: isPhone ? '16px' : '13px',
        fontFamily: 'inherit',
        background: theme.bgSurface,
        border: `1px solid ${rest}`,
        borderRadius: isPhone ? '10px' : '8px',
        color: theme.textPrimary,
        outline: 'none',
      }}
    />
  )
}
