import { useState } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
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
        </div>
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
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {[
                    '#',
                    'Employee',
                    'Period',
                    'Gross Pay',
                    'Taxable Income',
                    'Income Tax',
                    'Social Security',
                    'Net Pay',
                  ].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 14px',
                        textAlign: i >= 3 ? 'right' : 'left',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        borderBottom: `1px solid ${theme.border}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = theme.tableRowHover
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>
                      {row.employeeNumber}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textPrimary, fontWeight: 500 }}>
                      {row.employeeName}
                    </td>
                    <td style={{ padding: '12px 14px', color: theme.textSecondary }}>
                      {row.period}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AmountDisplay amount={row.grossPay} currency="IQD" size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <AmountDisplay amount={row.taxableIncome} currency="IQD" size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: theme.warning }}>
                      <AmountDisplay amount={row.incomeTaxWithheld} currency="IQD" size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', color: theme.info }}>
                      <AmountDisplay amount={row.socialSecurity} currency="IQD" size="sm" />
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 500 }}>
                      <AmountDisplay amount={row.netPay} currency="IQD" size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
