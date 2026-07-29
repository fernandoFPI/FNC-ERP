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
  const rows = (d?.rows ?? []).filter(
    (r) =>
      !search ||
      r.vendorName.toLowerCase().includes(search.toLowerCase()) ||
      r.taxId.includes(search),
  )

  const columns: Column<WHTRow>[] = [
    {
      key: 'vendorName',
      header: 'Vendor',
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{row.vendorName}</span>
      ),
    },
    {
      key: 'taxId',
      header: 'Tax ID',
      mobileSecondary: true,
      render: (row) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{row.taxId}</span>
      ),
    },
    {
      key: 'whtType',
      header: 'Type',
      mobilePriority: 4,
      render: (row) => (
        <Badge variant="info" size="sm">
          {row.whtType}
        </Badge>
      ),
    },
    {
      key: 'rate',
      header: 'Rate',
      mobilePriority: 3,
      render: (row) => <span style={{ color: theme.textSecondary }}>{row.rate}%</span>,
    },
    {
      key: 'paymentAmount',
      header: 'Payment',
      mobilePriority: 2,
      render: (row) => <AmountDisplay amount={row.paymentAmount} currency="IQD" size="sm" />,
    },
    {
      key: 'whtAmount',
      header: 'WHT Amount',
      mobilePriority: 1,
      render: (row) => (
        <span style={{ fontWeight: 500, color: theme.warning }}>
          <AmountDisplay amount={row.whtAmount} currency="IQD" size="sm" />
        </span>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      mobilePriority: 5,
      render: (row) => <span style={{ color: theme.textSecondary }}>{row.period}</span>,
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Withholding Tax Report"
        subtitle="WHT deductions by vendor and period"
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
        <Grid cols={3} tabletCols={2} phoneCols={2} gap={12} style={{ marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Total WHT
            </p>
            <AmountDisplay amount={d.totalWHT} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Vendor Count
            </p>
            <p style={{ fontSize: '22px', fontWeight: 500, color: theme.textPrimary }}>
              {d.vendorCount}
            </p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Payments Subject to WHT
            </p>
            <AmountDisplay amount={d.totalPaymentsSubjectToWHT} currency="IQD" size="md" />
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
            title="No WHT data"
            message="Adjust the date range to load withholding tax records."
          />
        )}
      </Card>
    </div>
  )
}
