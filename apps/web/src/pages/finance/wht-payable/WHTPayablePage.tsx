import { useTranslation } from 'react-i18next'
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
import { TabBar } from '../../../components/ui/TabBar'
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
  currencyCode: string
  availableCurrencies: string[]
}

function fmtAmt(val: number | string) {
  return parseFloat(String(val)).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

interface MonthlyRow {
  month: number
  payments_subject_to_wht: number
  wht_amount: number
  rate: number
}

export default function WHTPayablePage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const activeCompany = useCompanyStore((s) => s.activeCompany)
  const [data, setData] = useState<WHTPayableSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [currencyCode, setCurrencyCode] = useState<string | undefined>(undefined)
  const displayCurrency = data?.currencyCode ?? 'IQD'

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<WHTPayableSummary>('/reporting/compliance/wht-payable', {
        params: currencyCode ? { currency_code: currencyCode } : {},
      })
      setData(res.data)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [activeCompany?.id, currencyCode])

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

  const monthlyColumns: Column<MonthlyRow>[] = [
    {
      key: 'month',
      header: t('fin.wht.month'),
      mobilePrimary: true,
      render: (row) => `${MONTHS[row.month - 1]} ${data?.year ?? ''}`,
    },
    {
      key: 'payments_subject_to_wht',
      header: t('fin.wht.paymentsSubjectToWht'),
      render: (row) => (
        <AmountDisplay amount={row.payments_subject_to_wht} currency={displayCurrency} size="sm" />
      ),
    },
    {
      key: 'wht_amount',
      header: t('fin.wht.whtAmount'),
      render: (row) => (
        <span style={{ fontWeight: 600, color: theme.warning }}>
          <AmountDisplay amount={row.wht_amount} currency={displayCurrency} size="sm" />
        </span>
      ),
    },
    {
      key: 'rate',
      header: t('fin.wht.effectiveRate'),
      render: (row) => `${row.rate.toFixed(1)}%`,
    },
  ]

  return (
    <div style={{ ...pagePadding, maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title={t('fin.wht.whtPayable')}
        subtitle={t('fin.wht.yearToDate', { value: data?.year ?? new Date().getFullYear(), value2: activeCompany?.name ?? '' })}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void load()
            }}
          >
            {t('fin.wht.refresh')}
          </Button>
        }
      />

      {(data?.availableCurrencies.length ?? 0) > 1 && (
        <Card padding="none" style={{ marginBottom: '16px' }}>
          <TabBar
            tabs={data!.availableCurrencies.map((c) => ({ key: c, label: c }))}
            active={displayCurrency}
            onChange={setCurrencyCode}
          />
        </Card>
      )}

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
                {t('fin.wht.totalWhtPayableYtd')}
              </p>
              <AmountDisplay amount={data?.total_wht_payable ?? 0} currency={displayCurrency} size="lg" />
              <p style={{ fontSize: '11px', color: theme.warning, marginTop: '4px' }}>
                {t('fin.wht.dueToTaxAuthority')}
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
                {t('fin.wht.vendorsSubjectToWht')}
              </p>
              <p style={{ fontSize: '28px', fontWeight: 700, color: theme.textPrimary, margin: 0 }}>
                {data?.vendor_count ?? 0}
              </p>
              <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                {t('fin.wht.uniqueVendorsThisYear')}
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
                {t('fin.wht.invoicesWithWht')}
              </p>
              <p style={{ fontSize: '28px', fontWeight: 700, color: theme.textPrimary, margin: 0 }}>
                {data?.invoice_count ?? 0}
              </p>
              <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                {t('fin.wht.vendorInvoicesYtd')}
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
            {t('fin.wht.monthlyWhtAccumulated')}
          </h3>
          {loading ? (
            <div className="skeleton" style={{ height: 140 }} />
          ) : !monthly.length ? (
            <EmptyState message={t('fin.wht.noWhtDataForThisYear')} />
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
                      title={t('fin.wht.iqd', { value: MONTHS[month - 1], currency: displayCurrency, amt: fmtAmt(wht) })}
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
            {t('fin.wht.topVendorsByWht')}
          </h3>
          {loading ? (
            <div className="skeleton" style={{ height: 140 }} />
          ) : !data?.top_vendors.length ? (
            <EmptyState message={t('fin.wht.noVendorWhtData')} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {[t('fin.wht.vendor'), t('fin.wht.invoices'), t('fin.wht.whtWithheld')].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '6px 8px',
                          textAlign: 'start',
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
                        <AmountDisplay amount={parseFloat(v.total_wht)} currency={displayCurrency} size="sm" />
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
              {t('fin.wht.monthlyBreakdown')}
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
