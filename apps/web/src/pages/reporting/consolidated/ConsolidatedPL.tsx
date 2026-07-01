import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { ConsolidatedFinancialTable } from '../../../components/ui/ConsolidatedFinancialTable'
import { CONSOLIDATED_PL_QUERY } from '../../../graphql/reporting'

interface PLRow {
  accountType: string
  accountCode: string
  accountName: string
  companies: Record<string, number>
  consolidated: number
  eliminated: number
}

interface Company {
  id: string
  name: string
}

interface PLData {
  consolidatedPL: {
    rows: PLRow[]
    companies: Company[]
    currency: string
    totalRevenue: number
    totalExpenses: number
    netProfit: number
  }
}

export default function ConsolidatedPL() {
  const { theme } = useTheme()
  const today = new Date()
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const todayStr = today.toISOString().slice(0, 10)

  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(todayStr)
  const [showEliminations, setShowEliminations] = useState(false)
  const [showPriorPeriod, setShowPriorPeriod] = useState(false)
  const [applied, setApplied] = useState({ fromDate: firstOfMonth, toDate: todayStr, showEliminations: false })

  // Compute prior period dates (same duration, one period earlier)
  const priorFromDate = (() => {
    const d = new Date(applied.fromDate)
    const span = new Date(applied.toDate).getTime() - d.getTime()
    const prior = new Date(d.getTime() - span - 86400000)
    return prior.toISOString().slice(0, 10)
  })()
  const priorToDate = (() => {
    const d = new Date(applied.fromDate)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const { data, loading, refetch } = useQuery<PLData>(CONSOLIDATED_PL_QUERY, {
    variables: { fromDate: applied.fromDate, toDate: applied.toDate, showEliminations: applied.showEliminations },
  })

  const { data: priorDataRaw, loading: priorLoading } = useQuery<PLData>(CONSOLIDATED_PL_QUERY, {
    variables: { fromDate: priorFromDate, toDate: priorToDate, showEliminations: applied.showEliminations },
    skip: !showPriorPeriod,
  })

  const d = data?.consolidatedPL
  const prior = priorDataRaw?.consolidatedPL

  function handleApply() {
    setApplied({ fromDate, toDate, showEliminations })
  }

  const inputStyle = {
    background: theme.bgSurface,
    border: `1px solid ${(theme as unknown as Record<string, string>)['borderInput'] ?? theme.border}`,
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '12px',
    color: theme.textSecondary,
    fontFamily: 'inherit',
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Consolidated P&L"
        subtitle="Group profit & loss statement"
        actions={
          <Button variant="ghost" size="sm" onClick={() => { refetch() }}>Refresh</Button>
        }
      />

      {/* Filter Panel */}
      <Card padding="sm" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: theme.textMuted }}>From</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle} />
            <span style={{ fontSize: '12px', color: theme.textMuted }}>To</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textSecondary, cursor: 'pointer' }}>
            <input type="checkbox" checked={showEliminations} onChange={(e) => setShowEliminations(e.target.checked)} />
            Show Eliminations
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textSecondary, cursor: 'pointer' }}>
            <input type="checkbox" checked={showPriorPeriod} onChange={(e) => setShowPriorPeriod(e.target.checked)} />
            Compare Prior Period
          </label>
          <Button variant="primary" size="sm" onClick={handleApply}>Apply</Button>
          {d && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px' }}>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>Net Profit</p>
                <Badge variant={d.netProfit >= 0 ? 'success' : 'danger'}>
                  <AmountDisplay amount={d.netProfit} currency={d.currency} size="sm" />
                </Badge>
              </div>
            </div>
          )}
        </div>
        {showPriorPeriod && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: theme.textMuted }}>
            Prior period: {priorFromDate} → {priorToDate}
          </div>
        )}
      </Card>

      {/* Summary KPIs */}
      {d && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Revenue</p>
            <AmountDisplay amount={d.totalRevenue} currency={d.currency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Expenses</p>
            <AmountDisplay amount={d.totalExpenses} currency={d.currency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Net Profit</p>
            <AmountDisplay amount={d.netProfit} currency={d.currency} size="md" colored />
          </Card>
        </div>
      )}

      {/* Financial Table */}
      <Card padding="none">
        <ConsolidatedFinancialTable
          data={d?.rows ?? []}
          companies={d?.companies ?? []}
          currency={d?.currency ?? 'IQD'}
          showEliminations={applied.showEliminations}
          loading={loading || (showPriorPeriod && priorLoading)}
          priorData={showPriorPeriod ? prior?.rows : undefined}
        />
      </Card>
    </div>
  )
}
