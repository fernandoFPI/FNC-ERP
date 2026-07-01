import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
import { PAYROLL_COST_REPORT_QUERY } from '../../../graphql/reporting'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface PayrollRow {
  companyName: string
  costCenter: string
  period: string
  headcount: number
  totalGross: number
  totalNet: number
  totalIQD: number
}

interface ByCurrency {
  currency: string
  amount: number
  fxRate: number
  iqdEquivalent: number
}

interface MonthlyTrend {
  month: string
  yakam: number
  factory: number
  watanyia: number
}

interface PayrollCostData {
  payrollCostReport: {
    rows: PayrollRow[]
    totalHeadcount: number
    totalGross: number
    totalNet: number
    totalEmployerCost: number
    avgCostPerEmployee: number
    byCurrency: ByCurrency[]
    monthlyTrend: MonthlyTrend[]
  }
}

export default function PayrollCostReport() {
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(today)
  const [search, setSearch] = useState('')

  const { data, loading, refetch } = useQuery<PayrollCostData>(PAYROLL_COST_REPORT_QUERY, {
    variables: { fromDate, toDate },
  })

  const d = data?.payrollCostReport
  const rows = (d?.rows ?? []).filter(r =>
    !search || r.companyName.toLowerCase().includes(search.toLowerCase()) || r.costCenter.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Payroll Cost Report"
        subtitle="Employee cost analysis by entity and cost center"
        actions={
          <Button variant="ghost" size="sm" onClick={() => { refetch() }}>Refresh</Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Search company or cost center…' }}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onExport={() => undefined}
          resultCount={rows.length}
        />
      </Card>

      {/* Summary KPIs */}
      {d && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Headcount</p>
            <p style={{ fontSize: '22px', fontWeight: 500, color: theme.textPrimary }}>{d.totalHeadcount}</p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Gross</p>
            <AmountDisplay amount={d.totalGross} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Net</p>
            <AmountDisplay amount={d.totalNet} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Employer Cost</p>
            <AmountDisplay amount={d.totalEmployerCost} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Avg / Employee</p>
            <AmountDisplay amount={d.avgCostPerEmployee} currency="IQD" size="md" />
          </Card>
        </div>
      )}

      {/* Monthly Trend Chart */}
      {d?.monthlyTrend.length ? (
        <Card padding="md" style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Monthly Payroll Cost by Entity</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: theme.textMuted }} />
              <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} />
              <Tooltip contentStyle={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '11px', color: theme.textMuted }} />
              <Bar dataKey="yakam" fill={theme.accent} name="Yakam" />
              <Bar dataKey="factory" fill={theme.info} name="Factory" />
              <Bar dataKey="watanyia" fill={theme.success} name="Watanyia" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      ) : null}

      {/* Table */}
      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: '40px', borderRadius: '6px', marginBottom: '8px' }} />
            ))}
          </div>
        ) : rows.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {['Company', 'Cost Center', 'Period', 'Headcount', 'Total Gross', 'Total Net', 'IQD Equiv.'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: i >= 3 ? 'right' : 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = theme.tableRowHover }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '12px 14px', color: theme.textPrimary, fontWeight: 500 }}>{row.companyName}</td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>{row.costCenter}</td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>{row.period}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: theme.textSecondary }}>{row.headcount}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AmountDisplay amount={row.totalGross} currency="IQD" size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AmountDisplay amount={row.totalNet} currency="IQD" size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AmountDisplay amount={row.totalIQD} currency="IQD" size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No payroll data" message="Adjust the date range to load payroll cost data." />
        )}
      </Card>
    </div>
  )
}
