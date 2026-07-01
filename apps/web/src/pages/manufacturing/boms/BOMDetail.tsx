import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { BOM_QUERY } from '../../../graphql/manufacturing'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'

export default function BOMDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()

  const { data, loading } = useQuery(BOM_QUERY, { variables: { id }, skip: !id })
  const bom = data?.bom

  if (loading || !bom) return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</div>

  const totalCost = (bom.lines ?? []).reduce((s: number, l: { qty: number; unit_cost?: number }) => s + (l.qty ?? 0) * (l.unit_cost ?? 0), 0)

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title={`BOM: ${bom.product_name}`}
        subtitle={`Version ${bom.version} · Produces ${bom.qty_produced} units`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Badge variant={bom.is_active ? 'success' : 'neutral'}>{bom.is_active ? 'Active' : 'Archived'}</Badge>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/manufacturing/boms/${id}/edit`)}>Edit</Button>
            <Button variant="primary" size="sm" onClick={() => navigate(`/manufacturing/orders/new?bomId=${id}`)}>Create MO</Button>
          </div>
        }
      />

      {bom.notes && (
        <div style={{ marginTop: '16px', padding: '12px', background: 'var(--surface-hover)', borderRadius: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          {bom.notes}
        </div>
      )}

      <Card style={{ marginTop: '16px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
          <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>Components ({(bom.lines ?? []).length})</div>
          <span style={{ fontFamily: 'monospace', fontSize: '13px', color: theme.accent }}>
            Total Cost: {totalCost.toLocaleString()} IQD
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: theme.bgSurfaceHover }}>
              {['#', 'Component', 'Qty', 'UOM', 'Unit Cost', 'Line Total'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: theme.textMuted, fontWeight: 600, borderBottom: `1px solid ${theme.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(bom.lines ?? []).map((l: { id: string; sequence: number; component_name?: string; qty: number; uom: string; unit_cost?: number }) => (
              <tr key={l.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: '8px 12px', color: theme.textMuted, fontSize: '12px' }}>{l.sequence}</td>
                <td style={{ padding: '8px 12px', color: theme.textPrimary, fontSize: '13px', fontWeight: 500 }}>{l.component_name}</td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: theme.textSecondary }}>{l.qty}</td>
                <td style={{ padding: '8px 12px' }}><Badge variant="neutral">{l.uom}</Badge></td>
                <td style={{ padding: '8px 12px' }}><AmountDisplay amount={l.unit_cost ?? 0} currency="IQD" size="sm" /></td>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}><AmountDisplay amount={(l.qty ?? 0) * (l.unit_cost ?? 0)} currency="IQD" size="sm" /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: theme.bgSurfaceHover }}>
              <td colSpan={5} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: theme.textSecondary, fontSize: '13px' }}>Total Planned Cost</td>
              <td style={{ padding: '8px 12px', fontWeight: 700, color: theme.accent, fontFamily: 'monospace' }}>
                {totalCost.toLocaleString()} IQD
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  )
}
