import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PRODUCTS_QUERY,
  STOCK_LOCATIONS_QUERY,
  STOCK_BALANCES_QUERY,
  CREATE_STOCK_ADJUSTMENT,
  STOCK_SNAPSHOT_QUERY,
} from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { useToastStore } from '../../../store/toastStore'

export default function StockAdjustmentForm() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [newQty, setNewQty] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [notes, setNotes] = useState('')
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10))

  const { data: productsData } = useQuery(PRODUCTS_QUERY, { variables: {} })
  const { data: locationsData } = useQuery(STOCK_LOCATIONS_QUERY, { variables: { isActive: true } })
  const { data: balanceData } = useQuery(STOCK_BALANCES_QUERY, {
    variables: { productId, locationId },
    skip: !productId || !locationId,
    fetchPolicy: 'cache-and-network',
  })

  const [createAdjustment, { loading }] = useMutation(CREATE_STOCK_ADJUSTMENT, {
    refetchQueries: [{ query: STOCK_SNAPSHOT_QUERY }],
  })

  const products: { id: string; sku: string; name: string; uom: string; average_cost: string }[] =
    productsData?.products ?? []
  const locations: { id: string; name: string; code: string; type: string }[] =
    locationsData?.stockLocations ?? []
  const warehouses = locations.filter((l) => l.type === 'warehouse')

  const currentBalance = balanceData?.stockBalances?.[0]
  const currentQty = parseFloat(String(currentBalance?.qty_on_hand ?? 0))
  const currentCost = parseFloat(String(currentBalance?.average_cost ?? 0))

  const selectedProduct = products.find((p) => p.id === productId)
  const parsedNewQty = parseFloat(newQty)
  const diff = !isNaN(parsedNewQty) ? parsedNewQty - currentQty : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId) {
      addToast({ type: 'error', message: 'Select a product' })
      return
    }
    if (!locationId) {
      addToast({ type: 'error', message: 'Select a location' })
      return
    }
    if (newQty === '' || isNaN(parsedNewQty) || parsedNewQty < 0) {
      addToast({ type: 'error', message: 'Enter a valid quantity (0 or more)' })
      return
    }

    try {
      await createAdjustment({
        variables: {
          input: {
            product_id: productId,
            location_id: locationId,
            new_qty: parsedNewQty,
            unit_cost: unitCost ? parseFloat(unitCost) : undefined,
            notes: notes || undefined,
            adjustment_date: adjustmentDate,
          },
        },
      })
      addToast({ type: 'success', message: 'Stock adjusted successfully' })
      navigate('/inventory/balances')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '680px' }}>
      <PageHeader
        title="Stock Adjustment"
        subtitle="Set the actual on-hand quantity for a product at a location"
        backPath="/inventory/balances"
      />

      <form onSubmit={handleSubmit}>
        <Card
          style={{
            marginTop: '20px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Product + Location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Select
              label="Product"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value)
                setUnitCost('')
              }}
              required
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </Select>

            <Select
              label="Location"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value)
              }}
              required
            >
              <option value="">Select location…</option>
              {warehouses.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </Select>
          </div>

          {/* Current balance display */}
          {productId && locationId && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: theme.bgSurface,
                border: `1px solid ${theme.border}`,
                display: 'flex',
                gap: '32px',
                fontSize: '13px',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                  Current qty on hand
                </div>
                <div style={{ fontWeight: 600, color: theme.textPrimary }}>
                  {currentQty.toFixed(4)} {selectedProduct?.uom ?? ''}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                  Average cost
                </div>
                <div style={{ fontWeight: 600, color: theme.textPrimary }}>
                  {currentCost.toFixed(4)}
                </div>
              </div>
              {diff !== null && (
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                    Adjustment
                  </div>
                  <div
                    style={{
                      fontWeight: 600,
                      color: diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : theme.textMuted,
                    }}
                  >
                    {diff > 0 ? '+' : ''}
                    {diff.toFixed(4)} {selectedProduct?.uom ?? ''}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* New qty + cost + date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <Input
              label={`New qty${selectedProduct ? ` (${selectedProduct.uom})` : ''}`}
              type="number"
              min="0"
              step="0.0001"
              value={newQty}
              onChange={(e) => {
                setNewQty(e.target.value)
              }}
              placeholder={currentQty.toFixed(4)}
              required
            />
            <Input
              label="Unit cost (optional)"
              type="number"
              min="0"
              step="0.0001"
              value={unitCost}
              onChange={(e) => {
                setUnitCost(e.target.value)
              }}
              placeholder={currentCost > 0 ? currentCost.toFixed(4) : '0.0000'}
            />
            <Input
              label="Adjustment date"
              type="date"
              value={adjustmentDate}
              onChange={(e) => {
                setAdjustmentDate(e.target.value)
              }}
              required
            />
          </div>

          <Textarea
            label="Reason / notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
            }}
            placeholder="e.g. Physical count on 2026-06-15 — correcting system discrepancy"
            rows={3}
          />

          {/* Warning if reducing to zero */}
          {diff !== null && diff < 0 && parsedNewQty === 0 && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '7px',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                fontSize: '13px',
                color: '#991b1b',
              }}
            >
              This will zero out stock for this product at this location.
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                navigate('/inventory/balances')
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading} disabled={diff === 0}>
              {diff === null
                ? 'Apply adjustment'
                : diff === 0
                  ? 'No change'
                  : `Apply adjustment (${diff > 0 ? '+' : ''}${diff?.toFixed(4)})`}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
