import { useTranslation } from 'react-i18next'
import { useTheme } from '../../../theme/ThemeContext'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface ComponentBreakdown {
  key: string
  label: string
  amount: number
}

interface CostAnalysis {
  plannedCost: number
  actualCost: number
  variance: number
  variancePct: number
  componentBreakdown: ComponentBreakdown[]
}

interface Props {
  analysis: CostAnalysis
  qtyPlanned: number
  qtyProduced: number
}

interface UnitCostRow {
  key: string
  label: string
  plannedAmount: number
  actualAmount: number
  diffText: string
  diffColor: string
  rowBg?: string
}

export function MOCostAnalysis({ analysis, qtyPlanned, qtyProduced }: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const { plannedCost, actualCost, variance, variancePct, componentBreakdown } = analysis
  const overBudget = variance > 0
  const maxBar = Math.max(plannedCost, actualCost, 1)
  const unitPlanned = qtyPlanned > 0 ? plannedCost / qtyPlanned : 0
  const unitActual = qtyProduced > 0 ? actualCost / qtyProduced : 0
  const unitVariance = unitActual - unitPlanned
  const totalBreakdown = componentBreakdown.reduce((s, c) => s + c.amount, 0)

  const unitCostRows: UnitCostRow[] = [
    {
      key: 'total',
      label: t('mfg.moCost.totalCost'),
      plannedAmount: plannedCost,
      actualAmount: actualCost,
      diffText: `${variance >= 0 ? '+' : ''}${variance.toLocaleString()} IQD`,
      diffColor: overBudget ? theme.danger : theme.success,
    },
    {
      key: 'unit',
      label: t('mfg.moCost.unitCost'),
      plannedAmount: unitPlanned,
      actualAmount: unitActual,
      diffText: `${unitVariance >= 0 ? '+' : ''}${unitVariance.toFixed(2)} IQD`,
      diffColor: unitVariance > 0 ? theme.danger : theme.success,
      rowBg: theme.bgCanvas,
    },
  ]

  const unitCostColumns: Column<UnitCostRow>[] = [
    {
      key: 'label',
      header: '',
      mobilePrimary: true,
      render: (r) => <span style={{ color: theme.textMuted }}>{r.label}</span>,
    },
    {
      key: 'planned',
      header: t('mfg.moCost.planned'),
      mobilePriority: 1,
      render: (r) => <AmountDisplay amount={r.plannedAmount} currency="IQD" size="sm" />,
    },
    {
      key: 'actual',
      header: t('mfg.moCost.actual'),
      mobilePriority: 2,
      render: (r) => <AmountDisplay amount={r.actualAmount} currency="IQD" size="sm" />,
    },
    {
      key: 'difference',
      header: t('mfg.moCost.difference'),
      mobilePriority: 3,
      render: (r) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: r.diffColor }}>
          {r.diffText}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '700px' }}>
      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
        }}
      >
        {[
          { label: t('mfg.moCost.plannedCost'), value: plannedCost, currency: true, color: theme.textPrimary },
          {
            label: t('mfg.moCost.actualCost'),
            value: actualCost,
            currency: true,
            color: overBudget ? theme.danger : theme.success,
          },
          {
            label: t('mfg.moCost.unitCostPlan'),
            value: unitPlanned,
            currency: true,
            color: theme.textPrimary,
          },
          {
            label: t('mfg.moCost.unitCostActual'),
            value: unitActual,
            currency: true,
            color: unitVariance > 0 ? theme.danger : theme.success,
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
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
              {label}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color, fontFamily: 'monospace' }}>
              {value.toLocaleString()}{' '}
              <span style={{ fontSize: '11px', fontWeight: 400, color: theme.textMuted }}>IQD</span>
            </div>
          </div>
        ))}
      </div>

      {/* Planned vs Actual bar comparison */}
      <div
        style={{
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          borderRadius: '10px',
          padding: '20px',
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: '13px',
            color: theme.textPrimary,
            marginBottom: '16px',
          }}
        >
          {t('mfg.moCost.plannedVsActual')}
        </div>
        {[
          { label: t('mfg.moCost.planned'), value: plannedCost, color: theme.accent },
          { label: t('mfg.moCost.actual'), value: actualCost, color: overBudget ? theme.danger : theme.success },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ marginBottom: '14px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: theme.textMuted,
                marginBottom: '6px',
              }}
            >
              <span>{label}</span>
              <span style={{ fontFamily: 'monospace', color }}>{t('mfg.moCost.iqd', { value: value.toLocaleString() })}</span>
            </div>
            <div
              style={{
                height: '10px',
                background: theme.border,
                borderRadius: '999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min((value / maxBar) * 100, 100)}%`,
                  background: color,
                  borderRadius: '999px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        ))}

        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            borderRadius: '6px',
            background: overBudget ? '#ef444411' : '#22c55e11',
            border: `1px solid ${overBudget ? '#ef444433' : '#22c55e33'}`,
            fontSize: '13px',
            fontWeight: 600,
            color: overBudget ? theme.danger : theme.success,
          }}
        >{t(overBudget ? 'mfg.moCost.varianceIqdOverBudget' : 'mfg.moCost.varianceIqdUnderBudget', { arrow: overBudget ? '▲' : '▼', pct: Math.abs(variancePct).toFixed(1), sign: overBudget ? '+' : '', variance: variance.toLocaleString() })}</div>
      </div>

      {/* Component breakdown */}
      {componentBreakdown.length > 0 && (
        <div
          style={{
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            padding: '20px',
          }}
        >
          <div
            style={{
              fontWeight: 600,
              fontSize: '13px',
              color: theme.textPrimary,
              marginBottom: '16px',
            }}
          >
            {t('mfg.moCost.componentBreakdown')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {componentBreakdown.map((c) => {
              const pct = totalBreakdown > 0 ? (c.amount / totalBreakdown) * 100 : 0
              return (
                <div key={c.key}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '12px',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ color: theme.textPrimary }}>{c.label}</span>
                    <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{t('mfg.moCost.iqd2', { amount: c.amount.toLocaleString(), pct: pct.toFixed(1) })}</span>
                  </div>
                  <div
                    style={{
                      height: '6px',
                      background: theme.border,
                      borderRadius: '999px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: theme.accent,
                        borderRadius: '999px',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Unit cost comparison */}
      <div
        style={{
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          borderRadius: '10px',
          padding: '20px',
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: '13px',
            color: theme.textPrimary,
            marginBottom: '12px',
          }}
        >
          {t('mfg.moCost.unitCostDetail')}
        </div>
        <Table
          columns={unitCostColumns}
          data={unitCostRows}
          rowKey="key"
          getRowStyle={(r) => (r.rowBg ? { background: r.rowBg } : {})}
        />
      </div>
    </div>
  )
}
