import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  CREATE_INTERCO_STOCK_TRANSFER,
  INTERCO_STOCK_TRANSFERS_QUERY,
} from '../../../graphql/interco'
import { COMPANIES_QUERY } from '../../../graphql/admin'
import { PRODUCTS_QUERY, STOCK_LOCATIONS_QUERY } from '../../../graphql/inventory'
import { useAuthStore } from '../../../store/authStore'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

interface TransferLine {
  id: string
  product_id: string
  from_location_id: string
  to_location_id: string
  qty: string
}

export default function IntercoStockTransferForm() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const user = useAuthStore((s) => s.user)
  const addToast = useToastStore((s) => s.addToast)

  const [toCompanyId, setToCompanyId] = useState('')
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<TransferLine[]>([
    { id: '1', product_id: '', from_location_id: '', to_location_id: '', qty: '1' },
  ])

  const { data: companiesData } = useQuery(COMPANIES_QUERY)
  const { data: productsData } = useQuery(PRODUCTS_QUERY, { variables: { is_active: true } })
  const { data: fromLocsData } = useQuery(STOCK_LOCATIONS_QUERY, {
    variables: { type: 'warehouse' },
  })
  const { data: toLocsData } = useQuery(STOCK_LOCATIONS_QUERY, {
    variables: { companyId: toCompanyId, type: 'warehouse' },
    skip: !toCompanyId,
  })

  const [createTransfer, { loading }] = useMutation(CREATE_INTERCO_STOCK_TRANSFER)

  const companies = (companiesData?.companies ?? []).filter(
    (c: { id: string }) => c.id !== user?.companyId,
  )
  const products = productsData?.products ?? []
  const fromLocs = fromLocsData?.stockLocations ?? []
  const toLocs = toLocsData?.stockLocations ?? []

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    background: theme.bgSurface,
    color: theme.textPrimary,
    fontSize: '13px',
  }

  function addLine() {
    setLines((l) => [
      ...l,
      {
        id: String(Date.now()),
        product_id: '',
        from_location_id: '',
        to_location_id: '',
        qty: '1',
      },
    ])
  }

  function removeLine(id: string) {
    setLines((l) => l.filter((x) => x.id !== id))
  }

  function updateLine(id: string, field: keyof TransferLine, value: string) {
    setLines((l) => l.map((x) => (x.id === id ? { ...x, [field]: value } : x)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!toCompanyId) {
      addToast({ type: 'error', message: 'Select a destination company' })
      return
    }
    const invalid = lines.find(
      (l) => !l.product_id || !l.from_location_id || !l.to_location_id || !l.qty,
    )
    if (invalid) {
      addToast({ type: 'error', message: 'Fill in all line fields' })
      return
    }

    try {
      const res = await createTransfer({
        variables: {
          input: {
            to_company_id: toCompanyId,
            transfer_date: transferDate,
            notes: notes || undefined,
            lines: lines.map((l) => ({
              product_id: l.product_id,
              from_location_id: l.from_location_id,
              to_location_id: l.to_location_id,
              qty: parseFloat(l.qty) || 1,
            })),
          },
        },
        refetchQueries: [
          { query: INTERCO_STOCK_TRANSFERS_QUERY, variables: { page: 1, limit: 50 } },
        ],
      })
      addToast({
        type: 'success',
        message: `Transfer ${res.data.createIntercoStockTransfer.transferNumber} created`,
      })
      navigate(`/interco/stock-transfers/${res.data.createIntercoStockTransfer.id}`)
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        title="New Interco Stock Transfer"
        subtitle="Move inventory between group companies"
      />

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '20px' }}
      >
        <Card style={{ padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <SearchableSelect
                label="Destination Company *"
                value={toCompanyId}
                onChange={(v) => {
                  setToCompanyId(v)
                }}
                placeholder="Select company…"
                options={companies.map((c: { id: string; name: string }) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </div>
            <Input
              label="Transfer Date *"
              type="date"
              value={transferDate}
              onChange={(e) => {
                setTransferDate(e.target.value)
              }}
              required
            />
            <Input
              label="Notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
              }}
              placeholder="Optional notes…"
            />
          </div>
        </Card>

        <Card style={{ padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <div style={{ fontWeight: 600, color: theme.textPrimary }}>Items to Transfer</div>
            <Button type="button" variant="ghost" size="sm" onClick={addLine}>
              + Add Item
            </Button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {['Product', 'From Location (here)', 'To Location (destination)', 'Qty', ''].map(
                    (h, i) => (
                      <th
                        key={i}
                        style={{
                          padding: '8px 10px',
                          textAlign: 'left',
                          fontSize: '11px',
                          color: theme.textMuted,
                          fontWeight: 600,
                          borderBottom: `1px solid ${theme.border}`,
                        }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '8px 6px', minWidth: '180px' }}>
                      <SearchableSelect
                        value={line.product_id}
                        onChange={(v) => {
                          updateLine(line.id, 'product_id', v)
                        }}
                        placeholder="Select product…"
                        options={products.map((p: { id: string; name: string; sku: string }) => ({
                          value: p.id,
                          label: `${p.sku} — ${p.name}`,
                        }))}
                      />
                    </td>
                    <td style={{ padding: '8px 6px', minWidth: '160px' }}>
                      <SearchableSelect
                        value={line.from_location_id}
                        onChange={(v) => {
                          updateLine(line.id, 'from_location_id', v)
                        }}
                        placeholder="Select location…"
                        options={fromLocs.map((l: { id: string; name: string }) => ({
                          value: l.id,
                          label: l.name,
                        }))}
                      />
                    </td>
                    <td style={{ padding: '8px 6px', minWidth: '160px' }}>
                      <SearchableSelect
                        value={line.to_location_id}
                        onChange={(v) => {
                          updateLine(line.id, 'to_location_id', v)
                        }}
                        placeholder={toCompanyId ? 'Select location…' : 'Pick company first'}
                        options={toLocs.map((l: { id: string; name: string }) => ({
                          value: l.id,
                          label: l.name,
                        }))}
                        disabled={!toCompanyId}
                      />
                    </td>
                    <td style={{ padding: '8px 6px', width: '100px' }}>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={line.qty}
                        onChange={(e) => {
                          updateLine(line.id, 'qty', e.target.value)
                        }}
                        style={{ ...selectStyle, width: '90px', fontFamily: 'monospace' }}
                        required
                      />
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            removeLine(line.id)
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: theme.danger,
                            cursor: 'pointer',
                            fontSize: '16px',
                          }}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!toCompanyId && (
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                background: theme.bgSurface,
                borderRadius: '6px',
                fontSize: '12px',
                color: theme.textMuted,
                border: `1px solid ${theme.border}`,
              }}
            >
              Select a destination company above to choose where stock will be received.
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              navigate('/interco/stock-transfers')
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            Create Transfer
          </Button>
        </div>
      </form>
    </div>
  )
}
