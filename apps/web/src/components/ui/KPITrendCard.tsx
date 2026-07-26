import { useTheme } from '../../theme/ThemeContext'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

interface KPITrendCardProps {
  label: string
  value: string
  previousValue?: string
  trendData: { period: string; value: number }[]
  currency?: string
  delta?: { value: string; direction: 'up' | 'down' | 'neutral' }
  sparkline?: boolean
}

export function KPITrendCard({
  label,
  value,
  previousValue,
  trendData,
  currency,
  delta,
  sparkline = true,
}: KPITrendCardProps) {
  const { theme } = useTheme()

  const deltaColor =
    delta?.direction === 'up'
      ? theme.success
      : delta?.direction === 'down'
        ? theme.danger
        : theme.textMuted

  const deltaArrow = delta?.direction === 'up' ? '▲' : delta?.direction === 'down' ? '▼' : '—'

  return (
    <div
      style={{
        background: theme.bgSurface,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 160,
        height: 120,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <span
        style={{
          color: theme.textMuted,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </span>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ color: theme.textPrimary, fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>
          {value}
        </span>
        {currency && <span style={{ color: theme.textMuted, fontSize: 12 }}>{currency}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {delta && (
          <span style={{ color: deltaColor, fontSize: 12, fontWeight: 600 }}>
            {deltaArrow} {delta.value}
          </span>
        )}
        {previousValue && (
          <span style={{ color: theme.textMuted, fontSize: 11 }}>vs {previousValue}</span>
        )}
      </div>

      {sparkline && trendData.length > 1 && (
        <div
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, opacity: 0.7 }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Tooltip
                contentStyle={{
                  background: theme.bgSurface,
                  border: `1px solid ${theme.border}`,
                  fontSize: 11,
                  padding: '2px 6px',
                }}
                formatter={(v: number) => [v, label]}
                labelFormatter={(l: string) => l}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={theme.accent}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
