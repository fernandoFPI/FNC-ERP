import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
import { Grid } from '../../../components/ui/Grid'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { PAYROLL_TAX_REPORT_QUERY } from '../../../graphql/reporting'

interface PayrollTaxRow {
  employeeName: string
  employeeNumber: string
  period: string
  grossPay: number
  taxableIncome: number
  incomeTaxWithheld: number
  socialSecurity: number
  netPay: number
}

interface PayrollTaxData {
  payrollTaxReport: {
    rows: PayrollTaxRow[]
  }
}

export default function PayrollTaxReport() {
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(today)
  const [companyId] = useState('1')
  const [search, setSearch] = useState('')

  const { data, loading, refetch } = useQuery<PayrollTaxData>(PAYROLL_TAX_REPORT_QUERY, {
    variables: { fromDate, toDate, companyId },
  })

  const rows = (data?.payrollTaxReport.rows ?? []).filter(
    (r) =>
      !search ||
      r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      r.employeeNumber.includes(search),
  )

  const totalIncomeTax = rows.reduce((s, r) => s + r.incomeTaxWithheld, 0)
  const totalSS = rows.reduce((s, r) => s + r.socialSecurity, 0)
  const totalGross = rows.reduce((s, r) => s + r.grossPay, 0)

  const columns: Column<PayrollTaxRow>[] = [
    {
      key: 'employeeNumber',
      header: '#',
      mobileSecondary: true,
      render: (row) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{row.employeeNumber}</span>
      ),
    },
    {
      key: 'employeeName',
      header: 'Employee',
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{row.employeeName}</span>
      ),
    },
    {
      key: 'period',
      header: 'Period',
      mobilePriority: 6,
      render: (row) => <span style={{ color: theme.textSecondary }}>{row.period}</span>,
    },
    {
      key: 'grossPay',
      header: 'Gross Pay',
      mobilePriority: 4,
      render: (row) => <AmountDisplay amount={row.grossPay} currency="IQD" size="sm" />,
    },
    {
      key: 'taxableIncome',
      header: 'Taxable Income',
      mobilePriority: 5,
      render: (row) => <AmountDisplay amount={row.taxableIncome} currency="IQD" size="sm" />,
    },
    {
      key: 'incomeTaxWithheld',
      header: 'Income Tax',
      mobilePriority: 1,
      render: (row) => (
        <span style={{ color: theme.warning }}>
          <AmountDisplay amount={row.incomeTaxWithheld} currency="IQD" size="sm" />
        </span>
      ),
    },
    {
      key: 'socialSecurity',
      header: 'Social Security',
      mobilePriority: 2,
      render: (row) => (
        <span style={{ color: theme.info }}>
          <AmountDisplay amount={row.socialSecurity} currency="IQD" size="sm" />
        </span>
      ),
    },
    {
      key: 'netPay',
      header: 'Net Pay',
      mobilePriority: 3,
      render: (row) => (
        <span style={{ fontWeight: 500 }}>
          <AmountDisplay amount={row.netPay} currency="IQD" size="sm" />
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Payroll Tax Report"
        subtitle="Income tax and social security by employee"
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
          search={{ value: search, onChange: setSearch, placeholder: 'Search employee…' }}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onExport={() => undefined}
          resultCount={rows.length}
        />
      </Card>

      {rows.length > 0 && (
        <Grid cols={3} tabletCols={2} phoneCols={2} gap={12} style={{ marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Total Gross Pay
            </p>
            <AmountDisplay amount={totalGross} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Income Tax Withheld
            </p>
            <AmountDisplay amount={totalIncomeTax} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Social Security
            </p>
            <AmountDisplay amount={totalSS} currency="IQD" size="md" />
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
          <Table columns={columns} data={rows} rowKey="employeeNumber" />
        ) : (
          <EmptyState
            title="No payroll tax data"
            message="Adjust the date range to load payroll tax records."
          />
        )}
      </Card>
    </div>
  )
}
