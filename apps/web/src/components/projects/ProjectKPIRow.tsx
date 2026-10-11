import { useTranslation } from 'react-i18next'
import React from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { formatCurrency } from '../../lib/format'

interface Props {
  projectValue: number
  budgetAmount: number
  currencyCode: string
  overallCompletionPct: number
  teamCount: number
  openPoCount: number
  costSummary?: { actualCosts?: number; committedCosts?: number; budgetRemaining?: number } | null
  showFinance?: boolean
}

export function ProjectKPIRow({
  projectValue,
  budgetAmount,
  currencyCode,
  overallCompletionPct,
  teamCount,
  openPoCount,
  costSummary,
  showFinance = true,
}: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const actual = costSummary?.actualCosts ?? 0
  const committed = costSummary?.committedCosts ?? 0
  const remaining = costSummary?.budgetRemaining ?? budgetAmount - actual - committed
  const overBudget = remaining < 0

  const financeKpis = showFinance
    ? [
        {
          label: t('proj.kpi.projectValue'),
          value: formatCurrency(projectValue, currencyCode),
          color: theme.accent,
        },
        {
          label: t('proj.kpi.budgetRemaining'),
          value: formatCurrency(Math.abs(remaining), currencyCode),
          sub: overBudget ? t('proj.kpi.overBudget') : `of ${formatCurrency(budgetAmount, currencyCode)}`,
          color: overBudget ? '#ef4444' : '#22c55e',
        },
      ]
    : []

  const kpis = [
    ...financeKpis,
    {
      label: t('proj.kpi.completion'),
      value: `${overallCompletionPct}%`,
      sub: t('proj.kpi.overallProgress'),
      color: theme.accent,
    },
    {
      label: t('proj.kpi.teamOpenPos'),
      value: `${teamCount} / ${openPoCount}`,
      sub: t('proj.kpi.membersPurchaseOrders'),
      color: openPoCount > 0 ? '#f59e0b' : theme.textPrimary,
    },
  ]

  const cols = kpis.length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '12px' }}>
      {kpis.map((k) => (
        <div
          key={k.label}
          style={{
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: theme.textMuted,
              marginBottom: '6px',
            }}
          >
            {k.label}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: k.color }}>{k.value}</div>
          {k.sub && (
            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
              {k.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
