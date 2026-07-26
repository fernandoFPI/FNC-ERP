import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useTheme } from '../../theme/ThemeContext'

interface BarChartProps {
  data: Record<string, unknown>[]
  xKey: string
  bars: { key: string; label: string }[]
  height?: number
  className?: string
}

export function BarChart({ data, xKey, bars, height = 260, className = '' }: BarChartProps) {
  const { theme } = useTheme()

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ReBarChart data={data} barCategoryGap="30%">
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.barGradStart} />
              <stop offset="100%" stopColor={theme.barGradEnd} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={theme.tableBorder} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: theme.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: theme.textMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: theme.bgSurface,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              color: theme.textPrimary,
              fontSize: '12px',
            }}
            cursor={{ fill: theme.tableRowHover }}
          />
          {bars.length > 1 && (
            <Legend wrapperStyle={{ fontSize: '12px', color: theme.textSecondary }} />
          )}
          {bars.map((bar, i) => (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.label}
              radius={[4, 4, 0, 0]}
              fill={i === 0 ? 'url(#barGrad)' : theme.barGradEnd}
            />
          ))}
        </ReBarChart>
      </ResponsiveContainer>
    </div>
  )
}
