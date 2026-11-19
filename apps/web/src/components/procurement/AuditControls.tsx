// The Finance audit's controls, drawn inside the PO's Lines table (the audit is not a separate card: the lines are where the
// price and the quantity are, so the choice sits beside them). Three small pieces: the OK / Flag choice of a line, the box a
// flag reason is typed in, and the note under a line's actual price (how far it is from the PO price).
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { Textarea } from '../ui/Textarea'
import { ActionButton } from '../ui/ActionButton'
import { isKeyboardFocus } from '../ui/keyboardFocus'
import { menuFocusRing } from '../ui/menuStyles'
import { auditPrices, type AuditPriceLine } from '../../lib/poAudit'

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** One of the two choices (OK / Flag): pressed when it is the line's current status. */
function Choice({
  tone,
  pressed,
  disabled,
  onClick,
  children,
}: {
  tone: 'ok' | 'flagged'
  pressed: boolean
  disabled: boolean
  onClick: () => void
  children: string
}) {
  const { theme } = useTheme()
  const { isPhone } = useBreakpoint()
  const colour = tone === 'ok' ? theme.success : theme.danger
  const bg = tone === 'ok' ? theme.successBg : theme.dangerBg
  const border = tone === 'ok' ? theme.successBorder : theme.dangerBorder
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      onFocus={(e) => {
        if (isKeyboardFocus(e.currentTarget)) e.currentTarget.style.boxShadow = menuFocusRing(theme)
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none'
      }}
      style={{
        flex: isPhone ? 1 : undefined,
        minHeight: isPhone ? '44px' : '34px',
        padding: '0 14px',
        borderRadius: '8px',
        // a pressed choice is tinted with its colour; the other is a plain outline
        border: `1px solid ${pressed ? border : theme.borderField}`,
        background: pressed ? bg : theme.bgSurface,
        color: pressed ? colour : theme.textPrimary,
        fontSize: '13px',
        fontWeight: pressed ? 700 : 500,
        fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        outline: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

interface AuditCheckButtonsProps {
  /** The line's name, so a screen reader hears which line the two buttons are for. */
  itemName: string
  /** `ok`, `flagged`, or anything else for a line not yet checked. */
  status: string | null | undefined
  /** Someone else holds the edit lock: both buttons wait. */
  locked: boolean
  onOk: () => void
  onFlag: () => void
}

export function AuditCheckButtons({
  itemName,
  status,
  locked,
  onOk,
  onFlag,
}: AuditCheckButtonsProps) {
  const { t } = useTranslation()
  return (
    <div
      role="group"
      aria-label={t('po.detail.auditCheckOf', { item: itemName })}
      style={{ display: 'flex', gap: '6px' }}
    >
      <Choice tone="ok" pressed={status === 'ok'} disabled={locked} onClick={onOk}>
        {t('po.detail.ok')}
      </Choice>
      <Choice tone="flagged" pressed={status === 'flagged'} disabled={locked} onClick={onFlag}>
        {t('po.detail.flag')}
      </Choice>
    </div>
  )
}

interface AuditFlagEditorProps {
  reason: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

/** The box under a line where the reason for a flag is typed. A flag cannot be saved without one. */
export function AuditFlagEditor({ reason, onChange, onSave, onCancel }: AuditFlagEditorProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  return (
    <div style={{ padding: '12px 16px', background: `${theme.danger}0d` }}>
      <Textarea
        field
        autoFocus
        label={t('po.detail.flagReasonRequired')}
        value={reason}
        placeholder={t('po.detail.describeTheIssueWithThisLine')}
        rows={2}
        onChange={(e) => {
          onChange(e.target.value)
        }}
      />
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <ActionButton size="sm" variant="danger" disabled={!reason.trim()} onClick={onSave}>
          {t('po.detail.saveFlag')}
        </ActionButton>
        <ActionButton size="sm" variant="outline" onClick={onCancel}>
          {t('po.detail.cancel')}
        </ActionButton>
      </div>
    </div>
  )
}

interface AuditPriceNoteProps {
  line: AuditPriceLine & { uom?: string | null }
  currency: string
}

/**
 * Under a line's actual price while the order is being audited: how far it is from the price on the order, a warning when
 * the buyer has not recorded one, and what the purchased part comes to when stock covered some of the line.
 */
export function AuditPriceNote({ line, currency }: AuditPriceNoteProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const p = auditPrices(line)
  const fromStock = Number(line.qty_from_stock ?? 0) || 0
  if (p.toBuy === 0) return null
  if (p.actualPrice == null)
    return (
      <div
        style={{
          display: 'inline-block',
          marginTop: '4px',
          padding: '4px 10px',
          borderRadius: '8px',
          background: theme.warningBg,
          border: `1px solid ${theme.warningBorder}`,
          color: theme.warning,
          fontSize: '12px',
          fontWeight: 600,
          lineHeight: 1.4,
        }}
      >
        {t('po.detail.notEnteredYetBuyerHasnT')}
      </div>
    )
  const colour =
    p.variance == null || p.variance === 0
      ? theme.textSecondary
      : p.variance > 0
        ? theme.danger
        : theme.success
  return (
    <>
      {p.variance != null && p.variancePct != null && Math.abs(p.variancePct) > 0.01 && (
        <div style={{ fontSize: '12px', fontWeight: 600, color: colour, marginTop: '2px' }}>
          {p.variance > 0 ? '▲ +' : '▼ '}
          {t('po.detail.pctVsPo', { pct: p.variancePct.toFixed(1) })}
        </div>
      )}
      {fromStock > 0 && (
        <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '2px' }}>
          {t('po.detail.purchaseTotal')}: {fmt(p.purchaseTotal)} {currency} ({fmt(p.toBuy)}{' '}
          {line.uom ?? ''} × {fmt(p.actualPrice)})
        </div>
      )}
    </>
  )
}
