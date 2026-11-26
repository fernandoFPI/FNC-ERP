// The Overview's "Purchase Orders: Value Ordered" card: one row per status, one column per currency, and under the total ordered
// the cost booked in the same currencies, so the two can be read together (playbook #128). The booked figure is the project's cost
// ledger (what the Financial Summary shows); it is not reconciled against the ordered figure, the note says why they differ.

import type React from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { formatNumber } from '../../lib/format'
import { currenciesWithMoney } from '../../lib/projectPoSummary'
import type { MoneyByCurrency, PoSummary } from '../../lib/projectPoSummary'

interface Props {
  summary: PoSummary
  /** cost booked so far per currency (the project cost ledger), shown under the total ordered */
  booked: MoneyByCurrency
  onViewAll: () => void
}

export function ProjectPoSummaryCard({ summary, booked, onViewAll }: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()

  // every currency that holds money in either figure, so a currency with cost but no orders is not dropped
  const currencies = [
    ...new Set([...currenciesWithMoney(summary.totals), ...currenciesWithMoney(booked)]),
  ].sort()
  const hasBooked = currenciesWithMoney(booked).length > 0

  const dotColour = (status: string): string =>
    status === 'pending_approval'
      ? theme.warning
      : status === 'closed' || status === 'completed'
        ? theme.accent
        : [
              'draft',
              'inventory_check',
              'store_pricing',
              'market_pricing',
              'price_verification',
              'rejected',
            ].includes(status)
          ? theme.textMuted
          : theme.success

  const th: React.CSSProperties = {
    fontSize: '10.5px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: theme.textMuted,
    fontWeight: 600,
    padding: '8px 6px',
    textAlign: 'end',
  }
  const td: React.CSSProperties = {
    padding: '9px 6px',
    borderBottom: `1px solid ${theme.border}`,
    textAlign: 'end',
    verticalAlign: 'top',
    fontVariantNumeric: 'tabular-nums',
  }
  const dash = <span style={{ color: theme.textMuted }}>—</span>
  const amountCells = (amounts: MoneyByCurrency, tone: string, weight: number, testKey: string) =>
    currencies.map((c) => (
      <td
        key={c}
        style={{ ...td, color: tone, fontWeight: weight }}
        data-testid={`po-cell-${testKey}-${c}`}
      >
        {Math.abs(amounts[c] ?? 0) > 0 ? formatNumber(amounts[c] ?? 0) : dash}
      </td>
    ))

  return (
    <div
      style={{
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: '10px',
        padding: '16px',
        minWidth: 0,
      }}
      data-testid="po-summary"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '4px',
          paddingBottom: '8px',
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: theme.textMuted,
          }}
        >
          {t('proj.detail.purchaseOrderSummary')}
        </span>
        <button
          type="button"
          onClick={onViewAll}
          style={{
            fontSize: '11px',
            color: theme.accent,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {t('proj.detail.viewAll')}
        </button>
      </div>

      {summary.rows.length === 0 ? (
        <p
          style={{ margin: '12px 0 0', fontSize: '12px', color: theme.textSecondary }}
          data-testid="po-summary-empty"
        >
          {t('proj.detail.poNone')}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'start' }}>{t('proj.detail.status')}</th>
                <th style={th}>{t('proj.detail.poColCount')}</th>
                {currencies.map((c) => (
                  <th key={c} style={th} data-testid={`po-head-${c}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => (
                <tr key={r.status} data-testid={`po-row-${r.status}`}>
                  <td style={{ ...td, textAlign: 'start', color: theme.textPrimary }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: dotColour(r.status),
                          flexShrink: 0,
                          display: 'inline-block',
                        }}
                      />
                      {r.label}
                    </span>
                  </td>
                  <td style={{ ...td, color: theme.textSecondary }}>{r.count}</td>
                  {amountCells(r.amounts, theme.textSecondary, 400, r.status)}
                </tr>
              ))}
              <tr data-testid="po-row-total">
                <td
                  style={{ ...td, textAlign: 'start', fontWeight: 700, color: theme.textPrimary }}
                >
                  {t('proj.detail.poTotalOrdered')}
                </td>
                <td style={{ ...td, fontWeight: 700, color: theme.textPrimary }}>
                  {summary.total}
                </td>
                {amountCells(summary.totals, theme.textPrimary, 700, 'total')}
              </tr>
              {hasBooked && (
                <tr data-testid="po-row-booked">
                  <td
                    style={{
                      ...td,
                      textAlign: 'start',
                      fontWeight: 500,
                      color: theme.textPrimary,
                      borderBottom: 0,
                    }}
                  >
                    {t('proj.detail.poBooked')}
                    <span
                      style={{
                        display: 'block',
                        fontSize: '11.5px',
                        color: theme.textSecondary,
                        fontWeight: 400,
                        marginTop: '1px',
                      }}
                    >
                      {t('proj.detail.poBookedWhat')}
                    </span>
                  </td>
                  <td style={{ ...td, borderBottom: 0 }} />
                  {currencies.map((c) => (
                    <td
                      key={c}
                      style={{ ...td, borderBottom: 0, color: theme.textPrimary }}
                      data-testid={`po-cell-booked-${c}`}
                    >
                      {Math.abs(booked[c] ?? 0) > 0 ? formatNumber(booked[c] ?? 0) : dash}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          margin: '12px 0 0',
          padding: '8px 10px',
          borderRadius: '8px',
          background: theme.bgSurfaceHover,
          fontSize: '12px',
          lineHeight: 1.5,
          color: theme.textSecondary,
        }}
        data-testid="po-summary-note"
      >
        <b style={{ color: theme.textPrimary }}>{t('proj.detail.poWhyLead')}</b>{' '}
        {t('proj.detail.poWhyBody')}
      </div>
    </div>
  )
}
