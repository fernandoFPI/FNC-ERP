import { useState, useEffect } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { useCompanyStore } from '../../../store/companyStore'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Grid } from '../../../components/ui/Grid'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { usePagePadding } from '../../../hooks/usePagePadding'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface WHTPayableSummary {
  year: number
  total_wht_payable: number
  vendor_count: number
  invoice_count: number
  monthly: { month: number; payments_subject_to_wht: string; wht_amount: string }[]
  top_vendors: {
    vendor_name: string
    invoice_count: number
    total_wht: string
    total_payments: string
  }[]
}

function fmtAmt(val: number | string) {
  return parseFloat(String(val)).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

interface TopVendorRow {
  vendor_name: string
  invoice_count: number
  total_wht: string
  total_payments: string
}

interface MonthlyRow {
  month: number
  payments_subject_to_wht: number
  wht_amount: number
  rate: number
}

export default function WHTPayablePage() {
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const activeCompany = useCompanyStore((s) => s.activeCompany)
  const [data, setData] = useState<WHTPayableSummary | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<WHTPayableSummary>('/reporting/compliance/wht-payable')
      setData(res.data)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [activeCompany?.id])

  const monthly =
    data?.monthly.map((m) => ({
      ...m,
      wht_amount: parseFloat(m.wht_amount),
      payments_subject_to_wht: parseFloat(m.payments_subject_to_wht),
    })) ?? []
  const maxWHT = Math.max(...monthly.map((m) => m.wht_amount), 1)

  const monthlyRows: MonthlyRow[] = monthly.map((row) => ({
    ...row,
    rate:
      row.payments_subject_to_wht > 0 ? (row.wht_amount / row.payments_subject_to_wht) * 100 : 0,
  }))

  const topVendorColumns: Column<TopVendorRow>[] = [
    {
      key: 'vendor_name',
      header: 'Vendor',
      mobilePrimary: true,
      render: (v) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{v.vendor_name}</span>
      ),
    },
    {
      key: 'invoice_count',
      header: 'Invoices',
      mobileSecondary: true,
      render: (v) => `${v.invoice_count} invoices`,
    },
    {
      key: 'total_wht',
      header: 'WHT Withheld',
      render: (v) => (
        <span style={{ fontWeight: 600, color: theme.warning }}>
          <AmountDisplay amount={parseFloat(v.total_wht)} currency="IQD" size="sm" />
        </span>
      ),
    },
  ]

  const monthlyColumns: Column<MonthlyRow>[] = [
    {
      key: 'month',
      header: 'Month',
      mobilePrimary: true,
      render: (row) => `${MONTHS[row.month - 1]} ${data?.year ?? ''}`,
    },
    {
      key: 'payments_subject_to_wht',
      header: 'Payments Subject to WHT',
      render: (row) => (
        <AmountDisplay amount={row.payments_subject_to_wht} currency="IQD" size="sm" />
      ),
    },
    {
      key: 'wht_amount',
      header: 'WHT Amount',
      render: (row) => (
        <span style={{ fontWeight: 600, color: theme.warning }}>
          <AmountDisplay amount={row.wht_amount} currency="IQD" size="sm" />
        </span>
      ),
    },
    {
      key: 'rate',
      header: 'Effective Rate',
      render: (row) => `${row.rate.toFixed(1)}%`,
    },
  ]

  return (
    <div style={{ ...pagePadding, maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title="WHT Payable"
        subtitle={`${data?.year ?? new Date().getFullYear()} year-to-date · ${activeCompany?.name ?? ''}`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void load()
            }}
          >
            Refresh
          </Button>
        }
      />

      {/* KPI cards */}
      <Grid cols={3} tabletCols={2} phoneCols={1} gap={14} style={{ marginBottom: '24px' }}>
        <Card padding="md">
          {loading ? (
            <div className="skeleton" style={{ height: 64 }} />
          ) : (
            <>
              <p
                style={{
                  fontSize: '11px',
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '6px',
                }}
              >
                Total WHT Payable YTD
              </p>
              <AmountDisplay amount={data?.total_wht_payable ?? 0} currency="IQD" size="lg" />
              <p style={{ fontSize: '11px', color: theme.warning, marginTop: '4px' }}>
                Due to tax authority
              </p>
            </>
          )}
        </Card>
        <Card padding="md">
          {loading ? (
            <div className="skeleton" style={{ height: 64 }} />
          ) : (
            <>
              <p
                style={{
                  fontSize: '11px',
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '6px',
                }}
              >
                Vendors Subject to WHT
              </p>
              <p style={{ fontSize: '28px', fontWeight: 700, color: theme.textPrimary, margin: 0 }}>
                {data?.vendor_count ?? 0}
              </p>
              <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                Unique vendors this year
              </p>
            </>
          )}
        </Card>
        <Card padding="md">
          {loading ? (
            <div className="skeleton" style={{ height: 64 }} />
          ) : (
            <>
              <p
                style={{
                  fontSize: '11px',
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '6px',
                }}
              >
                Invoices with WHT
              </p>
              <p style={{ fontSize: '28px', fontWeight: 700, color: theme.textPrimary, margin: 0 }}>
                {data?.invoice_count ?? 0}
              </p>
              <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                Vendor invoices YTD
              </p>
            </>
          )}
        </Card>
      </Grid>

      <Grid cols={2} tabletCols={1} phoneCols={1} gap={16} style={{ marginBottom: '24px' }}>
        {/* Monthly bar chart */}
        <Card padding="md">
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '16px',
            }}
          >
            Monthly WHT accumulated
          </h3>
          {loading ? (
            <div className="skeleton" style={{ height: 140 }} />
          ) : !monthly.length ? (
            <EmptyState message="No WHT data for this year" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '120px' }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const row = monthly.find((m) => m.month === month)
                const wht = row?.wht_amount ?? 0
                const pct = maxWHT > 0 ? (wht / maxWHT) * 100 : 0
                return (
                  <div
                    key={month}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                  >
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
                    <span style={{ fontSize: '9px', color: theme.textMuted }}>
                      {MONTHS[month - 1]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Top vendors */}
        <Card padding="md">
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '14px',
            }}
          >
            Top vendors by WHT
          </h3>
          {loading ? (
            <div className="skeleton" style={{ height: 140 }} />
          ) : !data?.top_vendors.length ? (
            <EmptyState message="No vendor WHT data" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Vendor', 'Invoices', 'WHT Withheld'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '6px 8px',
                          textAlign: 'left',
                          color: theme.textMuted,
                          fontWeight: 500,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.top_vendors.map((v, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                      <td style={{ padding: '7px 8px', color: theme.textPrimary, fontWeight: 500 }}>
                        {v.vendor_name}
                      </td>
                      <td style={{ padding: '7px 8px', color: theme.textMuted }}>
                        {v.invoice_count}
                      </td>
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
      </Grid>

      {/* Monthly detail table */}
      {monthly.length > 0 && (
        <Card padding="none">
          <div style={{ padding: '16px', borderBottom: `1px solid ${theme.border}` }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
              Monthly breakdown
            </h3>
          </div>
          <div style={{ padding: '0 16px 16px' }}>
            <Table columns={monthlyColumns} data={monthlyRows} rowKey="month" />
          </div>
        </Card>
      )}
    </div>
  )
}
