import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { RENTAL_CONTRACTS_QUERY } from '../../../graphql/rental'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { useEntityChanged } from '../../../hooks/useEntityChanged'
import type { RentalContractsQuery, RentalContractsQueryVariables } from '../../../graphql/generated'

interface RentalContract {
  id: string
  contract_number: string
  rental_type: string
  status: string
  billing_cycle: string
  rate_amount: string
  start_date: string
  end_date?: string | null
  client_name?: string | null
  asset_name?: string | null
  currency_code?: string | null
}

const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  active: 'success',
  closed: 'neutral',
  cancelled: 'danger',
}

export default function RentalContractsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const { data, loading, refetch } = useQuery<RentalContractsQuery, RentalContractsQueryVariables>(RENTAL_CONTRACTS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('rental_contract', () => void refetch())
  const contracts: RentalContract[] = data?.rentalContracts ?? []

  const columns: Column<RentalContract>[] = [
    {
      key: 'contract_number',
      header: t('rental.contracts.contract'),
      render: (c) => (
        <button
          onClick={() => {
            navigate(`/rental/contracts/${c.id}`)
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: theme.accent,
            fontFamily: 'monospace',
            fontSize: '13px',
          }}
        >
          {c.contract_number}
        </button>
      ),
    },
    {
      key: 'client_name',
      header: t('rental.contracts.client'),
      render: (c) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500, fontSize: '13px' }}>
          {c.client_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'asset_name',
      header: t('rental.contracts.asset'),
      render: (c) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{c.asset_name ?? '—'}</span>
      ),
    },
    {
      key: 'rental_type',
      header: t('rental.contracts.type'),
      render: (c) => <Badge variant="neutral">{enumLabel(c.rental_type)}</Badge>,
    },
    {
      key: 'status',
      header: t('rental.contracts.status'),
      render: (c) => <Badge variant={STATUS_VARIANT[c.status] ?? 'neutral'}>{enumLabel(c.status)}</Badge>,
    },
    {
      key: 'billing_cycle',
      header: t('rental.contracts.billing'),
      render: (c) => <Badge variant="neutral">{enumLabel(c.billing_cycle)}</Badge>,
    },
    {
      key: 'rate_amount',
      header: t('rental.contracts.rateDay'),
      render: (c) => (
        <AmountDisplay amount={parseFloat(c.rate_amount)} currency={c.currency_code ?? t('rental.contracts.iqd')} />
      ),
    },
    {
      key: 'start_date',
      header: t('rental.contracts.start'),
      render: (c) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{c.start_date}</span>
      ),
    },
    {
      key: 'end_date',
      header: t('rental.contracts.end'),
      render: (c) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{c.end_date ?? t('rental.contracts.open')}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (c) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigate(`/rental/contracts/${c.id}`)
          }}
        >
          {t('rental.contracts.view')}
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1500px' }}>
      <PageHeader
        title={t('rental.contracts.rentalContracts')}
        subtitle={`${contracts.length} contracts`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/rental/contracts/new')
            }}
          >
            {t('rental.contracts.newContract')}
          </Button>
        }
      />
      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={contracts} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
