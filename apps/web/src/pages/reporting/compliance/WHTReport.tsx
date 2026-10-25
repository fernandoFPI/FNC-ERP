import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
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
import { Grid } from '../../../components/ui/Grid'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { TabBar } from '../../../components/ui/TabBar'
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
    currencyCode: string
    availableCurrencies: string[]
  }
}

export default function WHTReport() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(today)
  const [search, setSearch] = useState('')
  const [currencyCode, setCurrencyCode] = useState<string | undefined>(undefined)

  const { data, loading, refetch } = useQuery<WHTData>(WHT_REPORT_QUERY, {
    variables: { fromDate, toDate, currencyCode },
  })

  const d = data?.whtReport
  const displayCurrency = d?.currencyCode ?? 'IQD'
  const rows = (d?.rows ?? []).filter(
    (r) =>
      !search ||
      r.vendorName.toLowerCase().includes(search.toLowerCase()) ||
      r.taxId.includes(search),
  )

  const columns: Column<WHTRow>[] = [
    {
      key: 'vendorName',
      header: t('rep.wht.vendor'),
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{row.vendorName}</span>
      ),
    },
    {
      key: 'taxId',
      header: t('rep.wht.taxId'),
      mobileSecondary: true,
      render: (row) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{row.taxId}</span>
      ),
    },
    {
      key: 'whtType',
      header: t('rep.wht.type'),
      mobilePriority: 4,
      render: (row) => (
        <Badge variant="info" size="sm">
          {enumLabel(row.whtType)}
        </Badge>
      ),
    },
    {
      key: 'rate',
      header: t('rep.wht.rate'),
      mobilePriority: 3,
      render: (row) => <span style={{ color: theme.textSecondary }}>{row.rate}%</span>,
    },
    {
      key: 'paymentAmount',
      header: t('rep.wht.payment'),
      mobilePriority: 2,
      render: (row) => <AmountDisplay amount={row.paymentAmount} currency={displayCurrency} size="sm" />,
    },
    {
      key: 'whtAmount',
      header: t('rep.wht.whtAmount'),
      mobilePriority: 1,
      render: (row) => (
        <span style={{ fontWeight: 500, color: theme.warning }}>
          <AmountDisplay amount={row.whtAmount} currency={displayCurrency} size="sm" />
        </span>
      ),
    },
    {
      key: 'period',
      header: t('rep.wht.period'),
      mobilePriority: 5,
      render: (row) => <span style={{ color: theme.textSecondary }}>{row.period}</span>,
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('rep.wht.withholdingTaxReport')}
        subtitle={t('rep.wht.whtDeductionsByVendorAndPeriod')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
            }}
          >
            {t('rep.wht.refresh')}
          </Button>
        }
      />

      {(d?.availableCurrencies.length ?? 0) > 1 && (
        <Card padding="none" style={{ marginBottom: '16px' }}>
          <TabBar
            tabs={d!.availableCurrencies.map((c) => ({ key: c, label: c }))}
            active={displayCurrency}
            onChange={setCurrencyCode}
          />
        </Card>
      )}

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: t('rep.wht.searchVendorOrTaxId') }}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onExport={() => undefined}
          resultCount={rows.length}
        />
      </Card>

      {d && (
        <Grid cols={3} tabletCols={2} phoneCols={2} gap={12} style={{ marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.wht.totalWht')}
            </p>
            <AmountDisplay amount={d.totalWHT} currency={displayCurrency} size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.wht.vendorCount')}
            </p>
            <p style={{ fontSize: '22px', fontWeight: 500, color: theme.textPrimary }}>
              {d.vendorCount}
            </p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.wht.paymentsSubjectToWht')}
            </p>
            <AmountDisplay amount={d.totalPaymentsSubjectToWHT} currency={displayCurrency} size="md" />
          </Card>
        </Grid>
      )}

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: '40px', borderRadius: '6px', marginBottom: '8px' }}
              />
            ))}
          </div>
        ) : rows.length ? (
          <Table columns={columns} data={rows} />
        ) : (
          <EmptyState
            title={t('rep.wht.noWhtData')}
            message={t('rep.wht.adjustTheDateRangeToLoad')}
          />
        )}
      </Card>
    </div>
  )
}
