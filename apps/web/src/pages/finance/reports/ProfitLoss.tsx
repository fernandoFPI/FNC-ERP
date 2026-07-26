import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { PROFIT_LOSS_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { BarChart } from '../../../components/charts/BarChart'

interface PLLine {
  account_id: string
  code: string
  name: string
  amount: string
}

export default function ProfitLoss() {
  const { theme } = useTheme()
  const now = new Date()
  const firstOfYear = `${now.getFullYear()}-01-01`
  const today = now.toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(firstOfYear)
  const [toDate, setToDate] = useState(today)
  const [queried, setQueried] = useState(false)

  const { data, loading, refetch } = useQuery(PROFIT_LOSS_QUERY, {
    variables: { fromDate, toDate },
    skip: !queried,
    fetchPolicy: 'network-only',
  })

  const report = data?.profitLoss
  const revenue: PLLine[] = report?.revenue ?? []
  const expenses: PLLine[] = report?.expenses ?? []

  function run() {
    if (queried) refetch()
    else setQueried(true)
  }

  const chartData = report
    ? [
        { label: 'Revenue', value: parseFloat(report.totalRevenue) },
        { label: 'Expenses', value: parseFloat(report.totalExpenses) },
        { label: 'Net Profit', value: parseFloat(report.netProfit) },
      ]
    : []

  function ReportSection({
    title,
    lines,
    color,
  }: {
    title: string
    lines: PLLine[]
    color: string
  }) {
    const total = lines.reduce((s, l) => s + parseFloat(l.amount || '0'), 0)
    return (
      <div>
        <div
          style={{
            fontWeight: 600,
            color: theme.textPrimary,
            fontSize: '14px',
            marginBottom: '8px',
            borderBottom: `1px solid ${theme.border}`,
            paddingBottom: '6px',
          }}
        >
          {title}
        </div>
        {lines.map((l) => (
          <div
            key={l.account_id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 0',
              borderBottom: `1px solid ${theme.border}`,
            }}
          >
            <div>
              <span
                style={{
                  fontFamily: 'monospace',
                  color: theme.textMuted,
                  fontSize: '12px',
                  marginRight: '8px',
                }}
              >
                {l.code}
              </span>
              <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{l.name}</span>
            </div>
            <span style={{ fontFamily: 'monospace', color, fontSize: '13px', fontWeight: 500 }}>
              {parseFloat(l.amount).toLocaleString()}
            </span>
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '8px 0',
            fontWeight: 700,
          }}
        >
          <span style={{ color: theme.textPrimary }}>Total {title}</span>
          <span style={{ fontFamily: 'monospace', color }}>{total.toLocaleString()}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader title="Profit & Loss" subtitle="Income statement" />

      <Card style={{ marginTop: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', padding: '16px', alignItems: 'flex-end' }}>
          <Input
            label="From Date"
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
            }}
          />
          <Input
            label="To Date"
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
            }}
          />
          <Button variant="primary" onClick={run} loading={loading}>
            Run Report
          </Button>
        </div>
      </Card>

      {report && (
        <>
          {chartData.length > 0 && (
            <Card style={{ marginBottom: '16px', padding: '16px' }}>
              <BarChart
                data={chartData.map((d) => ({ label: d.label, value: d.value, target: 0 }))}
                xKey="label"
                bars={[{ key: 'value', label: 'Amount' }]}
                height={200}
              />
            </Card>
          )}

          <Card style={{ padding: '24px' }}>
            <ReportSection title="Revenue" lines={revenue} color={theme.success} />
            <div style={{ marginTop: '20px' }}>
              <ReportSection title="Expenses" lines={expenses} color={theme.danger} />
            </div>
            <div
              style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: `2px solid ${theme.border}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '16px',
                  fontWeight: 700,
                }}
              >
                <span style={{ color: theme.textPrimary }}>Net Profit</span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    color: parseFloat(report.netProfit) >= 0 ? theme.success : theme.danger,
                  }}
                >
                  {parseFloat(report.netProfit).toLocaleString()}
                </span>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
