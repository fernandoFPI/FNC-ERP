import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
import { WHT_REPORT_QUERY } from '../../../graphql/reporting'

interface WHTRow {
  vendorName: string
  taxId: string
  whtType: string
  rate: number
  paymentAmount: number
  whtAmount: number
  period: string
}

interface WHTData {
  whtReport: {
    rows: WHTRow[]
    totalWHT: number
    vendorCount: number
    totalPaymentsSubjectToWHT: number
  }
}

export default function WHTReport() {
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(today)
  const [companyId] = useState('1')
  const [search, setSearch] = useState('')

  const { data, loading, refetch } = useQuery<WHTData>(WHT_REPORT_QUERY, {
    variables: { fromDate, toDate, companyId },
  })

  const d = data?.whtReport
  const rows = (d?.rows ?? []).filter(r =>
    !search || r.vendorName.toLowerCase().includes(search.toLowerCase()) || r.taxId.includes(search)
  )

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Withholding Tax Report"
        subtitle="WHT deductions by vendor and period"
        actions={
          <Button variant="ghost" size="sm" onClick={() => { refetch() }}>Refresh</Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: 'Search vendor or tax ID…' }}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onExport={() => undefined}
          resultCount={rows.length}
        />
      </Card>

      {d && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total WHT</p>
            <AmountDisplay amount={d.totalWHT} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Vendor Count</p>
            <p style={{ fontSize: '22px', fontWeight: 500, color: theme.textPrimary }}>{d.vendorCount}</p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Payments Subject to WHT</p>
            <AmountDisplay amount={d.totalPaymentsSubjectToWHT} currency="IQD" size="md" />
          </Card>
        </div>
      )}

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: '40px', borderRadius: '6px', marginBottom: '8px' }} />
            ))}
          </div>
        ) : rows.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {['Vendor', 'Tax ID', 'Type', 'Rate', 'Payment', 'WHT Amount', 'Period'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: i >= 3 && i <= 5 ? 'right' : 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = theme.tableRowHover }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                    <td style={{ padding: '12px 14px', color: theme.textPrimary, fontWeight: 500 }}>{row.vendorName}</td>
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>{row.taxId}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <Badge variant="info" size="sm">{row.whtType}</Badge>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: theme.textSecondary }}>{row.rate}%</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AmountDisplay amount={row.paymentAmount} currency="IQD" size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 500, color: theme.warning }}>
                      <AmountDisplay amount={row.whtAmount} currency="IQD" size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>{row.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No WHT data" message="Adjust the date range to load withholding tax records." />
        )}
      </Card>
    </div>
  )
}
