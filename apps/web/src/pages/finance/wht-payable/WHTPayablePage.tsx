import { useState, useEffect } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { useCompanyStore } from '../../../store/companyStore'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface WHTPayableSummary {
  year: number
  total_wht_payable: number
  vendor_count: number
  invoice_count: number
  monthly: Array<{ month: number; payments_subject_to_wht: string; wht_amount: string }>
  top_vendors: Array<{ vendor_name: string; invoice_count: number; total_wht: string; total_payments: string }>
}

function fmtAmt(val: number | string) {
  return parseFloat(String(val)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function WHTPayablePage() {
  const { theme } = useTheme()
  const activeCompany = useCompanyStore((s) => s.activeCompany)
  const [data, setData] = useState<WHTPayableSummary | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<WHTPayableSummary>('/reporting/compliance/wht-payable')
      setData(res.data)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [activeCompany?.id])

  const monthly = data?.monthly.map(m => ({ ...m, wht_amount: parseFloat(m.wht_amount), payments_subject_to_wht: parseFloat(m.payments_subject_to_wht) })) ?? []
  const maxWHT = Math.max(...monthly.map(m => m.wht_amount), 1)

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="WHT Payable"
        subtitle={`${data?.year ?? new Date().getFullYear()} year-to-date · ${activeCompany?.name ?? ''}`}
        actions={<Button variant="ghost" size="sm" onClick={() => { void load() }}>Refresh</Button>}
      />

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        <Card padding="md">
          {loading ? <div className="skeleton" style={{ height: 64 }} /> : (
            <>
              <p style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Total WHT Payable YTD</p>
              <AmountDisplay amount={data?.total_wht_payable ?? 0} currency="IQD" size="lg" />
              <p style={{ fontSize: '11px', color: theme.warning, marginTop: '4px' }}>Due to tax authority</p>
            </>
          )}
        </Card>
        <Card padding="md">
          {loading ? <div className="skeleton" style={{ height: 64 }} /> : (
            <>
              <p style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Vendors Subject to WHT</p>
              <p style={{ fontSize: '28px', fontWeight: 700, color: theme.textPrimary, margin: 0 }}>{data?.vendor_count ?? 0}</p>
              <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Unique vendors this year</p>
            </>
          )}
        </Card>
        <Card padding="md">
          {loading ? <div className="skeleton" style={{ height: 64 }} /> : (
            <>
              <p style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>Invoices with WHT</p>
              <p style={{ fontSize: '28px', fontWeight: 700, color: theme.textPrimary, margin: 0 }}>{data?.invoice_count ?? 0}</p>
              <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Vendor invoices YTD</p>
            </>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Monthly bar chart */}
        <Card padding="md">
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '16px' }}>Monthly WHT accumulated</h3>
          {loading ? <div className="skeleton" style={{ height: 140 }} /> : !monthly.length ? (
            <EmptyState message="No WHT data for this year" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '120px' }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                const row = monthly.find(m => m.month === month)
                const wht = row?.wht_amount ?? 0
                const pct = maxWHT > 0 ? (wht / maxWHT) * 100 : 0
                return (
                  <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                    <div
                      title={`${MONTHS[month - 1]}: IQD ${fmtAmt(wht)}`}
                      style={{
                        width: '100%',
                        height: `${Math.max(pct, wht > 0 ? 4 : 0)}%`,
                        minHeight: wht > 0 ? '4px' : '0',
                        background: wht > 0 ? theme.warning : theme.bgSurfaceHover,
                        borderRadius: '3px 3px 0 0',
                        transition: 'height 0.3s ease',
                      }}
                    />
                    <span style={{ fontSize: '9px', color: theme.textMuted }}>{MONTHS[month - 1]}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Top vendors */}
        <Card padding="md">
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '14px' }}>Top vendors by WHT</h3>
          {loading ? <div className="skeleton" style={{ height: 140 }} /> : !data?.top_vendors.length ? (
            <EmptyState message="No vendor WHT data" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Vendor', 'Invoices', 'WHT Withheld'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: theme.textMuted, fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.top_vendors.map((v, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                      <td style={{ padding: '7px 8px', color: theme.textPrimary, fontWeight: 500 }}>{v.vendor_name}</td>
                      <td style={{ padding: '7px 8px', color: theme.textMuted }}>{v.invoice_count}</td>
                      <td style={{ padding: '7px 8px', fontWeight: 600, color: theme.warning }}>
                        <AmountDisplay amount={parseFloat(v.total_wht)} currency="IQD" size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Monthly detail table */}
      {monthly.length > 0 && (
        <Card padding="none">
          <div style={{ padding: '16px', borderBottom: `1px solid ${theme.border}` }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>Monthly breakdown</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {['Month', 'Payments Subject to WHT', 'WHT Amount', 'Effective Rate'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: i > 0 ? 'right' : 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthly.map((row, i) => {
                  const rate = row.payments_subject_to_wht > 0 ? (row.wht_amount / row.payments_subject_to_wht) * 100 : 0
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = theme.tableRowHover }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                      <td style={{ padding: '10px 14px', color: theme.textPrimary, fontWeight: 500 }}>{MONTHS[row.month - 1]} {data?.year}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <AmountDisplay amount={row.payments_subject_to_wht} currency="IQD" size="sm" />
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: theme.warning }}>
                        <AmountDisplay amount={row.wht_amount} currency="IQD" size="sm" />
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: theme.textSecondary }}>{rate.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
