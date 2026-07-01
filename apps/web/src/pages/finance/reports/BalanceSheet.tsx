import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { BALANCE_SHEET_QUERY } from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Badge } from '../../../components/ui/Badge'

interface BSLine {
  account_id: string
  code: string
  name: string
  amount: string
}

export default function BalanceSheet() {
  const { theme } = useTheme()
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0])
  const [queried, setQueried] = useState(false)

  const { data, loading, refetch } = useQuery(BALANCE_SHEET_QUERY, {
    variables: { asOfDate },
    skip: !queried,
    fetchPolicy: 'network-only',
  })

  const report = data?.balanceSheet

  function run() {
    if (queried) refetch()
    else setQueried(true)
  }

  function Section({ title, lines, color }: { title: string; lines: BSLine[]; color: string }) {
    const total = lines.reduce((s, l) => s + parseFloat(l.amount || '0'), 0)
    return (
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px', marginBottom: '8px', borderBottom: `2px solid ${color}`, paddingBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
          <span>{title}</span>
          <span style={{ fontFamily: 'monospace', color }}>{total.toLocaleString()}</span>
        </div>
        {lines.map((l) => (
          <div key={l.account_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: `1px solid ${theme.border}` }}>
            <div>
              <span style={{ fontFamily: 'monospace', color: theme.textMuted, fontSize: '12px', marginRight: '8px' }}>{l.code}</span>
              <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{l.name}</span>
            </div>
            <span style={{ fontFamily: 'monospace', color: theme.textPrimary, fontSize: '13px' }}>
              {parseFloat(l.amount).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader title="Balance Sheet" subtitle="Financial position" />

      <Card style={{ marginTop: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', padding: '16px', alignItems: 'flex-end' }}>
          <Input label="As of Date" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          <Button variant="primary" onClick={run} loading={loading}>Run Report</Button>
        </div>
      </Card>

      {report && (
        <>
          {/* Balanced indicator */}
          <div style={{ marginBottom: '12px' }}>
            <Badge variant={report.isBalanced ? 'success' : 'danger'}>
              {report.isBalanced ? 'Balanced' : 'UNBALANCED — check for errors'}
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <Card style={{ padding: '24px' }}>
              <Section title="Assets" lines={report.assets} color={theme.success} />
              <div style={{ borderTop: `2px solid ${theme.border}`, paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span style={{ color: theme.textPrimary }}>Total Assets</span>
                <span style={{ fontFamily: 'monospace', color: theme.success }}>{parseFloat(report.totalAssets).toLocaleString()}</span>
              </div>
            </Card>

            <div>
              <Card style={{ padding: '24px', marginBottom: '16px' }}>
                <Section title="Liabilities" lines={report.liabilities} color={theme.danger} />
                <div style={{ borderTop: `2px solid ${theme.border}`, paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span style={{ color: theme.textPrimary }}>Total Liabilities</span>
                  <span style={{ fontFamily: 'monospace', color: theme.danger }}>{parseFloat(report.totalLiabilities).toLocaleString()}</span>
                </div>
              </Card>

              <Card style={{ padding: '24px' }}>
                <Section title="Equity" lines={report.equity} color={theme.accent} />
                {/* Retained earnings = net P&L not yet closed to an equity account */}
                {parseFloat(report.retainedEarnings) !== 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderBottom: `1px solid ${theme.border}` }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', color: theme.textMuted, fontSize: '12px', marginRight: '8px' }}>—</span>
                      <span style={{ color: theme.textSecondary, fontSize: '13px' }}>Retained Earnings (current period)</span>
                    </div>
                    <span style={{ fontFamily: 'monospace', color: parseFloat(report.retainedEarnings) >= 0 ? theme.success : theme.danger, fontSize: '13px' }}>
                      {parseFloat(report.retainedEarnings).toLocaleString()}
                    </span>
                  </div>
                )}
                <div style={{ borderTop: `2px solid ${theme.border}`, paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span style={{ color: theme.textPrimary }}>Total Equity</span>
                  <span style={{ fontFamily: 'monospace', color: theme.accent }}>{parseFloat(report.totalEquity).toLocaleString()}</span>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
