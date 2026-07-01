import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { KPITrendCard } from '../../../components/ui/KPITrendCard'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { EXECUTIVE_DASHBOARD_QUERY } from '../../../graphql/reporting'
import { formatNumber } from '../../../lib/format'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from 'recharts'

interface EntityBreakdown {
  companyId: string
  companyName: string
  revenueThisMonth: number
  costThisMonth: number
  netThisMonth: number
  headcount: number
}

interface RevenueByMonth {
  month: string
  yakam: number
  factory: number
  watanyia: number
}

interface ProjectScatter {
  id: string
  name: string
  budget: number
  marginPct: number
  actualCost: number
  status: string
  client_name: string
}

interface ExecutiveDashboardData {
  executiveDashboard: {
    totalRevenue: number
    totalCosts: number
    netProfit: number
    activeProjects: number
    totalProjectBudget: number
    totalHeadcount: number
    openPOsValue: number
    revenueTrend: { period: string; value: number }[]
    costsTrend: { period: string; value: number }[]
    profitTrend: { period: string; value: number }[]
    entityBreakdown: EntityBreakdown[]
    revenueByEntityMonthly: RevenueByMonth[]
    projectProfitabilityScatter: ProjectScatter[]
  }
}

function computeDelta(trend: { period: string; value: number }[]): { value: string; direction: 'up' | 'down' | 'neutral' } | undefined {
  if (trend.length < 2) return undefined
  const curr = trend[trend.length - 1].value
  const prev = trend[trend.length - 2].value
  if (!prev) return undefined
  const pct = ((curr - prev) / Math.abs(prev)) * 100
  return {
    value: `${Math.abs(pct).toFixed(1)}%`,
    direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'neutral',
  }
}

function prevValue(trend: { period: string; value: number }[], fmt: (v: number) => string): string | undefined {
  if (trend.length < 2) return undefined
  return fmt(trend[trend.length - 2].value)
}

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  completed: '#3b82f6',
  on_hold: '#f59e0b',
  cancelled: '#ef4444',
}

function statusColor(status: string) {
  return STATUS_COLORS[status?.toLowerCase()] ?? '#94a3b8'
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: { payload: ProjectScatter }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: 12,
      minWidth: 160,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    }}>
      <p style={{ color: 'var(--text-primary)', fontWeight: 600, margin: '0 0 4px' }}>{d.name}</p>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 2px' }}>Client: {d.client_name || '—'}</p>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 2px' }}>Budget: {formatNumber(d.budget)}</p>
      <p style={{ color: 'var(--text-muted)', margin: '0 0 2px' }}>Actual: {formatNumber(d.actualCost)}</p>
      <p style={{ color: d.marginPct >= 0 ? '#22c55e' : '#ef4444', margin: 0, fontWeight: 500 }}>
        Margin: {d.marginPct.toFixed(1)}%
      </p>
    </div>
  )
}

