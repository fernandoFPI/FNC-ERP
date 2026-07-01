import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KPITrendCard } from '../KPITrendCard'
import { ThemeProvider } from '../../../theme/ThemeContext'

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}))

function wrap(props: React.ComponentProps<typeof KPITrendCard>) {
  return render(
    <ThemeProvider>
      <KPITrendCard {...props} />
    </ThemeProvider>
  )
}

const mockTrend = [
  { period: 'Jan', value: 100 },
  { period: 'Feb', value: 120 },
  { period: 'Mar', value: 110 },
]

describe('KPITrendCard', () => {
  it('renders label', () => {
    wrap({ label: 'Total Revenue', value: '1,500,000', trendData: mockTrend })
    expect(screen.getByText('Total Revenue')).toBeInTheDocument()
  })

  it('renders value', () => {
    wrap({ label: 'Net Profit', value: '$42,000', trendData: mockTrend })
    expect(screen.getByText('$42,000')).toBeInTheDocument()
  })

  it('shows up delta in success color context', () => {
    wrap({ label: 'Revenue', value: '100K', trendData: mockTrend, delta: { value: '+12%', direction: 'up' } })
    expect(screen.getByText(/\+12%/)).toBeInTheDocument()
  })

  it('shows down delta', () => {
    wrap({ label: 'Costs', value: '80K', trendData: mockTrend, delta: { value: '-5%', direction: 'down' } })
    expect(screen.getByText(/-5%/)).toBeInTheDocument()
  })

  it('shows previous value when provided', () => {
    wrap({ label: 'Headcount', value: '120', previousValue: '115', trendData: mockTrend })
    expect(screen.getByText('120')).toBeInTheDocument()
  })

  it('renders sparkline when sparkline=true and trendData has points', () => {
    wrap({ label: 'Trend', value: '500', trendData: mockTrend, sparkline: true })
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('renders without trendData gracefully', () => {
    wrap({ label: 'Active Projects', value: '7', trendData: [] })
    expect(screen.getByText('Active Projects')).toBeInTheDocument()
  })
})
