import { useTheme } from '../../../theme/ThemeContext'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'

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

export function MOCostAnalysis({ analysis, qtyPlanned, qtyProduced }: Props) {
  const { theme } = useTheme()

  const { plannedCost, actualCost, variance, variancePct, componentBreakdown } = analysis
  const overBudget    = variance > 0
  const maxBar        = Math.max(plannedCost, actualCost, 1)
  const unitPlanned   = qtyPlanned  > 0 ? plannedCost / qtyPlanned  : 0
  const unitActual    = qtyProduced > 0 ? actualCost  / qtyProduced : 0
  const unitVariance  = unitActual - unitPlanned
  const totalBreakdown = componentBreakdown.reduce((s, c) => s + c.amount, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '700px' }}>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Planned Cost',      value: plannedCost,   currency: true, color: theme.textPrimary },
          { label: 'Actual Cost',       value: actualCost,    currency: true, color: overBudget ? theme.danger : theme.success },
          { label: 'Unit Cost (plan)',  value: unitPlanned,   currency: true, color: theme.textPrimary },
          { label: 'Unit Cost (actual)',value: unitActual,    currency: true, color: unitVariance > 0 ? theme.danger : theme.success },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '14px 16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, marginBottom: '6px' }}>
              {label}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color, fontFamily: 'monospace' }}>
              {value.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 400, color: theme.textMuted }}>IQD</span>
            </div>
          </div>
        ))}
      </div>

      {/* Planned vs Actual bar comparison */}
      <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '20px' }}>
        <div style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary, marginBottom: '16px' }}>
          Planned vs Actual
        </div>
        {[
          { label: 'Planned', value: plannedCost, color: theme.accent },
          { label: 'Actual',  value: actualCost,  color: overBudget ? theme.danger : theme.success },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textMuted, marginBottom: '6px' }}>
              <span>{label}</span>
              <span style={{ fontFamily: 'monospace', color }}>{value.toLocaleString()} IQD</span>
            </div>
            <div style={{ height: '10px', background: theme.border, borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min((value / maxBar) * 100, 100)}%`,
                background: color,
                borderRadius: '999px',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        ))}

        <div style={{
          marginTop: '12px', padding: '8px 12px', borderRadius: '6px',
          background: overBudget ? '#ef444411' : '#22c55e11',
          border: `1px solid ${overBudget ? '#ef444433' : '#22c55e33'}`,
          fontSize: '13px', fontWeight: 600,
          color: overBudget ? theme.danger : theme.success,
        }}>
          {overBudget ? '▲' : '▼'} {Math.abs(variancePct).toFixed(1)}% variance
          {' · '}
          {overBudget ? '+' : ''}{variance.toLocaleString()} IQD {overBudget ? 'over' : 'under'} budget
        </div>
      </div>

      {/* Component breakdown */}
      {componentBreakdown.length > 0 && (
        <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '20px' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary, marginBottom: '16px' }}>
            Component Breakdown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {componentBreakdown.map(c => {
              const pct = totalBreakdown > 0 ? (c.amount / totalBreakdown) * 100 : 0
              return (
                <div key={c.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: theme.textPrimary }}>{c.label}</span>
                    <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
                      {c.amount.toLocaleString()} IQD · {pct.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: '6px', background: theme.border, borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: theme.accent, borderRadius: '999px' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Unit cost comparison */}
      <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '20px' }}>
        <div style={{ fontWeight: 600, fontSize: '13px', color: theme.textPrimary, marginBottom: '12px' }}>
          Unit Cost Detail
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr>
              {['', 'Planned', 'Actual', 'Difference'].map(h => (
                <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', borderBottom: `1px solid ${theme.border}` }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '10px 12px', color: theme.textMuted }}>Total Cost</td>
              <td style={{ padding: '10px 12px' }}><AmountDisplay amount={plannedCost} currency="IQD" size="sm" /></td>
              <td style={{ padding: '10px 12px' }}><AmountDisplay amount={actualCost} currency="IQD" size="sm" /></td>
              <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: overBudget ? theme.danger : theme.success }}>
                {variance >= 0 ? '+' : ''}{variance.toLocaleString()} IQD
              </td>
            </tr>
            <tr style={{ background: theme.bgCanvas }}>
              <td style={{ padding: '10px 12px', color: theme.textMuted }}>Unit Cost</td>
              <td style={{ padding: '10px 12px' }}><AmountDisplay amount={unitPlanned} currency="IQD" size="sm" /></td>
              <td style={{ padding: '10px 12px' }}><AmountDisplay amount={unitActual} currency="IQD" size="sm" /></td>
              <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: unitVariance > 0 ? theme.danger : theme.success }}>
                {unitVariance >= 0 ? '+' : ''}{unitVariance.toFixed(2)} IQD
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