export default function ExecutiveDashboard() {
  const { theme } = useTheme()
  const { data, loading, refetch } = useQuery<ExecutiveDashboardData>(EXECUTIVE_DASHBOARD_QUERY)

  const d = data?.executiveDashboard

  const scatterData = (d?.projectProfitabilityScatter ?? []).map(p => ({
    ...p,
    x: Math.round(p.budget / 1000),
    y: parseFloat(p.marginPct.toFixed(2)),
  }))

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Executive Dashboard"
        subtitle="Consolidated group performance overview"
        actions={
          <Button variant="ghost" size="sm" onClick={() => { refetch() }}>
            Refresh
          </Button>
        }
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <KPITrendCard
          label="Total Revenue"
          value={d ? `$${(d.totalRevenue / 1000000).toFixed(2)}M` : '—'}
          trendData={d?.revenueTrend ?? []}
          delta={computeDelta(d?.revenueTrend ?? [])}
          previousValue={prevValue(d?.revenueTrend ?? [], v => `$${(v / 1000000).toFixed(2)}M`)}
        />
        <KPITrendCard
          label="Total Costs"
          value={d ? `$${(d.totalCosts / 1000000).toFixed(2)}M` : '—'}
          trendData={d?.costsTrend ?? []}
          delta={computeDelta(d?.costsTrend ?? [])}
          previousValue={prevValue(d?.costsTrend ?? [], v => `$${(v / 1000000).toFixed(2)}M`)}
        />
        <KPITrendCard
          label="Net Profit"
          value={d ? `$${(d.netProfit / 1000000).toFixed(2)}M` : '—'}
          trendData={d?.profitTrend ?? []}
          delta={computeDelta(d?.profitTrend ?? [])}
          previousValue={prevValue(d?.profitTrend ?? [], v => `$${(v / 1000000).toFixed(2)}M`)}
        />
        <KPITrendCard
          label="Active Projects"
          value={d ? String(d.activeProjects) : '—'}
          trendData={[]}
        />
        <KPITrendCard
          label="Total Headcount"
          value={d ? String(d.totalHeadcount) : '—'}
          trendData={[]}
          sparkline={false}
        />
        <KPITrendCard
          label="Open POs Value"
          value={d ? `$${(d.openPOsValue / 1000000).toFixed(2)}M` : '—'}
          trendData={[]}
          sparkline={false}
        />
      </div>

      {/* Entity Breakdown — 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: '120px', borderRadius: '10px' }} />
          ))
        ) : d?.entityBreakdown.length ? (
          d.entityBreakdown.map((entity) => (
            <Card key={entity.companyId} padding="md">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: theme.textPrimary }}>{entity.companyName}</span>
                <Badge variant={entity.netThisMonth >= 0 ? 'success' : 'danger'} size="sm">
                  {entity.netThisMonth >= 0 ? '+' : ''}{(entity.netThisMonth / 1000).toFixed(0)}K
                </Badge>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                <div>
                  <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Revenue</p>
                  <AmountDisplay amount={entity.revenueThisMonth} currency="USD" size="sm" />
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Costs</p>
                  <AmountDisplay amount={entity.costThisMonth} currency="USD" size="sm" />
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Staff</p>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: theme.textSecondary }}>{entity.headcount}</span>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <div style={{ gridColumn: '1 / -1' }}>
            <EmptyState message="No entity data" />
          </div>
        )}
      </div>

      {/* Revenue by Entity + Profit Trend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Revenue Stacked Bar Chart */}
        <Card padding="md">
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Revenue by Entity (Monthly)</h3>
          {loading ? (
            <div className="skeleton" style={{ height: '200px', borderRadius: '8px' }} />
          ) : d?.revenueByEntityMonthly.length ? (
            <div className="no-theme-transition">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={d.revenueByEntityMonthly} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: theme.textMuted }} />
                <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} />
                <Tooltip
                  contentStyle={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', color: theme.textMuted }} />
                <Bar dataKey="yakam" stackId="a" fill={theme.accent} name="Yakam" />
                <Bar dataKey="factory" stackId="a" fill={theme.info} name="Factory" />
                <Bar dataKey="watanyia" stackId="a" fill={theme.success} name="Watanyia" />
              </BarChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState message="No chart data" />
          )}
        </Card>

        {/* Profit Trend Line Chart */}
        <Card padding="md">
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Profit Trend</h3>
          {loading ? (
            <div className="skeleton" style={{ height: '200px', borderRadius: '8px' }} />
          ) : d?.profitTrend.length ? (
            <div className="no-theme-transition">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={d.profitTrend} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: theme.textMuted }} />
                <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} />
                <Tooltip
                  contentStyle={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="value" stroke={theme.accent} strokeWidth={2} dot={false} name="Profit" />
              </LineChart>
            </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState message="No trend data" />
          )}
        </Card>
      </div>

      {/* Project Profitability Scatter */}
      <Card padding="md" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Project Profitability</h3>
        {loading ? (
          <div className="skeleton" style={{ height: '280px', borderRadius: '8px' }} />
        ) : scatterData.length ? (
          <div className="no-theme-transition">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
              <XAxis
                type="number"
                dataKey="x"
                name="Budget ($K)"
                tick={{ fontSize: 11, fill: theme.textMuted }}
                label={{ value: 'Budget ($K)', position: 'insideBottom', offset: -15, fontSize: 11, fill: theme.textMuted }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Margin %"
                tick={{ fontSize: 11, fill: theme.textMuted }}
                label={{ value: 'Margin %', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: theme.textMuted }}
              />
              <ZAxis range={[40, 200]} />
              <Tooltip content={(props) => <ScatterTooltip active={props.active} payload={props.payload as { payload: ProjectScatter }[]} />} />
              <Scatter data={scatterData} fill={theme.accent}>
                {scatterData.map((entry, index) => (
                  <Cell key={index} fill={statusColor(entry.status)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState message="No project data" />
        )}

        {/* Legend */}
        {scatterData.length > 0 && (
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', flexWrap: 'wrap' }}>
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: theme.textMuted, textTransform: 'capitalize' }}>{status.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
