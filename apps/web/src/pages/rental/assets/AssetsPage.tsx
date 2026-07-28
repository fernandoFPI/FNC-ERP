import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { EQUIPMENT_ASSETS_QUERY } from '../../../graphql/rental'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Button } from '../../../components/ui/Button'
import { AssetStatusBadge } from '../../../components/ui/AssetStatusBadge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { useEntityChanged } from '../../../hooks/useEntityChanged'

interface Asset {
  id: string
  asset_number: string
  name: string
  category?: string
  status: string
  daily_rate: string
  currency_code: string
  total_hours?: number
  maintenance_status?: string
  condition_rating?: number
  last_maintenance_date?: string
}

export default function AssetsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()

  const { data, loading, refetch } = useQuery(EQUIPMENT_ASSETS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('equipment_asset', () => void refetch())
  const assets: Asset[] = data?.equipmentAssets ?? []

  const columns: Column<Asset>[] = [
    {
      key: 'asset_number',
      header: 'Asset #',
      render: (a) => (
        <button
          onClick={() => {
            navigate(`/rental/assets/${a.id}`)
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
          {a.asset_number}
        </button>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (a) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500, fontSize: '13px' }}>
          {a.name}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (a) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{a.category ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (
        <AssetStatusBadge
          status={a.status as 'available' | 'rented' | 'maintenance' | 'retired' | 'reserved'}
          maintenanceStatus={
            a.maintenance_status as 'ok' | 'due_soon' | 'overdue' | 'in_progress' | undefined
          }
        />
      ),
    },
    {
      key: 'daily_rate',
      header: 'Daily Rate',
      render: (a) => <AmountDisplay amount={parseFloat(a.daily_rate)} currency={a.currency_code} />,
    },
    {
      key: 'total_hours',
      header: 'Total Hours',
      render: (a) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary, fontSize: '13px' }}>
          {a.total_hours?.toLocaleString() ?? '0'}h
        </span>
      ),
    },
    {
      key: 'last_maintenance_date',
      header: 'Last Maint.',
      render: (a) => (
        <span style={{ fontSize: '12px', color: theme.textMuted }}>
          {a.last_maintenance_date?.slice(0, 10) ?? '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (a) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigate(`/rental/assets/${a.id}`)
            }}
          >
            View
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigate(`/rental/assets/${a.id}/edit`)
            }}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1500px' }}>
      <PageHeader
        title="Equipment Assets"
        subtitle={`${assets.length} assets`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate('/rental/fleet')
              }}
            >
              Fleet View
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/rental/assets/new')
              }}
            >
              Add Asset
            </Button>
          </div>
        }
      />
      <Card style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px' }}>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
        <Table columns={columns} data={assets} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
