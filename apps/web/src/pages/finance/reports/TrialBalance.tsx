import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { TRIAL_BALANCE_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Badge } from '../../../components/ui/Badge'
import { TabBar } from '../../../components/ui/TabBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import type { TrialBalanceQuery, TrialBalanceQueryVariables } from '../../../graphql/generated'

interface TBLine {
  id: string
  code: string
  name: string
  account_type: string
  currency_code: string
  total_debit: string
  total_credit: string
  balance: string
}

export default function TrialBalance() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [queried, setQueried] = useState(false)
  const [currency, setCurrency] = useState<string | null>(null)

  const { data, loading, refetch } = useQuery<TrialBalanceQuery, TrialBalanceQueryVariables>(TRIAL_BALANCE_QUERY, {
    variables: { asOfDate },
    skip: !queried,
    fetchPolicy: 'network-only',
  })

  const allRows: TBLine[] = (data?.trialBalance ?? []).filter((x): x is NonNullable<typeof x> => x !== null)
  // Every currency present with real activity (or the company's own
  // currency on its row even with none) — never blended, per the no
  // -currency-exchange policy. Default to the first one seen.
  const currencies = [...new Set(allRows.map((r) => r.currency_code))].sort()
  const activeCurrency = currency ?? currencies[0] ?? 'IQD'
  const rows = allRows.filter((r) => r.currency_code === activeCurrency)
  const totalDebit = rows.reduce((s, r) => s + parseFloat(r.total_debit || '0'), 0)
  const totalCredit = rows.reduce((s, r) => s + parseFloat(r.total_credit || '0'), 0)

  function run() {
    if (queried) void refetch()
    else setQueried(true)
  }

  const columns: Column<TBLine>[] = [
    {
      key: 'code',
      header: t('fin.tb.code'),
      mobilePrimary: true,
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>{r.code}</span>
      ),
    },
    {
      key: 'name',
      header: t('fin.tb.accountName'),
      mobileSecondary: true,
      render: (r) => <span style={{ color: theme.textPrimary }}>{r.name}</span>,
    },
    {
      key: 'account_type',
      header: t('fin.tb.type'),
      render: (r) => <Badge variant="neutral">{enumLabel(r.account_type)}</Badge>,
    },
    {
      key: 'total_debit',
      header: t('fin.tb.debit'),
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>
          {parseFloat(r.total_debit).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'total_credit',
      header: t('fin.tb.credit'),
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>
          {parseFloat(r.total_credit).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'balance',
      header: t('fin.tb.balance'),
      render: (r) => (
        <span
          style={{
            fontFamily: 'monospace',
            color: parseFloat(r.balance) >= 0 ? theme.textPrimary : theme.danger,
          }}
        >
          {parseFloat(r.balance).toLocaleString()}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader title={t('fin.tb.trialBalance')} subtitle={t('fin.tb.asOfDateSummary')} />

      <Card style={{ marginTop: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', padding: '16px', alignItems: 'flex-end' }}>
          <Input
            label={t('fin.tb.asOfDate')}
            type="date"
            value={asOfDate}
            onChange={(e) => {
              setAsOfDate(e.target.value)
            }}
          />
          <Button variant="primary" onClick={run} loading={loading}>
            {t('fin.tb.runReport')}
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

      {rows.length > 0 && (
        <Card>
          <Table
            columns={columns}
            data={rows}
            rowKey="id"
            footerRow={{
              name: 'Totals',
              total_debit: totalDebit.toLocaleString(),
              total_credit: totalCredit.toLocaleString(),
              balance: (
                <span
                  style={{
                    color: Math.abs(totalDebit - totalCredit) < 0.01 ? theme.success : theme.danger,
                  }}
                >
                  {(totalDebit - totalCredit).toLocaleString()}
                </span>
              ),
            }}
          />
        </Card>
      )}
    </div>
  )
}
