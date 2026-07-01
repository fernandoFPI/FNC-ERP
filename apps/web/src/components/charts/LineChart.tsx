import {
  LineChart as ReLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useTheme } from '../../theme/ThemeContext'

interface LineChartProps {
  data: Record<string, unknown>[]
  xKey: string
  lines: { key: string; label: string; color?: string }[]
  height?: number
  className?: string
}

export function LineChart({ data, xKey, lines, height = 260, className = '' }: LineChartProps) {
  const { theme } = useTheme()

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ReLineChart data={data}>
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
          />
          {lines.length > 1 && <Legend wrapperStyle={{ fontSize: '12px', color: theme.textSecondary }} />}
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.label}
              stroke={line.color ?? theme.barGradStart}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: line.color ?? theme.barGradStart }}
            />
          ))}
        </ReLineChart>
      </ResponsiveContainer>
    </div>
  )
}
