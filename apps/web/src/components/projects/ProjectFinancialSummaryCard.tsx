// The Overview's Financial Summary card: one column per currency, and a figure that cannot be worked out says what is missing
// instead of showing 0.00 (playbook #128). The numbers come from lib/projectFinancialSummary.ts.

import type React from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../theme/ThemeContext'
import { formatNumber } from '../../lib/format'
import type { FinancialColumn, FinancialSummaryModel } from '../../lib/projectFinancialSummary'

export function ProjectFinancialSummaryCard({ model }: { model: FinancialSummaryModel }) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { columns } = model
  const span = columns.length

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
    color: theme.textPrimary,
  }
  const labelCell: React.CSSProperties = {
    ...td,
    textAlign: 'start',
    fontWeight: 500,
  }

  // one row of numbers, or, when no currency has a value, one line saying what is missing
  const row = (
    key: string,
    label: string,
    what: string | null,
    value: (c: FinancialColumn) => React.ReactNode,
    allMissing: boolean,
    missing: string,
    bold = false,
  ) => (
    <tr key={key} data-testid={`fs-row-${key}`}>
      <td style={{ ...labelCell, fontWeight: bold ? 700 : 500 }}>
        {label}
        {what ? (
          <span
            style={{
              display: 'block',
              fontSize: '11.5px',
              color: theme.textSecondary,
              fontWeight: 400,
              marginTop: '1px',
            }}
          >
            {what}
          </span>
        ) : null}
      </td>
      {allMissing ? (
        <td
          colSpan={span}
          style={{ ...td, color: theme.textMuted }}
          data-testid={`fs-missing-${key}`}
        >
          {missing}
        </td>
      ) : (
        columns.map((c) => (
          <td
            key={c.currency}
            style={{ ...td, fontWeight: bold ? 700 : 400 }}
            data-testid={`fs-cell-${key}-${c.currency}`}
          >
            {value(c)}
          </td>
        ))
      )}
    </tr>
  )

  const dash = <span style={{ color: theme.textMuted }}>—</span>
  const money = (v: number | null): React.ReactNode => (v === null ? dash : formatNumber(v))
  const signed = (v: number | null, text: string): React.ReactNode =>
    v === null ? dash : <span style={{ color: v < 0 ? theme.danger : theme.success }}>{text}</span>

  // profit needs both; say which one is missing, or both
  const needsForProfit = !model.hasBudget
    ? model.hasCompletion
      ? t('proj.detail.fsNeedsBudget')
      : t('proj.detail.fsNeedsBudgetAndCompletion')
    : t('proj.detail.fsNeedsCompletion')

  return (
    <div
      style={{
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: '10px',
        padding: '16px',
        minWidth: 0,
      }}
      data-testid="financial-summary"
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
          {t('proj.detail.financialSummary')}
        </span>
        {span > 1 && (
          <span style={{ fontSize: '11px', color: theme.textSecondary }}>
            {t('proj.detail.fsHint')}
          </span>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'start' }}>{t('proj.detail.description')}</th>
              {columns.map((c) => (
                <th key={c.currency} style={th} data-testid={`fs-head-${c.currency}`}>
                  {c.currency}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row(
              'budget',
              t('proj.detail.fsBudget'),
              null,
              (c) => money(c.budget),
              !model.hasBudget,
              t('proj.detail.fsNoBudget'),
            )}
            {row(
              'cost',
              t('proj.detail.fsCost'),
              t('proj.detail.fsCostWhat'),
              (c) => formatNumber(c.actual),
              false,
              '',
              true,
            )}
            {row(
              'committed',
              t('proj.detail.fsCommitted'),
              t('proj.detail.fsCommittedWhat'),
              (c) => formatNumber(c.committed),
              false,
              '',
            )}
            {model.hasStore &&
              row(
                'store',
                t('proj.detail.fsStore'),
                null,
                (c) => (c.store > 0 ? formatNumber(c.store) : dash),
                false,
                '',
              )}
            {row(
              'remaining',
              t('proj.detail.fsRemaining'),
              null,
              (c) => signed(c.remaining, formatNumber(c.remaining ?? 0)),
              !model.hasBudget,
              t('proj.detail.fsNeedsBudget'),
            )}
            {row(
              'forecast',
              t('proj.detail.fsForecast'),
              null,
              (c) => money(c.forecast),
              !model.hasCompletion,
              t('proj.detail.fsNeedsCompletion'),
            )}
            {row(
              'profit',
              t('proj.detail.fsProfit'),
              null,
              (c) =>
                signed(
                  c.profit,
                  c.profit === null || c.margin === null
                    ? ''
                    : `${formatNumber(c.profit)} (${c.margin.toFixed(1)}%)`,
                ),
              !model.hasBudget || !model.hasCompletion,
              needsForProfit,
            )}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: '12px', color: theme.textSecondary }}>
        {t('proj.detail.fsNote')}
      </p>
    </div>
  )
}
