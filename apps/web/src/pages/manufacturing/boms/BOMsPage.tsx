import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { BOMS_QUERY } from '../../../graphql/manufacturing'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import type { BoMsQuery, BoMsQueryVariables } from '../../../graphql/generated'

interface BOM {
  id: string
  product_name?: string | null
  version: string
  qty_produced: string
  is_active: boolean
}

export default function BOMsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const { data, loading } = useQuery<BoMsQuery, BoMsQueryVariables>(BOMS_QUERY, { fetchPolicy: 'cache-and-network' })
  const boms: BOM[] = data?.boms ?? []

  const columns: Column<BOM>[] = [
    {
      key: 'product_name',
      header: t('mfg.boms.finishedProduct'),
      render: (b) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500, fontSize: '13px' }}>
          {b.product_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'version',
      header: t('mfg.boms.version'),
      render: (b) => <Badge variant="neutral">v{b.version}</Badge>,
    },
    {
      key: 'qty_produced',
      header: t('mfg.boms.qtyProduced'),
      render: (b) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>
          {b.qty_produced}
        </span>
      ),
    },
    {
      key: 'is_active',
      header: t('mfg.boms.status'),
      render: (b) => (
        <Badge variant={b.is_active ? 'success' : 'neutral'}>
          {b.is_active ? t('mfg.boms.active') : t('mfg.boms.archived')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (b) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigate(`/manufacturing/boms/${b.id}`)
            }}
          >
            {t('mfg.boms.view')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigate(`/manufacturing/boms/${b.id}/edit`)
            }}
          >
            {t('mfg.boms.edit')}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={t('mfg.boms.billsOfMaterials')}
        subtitle={t('mfg.boms.boms', { length: boms.length })}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              navigate('/manufacturing/boms/new')
            }}
          >
            {t('mfg.boms.newBom')}
          </Button>
        }
      />
      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={boms} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
