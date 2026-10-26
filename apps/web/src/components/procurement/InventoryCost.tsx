import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'

interface InventoryCostProps {
  /** products.standard_cost as the API sends it; empty when no cost was ever recorded. */
  cost: string | number | null | undefined
  /** products.cost_currency; older costs were saved without one. */
  currency: string | null | undefined
}

// What the item costs in inventory right now (the product's own Cost, the figure Cost Change
// Approvals manages), shown beside a line for reference. It is not the store price someone typed
// on this line and it never feeds a total, so it is muted, never green like the money columns.
//
// A cost saved without a currency (older imports) is still shown, with a small tag saying so,
// rather than guessing a currency for it.
export function InventoryCost({ cost, currency }: InventoryCostProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const amount = cost == null ? NaN : parseFloat(String(cost))

  if (!(amount > 0)) {
    return <span style={{ color: theme.textMuted, fontFamily: 'monospace' }}>—</span>
  }

  return (
    <div title={t('po.detail.inventoryCostHint')}>
      <span
        style={{
          color: theme.textSecondary,
          fontFamily: 'monospace',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{' '}
        {currency ?? ''}
      </span>
      {!currency && (
        <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
          {t('po.detail.currencyNotSet')}
        </div>
      )}
    </div>
  )
}
