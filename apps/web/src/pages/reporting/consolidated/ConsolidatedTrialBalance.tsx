import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { CONSOLIDATED_TB_QUERY } from '../../../graphql/reporting'

interface TBRow {
  accountType: string
  accountCode: string
  accountName: string
  companies: number[]
  consolidated: number
  eliminated: number
}

interface Company {
  id: string
  name: string
}

interface TBData {
  consolidatedTrialBalance: {
    rows: TBRow[]
    companies: Company[]
    currency: string
    totalDebits: number
    totalCredits: number
    isBalanced: boolean
  }
}

export default function ConsolidatedTrialBalance() {
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const [asOfDate, setAsOfDate] = useState(today)
  const [applied, setApplied] = useState(today)

  const { data, loading, refetch } = useQuery<TBData>(CONSOLIDATED_TB_QUERY, {
    variables: { asOfDate: applied },
  })

  const d = data?.consolidatedTrialBalance

  function handleApply() {
    setApplied(asOfDate)
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Consolidated Trial Balance"
        subtitle="Group-wide debit/credit balances"
        actions={
          <Button variant="ghost" size="sm" onClick={() => { refetch() }}>Refresh</Button>
        }
      />

      {/* Filter Panel */}
      <Card padding="sm" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: theme.textMuted }}>As of Date</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              style={{
                background: theme.bgSurface,
                border: `1px solid ${theme.borderInput}`,
                borderRadius: '8px',
                padding: '6px 10px',
                fontSize: '12px',
                color: theme.textSecondary,
                fontFamily: 'inherit',
              }}
            />
          </div>
          <Button variant="primary" size="sm" onClick={handleApply}>Apply</Button>
          {d && (
            <div style={{ marginLeft: 'auto' }}>
              <Badge variant={d.isBalanced ? 'success' : 'danger'}>
                {d.isBalanced ? 'Balanced' : 'OUT OF BALANCE'}
              </Badge>
            </div>
          )}
        </div>
      </Card>

      {/* Summary */}
      {d && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Debits</p>
            <AmountDisplay amount={d.totalDebits} currency={d.currency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Credits</p>
            <AmountDisplay amount={d.totalCredits} currency={d.currency} size="md" />
          </Card>
        </div>
      )}

      {/* TB Table */}
      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="skeleton" style={{ height: '36px', borderRadius: '6px', marginBottom: '6px' }} />
            ))}
          </div>
        ) : d?.rows.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>Code</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>Account</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>Type</th>
                  {d.companies.map(c => (
                    <th key={c.id} style={{ padding: '10px 14px', textAlign: 'right', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{c.name}</th>
                  ))}
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}` }}>Consolidated</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = theme.tableRowHover }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '10px 16px', color: theme.textMuted, fontSize: '12px' }}>{row.accountCode}</td>
                    <td style={{ padding: '10px 16px', color: theme.textSecondary }}>{row.accountName}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <Badge variant="neutral" size="sm">{row.accountType}</Badge>
                    </td>
                    {row.companies.map((amt, ci) => (
                      <td key={ci} style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <AmountDisplay amount={amt} currency={d.currency} size="sm" />
                      </td>
                    ))}
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 500 }}>
                      <AmountDisplay amount={row.consolidated} currency={d.currency} size="sm" colored />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No data" message="Select a date and apply to load trial balance." />
        )}
      </Card>
    </div>
  )
}
