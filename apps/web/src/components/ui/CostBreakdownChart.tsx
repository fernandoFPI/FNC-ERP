import { useTheme } from '../../theme/ThemeContext'

export interface CostSegment {
  label: string
  amount: number
  key: string
}

interface Props {
  segments: CostSegment[]
  currency?: string
}

const PALETTE_KEYS = ['accent', 'success', 'warning', 'danger', 'info'] as const

export function CostBreakdownChart({ segments, currency = 'IQD' }: Props) {
  const { theme } = useTheme()
  const total = segments.reduce((s, c) => s + c.amount, 0) || 1

  const palette = [theme.accent, theme.success, theme.warning, theme.danger, theme.info ?? theme.accent]

  // Donut geometry
  const SIZE = 160
  const STROKE = 28
  const R = (SIZE - STROKE) / 2
  const CIRC = 2 * Math.PI * R
  const cx = SIZE / 2
  const cy = SIZE / 2

  let offset = 0

  return (
    <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Donut */}
      <svg width={SIZE} height={SIZE} style={{ flexShrink: 0 }}>
        {/* background track */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={theme.bgSurfaceHover} strokeWidth={STROKE} />

        {segments.map((seg, i) => {
          const pct = seg.amount / total
          const dashLen = CIRC * pct
          const dashGap = CIRC - dashLen
          const rotateOffset = (offset / total) * 360 - 90
          offset += seg.amount
          const color = palette[i % palette.length]

          return (
            <circle
              key={seg.key}
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke={color}
              strokeWidth={STROKE}
              strokeDasharray={`${dashLen} ${dashGap}`}
              strokeDashoffset={0}
              transform={`rotate(${rotateOffset} ${cx} ${cy})`}
              style={{ transition: 'stroke-dasharray 0.4s ease' }}
            />
          )
        })}

        {/* center label */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill={theme.textMuted}>Total</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="13" fontWeight="600" fill={theme.textPrimary}>
          {total.toLocaleString()}
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        {segments.map((seg, i) => {
          const color = palette[i % palette.length]
          const pct = ((seg.amount / total) * 100).toFixed(1)
          return (
            <div key={seg.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '13px', color: theme.textSecondary }}>{seg.label}</span>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>{pct}%</span>
              <span style={{ fontFamily: 'monospace', fontSize: '13px', color: theme.textPrimary, minWidth: '80px', textAlign: 'right' }}>
                {seg.amount.toLocaleString()} {currency}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// suppress unused palette keys warning
void PALETTE_KEYS
