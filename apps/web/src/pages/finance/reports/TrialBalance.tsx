import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { TRIAL_BALANCE_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Badge } from '../../../components/ui/Badge'

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
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {['Code', 'Account Name', 'Type', 'Debit', 'Credit', 'Balance'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        textAlign:
                          h === 'Code' || h === 'Account Name' || h === 'Type' ? 'left' : 'right',
                        fontWeight: 600,
                        fontSize: '11px',
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td
                      style={{
                        padding: '10px 16px',
                        fontFamily: 'monospace',
                        color: theme.textPrimary,
                      }}
                    >
                      {r.code}
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.textPrimary }}>{r.name}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <Badge variant="neutral">{r.account_type}</Badge>
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        color: theme.textPrimary,
                      }}
                    >
                      {parseFloat(r.total_debit).toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        color: theme.textPrimary,
                      }}
                    >
                      {parseFloat(r.total_credit).toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        color: parseFloat(r.balance) >= 0 ? theme.textPrimary : theme.danger,
                      }}
                    >
                      {parseFloat(r.balance).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: theme.bgSurface, borderTop: `2px solid ${theme.border}` }}>
                  <td
                    colSpan={3}
                    style={{ padding: '10px 16px', fontWeight: 600, color: theme.textPrimary }}
                  >
                    Totals
                  </td>
                  <td
                    style={{
                      padding: '10px 16px',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: theme.textPrimary,
                    }}
                  >
                    {totalDebit.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: '10px 16px',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color: theme.textPrimary,
                    }}
                  >
                    {totalCredit.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: '10px 16px',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      color:
                        Math.abs(totalDebit - totalCredit) < 0.01 ? theme.success : theme.danger,
                    }}
                  >
                    {(totalDebit - totalCredit).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
