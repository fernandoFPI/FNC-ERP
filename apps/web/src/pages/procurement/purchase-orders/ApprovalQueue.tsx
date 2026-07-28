import { useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { MY_APPROVAL_QUEUE_QUERY } from '../../../graphql/procurement'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useEntityChanged } from '../../../hooks/useEntityChanged'

interface POItem {
  id: string
  po_number: string
  vendor_name?: string
  status: string
  total_amount: string
  currency_code: string
  created_at: string
  submitted_at?: string
  assigned_to_email?: string
}

export default function ApprovalQueue() {
  const { theme } = useTheme()
  const navigate = useNavigate()

  const { data, loading, refetch } = useQuery(MY_APPROVAL_QUEUE_QUERY, {
    fetchPolicy: 'cache-and-network',
    pollInterval: 60_000,
  })
  useEntityChanged('purchase_order', () => void refetch())

  const items: POItem[] = data?.myApprovalQueue ?? []

  const columns: Column<POItem>[] = [
    {
      key: 'po_number',
      header: 'PO Number',
      render: (o) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent, fontSize: '13px' }}>
          {o.po_number}
        </span>
      ),
    },
    {
      key: 'vendor_name',
      header: 'Vendor',
      render: (o) => <span style={{ color: theme.textPrimary }}>{o.vendor_name ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (o) => <Badge variant="warning">{o.status.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'total_amount',
      header: 'Amount',
      render: (o) => (
        <AmountDisplay amount={parseFloat(o.total_amount)} currency={o.currency_code} />
      ),
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      render: (o) => (
        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
          {o.submitted_at ? o.submitted_at.slice(0, 10) : '—'}
        </span>
      ),
    },
    {
      key: 'assigned_to_email',
      header: 'Assigned To',
      render: (o) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {o.assigned_to_email ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title="Approval Queue"
        subtitle={`${items.length} pending approval`}
        actions={
          <button
            onClick={() => refetch()}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.accent,
              fontSize: '13px',
            }}
          >
            Refresh
          </button>
        }
      />

      <Card style={{ marginTop: '20px' }}>
        {!loading && items.length === 0 ? (
          <EmptyState
            icon="✓"
            title="All caught up"
            message="No purchase orders awaiting your approval."
          />
        ) : (
          <Table
            columns={columns}
            data={items}
            loading={loading}
            rowKey="id"
            onRowClick={(o) => {
              navigate(`/procurement/purchase-orders/${o.id}`)
            }}
          />
        )}
      </Card>
    </div>
  )
}
