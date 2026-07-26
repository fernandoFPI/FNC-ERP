import { useParams } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { INTERCO_STOCK_TRANSFER_QUERY } from '../../../graphql/interco'

interface TransferLine {
  id: string
  productName: string
  sku: string
  qty: number
  avcoAtTransfer: number
  transferPrice: number
  markupPct: number
  totalValue: number
}

interface StockTransferDetail {
  id: string
  transferNumber: string
  fromCompanyId: string
  fromCompanyName: string
  toCompanyId: string
  toCompanyName: string
  pricingMethod: string
  status: string
  transferDate: string
  fromStockMoveId: string | null
  toStockMoveId: string | null
  fromJournalId: string | null
  toJournalId: string | null
  lines: TransferLine[]
}

interface TransferDetailData {
  intercoStockTransfer: StockTransferDetail
}

function statusVariant(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    completed: 'success',
    draft: 'neutral',
    cancelled: 'danger',
    in_transit: 'info',
  }
  return m[status?.toLowerCase()] ?? 'neutral'
}

export default function IntercoStockTransferDetail() {
  const { theme } = useTheme()
  const { id } = useParams<{ id: string }>()

  const { data, loading } = useQuery<TransferDetailData>(INTERCO_STOCK_TRANSFER_QUERY, {
    variables: { id },
    skip: !id,
  })

  const tx = data?.intercoStockTransfer

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div
          className="skeleton"
          style={{ height: '60px', borderRadius: '8px', marginBottom: '16px' }}
        />
        <div className="skeleton" style={{ height: '300px', borderRadius: '8px' }} />
      </div>
    )
  }

  if (!tx) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>Transfer not found.</p>
      </div>
    )
  }

  const totalValue = tx.lines.reduce((s, l) => s + l.totalValue, 0)

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={tx.transferNumber}
        subtitle={`${tx.fromCompanyName} → ${tx.toCompanyName} · ${new Date(tx.transferDate).toLocaleDateString()}`}
        backPath="/interco/stock-transfers"
        backLabel="Stock Transfers"
        status={<Badge variant={statusVariant(tx.status)}>{tx.status}</Badge>}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        <Card padding="md">
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            Transfer Info
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              gap: '8px 12px',
              fontSize: '13px',
            }}
          >
            <dt style={{ color: theme.textMuted }}>From</dt>
            <dd style={{ color: theme.textPrimary, fontWeight: 500, margin: 0 }}>
              {tx.fromCompanyName}
            </dd>
            <dt style={{ color: theme.textMuted }}>To</dt>
            <dd style={{ color: theme.textPrimary, fontWeight: 500, margin: 0 }}>
              {tx.toCompanyName}
            </dd>
            <dt style={{ color: theme.textMuted }}>Pricing Method</dt>
            <dd style={{ margin: 0 }}>
              <Badge variant="neutral" size="sm">
                {tx.pricingMethod}
              </Badge>
            </dd>
            <dt style={{ color: theme.textMuted }}>Transfer Date</dt>
            <dd style={{ color: theme.textSecondary, margin: 0 }}>
              {new Date(tx.transferDate).toLocaleDateString()}
            </dd>
            <dt style={{ color: theme.textMuted }}>Total Value</dt>
            <dd style={{ margin: 0 }}>
              <AmountDisplay amount={totalValue} currency="USD" size="md" />
            </dd>
          </dl>
        </Card>

        <Card padding="md">
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '12px',
            }}
          >
            Journal References
          </p>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr',
              gap: '8px 12px',
              fontSize: '13px',
            }}
          >
            <dt style={{ color: theme.textMuted }}>From Stock Move</dt>
            <dd style={{ color: tx.fromStockMoveId ? theme.accent : theme.textMuted, margin: 0 }}>
              {tx.fromStockMoveId ?? '—'}
            </dd>
            <dt style={{ color: theme.textMuted }}>To Stock Move</dt>
            <dd style={{ color: tx.toStockMoveId ? theme.accent : theme.textMuted, margin: 0 }}>
              {tx.toStockMoveId ?? '—'}
            </dd>
            <dt style={{ color: theme.textMuted }}>From Journal</dt>
            <dd style={{ color: tx.fromJournalId ? theme.accent : theme.textMuted, margin: 0 }}>
              {tx.fromJournalId ?? '—'}
            </dd>
            <dt style={{ color: theme.textMuted }}>To Journal</dt>
            <dd style={{ color: tx.toJournalId ? theme.accent : theme.textMuted, margin: 0 }}>
              {tx.toJournalId ?? '—'}
            </dd>
          </dl>
        </Card>
      </div>

      {/* Transfer Lines */}
      <Card padding="none">
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${theme.border}` }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            Transfer Lines ({tx.lines.length})
          </h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: theme.bgSurface }}>
                {[
                  'SKU',
                  'Product',
                  'Qty',
                  'AVCO at Transfer',
                  'Transfer Price',
                  'Markup %',
                  'Total Value',
                ].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: '10px 14px',
                      textAlign: i >= 2 ? 'right' : 'left',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: theme.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      borderBottom: `1px solid ${theme.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tx.lines.map((line) => (
                <tr
                  key={line.id}
                  style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme.tableRowHover
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>
                    {line.sku}
                  </td>
                  <td style={{ padding: '12px 14px', color: theme.textPrimary, fontWeight: 500 }}>
                    {line.productName}
                  </td>
                  <td
                    style={{ padding: '12px 14px', textAlign: 'right', color: theme.textSecondary }}
                  >
                    {line.qty.toLocaleString()}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <AmountDisplay amount={line.avcoAtTransfer} currency="USD" size="sm" />
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <AmountDisplay amount={line.transferPrice} currency="USD" size="sm" />
                  </td>
                  <td
                    style={{ padding: '12px 14px', textAlign: 'right', color: theme.textSecondary }}
                  >
                    {line.markupPct.toFixed(1)}%
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 500 }}>
                    <AmountDisplay amount={line.totalValue} currency="USD" size="sm" />
                  </td>
                </tr>
              ))}
              <tr style={{ background: theme.bgSurfaceHover }}>
                <td
                  colSpan={6}
                  style={{
                    padding: '12px 14px',
                    fontWeight: 600,
                    color: theme.textPrimary,
                    textAlign: 'right',
                  }}
                >
                  Total
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600 }}>
                  <AmountDisplay amount={totalValue} currency="USD" size="sm" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
