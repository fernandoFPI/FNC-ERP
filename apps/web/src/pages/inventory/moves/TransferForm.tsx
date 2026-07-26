import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_TRANSFER, STOCK_LOCATIONS_QUERY, PRODUCTS_QUERY } from '../../../graphql/inventory'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { useToastStore } from '../../../store/toastStore'

interface TransferLine {
  product_id: string
  qty: string
  unit_cost: string
}

const emptyLine = (): TransferLine => ({ product_id: '', qty: '1', unit_cost: '0' })

export default function TransferForm() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState({
    from_location_id: '',
    to_location_id: '',
    move_date: new Date().toISOString().split('T')[0],
    reference: '',
  })
  const [lines, setLines] = useState<TransferLine[]>([emptyLine()])

  const { data: locationsData } = useQuery(STOCK_LOCATIONS_QUERY, { variables: { isActive: true } })
  const { data: productsData } = useQuery(PRODUCTS_QUERY, { variables: {} })
  const [createTransfer, { loading }] = useMutation(CREATE_TRANSFER)

  const locations = locationsData?.stockLocations ?? []
  const products = productsData?.products ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.from_location_id || !form.to_location_id) {
      addToast({ type: 'error', message: 'Select both locations' })
      return
    }
    if (form.from_location_id === form.to_location_id) {
      addToast({ type: 'error', message: 'Source and destination must differ' })
      return
    }
    try {
      await createTransfer({
        variables: {
          input: {
            from_location_id: form.from_location_id,
            to_location_id: form.to_location_id,
            move_date: form.move_date,
            reference: form.reference || undefined,
            lines: lines
              .filter((l) => l.product_id)
              .map((l) => ({
                product_id: l.product_id,
                qty: parseFloat(l.qty),
                unit_cost: parseFloat(l.unit_cost) || undefined,
              })),
          },
        },
      })
      addToast({ type: 'success', message: 'Transfer created' })
      navigate('/inventory/moves')
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1000px' }}>
      <PageHeader
        title="Manual Transfer"
        subtitle="Move stock between locations"
        backPath="/inventory/moves"
      />

      <form onSubmit={handleSubmit}>
        <Card
          style={{
            marginTop: '20px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Select
              label="From Location"
              value={form.from_location_id}
              onChange={(e) => {
                setForm((f) => ({ ...f, from_location_id: e.target.value }))
              }}
              required
            >
              <option value="">Select…</option>
              {locations.map((l: { id: string; name: string }) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <Select
              label="To Location"
              value={form.to_location_id}
              onChange={(e) => {
                setForm((f) => ({ ...f, to_location_id: e.target.value }))
              }}
              required
            >
              <option value="">Select…</option>
              {locations.map((l: { id: string; name: string }) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
            }}
          >
            <Input
              label="Transfer Date"
              type="date"
              value={form.move_date}
              onChange={(e) => {
                setForm((f) => ({ ...f, move_date: e.target.value }))
              }}
              required
            />
            <Input
              label="Reference"
              value={form.reference}
              onChange={(e) => {
                setForm((f) => ({ ...f, reference: e.target.value }))
              }}
              placeholder="Optional"
            />
          </div>
        </Card>

        <Card style={{ marginTop: '16px' }}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.border}`,
              fontWeight: 600,
              color: theme.textPrimary,
            }}
          >
            Lines
          </div>
          <div style={{ padding: '12px' }}>
            {lines.map((line, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 100px 100px 28px',
                  gap: '8px',
                  marginBottom: '8px',
                  alignItems: 'center',
                }}
              >
                <Select
                  value={line.product_id}
                  onChange={(e) => {
                    setLines((p) =>
                      p.map((l, idx) => (idx === i ? { ...l, product_id: e.target.value } : l)),
                    )
                  }}
                  required
                >
                  <option value="">Select product…</option>
                  {products.map((p: { id: string; sku: string; name: string }) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Qty"
                  value={line.qty}
                  onChange={(e) => {
                    setLines((p) =>
                      p.map((l, idx) => (idx === i ? { ...l, qty: e.target.value } : l)),
                    )
                  }}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Cost"
                  value={line.unit_cost}
                  onChange={(e) => {
                    setLines((p) =>
                      p.map((l, idx) => (idx === i ? { ...l, unit_cost: e.target.value } : l)),
                    )
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setLines((p) => p.filter((_, idx) => idx !== i))
                  }}
                  disabled={lines.length <= 1}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: theme.danger,
                    fontSize: '16px',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => {
                setLines((p) => [...p, emptyLine()])
              }}
            >
              + Add Line
            </Button>
          </div>
        </Card>

        <div
          style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}
        >
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              navigate('/inventory/moves')
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            Create Transfer
          </Button>
        </div>
      </form>
    </div>
  )
}
