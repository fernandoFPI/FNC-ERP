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

interface RentalContract {
  id: string
  contract_number: string
  rental_type: string
  status: string
  billing_cycle: string
  rate_amount: string
  start_date: string
  end_date?: string
  client_name?: string
  asset_name?: string
  currency_code?: string
}

const STATUS_VARIANT: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  active: 'success',
  closed: 'neutral',
  cancelled: 'danger',
}

export default function RentalContractsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()

  const { data, loading } = useQuery(RENTAL_CONTRACTS_QUERY, { fetchPolicy: 'cache-and-network' })
  const contracts: RentalContract[] = data?.rentalContracts ?? []

  const columns: Column<RentalContract>[] = [
    {
      key: 'contract_number',
      header: 'Contract #',
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
      header: 'Client',
      render: (c) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500, fontSize: '13px' }}>
          {c.client_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'asset_name',
      header: 'Asset',
      render: (c) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{c.asset_name ?? '—'}</span>
      ),
    },
    {
      key: 'rental_type',
      header: 'Type',
      render: (c) => <Badge variant="neutral">{c.rental_type}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge variant={STATUS_VARIANT[c.status] ?? 'neutral'}>{c.status}</Badge>,
    },
    {
      key: 'billing_cycle',
      header: 'Billing',
      render: (c) => <Badge variant="neutral">{c.billing_cycle}</Badge>,
    },
    {
      key: 'rate_amount',
      header: 'Rate/Day',
      render: (c) => (
        <AmountDisplay amount={parseFloat(c.rate_amount)} currency={c.currency_code ?? 'IQD'} />
      ),
    },
    {
      key: 'start_date',
      header: 'Start',
      render: (c) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{c.start_date}</span>
      ),
    },
    {
      key: 'end_date',
      header: 'End',
      render: (c) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{c.end_date ?? 'Open'}</span>
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
          View
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1500px' }}>
      <PageHeader
        title="Rental Contracts"
        subtitle={`${contracts.length} contracts`}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/rental/contracts/new')
            }}
          >
            New Contract
          </Button>
        }
      />
      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={contracts} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
