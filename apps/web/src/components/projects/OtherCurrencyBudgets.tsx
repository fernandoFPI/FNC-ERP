import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { formatCurrency } from '../../lib/format'
import { Button } from '../ui/Button'

// D2: the rare multi-currency case. A project has one main budget currency; costs booked in any other currency
// can never be taken off it (nothing in this system converts between currencies), so each gets its own card here,
// with its own budget if one was added. Shown at the top of the project's Cost Control tab (it used to be a strip
// under the page header, on every tab). Administrators only, and only while there is something to show.

export interface OtherCurrencyBudgetRow {
  id: string
  currencyCode: string
  isPrimary: boolean
}

export interface OtherCurrencyBudgetsProps {
  isAdmin: boolean
  // The project's cost summary entries for every currency EXCEPT its main one (one per currency).
  summaries: Record<string, unknown>[]
  budgets: OtherCurrencyBudgetRow[]
  showForm: boolean
  currency: string
  amount: string
  saving: boolean
  onOpenForm: () => void
  onCancelForm: () => void
  onCurrencyChange: (value: string) => void
  onAmountChange: (value: string) => void
  onSave: () => void
  onRemove: (budgetId: string) => void
}

export function OtherCurrencyBudgets(props: OtherCurrencyBudgetsProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { summaries, budgets, showForm, currency, amount, saving } = props

  if (!props.isAdmin || (summaries.length === 0 && !showForm)) return null

  const input = {
    padding: '6px 8px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    background: theme.bgSurface,
    color: theme.textPrimary,
  } as const

  return (
    <div
      style={{
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: theme.textMuted,
          }}
        >
          {t('proj.detail.otherCurrencyBudgets')}
        </span>
        {!showForm && (
          <button
            type="button"
            onClick={props.onOpenForm}
            style={{
              background: 'none',
              border: 'none',
              color: theme.accent,
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '2px 4px',
            }}
          >
            {t('proj.detail.addCurrencyBudget')}
          </button>
        )}
      </div>

      {summaries.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: showForm ? '12px' : 0,
          }}
        >
          {summaries.map((e) => {
            const ccy = String(e.currencyCode)
            const budgetRow = budgets.find((b) => b.currencyCode === ccy)
            const hasBudget = e.budgetAmount != null
            const remaining = e.budgetRemaining != null ? Number(e.budgetRemaining) : null
            return (
              <div
                key={ccy}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  minWidth: '160px',
                  background: theme.bgCanvas,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>
                    {ccy}
                  </span>
                  {budgetRow && !budgetRow.isPrimary && (
                    <button
                      type="button"
                      onClick={() => {
                        props.onRemove(budgetRow.id)
                      }}
                      title={t('proj.detail.remove2')}
                      aria-label={t('proj.detail.remove2')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: theme.textMuted,
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: 0,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>
                  {hasBudget
                    ? `${t('proj.detail.budget')}: ${formatCurrency(Number(e.budgetAmount), ccy)}`
                    : t('proj.detail.noBudgetSet')}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>
                  {t('proj.detail.actualCost')}: {formatCurrency(Number(e.actualCosts ?? 0), ccy)}
                </div>
                {remaining != null && (
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: remaining < 0 ? '#ef4444' : '#22c55e',
                    }}
                  >
                    {formatCurrency(remaining, ccy)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="other-ccy-code" style={{ fontSize: '10px', color: theme.textMuted }}>
              {t('proj.detail.currency')}
            </label>
            <input
              id="other-ccy-code"
              value={currency}
              onChange={(e) => {
                props.onCurrencyChange(e.target.value.toUpperCase().slice(0, 3))
              }}
              placeholder="USD"
              style={{ ...input, width: '70px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="other-ccy-amount" style={{ fontSize: '10px', color: theme.textMuted }}>
              {t('proj.detail.amount')}
            </label>
            <input
              id="other-ccy-amount"
              type="number"
              value={amount}
              onChange={(e) => {
                props.onAmountChange(e.target.value)
              }}
              placeholder="0.00"
              style={{ ...input, width: '140px' }}
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={saving || currency.length !== 3 || !amount}
            onClick={props.onSave}
          >
            {t('proj.detail.save')}
          </Button>
          <Button variant="secondary" size="sm" onClick={props.onCancelForm}>
            {t('proj.detail.cancel')}
          </Button>
        </div>
      )}
    </div>
  )
}
