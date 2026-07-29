import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { TRIAL_BALANCE_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Badge } from '../../../components/ui/Badge'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface TBLine {
  id: string
  code: string
  name: string
  account_type: string
  total_debit: string
  total_credit: string
  balance: string
}

export default function TrialBalance() {
  const { theme } = useTheme()
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [queried, setQueried] = useState(false)

  const { data, loading, refetch } = useQuery(TRIAL_BALANCE_QUERY, {
    variables: { asOfDate },
    skip: !queried,
    fetchPolicy: 'network-only',
  })

  const rows: TBLine[] = data?.trialBalance ?? []
  const totalDebit = rows.reduce((s, r) => s + parseFloat(r.total_debit || '0'), 0)
  const totalCredit = rows.reduce((s, r) => s + parseFloat(r.total_credit || '0'), 0)

  function run() {
    if (queried) refetch()
    else setQueried(true)
  }

  const columns: Column<TBLine>[] = [
    {
      key: 'code',
      header: 'Code',
      mobilePrimary: true,
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>{r.code}</span>
      ),
    },
    {
      key: 'name',
      header: 'Account Name',
      mobileSecondary: true,
      render: (r) => <span style={{ color: theme.textPrimary }}>{r.name}</span>,
    },
    {
      key: 'account_type',
      header: 'Type',
      render: (r) => <Badge variant="neutral">{r.account_type}</Badge>,
    },
    {
      key: 'total_debit',
      header: 'Debit',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>
          {parseFloat(r.total_debit).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'total_credit',
      header: 'Credit',
      render: (r) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>
          {parseFloat(r.total_credit).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
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
      <PageHeader title="Trial Balance" subtitle="As of date summary" />

      <Card style={{ marginTop: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', padding: '16px', alignItems: 'flex-end' }}>
          <Input
            label="As of Date"
            type="date"
            value={asOfDate}
            onChange={(e) => {
              setAsOfDate(e.target.value)
            }}
          />
          <Button variant="primary" onClick={run} loading={loading}>
            Run Report
          </Button>
        </div>
      </Card>

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
