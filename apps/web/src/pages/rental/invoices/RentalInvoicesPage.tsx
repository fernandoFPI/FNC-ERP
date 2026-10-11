import { useTranslation } from 'react-i18next'
import { enumLabel, useIsRtl } from '../../../i18n'
import { useQuery } from '@apollo/client'
import { RENTAL_INVOICES_QUERY } from '../../../graphql/rental'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import type { RentalInvoicesQuery, RentalInvoicesQueryVariables } from '../../../graphql/generated'

interface RentalInvoice {
  id: string
  invoice_number: string
  billing_period_start: string
  billing_period_end: string
  days_billed: number
  rate_amount: number
  total_amount: number
  whtApplies: boolean
  whtScenario?: string | null
  whtRate: number
  whtAmount: number
  status: string
  invoice_date: string
  due_date: string
  paid_at?: string | null
}

export default function RentalInvoicesPage() {
  const { t } = useTranslation()
  const rtl = useIsRtl()
  const { theme } = useTheme()

  const { data, loading } = useQuery<RentalInvoicesQuery, RentalInvoicesQueryVariables>(RENTAL_INVOICES_QUERY, { fetchPolicy: 'cache-and-network' })
  const invoices: RentalInvoice[] = data?.rentalInvoices ?? []

  const columns: Column<RentalInvoice>[] = [
    {
      key: 'invoice_number',
      header: t('rental.invoices.invoice'),
      render: (inv) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>
          {inv.invoice_number}
        </span>
      ),
    },
    {
      key: 'billing_period_start',
      header: t('rental.invoices.period'),
      render: (inv) => (
        <span style={{ color: theme.textSecondary, fontSize: '12px' }}>
          {inv.billing_period_start} {rtl ? '←' : '→'} {inv.billing_period_end}
        </span>
      ),
    },
    {
      key: 'days_billed',
      header: t('rental.invoices.days'),
      render: (inv) => (
        <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>{inv.days_billed}</span>
      ),
    },
    {
      key: 'rate_amount',
      header: t('rental.invoices.dailyRate'),
      render: (inv) => <AmountDisplay amount={inv.rate_amount} currency="IQD" />,
    },
    {
      key: 'total_amount',
      header: t('rental.invoices.total'),
      render: (inv) => <AmountDisplay amount={inv.total_amount} currency="IQD" />,
    },
    {
      key: 'whtAmount',
      header: t('rental.invoices.wht'),
      render: (inv) =>
        inv.whtApplies ? (
          <span
            style={{
              fontSize: '12px',
              color: inv.whtScenario === 'client_withholds' ? '#2563eb' : '#d97706',
            }}
          >
            {(inv.whtRate * 100).toFixed(1)}% · {inv.whtAmount.toLocaleString()} IQD
            <br />
            <span style={{ fontSize: '10px', opacity: 0.75 }}>
              {inv.whtScenario === 'client_withholds' ? t('rental.invoices.clientPaysTax') : t('rental.invoices.fncPaysTax')}
            </span>
          </span>
        ) : (
          <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>
        ),
    },
    {
      key: 'status',
      header: t('rental.invoices.status'),
      render: (inv) => (
        <Badge variant={inv.status === 'paid' ? 'success' : 'neutral'}>{enumLabel(inv.status)}</Badge>
      ),
    },
    {
      key: 'invoice_date',
      header: t('rental.invoices.date'),
      render: (inv) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{inv.invoice_date}</span>
      ),
    },
    {
      key: 'due_date',
      header: t('rental.invoices.due'),
      render: (inv) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{inv.due_date}</span>
      ),
    },
    {
      key: 'paid_at',
      header: t('rental.invoices.paid'),
      render: (inv) => (
        <span style={{ color: inv.paid_at ? theme.success : theme.textMuted, fontSize: '12px' }}>
          {inv.paid_at?.slice(0, 10) ?? '—'}
        </span>
      ),
    },
  ]

  const totalOutstanding = invoices
    .filter((i) => i.status !== 'paid')
    .reduce((s, i) => s + i.total_amount, 0)
  const totalPaid = invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + i.total_amount, 0)

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader title={t('rental.invoices.rentalInvoices')} subtitle={`${invoices.length} invoices`} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginTop: '16px',
          marginBottom: '16px',
        }}
      >
        <Card style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('rental.invoices.outstanding')}
          </div>
          <AmountDisplay amount={totalOutstanding} currency="IQD" />
        </Card>
        <Card style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>{t('rental.invoices.paid')}</div>
          <AmountDisplay amount={totalPaid} currency="IQD" />
        </Card>
      </div>
      <Card>
        <Table columns={columns} data={invoices} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
