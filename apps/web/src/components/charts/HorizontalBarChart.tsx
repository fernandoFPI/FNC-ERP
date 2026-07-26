import { useTheme } from '../../theme/ThemeContext'

interface HBarItem {
  label: string
  value: number
  max?: number
}

interface HorizontalBarChartProps {
  data: HBarItem[]
  height?: number
  className?: string
  formatValue?: (v: number) => string
}

export function HorizontalBarChart({
  data,
  height = 260,
  className = '',
  formatValue,
}: HorizontalBarChartProps) {
  const { theme } = useTheme()
  const max = Math.max(...data.map((d) => d.max ?? d.value), 1)

  return (
    <div className={className} style={{ height, overflowY: 'auto' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>
        {data.map((item, idx) => {
          const pct = Math.min((item.value / max) * 100, 100)
          return (
            <div key={idx}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}
              >
                <span style={{ fontSize: '12px', color: theme.textSecondary }}>{item.label}</span>
                <span style={{ fontSize: '12px', fontWeight: 500, color: theme.textPrimary }}>
                  {formatValue ? formatValue(item.value) : item.value.toLocaleString()}
                </span>
              </div>
              <div
                style={{
                  height: '6px',
                  borderRadius: '3px',
                  background: theme.hbarTrack,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${pct}%`,
                    borderRadius: '3px',
                    background: `linear-gradient(90deg, ${theme.barGradStart}, ${theme.barGradEnd})`,
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
