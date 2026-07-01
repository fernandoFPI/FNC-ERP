import { useState } from 'react'
import { useMutation, useQuery } from '@apollo/client'
import { CREATE_MANUFACTURING_REQUEST, MANUFACTURING_REQUESTS_QUERY } from '../../../graphql/manufacturing-requests'
import { BOMS_QUERY } from '../../../graphql/manufacturing'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

interface BOM { id: string; finished_product_id: string; product_name: string; version: string }

interface Props {
  projectId: string
  onClose: () => void
  onCreated?: () => void
}

export function ManufacturingRequestForm({ projectId, onClose, onCreated }: Props) {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState({
    productId: '',
    bomId: '',
    qtyRequested: '1',
    requiredDate: '',
    description: '',
    notes: '',
  })

  const { data: bomsData } = useQuery<{ boms: BOM[] }>(BOMS_QUERY, { variables: { isActive: true, allCompanies: true } })
  const boms = bomsData?.boms ?? []

  const [createMR, { loading }] = useMutation(CREATE_MANUFACTURING_REQUEST, {
    refetchQueries: [{ query: MANUFACTURING_REQUESTS_QUERY, variables: { projectId } }],
  })

  async function handleSubmit() {
    try {
      await createMR({
        variables: {
          input: {
            projectId,
            productId: form.productId || null,
            qtyRequested: parseFloat(form.qtyRequested) || 1,
            requiredDate: form.requiredDate || null,
            description: form.description || null,
            notes: form.notes || null,
          },
        },
      })
      addToast({ type: 'success', message: 'Manufacturing request created' })
      onCreated?.()
      onClose()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const inputStyle = {
    width: '100%', padding: '7px 10px', borderRadius: '6px',
    border: `1px solid ${theme.border}`, background: theme.bgCanvas,
    color: theme.textPrimary, fontSize: '13px', boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: '11px', color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }

  return (
    <Modal open={true} title="New Manufacturing Request" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '420px' }}>

        <div>
          <SearchableSelect
            label="Product (BOM)"
            value={form.bomId}
            onChange={(v) => {
              const bom = boms.find(b => b.id === v)
              setForm(f => ({ ...f, bomId: v, productId: bom?.finished_product_id ?? '' }))
            }}
            placeholder="— Select a product —"
            options={boms.map(b => ({ value: b.id, label: `${b.product_name} (v${b.version})` }))}
          />
        </div>

        <div>
          <label style={labelStyle}>Quantity Requested <span style={{ color: theme.danger }}>*</span></label>
          <input
            type="number" min="0.0001" step="0.0001"
            style={inputStyle}
            value={form.qtyRequested}
            onChange={e => setForm(f => ({ ...f, qtyRequested: e.target.value }))}
          />
        </div>

        <div>
          <label style={labelStyle}>Required By Date</label>
          <input
            type="date"
            style={inputStyle}
            value={form.requiredDate}
            onChange={e => setForm(f => ({ ...f, requiredDate: e.target.value }))}
          />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Describe what needs to be manufactured…"
          />
        </div>

        <div>
          <label style={labelStyle}>Notes</label>
          <textarea
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" loading={loading} onClick={handleSubmit}>Create Request</Button>
        </div>
      </div>
    </Modal>
  )
}
