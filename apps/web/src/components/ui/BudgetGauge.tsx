import { useTheme } from '../../theme/ThemeContext'
import { AmountDisplay } from './AmountDisplay'

interface Props {
  budget: number
  spent: number
  committed?: number
  currency?: string
}

export function BudgetGauge({ budget, spent, committed = 0, currency = 'IQD' }: Props) {
  const { theme } = useTheme()
  const total = budget || 1
  const spentPct = Math.min((spent / total) * 100, 100)
  const committedPct = Math.min(((spent + committed) / total) * 100, 100)
  const overBudget = spent > budget

  const barColor = overBudget ? theme.danger : spentPct > 80 ? theme.warning : theme.success
  const committedColor = theme.warning

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '6px',
          fontSize: '12px',
        }}
      >
        <span style={{ color: theme.textSecondary }}>Budget consumption</span>
        <span style={{ color: overBudget ? theme.danger : theme.textPrimary, fontWeight: 600 }}>
          {spentPct.toFixed(1)}%
        </span>
      </div>

      <div
        style={{
          height: '12px',
          background: theme.bgSurfaceHover,
          borderRadius: '6px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* committed overlay */}
        {committedPct > spentPct && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: `${committedPct}%`,
              height: '100%',
              background: committedColor,
              opacity: 0.3,
            }}
          />
        )}
        {/* spent bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${spentPct}%`,
            height: '100%',
            background: barColor,
            borderRadius: '6px',
            transition: 'width 0.4s ease',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '6px',
          fontSize: '11px',
          color: theme.textMuted,
        }}
      >
        <span>
          Spent: <AmountDisplay amount={spent} currency={currency} size="sm" />
        </span>
        {committed > 0 && (
          <span style={{ color: committedColor }}>
            Committed: <AmountDisplay amount={committed} currency={currency} size="sm" />
          </span>
        )}
        <span>
          Budget: <AmountDisplay amount={budget} currency={currency} size="sm" />
        </span>
      </div>
    </div>
  )
}
