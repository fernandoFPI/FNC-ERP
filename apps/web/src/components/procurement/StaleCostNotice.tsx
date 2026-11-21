import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ActionButton } from '../ui/ActionButton'
import { useTheme } from '../../theme/ThemeContext'
import { STOCK_COST_STALE_DAYS } from '../../lib/staleStockCost'
import type { StaleCostItem } from '../../lib/staleStockCost'

/**
 * "Double-check the store price" (playbook #111): the items on a requisition that are drawn from stock and whose Cost has not changed or
 * been confirmed for over a month. Says what to do, names each item with its age, links to the item and, for a store keeper (or admin),
 * offers "Price confirmed", which restarts that item's clock. Never blocks anything.
 */
export function StaleCostNotice({
  items,
  canConfirm,
  confirmingProductId,
  onConfirm,
}: {
  items: StaleCostItem[]
  canConfirm: boolean
  confirmingProductId?: string | null
  onConfirm: (productId: string) => void
}) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  if (items.length === 0) return null
  return (
    <div
      role="region"
      aria-label={t('req.detail.staleCostTitle')}
      data-testid="stale-cost-notice"
      style={{
        border: `1px solid ${theme.warning}55`,
        borderInlineStart: `4px solid ${theme.warning}`,
        background: `${theme.warning}12`,
        borderRadius: '12px',
        padding: '14px 16px',
        marginBottom: '14px',
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
        {t('req.detail.staleCostTitle')}
      </div>
      <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '2px' }}>
        {t('req.detail.staleCostIntro', { limit: STOCK_COST_STALE_DAYS })}
        {canConfirm && ` ${t('req.detail.staleCostConfirmHint')}`}
      </div>
      <ul
        style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'grid', gap: '8px' }}
      >
        {items.map((item) => (
          <li
            key={item.productId}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px 14px',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ minWidth: 0, flex: '1 1 220px' }}>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: theme.textPrimary,
                  overflowWrap: 'anywhere',
                }}
              >
                {item.name}
              </div>
              <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                {item.sku && <span style={{ marginInlineEnd: '8px' }}>{item.sku}</span>}
                {t('req.detail.staleCostAge', { days: item.days })}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Link
                to={`/inventory/products/${item.productId}`}
                style={{ fontSize: '13px', fontWeight: 600, color: theme.accentSolid }}
              >
                {t('req.detail.staleCostOpenItem')}
              </Link>
              {canConfirm && (
                <ActionButton
                  variant="outline"
                  size="sm"
                  loading={confirmingProductId === item.productId}
                  disabled={confirmingProductId != null}
                  onClick={() => {
                    onConfirm(item.productId)
                  }}
                  ariaLabel={`${t('req.detail.staleCostConfirm')}: ${item.name}`}
                >
                  {t('req.detail.staleCostConfirm')}
                </ActionButton>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
