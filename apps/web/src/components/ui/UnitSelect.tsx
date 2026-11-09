import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { INVOICE_UNITS, INVOICE_UNIT_MAX_LENGTH } from '../../lib/invoiceUnits'

const OTHER = '__other__'

interface UnitSelectProps {
  /** The unit as text; '' means none. */
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** The box itself (size, padding, font): pass what the neighbouring inputs use so it sits level with them. */
  style?: React.CSSProperties
  ariaLabel?: string
}

// Unit of measure for an invoice line: pick one from the list, or choose "Other…" and type your own (up to 20
// characters). A value that is not in the list (typed earlier, or from an older record) is kept as an extra choice, so
// opening an old line never loses or changes it.
export function UnitSelect({
  value,
  onChange,
  disabled = false,
  style,
  ariaLabel,
}: UnitSelectProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [typing, setTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const label = ariaLabel ?? t('invoiceUnit.ariaLabel')

  useEffect(() => {
    if (typing) inputRef.current?.focus()
  }, [typing])

  const box: React.CSSProperties = {
    background: theme.bgSurface,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '13px',
    width: '100%',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    ...style,
  }

  if (typing) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
        <input
          ref={inputRef}
          value={value}
          maxLength={INVOICE_UNIT_MAX_LENGTH}
          placeholder={t('invoiceUnit.typeOne')}
          aria-label={label}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value)
          }}
          onBlur={() => {
            if (value.trim() === '') setTyping(false)
          }}
          style={{ ...box, minWidth: 0, flex: 1 }}
        />
        <button
          type="button"
          title={t('invoiceUnit.backToList')}
          aria-label={t('invoiceUnit.backToList')}
          disabled={disabled}
          onClick={() => {
            setTyping(false)
          }}
          style={{
            background: 'transparent',
            border: `1px solid ${theme.border}`,
            borderRadius: '4px',
            color: theme.textMuted,
            cursor: 'pointer',
            padding: '2px 6px',
            fontSize: '12px',
            lineHeight: 1,
          }}
        >
          ▾
        </button>
      </span>
    )
  }

  const known = (INVOICE_UNITS as readonly string[]).includes(value)
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === OTHER) setTyping(true)
        else onChange(e.target.value)
      }}
      style={box}
    >
      <option value="">{t('invoiceUnit.none')}</option>
      {INVOICE_UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
      {value !== '' && !known && <option value={value}>{value}</option>}
      <option value={OTHER}>{t('invoiceUnit.other')}</option>
    </select>
  )
}
