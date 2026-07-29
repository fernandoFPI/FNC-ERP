import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { BOM_QUERY } from '../../../graphql/manufacturing'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface BOMLine {
  id: string
  sequence: number
  component_name?: string
  qty: number
  uom: string
  unit_cost?: number
}

export default function BOMDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()

  const { data, loading } = useQuery(BOM_QUERY, { variables: { id }, skip: !id })
  const bom = data?.bom

  if (loading || !bom)
    return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</div>

  const totalCost = (bom.lines ?? []).reduce(
    (s: number, l: { qty: number; unit_cost?: number }) => s + (l.qty ?? 0) * (l.unit_cost ?? 0),
    0,
  )

  const columns: Column<BOMLine>[] = [
    {
      key: 'sequence',
      header: '#',
      mobileSecondary: true,
      render: (l) => <span style={{ color: theme.textMuted, fontSize: '12px' }}>{l.sequence}</span>,
    },
    {
      key: 'component_name',
      header: 'Component',
      mobilePrimary: true,
      render: (l) => (
        <span style={{ color: theme.textPrimary, fontSize: '13px', fontWeight: 500 }}>
          {l.component_name}
        </span>
      ),
    },
    {
      key: 'qty',
      header: 'Qty',
      mobilePriority: 1,
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{l.qty}</span>
      ),
    },
    {
      key: 'uom',
      header: 'UOM',
      mobilePriority: 2,
      render: (l) => <Badge variant="neutral">{l.uom}</Badge>,
    },
    {
      key: 'unit_cost',
      header: 'Unit Cost',
      mobilePriority: 3,
      render: (l) => <AmountDisplay amount={l.unit_cost ?? 0} currency="IQD" size="sm" />,
    },
    {
      key: 'line_total',
      header: 'Line Total',
      mobilePriority: 4,
      render: (l) => (
        <span style={{ fontWeight: 600 }}>
          <AmountDisplay amount={(l.qty ?? 0) * (l.unit_cost ?? 0)} currency="IQD" size="sm" />
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title={`BOM: ${bom.product_name}`}
        subtitle={`Version ${bom.version} · Produces ${bom.qty_produced} units`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Badge variant={bom.is_active ? 'success' : 'neutral'}>
              {bom.is_active ? 'Active' : 'Archived'}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate(`/manufacturing/boms/${id}/edit`)
              }}
            >
              Edit
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate(`/manufacturing/orders/new?bomId=${id}`)
              }}
            >
              Create MO
            </Button>
          </div>
        }
      />

      {bom.notes && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            background: 'var(--surface-hover)',
            borderRadius: '6px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
          }}
        >
          {bom.notes}
        </div>
      )}

      <Card style={{ marginTop: '16px', padding: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '12px',
            alignItems: 'center',
          }}
        >
          <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>
            Components ({(bom.lines ?? []).length})
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: '13px', color: theme.accent }}>
            Total Cost: {totalCost.toLocaleString()} IQD
          </span>
        </div>
        <Table
          columns={columns}
          data={bom.lines ?? []}
          rowKey="id"
          footerRow={{
            unit_cost: (
              <span style={{ color: theme.textSecondary, fontWeight: 600, fontSize: '13px' }}>
                Total Planned Cost
              </span>
            ),
            line_total: (
              <span style={{ color: theme.accent, fontWeight: 700, fontFamily: 'monospace' }}>
                {totalCost.toLocaleString()} IQD
              </span>
            ),
          }}
        />
      </Card>
    </div>
  )
}
