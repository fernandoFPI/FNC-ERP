import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@apollo/client'
import { PRODUCT_QUERY } from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Table, Column } from '../../../components/ui/Table'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'

interface ProductBalance {
  location_id: string
  location_name?: string
  location_type?: string
  qty_on_hand: string
  qty_reserved: string
  available: string
  average_cost: string
  total_value: string
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()

  const { data, loading } = useQuery(PRODUCT_QUERY, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })

  const product = data?.product
  const balances: ProductBalance[] = product?.balances ?? []

  const totalOnHand = balances.reduce((s, b) => s + parseFloat(b.qty_on_hand), 0)
  const totalValue = balances.reduce((s, b) => s + parseFloat(b.total_value), 0)

  const balanceColumns: Column<ProductBalance>[] = [
    { key: 'location_name', header: 'Location', render: (b) => <span style={{ color: theme.textPrimary }}>{b.location_name ?? b.location_id}</span> },
    { key: 'location_type', header: 'Type', render: (b) => b.location_type ? <Badge variant="neutral">{b.location_type}</Badge> : null },
    { key: 'qty_on_hand', header: 'On Hand', render: (b) => <span style={{ fontFamily: 'monospace', color: theme.textPrimary }}>{parseFloat(b.qty_on_hand).toLocaleString()}</span> },
    { key: 'qty_reserved', header: 'Reserved', render: (b) => <span style={{ fontFamily: 'monospace', color: theme.warning }}>{parseFloat(b.qty_reserved).toLocaleString()}</span> },
    { key: 'available', header: 'Available', render: (b) => <span style={{ fontFamily: 'monospace', color: theme.success }}>{parseFloat(b.available).toLocaleString()}</span> },
    { key: 'average_cost', header: 'Avg Cost', render: (b) => <AmountDisplay amount={parseFloat(b.average_cost)} currency="IQD" /> },
    { key: 'total_value', header: 'Total Value', render: (b) => <AmountDisplay amount={parseFloat(b.total_value)} currency="IQD" /> },
  ]

  if (loading && !product) return <div style={{ padding: '24px', color: theme.textMuted }}>Loading…</div>
  if (!product) return <div style={{ padding: '24px', color: theme.textMuted }}>Product not found</div>

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={product.name}
        subtitle={product.sku}
        backPath="/inventory/products"
        status={<Badge variant={product.is_active ? 'success' : 'neutral'}>{product.is_active ? 'Active' : 'Inactive'}</Badge>}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/inventory/products/${id}/edit`)}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/inventory/moves?productId=${id}`)}>View Moves</Button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginTop: '20px', marginBottom: '16px' }}>
        {[
          ['Category', product.category ?? '—'],
          ...(product.sub_category ? [['Store', product.sub_category] as [string, string]] : []),
          ['UOM', product.uom],
          ['Valuation', product.valuation_method],
          ['Std Cost', parseFloat(product.standard_cost ?? '0').toLocaleString()],
          ['Total On Hand', totalOnHand.toLocaleString()],
          ['Total Value', totalValue.toLocaleString()],
          ['Reorder Point', product.reorder_point ? parseFloat(product.reorder_point).toLocaleString() : '—'],
          ['Reorder Qty', product.reorder_qty ? parseFloat(product.reorder_qty).toLocaleString() : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary, marginTop: '4px', fontFamily: /\d/.test(String(value)) ? 'monospace' : 'inherit' }}>{value}</div>
          </div>
        ))}
      </div>

      {product.description && (
        <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: theme.textSecondary }}>
          {product.description}
        </div>
      )}

      <Card>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, fontWeight: 600, color: theme.textPrimary }}>
          Stock by Location
        </div>
        <Table columns={balanceColumns} data={balances} rowKey="location_id" />
      </Card>
    </div>
  )
}
