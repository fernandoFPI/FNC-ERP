import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { CONSOLIDATED_BS_QUERY } from '../../../graphql/reporting'

interface BSRow {
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

interface BSData {
  consolidatedBS: {
    rows: BSRow[]
    companies: Company[]
    currency: string
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
    isBalanced: boolean
  }
}

export default function ConsolidatedBS() {
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const [asOfDate, setAsOfDate] = useState(today)
  const [showEliminations, setShowEliminations] = useState(false)
  const [applied, setApplied] = useState({ asOfDate: today, showEliminations: false })

  const { data, loading, refetch } = useQuery<BSData>(CONSOLIDATED_BS_QUERY, {
    variables: { asOfDate: applied.asOfDate, showEliminations: applied.showEliminations },
  })

  const d = data?.consolidatedBS

  function handleApply() {
    setApplied({ asOfDate, showEliminations })
  }

  const rowsByType =
    d?.rows.reduce<Record<string, BSRow[]>>((acc, row) => {
      const t = row.accountType
      if (!acc[t]) acc[t] = []
      acc[t].push(row)
      return acc
    }, {}) ?? {}

  const sectionOrder = [
    'current_assets',
    'non_current_assets',
    'current_liabilities',
    'non_current_liabilities',
    'equity',
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Consolidated Balance Sheet"
        subtitle="Group assets, liabilities & equity"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              refetch()
            }}
          >
            Refresh
          </Button>
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
              onChange={(e) => {
                setAsOfDate(e.target.value)
              }}
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
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: theme.textSecondary,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={showEliminations}
              onChange={(e) => {
                setShowEliminations(e.target.checked)
              }}
            />
            Show Eliminations
          </label>
          <Button variant="primary" size="sm" onClick={handleApply}>
            Apply
          </Button>
          {d && (
            <div style={{ marginLeft: 'auto' }}>
              <Badge variant={d.isBalanced ? 'success' : 'danger'}>
                {d.isBalanced ? 'Balanced' : 'IMBALANCED'}
              </Badge>
            </div>
          )}
        </div>
      </Card>

      {/* Summary KPIs */}
      {d && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Total Assets
            </p>
            <AmountDisplay amount={d.totalAssets} currency={d.currency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Total Liabilities
            </p>
            <AmountDisplay amount={d.totalLiabilities} currency={d.currency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Total Equity
            </p>
            <AmountDisplay amount={d.totalEquity} currency={d.currency} size="md" colored />
          </Card>
        </div>
      )}

      {/* Balance Sheet Table */}
      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '36px', borderRadius: '6px', marginBottom: '6px' }}
              />
            ))}
          </div>
        ) : d?.rows.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  <th
                    style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: theme.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    Account
                  </th>
                  {d.companies.map((c) => (
                    <th
                      key={c.id}
                      style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderBottom: `1px solid ${theme.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.name}
                    </th>
                  ))}
                  {showEliminations && (
                    <th
                      style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      Elim.
                    </th>
                  )}
                  <th
                    style={{
                      padding: '10px 16px',
                      textAlign: 'right',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: theme.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    Consolidated
                  </th>
                </tr>
              </thead>
              <tbody>
                {(sectionOrder.filter((s) => rowsByType[s]).length > 0
                  ? sectionOrder.filter((s) => rowsByType[s])
                  : Object.keys(rowsByType)
                ).map((section) => (
                  <>
                    <tr key={`section-${section}`}>
                      <td
                        colSpan={d.companies.length + (showEliminations ? 2 : 1) + 1}
                        style={{
                          padding: '8px 16px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: theme.textPrimary,
                          background: theme.bgSurfaceHover,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {section.replace(/_/g, ' ')}
                      </td>
                    </tr>
                    {rowsByType[section]?.map((row, ri) => (
                      <tr
                        key={ri}
                        style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = theme.tableRowHover
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <td style={{ padding: '10px 16px', color: theme.textSecondary }}>
                          <span
                            style={{ fontSize: '11px', color: theme.textMuted, marginRight: '8px' }}
                          >
                            {row.accountCode}
                          </span>
                          {row.accountName}
                        </td>
                        {row.companies.map((amt, ci) => (
                          <td key={ci} style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <AmountDisplay amount={amt} currency={d.currency} size="sm" />
                          </td>
                        ))}
                        {showEliminations && (
                          <td
                            style={{
                              padding: '10px 14px',
                              textAlign: 'right',
                              color: theme.warning,
                            }}
                          >
                            <AmountDisplay
                              amount={row.eliminated}
                              currency={d.currency}
                              size="sm"
                            />
                          </td>
                        )}
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 500 }}>
                          <AmountDisplay
                            amount={row.consolidated}
                            currency={d.currency}
                            size="sm"
                          />
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No data"
            message="Select a date and apply to load the balance sheet."
          />
        )}
      </Card>
    </div>
  )
}
