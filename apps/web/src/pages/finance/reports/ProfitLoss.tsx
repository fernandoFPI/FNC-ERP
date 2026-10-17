import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { PROFIT_LOSS_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { BarChart } from '../../../components/charts/BarChart'
import { TabBar } from '../../../components/ui/TabBar'
import type { ProfitLossQuery, ProfitLossQueryVariables } from '../../../graphql/generated'

interface PLLine {
  account_id: string
  code: string
  name: string
  currency_code: string
  amount: string
}

export default function ProfitLoss() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const now = new Date()
  const firstOfYear = `${now.getFullYear()}-01-01`
  const today = now.toISOString().split('T')[0]
  const [fromDate, setFromDate] = useState(firstOfYear)
  const [toDate, setToDate] = useState(today)
  const [queried, setQueried] = useState(false)
  const [currency, setCurrency] = useState<string | null>(null)

  const { data, loading, refetch } = useQuery<ProfitLossQuery, ProfitLossQueryVariables>(PROFIT_LOSS_QUERY, {
    variables: { fromDate, toDate },
    skip: !queried,
    fetchPolicy: 'network-only',
  })

  const report = data?.profitLoss
  const allRevenue: PLLine[] = report?.revenue ?? []
  const allExpenses: PLLine[] = report?.expenses ?? []
  // Never blended across currencies (no currency exchange anywhere) — a
  // selector picks which currency's figures are shown.
  const currencies = [
    ...new Set([...allRevenue, ...allExpenses].map((l) => l.currency_code)),
  ].sort()
  const activeCurrency = currency ?? currencies[0] ?? 'IQD'
  const revenue = allRevenue.filter((l) => l.currency_code === activeCurrency)
  const expenses = allExpenses.filter((l) => l.currency_code === activeCurrency)
  const totalRevenueForCurrency = parseFloat(
    report?.totalRevenue.find((c) => c.currency_code === activeCurrency)?.amount ?? '0',
  )
  const totalExpensesForCurrency = parseFloat(
    report?.totalExpenses.find((c) => c.currency_code === activeCurrency)?.amount ?? '0',
  )
  const netProfitForCurrency = parseFloat(
    report?.netProfit.find((c) => c.currency_code === activeCurrency)?.amount ?? '0',
  )

  function run() {
    if (queried) void refetch()
    else setQueried(true)
  }

  const chartData = report
    ? [
        { label: t('fin.pl.revenue'), value: totalRevenueForCurrency },
        { label: t('fin.pl.expenses'), value: totalExpensesForCurrency },
        { label: t('fin.pl.netProfit'), value: netProfitForCurrency },
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
                  marginInlineEnd: '8px',
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
          <span style={{ color: theme.textPrimary }}>{t('fin.pl.total', { title })}</span>
          <span style={{ fontFamily: 'monospace', color }}>{total.toLocaleString()}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader title={t('fin.pl.profitLoss')} subtitle={t('fin.pl.incomeStatement')} />

      <Card style={{ marginTop: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', padding: '16px', alignItems: 'flex-end' }}>
          <Input
            label={t('fin.pl.fromDate')}
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value)
            }}
          />
          <Input
            label={t('fin.pl.toDate')}
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value)
            }}
          />
          <Button variant="primary" onClick={run} loading={loading}>
            {t('fin.pl.runReport')}
          </Button>
        </div>
      </Card>

      {currencies.length > 1 && (
        <Card style={{ marginBottom: '16px' }}>
          <TabBar
            tabs={currencies.map((c) => ({ key: c, label: c }))}
            active={activeCurrency}
            onChange={setCurrency}
          />
        </Card>
      )}

      {report && (
        <>
          {chartData.length > 0 && (
            <Card style={{ marginBottom: '16px', padding: '16px' }}>
              <BarChart
                data={chartData.map((d) => ({ label: d.label, value: d.value, target: 0 }))}
                xKey="label"
                bars={[{ key: 'value', label: t('fin.pl.amount') }]}
                height={200}
              />
            </Card>
          )}

          <Card style={{ padding: '24px' }}>
            <ReportSection title={t('fin.pl.revenue')} lines={revenue} color={theme.success} />
            <div style={{ marginTop: '20px' }}>
              <ReportSection title={t('fin.pl.expenses')} lines={expenses} color={theme.danger} />
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
                <span style={{ color: theme.textPrimary }}>{t('fin.pl.netProfit')}</span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    color: netProfitForCurrency >= 0 ? theme.success : theme.danger,
                  }}
                >
                  {netProfitForCurrency.toLocaleString()}
                </span>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
