import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'

export interface InlineSelectOption {
  value: string
  label: string
}

interface InlineSelectProps {
  value: string
  onChange: (value: string) => void
  options: InlineSelectOption[]
  /** What the control is for, including which line: there is no visible label beside it. */
  ariaLabel: string
  /** The first, empty choice ("nothing chosen"). Left out when a choice is always needed. */
  placeholder?: string
  width?: string
}

/**
 * A plain drop-down that sits inside a Lines table cell (for example the stock location an item is
 * taken from). Native on purpose: every choice is in the page for a screen reader and the phone's own
 * picker, and it is never clipped by the card around the table (playbook #42).
 */
export function InlineSelect({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  width = '100%',
}: InlineSelectProps) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()

  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => {
        onChange(e.target.value)
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = theme.accent
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = theme.borderInput
      }}
      style={{
        width,
        minHeight: isPhone ? '44px' : '34px',
        padding: isPhone ? '10px 12px' : '0 10px',
        fontSize: isPhone ? '16px' : '13px',
        fontFamily: 'inherit',
        background: theme.bgSurface,
        border: `1px solid ${theme.borderInput}`,
        borderRadius: isPhone ? '10px' : '8px',
        color: theme.textPrimary,
        outline: 'none',
      }}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
