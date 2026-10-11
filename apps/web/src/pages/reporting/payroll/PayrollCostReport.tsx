import { useTranslation } from 'react-i18next'
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
import { PAYROLL_COST_REPORT_QUERY } from '../../../graphql/reporting'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface PayrollRow {
  companyName: string
  costCenter: string
  period: string
  headcount: number
  totalGross: number
  totalNet: number
  totalIQD: number
}

interface ByCurrency {
  currency: string
  amount: number
  fxRate: number
  iqdEquivalent: number
}

interface MonthlyTrend {
  month: string
  yakam: number
  factory: number
  watanyia: number
}

interface PayrollCostData {
  payrollCostReport: {
    rows: PayrollRow[]
    totalHeadcount: number
    totalGross: number
    totalNet: number
    totalEmployerCost: number
    avgCostPerEmployee: number
    byCurrency: ByCurrency[]
    monthlyTrend: MonthlyTrend[]
  }
}

export default function PayrollCostReport() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const today = new Date().toISOString().slice(0, 10)
  const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`

  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(today)
  const [search, setSearch] = useState('')

  const { data, loading, refetch } = useQuery<PayrollCostData>(PAYROLL_COST_REPORT_QUERY, {
    variables: { fromDate, toDate },
  })

  const d = data?.payrollCostReport
  const rows = (d?.rows ?? []).filter(
    (r) =>
      !search ||
      r.companyName.toLowerCase().includes(search.toLowerCase()) ||
      r.costCenter.toLowerCase().includes(search.toLowerCase()),
  )

  const columns: Column<PayrollRow>[] = [
    {
      key: 'companyName',
      header: t('rep.payrollCost.company'),
      mobilePrimary: true,
      render: (row) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>{row.companyName}</span>
      ),
    },
    {
      key: 'costCenter',
      header: t('rep.payrollCost.costCenter'),
      mobileSecondary: true,
      render: (row) => row.costCenter,
    },
    {
      key: 'period',
      header: t('rep.payrollCost.period'),
      mobilePriority: 5,
      render: (row) => row.period,
    },
    {
      key: 'headcount',
      header: t('rep.payrollCost.headcount'),
      mobilePriority: 3,
      render: (row) => row.headcount,
    },
    {
      key: 'totalGross',
      header: t('rep.payrollCost.totalGross'),
      mobilePriority: 2,
      render: (row) => <AmountDisplay amount={row.totalGross} currency="IQD" size="sm" />,
    },
    {
      key: 'totalNet',
      header: t('rep.payrollCost.totalNet'),
      mobilePriority: 4,
      render: (row) => <AmountDisplay amount={row.totalNet} currency="IQD" size="sm" />,
    },
    {
      key: 'totalIQD',
      header: t('rep.payrollCost.iqdEquiv'),
      mobileLabel: t('rep.payrollCost.iqdEquiv'),
      mobilePriority: 1,
      render: (row) => <AmountDisplay amount={row.totalIQD} currency="IQD" size="sm" />,
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('rep.payrollCost.payrollCostReport')}
        subtitle={t('rep.payrollCost.employeeCostAnalysisByEntityAnd')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
            }}
          >
            {t('rep.payrollCost.refresh')}
          </Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '16px' }}>
        <FilterBar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: t('rep.payrollCost.searchCompanyOrCostCenter'),
          }}
          fromDate={fromDate}
          toDate={toDate}
          onFromDateChange={setFromDate}
          onToDateChange={setToDate}
          onExport={() => undefined}
          resultCount={rows.length}
        />
      </Card>

      {/* Summary KPIs */}
      {d && (
        <Grid cols={5} tabletCols={3} phoneCols={2} gap={12} style={{ marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.payrollCost.totalHeadcount')}
            </p>
            <p style={{ fontSize: '22px', fontWeight: 500, color: theme.textPrimary }}>
              {d.totalHeadcount}
            </p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.payrollCost.totalGross')}
            </p>
            <AmountDisplay amount={d.totalGross} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.payrollCost.totalNet')}
            </p>
            <AmountDisplay amount={d.totalNet} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.payrollCost.employerCost')}
            </p>
            <AmountDisplay amount={d.totalEmployerCost} currency="IQD" size="md" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              {t('rep.payrollCost.avgEmployee')}
            </p>
            <AmountDisplay amount={d.avgCostPerEmployee} currency="IQD" size="md" />
          </Card>
        </Grid>
      )}

      {/* Monthly Trend Chart */}
      {d?.monthlyTrend.length ? (
        <Card padding="md" style={{ marginBottom: '20px' }}>
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '16px',
            }}
          >
            {t('rep.payrollCost.monthlyPayrollCostByEntity')}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: theme.textMuted }} />
              <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} />
              <Tooltip
                contentStyle={{
                  background: theme.bgSurface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: theme.textMuted }} />
              <Bar dataKey="yakam" fill={theme.accent} name="Yakam" />
              <Bar dataKey="factory" fill={theme.info} name="Factory" />
              <Bar dataKey="watanyia" fill={theme.success} name="Watanyia" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      ) : null}

      {/* Table */}
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
            title={t('rep.payrollCost.noPayrollData')}
            message={t('rep.payrollCost.adjustTheDateRangeToLoad')}
          />
        )}
      </Card>
    </div>
  )
}
