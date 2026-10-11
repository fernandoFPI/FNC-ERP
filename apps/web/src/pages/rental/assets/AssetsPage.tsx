import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
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
import type { EquipmentAssetsQuery, EquipmentAssetsQueryVariables } from '../../../graphql/generated'

interface Asset {
  id: string
  asset_number: string
  name: string
  category?: string | null
  status: string
  daily_rate: string
  currency_code: string
  total_hours?: number | null
  maintenance_status?: string | null
  condition_rating?: number | null
  last_maintenance_date?: string | null
}

export default function AssetsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const { data, loading, refetch } = useQuery<EquipmentAssetsQuery, EquipmentAssetsQueryVariables>(EQUIPMENT_ASSETS_QUERY, {
    fetchPolicy: 'cache-and-network',
  })
  useEntityChanged('equipment_asset', () => void refetch())
  const assets: Asset[] = data?.equipmentAssets ?? []

  const columns: Column<Asset>[] = [
    {
      key: 'asset_number',
      header: t('rental.assets.asset'),
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
      header: t('rental.assets.name'),
      render: (a) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500, fontSize: '13px' }}>
          {a.name}
        </span>
      ),
    },
    {
      key: 'category',
      header: t('rental.assets.category'),
      render: (a) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{enumLabel(a.category) || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: t('rental.assets.status'),
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
      header: t('rental.assets.dailyRate'),
      render: (a) => <AmountDisplay amount={parseFloat(a.daily_rate)} currency={a.currency_code} />,
    },
    {
      key: 'total_hours',
      header: t('rental.assets.totalHours'),
      render: (a) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary, fontSize: '13px' }}>
          {a.total_hours?.toLocaleString() ?? '0'}h
        </span>
      ),
    },
    {
      key: 'last_maintenance_date',
      header: t('rental.assets.lastMaint'),
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
            {t('rental.assets.view')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigate(`/rental/assets/${a.id}/edit`)
            }}
          >
            {t('rental.assets.edit')}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1500px' }}>
      <PageHeader
        title={t('rental.assets.equipmentAssets')}
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
              {t('rental.assets.fleetView')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate('/rental/assets/new')
              }}
            >
              {t('rental.assets.addAsset')}
            </Button>
          </div>
        }
      />
      <Card style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px' }}>
          <Button variant="ghost" size="sm" onClick={() => void refetch()}>
            {t('rental.assets.refresh')}
          </Button>
        </div>
        <Table columns={columns} data={assets} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
