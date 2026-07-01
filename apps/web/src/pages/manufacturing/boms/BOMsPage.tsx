import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { BOMS_QUERY } from '../../../graphql/manufacturing'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Table, Column } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'

interface BOM {
  id: string
  product_name?: string
  version: string
  qty_produced: string
  is_active: boolean
}

export default function BOMsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()

  const { data, loading } = useQuery(BOMS_QUERY, { fetchPolicy: 'cache-and-network' })
  const boms: BOM[] = data?.boms ?? []

  const columns: Column<BOM>[] = [
    { key: 'product_name', header: 'Finished Product', render: (b) => <span style={{ color: theme.textPrimary, fontWeight: 500, fontSize: '13px' }}>{b.product_name ?? '—'}</span> },
    { key: 'version', header: 'Version', render: (b) => <Badge variant="neutral">v{b.version}</Badge> },
    { key: 'qty_produced', header: 'Qty Produced', render: (b) => <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{b.qty_produced}</span> },
    { key: 'is_active', header: 'Status', render: (b) => <Badge variant={b.is_active ? 'success' : 'neutral'}>{b.is_active ? 'Active' : 'Archived'}</Badge> },
    {
      key: 'actions',
      header: '',
      render: (b) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button variant="ghost" size="sm" onClick={() => navigate(`/manufacturing/boms/${b.id}`)}>View</Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(`/manufacturing/boms/${b.id}/edit`)}>Edit</Button>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title="Bills of Materials"
        subtitle={`${boms.length} BOMs`}
        actions={<Button variant="primary" size="sm" onClick={() => navigate('/manufacturing/boms/new')}>New BOM</Button>}
      />
      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={boms} loading={loading} rowKey="id" />
      </Card>
    </div>
  )
}
