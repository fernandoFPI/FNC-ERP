import { useState } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface CashFlowLine {
  code: string
  label: string
  amount: number
}

interface CashFlowSection {
  label: string
  lines: CashFlowLine[]
  total: number
  note?: string
}

interface CashFlowData {
  period: { from: string; to: string }
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  summary: {
    net_change_from_activities: number
    opening_cash_balance: number
    closing_cash_balance: number
    net_change_in_cash: number
    validated: boolean
  }
}

function Section({ section, theme }: { section: CashFlowSection; theme: ReturnType<typeof useTheme>['theme'] }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{
        padding: '8px 16px',
        background: theme.bgSurface,
        borderBottom: `1px solid ${theme.border}`,
        fontSize: '12px',
        fontWeight: 600,
        color: theme.textPrimary,
        letterSpacing: '0.02em',
      }}>
        {section.label}
      </div>
      {section.note && (
        <div style={{ padding: '8px 16px', fontSize: '11px', color: theme.textMuted, fontStyle: 'italic' }}>
          {section.note}
        </div>
      )}
      {section.lines.map((line, i) => (
        <div key={i} style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '7px 16px',
          borderBottom: `1px solid ${theme.border}`,
          fontSize: '12px',
        }}>
          <span style={{ color: theme.textSecondary }}>{line.label}</span>
          <span style={{ color: line.amount < 0 ? '#ef4444' : theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
            {line.amount < 0 ? `(${Math.abs(line.amount).toLocaleString()})` : line.amount.toLocaleString()}
          </span>
        </div>
      ))}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 16px',
        fontSize: '12px',
        fontWeight: 600,
        background: theme.bgSurface,
      }}>
        <span style={{ color: theme.textPrimary }}>Net {section.label.replace('Cash Flows from ', '')}</span>
        <span style={{ color: section.total < 0 ? '#ef4444' : '#22c55e', fontVariantNumeric: 'tabular-nums' }}>
          {section.total < 0 ? `(${Math.abs(section.total).toLocaleString()})` : section.total.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

export default function CashFlowStatement() {
  const { theme } = useTheme()
  const today = new Date()
  const firstOfYear = `${today.getFullYear()}-01-01`
  const todayStr = today.toISOString().slice(0, 10)

  const [fromDate, setFromDate] = useState(firstOfYear)
  const [toDate, setToDate]     = useState(todayStr)
  const [applied, setApplied]   = useState({ from: firstOfYear, to: todayStr })
  const [data, setData]         = useState<CashFlowData | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function load(from: string, to: string) {
    setLoading(true)
    setError(null)
    try {
      const r = await api.get<CashFlowData>('/reporting/cash-flow', { params: { from_date: from, to_date: to } })
      setData(r.data)
    } catch {
      setError('Failed to load cash flow statement')
    } finally {
      setLoading(false)
    }
  }

  function handleApply() {
    setApplied({ from: fromDate, to: toDate })
    load(fromDate, toDate)
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

  const s = data?.summary

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Cash Flow Statement"
        subtitle="Indirect method — operating, investing & financing activities"
        actions={
          <Button variant="ghost" size="sm" onClick={() => load(applied.from, applied.to)}>Refresh</Button>
        }
      />

      {/* Filter Panel */}
      <Card padding="sm" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>From</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle} />
          <span style={{ fontSize: '12px', color: theme.textMuted }}>To</span>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle} />
          <Button variant="primary" size="sm" onClick={handleApply}>Apply</Button>
          {s && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
              {!s.validated && (
                <Badge variant="warning">Balance mismatch — check unposted entries</Badge>
              )}
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>Net Change in Cash</p>
                <Badge variant={s.net_change_in_cash >= 0 ? 'success' : 'danger'}>
                  <AmountDisplay amount={s.net_change_in_cash} currency="IQD" size="sm" />
                </Badge>
              </div>
            </div>
          )}
        </div>
      </Card>

      {error && (
        <Card padding="sm" style={{ marginBottom: '16px', borderColor: '#ef4444' }}>
          <p style={{ color: '#ef4444', fontSize: '12px' }}>{error}</p>
        </Card>
      )}

      {/* KPI Row */}
      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Opening Cash</p>
            <AmountDisplay amount={s.opening_cash_balance} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Closing Cash</p>
            <AmountDisplay amount={s.closing_cash_balance} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>From Operations</p>
            <AmountDisplay amount={data!.operating.total} currency="IQD" size="md" colored />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>From Financing</p>
            <AmountDisplay amount={data!.financing.total} currency="IQD" size="md" colored />
          </Card>
        </div>
      )}

      {/* Statement */}
      {loading && (
        <Card padding="md">
          <p style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center' }}>Loading...</p>
        </Card>
      )}

      {!loading && data && (
        <Card padding="none">
          <Section section={data.operating}  theme={theme} />
          <Section section={data.investing}  theme={theme} />
          <Section section={data.financing}  theme={theme} />

          {/* Summary */}
          <div style={{ padding: '12px 16px', borderTop: `2px solid ${theme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
              <span style={{ color: theme.textSecondary }}>Opening Cash Balance</span>
              <span style={{ color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                {s!.opening_cash_balance.toLocaleString()}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
              <span style={{ color: theme.textSecondary }}>Net Change in Cash</span>
              <span style={{
                color: s!.net_change_in_cash < 0 ? '#ef4444' : '#22c55e',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {s!.net_change_in_cash < 0
                  ? `(${Math.abs(s!.net_change_in_cash).toLocaleString()})`
                  : s!.net_change_in_cash.toLocaleString()}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '13px',
              fontWeight: 700,
              paddingTop: '8px',
              borderTop: `1px solid ${theme.border}`,
            }}>
              <span style={{ color: theme.textPrimary }}>Closing Cash Balance</span>
              <span style={{ color: theme.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                {s!.closing_cash_balance.toLocaleString()}
              </span>
            </div>
          </div>
        </Card>
      )}

      {!loading && !data && !error && (
        <Card padding="md">
          <p style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center' }}>
            Select a date range and click Apply to generate the cash flow statement.
          </p>
        </Card>
      )}
    </div>
  )
}
