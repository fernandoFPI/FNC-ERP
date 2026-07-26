import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { STOCK_LOT_QUERY } from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { DetailHeader } from '../../../components/ui/DetailHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import type { TimelineEvent } from '../../../components/ui/Timeline'
import { Timeline } from '../../../components/ui/Timeline'

interface LotMove {
  id: string
  move_date: string
  direction?: 'in' | 'out'
  from_location_name?: string
  to_location_name?: string
  qty: string
  source_type: string
  reference?: string
  moved_by_email?: string
}

interface StockLotDetail {
  id: string
  lot_number: string
  product_id: string
  product_name?: string
  sku?: string
  expiry_date?: string
  created_at: string
  current_qty?: string
  current_location_id?: string
  current_location_name?: string
  moves?: LotMove[]
}

function expiryBadge(expiryDate?: string) {
  if (!expiryDate) return null
  const diff = new Date(expiryDate).getTime() - Date.now()
  const days = diff / 86_400_000
  if (days < 0) return <Badge variant="danger">Expired</Badge>
  if (days <= 30) return <Badge variant="warning">Expiring soon</Badge>
  return <Badge variant="success">OK</Badge>
}

function moveToEvent(move: LotMove): TimelineEvent {
  const isIn = move.direction === 'in' || !move.from_location_name
  const locationDesc = isIn
    ? `Received into ${move.to_location_name ?? '—'}`
    : `Moved from ${move.from_location_name ?? '—'} → ${move.to_location_name ?? '—'}`

  return {
    id: move.id,
    title: `${isIn ? '↓ In' : '↑ Out'} · ${parseFloat(move.qty).toLocaleString()} units`,
    description: `${locationDesc}${move.reference ? ` · Ref: ${move.reference}` : ''} · ${move.source_type}`,
    user: move.moved_by_email,
    timestamp: move.move_date,
    variant: isIn ? 'success' : 'default',
  }
}

export default function LotTraceability() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()

  const { data, loading } = useQuery(STOCK_LOT_QUERY, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })

  const lot: StockLotDetail | undefined = data?.stockLot
  const moves: LotMove[] = lot?.moves ?? []
  const events: TimelineEvent[] = moves.map(moveToEvent)

  if (loading && !lot) {
    return <div style={{ padding: '24px', color: theme.textMuted }}>Loading…</div>
  }
  if (!lot) {
    return <div style={{ padding: '24px', color: theme.textMuted }}>Lot not found</div>
  }

  const currentQty = lot.current_qty ? parseFloat(lot.current_qty) : 0

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <DetailHeader
        title={lot.lot_number}
        subtitle={
          lot.product_name ? `${lot.product_name}${lot.sku ? ` · ${lot.sku}` : ''}` : lot.product_id
        }
        backPath="/inventory/lots"
        backLabel="Lots"
        actions={
          lot.product_id ? (
            <button
              onClick={() => {
                navigate(`/inventory/products/${lot.product_id}`)
              }}
              style={{
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '13px',
                color: theme.textSecondary,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              View product
            </button>
          ) : undefined
        }
      />

      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginTop: '20px',
          marginBottom: '20px',
        }}
      >
        {[
          { label: 'Current qty', value: currentQty.toLocaleString(), highlight: currentQty === 0 },
          { label: 'Current location', value: lot.current_location_name ?? '—', highlight: false },
          {
            label: 'Created',
            value: new Date(lot.created_at).toLocaleDateString(),
            highlight: false,
          },
        ].map(({ label, value, highlight }) => (
          <div
            key={label}
            style={{
              background: theme.bgSurface,
              border: `1px solid ${highlight ? theme.warning : theme.border}`,
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: highlight ? theme.warning : theme.textPrimary,
                marginTop: '6px',
                fontFamily: 'monospace',
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Expiry */}
      {lot.expiry_date && (
        <div
          style={{
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '13px', color: theme.textMuted }}>Expiry date</span>
          <span style={{ fontSize: '14px', color: theme.textSecondary, fontFamily: 'monospace' }}>
            {lot.expiry_date}
          </span>
          {expiryBadge(lot.expiry_date)}
        </div>
      )}

      {/* Move timeline */}
      <Card>
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${theme.border}`,
            fontWeight: 600,
            color: theme.textPrimary,
            fontSize: '14px',
          }}
        >
          Movement history
          <span
            style={{ fontSize: '12px', fontWeight: 400, color: theme.textMuted, marginLeft: '8px' }}
          >
            {events.length} move{events.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ padding: '16px' }}>
          <Timeline events={events} loading={loading && events.length === 0} />
        </div>
      </Card>
    </div>
  )
}
