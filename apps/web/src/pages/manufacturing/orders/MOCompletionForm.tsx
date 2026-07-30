import { useState } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'

interface MOLine {
  id: string
  component_product_id: string
  component_name?: string
  qty_planned: number
  qty_consumed: number
  unit_cost: number
}

interface MO {
  id: string
  qty_planned: number
  planned_cost: number
  work_center_name?: string
  lines: MOLine[]
}

interface CompletionInput {
  qty_produced: number
  actual_cost?: number
  notes?: string
  lines?: { component_product_id: string; qty_consumed: number; unit_cost?: number }[]
}

interface Props {
  open: boolean
  onClose: () => void
  mo: MO
  onComplete: (input: CompletionInput) => Promise<void>
  loading: boolean
}

export function MOCompletionForm({ open, onClose, mo, onComplete, loading }: Props) {
  const { theme } = useTheme()

  const [qtyProduced, setQtyProduced] = useState(String(mo.qty_planned))
  const [notes, setNotes] = useState('')
  const [wcHours, setWcHours] = useState('')
  // Per-component actual quantities
  const [componentActuals, setComponentActuals] = useState<Record<string, string>>(
    Object.fromEntries(mo.lines.map((l) => [l.id, String(l.qty_planned)])),
  )

  function setActual(id: string, val: string) {
    setComponentActuals((prev) => ({ ...prev, [id]: val }))
  }

  // Compute actual cost from component actuals
  const computedMaterialCost = mo.lines.reduce((sum, l) => {
    const qty = parseFloat(componentActuals[l.id] ?? String(l.qty_planned)) || 0
    return sum + qty * l.unit_cost
  }, 0)

  const qtyNum = parseFloat(qtyProduced) || mo.qty_planned
  const planned = mo.planned_cost
  const variance = computedMaterialCost - planned
  const varPct = planned > 0 ? (variance / planned) * 100 : 0
  const overBudget = variance > 0

  const materialFields: LineItemField<MOLine>[] = [
    {
      key: 'component_name',
      label: 'Component',
      render: (l) => (
        <span style={{ fontWeight: 500, color: theme.textPrimary }}>{l.component_name}</span>
      ),
    },
    {
      key: 'qty_planned',
      label: 'Planned',
      render: (l) => (
        <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{l.qty_planned}</span>
      ),
    },
    {
      key: 'actual',
      label: 'Actual',
      width: '90px',
      render: (l) => {
        const actualQty = parseFloat(componentActuals[l.id] ?? String(l.qty_planned)) || 0
        const overUsed = actualQty - l.qty_planned > 0
        return (
          <input
            type="number"
            step="0.001"
            value={componentActuals[l.id] ?? String(l.qty_planned)}
            onChange={(e) => {
              setActual(l.id, e.target.value)
            }}
            style={{
              width: '100%',
              padding: '4px 6px',
              borderRadius: '5px',
              border: `1px solid ${overUsed ? theme.danger : theme.borderInput}`,
              background: overUsed ? '#ef444411' : theme.bgCanvas,
              color: theme.textPrimary,
              fontFamily: 'monospace',
              fontSize: '13px',
            }}
          />
        )
      },
    },
    {
      key: 'unit_cost',
      label: 'Unit Cost',
      render: (l) => <AmountDisplay amount={l.unit_cost} currency="IQD" size="sm" />,
    },
    {
      key: 'total',
      label: 'Total',
      render: (l) => {
        const actualQty = parseFloat(componentActuals[l.id] ?? String(l.qty_planned)) || 0
        return <AmountDisplay amount={actualQty * l.unit_cost} currency="IQD" size="sm" />
      },
    },
    {
      key: 'variance',
      label: 'Variance',
      render: (l) => {
        const actualQty = parseFloat(componentActuals[l.id] ?? String(l.qty_planned)) || 0
        const lineVar = actualQty - l.qty_planned
        const overUsed = lineVar > 0
        return (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              color: overUsed ? theme.danger : theme.success,
            }}
          >
            {lineVar >= 0 ? '+' : ''}
            {lineVar.toFixed(2)}
          </span>
        )
      },
    },
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await onComplete({
      qty_produced: qtyNum,
      actual_cost: computedMaterialCost > 0 ? computedMaterialCost : undefined,
      notes: notes || undefined,
      lines: mo.lines.map((l) => ({
        component_product_id: l.component_product_id,
        qty_consumed: parseFloat(componentActuals[l.id] ?? String(l.qty_planned)) || 0,
        unit_cost: l.unit_cost,
      })),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Complete Manufacturing Order" size="lg">
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        {/* Section 1: Qty produced */}
        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: theme.textMuted,
              marginBottom: '10px',
            }}
          >
            Quantity Produced
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <Input
              label={`Qty Produced (planned: ${mo.qty_planned})`}
              type="number"
              step="0.001"
              value={qtyProduced}
              onChange={(e) => {
                setQtyProduced(e.target.value)
              }}
              required
            />
            <Input
              label="Work Center Hours (actual)"
              type="number"
              step="0.1"
              value={wcHours}
              onChange={(e) => {
                setWcHours(e.target.value)
              }}
              placeholder={mo.work_center_name ? mo.work_center_name : 'Optional'}
            />
          </div>
        </div>

        {/* Section 2: Materials consumed */}
        {mo.lines.length > 0 && (
          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: theme.textMuted,
                marginBottom: '10px',
              }}
            >
              Materials Consumed
            </div>
            <LineItemEditor fields={materialFields} rows={mo.lines} rowKey={(l) => l.id} />
          </div>
        )}

        {/* Section 3/4: Cost summary */}
        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: theme.textMuted,
              marginBottom: '10px',
            }}
          >
            Cost Summary
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '10px',
            }}
          >
            {[
              { label: 'Planned Cost', value: planned, color: theme.textPrimary },
              {
                label: 'Actual Cost',
                value: computedMaterialCost,
                color: overBudget ? theme.danger : theme.success,
              },
              {
                label: 'Variance',
                value: Math.abs(variance),
                color: overBudget ? theme.danger : theme.success,
                prefix: overBudget ? '+' : '-',
              },
            ].map(({ label, value, color, prefix }) => (
              <div
                key={label}
                style={{
                  background: theme.bgSurface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  padding: '12px',
                }}
              >
                <div
                  style={{
                    fontSize: '10px',
                    color: theme.textMuted,
                    marginBottom: '6px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {label}
                </div>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', color }}>
                  {prefix}
                  {value.toLocaleString()} IQD
                </div>
              </div>
            ))}
          </div>
          {Math.abs(varPct) > 0.1 && (
            <div
              style={{
                marginTop: '8px',
                fontSize: '12px',
                fontWeight: 500,
                color: overBudget ? theme.danger : theme.success,
              }}
            >
              {overBudget ? '▲' : '▼'} {Math.abs(varPct).toFixed(1)}%{' '}
              {overBudget ? 'over' : 'under'} budget
            </div>
          )}
        </div>

        {/* Notes */}
        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
          }}
          placeholder="Completion notes…"
        />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            Complete MO
          </Button>
        </div>
      </form>
    </Modal>
  )
}
