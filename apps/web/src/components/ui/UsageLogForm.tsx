import { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Modal } from './Modal'
import { Input } from './Input'
import { Button } from './Button'

export interface UsageLogEntry {
  asset_id: string
  usage_date: string
  hours_used: number
  mileage_km?: number
  operator_name: string
  notes?: string
}

interface Props {
  open: boolean
  assetId: string
  assetName: string
  maintenanceDueHours?: number
  currentHours?: number
  onSubmit: (entry: UsageLogEntry) => Promise<void>
  onClose: () => void
}

export function UsageLogForm({
  open,
  assetId,
  assetName,
  maintenanceDueHours,
  currentHours = 0,
  onSubmit,
  onClose,
}: Props) {
  const { theme } = useTheme()
  const [form, setForm] = useState<Omit<UsageLogEntry, 'asset_id'>>({
    usage_date: new Date().toISOString().slice(0, 10),
    hours_used: 0,
    mileage_km: undefined,
    operator_name: '',
    notes: '',
  })
  const [loading, setLoading] = useState(false)

  const projectedHours = currentHours + (form.hours_used || 0)
  const maintenanceWarning = maintenanceDueHours != null && projectedHours >= maintenanceDueHours

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await onSubmit({ ...form, asset_id: assetId })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Log Usage — ${assetName}`}>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}
      >
        <Input
          label="Date"
          type="date"
          value={form.usage_date}
          onChange={(e) => {
            setForm((f) => ({ ...f, usage_date: e.target.value }))
          }}
          required
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label="Hours Used"
            type="number"
            step="0.5"
            min="0"
            value={String(form.hours_used)}
            onChange={(e) => {
              setForm((f) => ({ ...f, hours_used: parseFloat(e.target.value) || 0 }))
            }}
            required
          />
          <Input
            label="Mileage (km)"
            type="number"
            step="1"
            min="0"
            value={form.mileage_km != null ? String(form.mileage_km) : ''}
            onChange={(e) => {
              setForm((f) => ({
                ...f,
                mileage_km: e.target.value ? parseFloat(e.target.value) : undefined,
              }))
            }}
          />
        </div>

        {maintenanceWarning && (
          <div
            style={{
              padding: '12px',
              background: theme.warningBg ?? theme.accentBg,
              border: `1px solid ${theme.warning}`,
              borderRadius: '6px',
              fontSize: '13px',
              color: theme.warning,
            }}
          >
            ⚠ Maintenance will be due at {maintenanceDueHours}h. Current: {currentHours}h →
            projected: {projectedHours}h
          </div>
        )}

        <Input
          label="Operator Name"
          value={form.operator_name}
          onChange={(e) => {
            setForm((f) => ({ ...f, operator_name: e.target.value }))
          }}
          required
        />
        <Input
          label="Notes"
          value={form.notes ?? ''}
          onChange={(e) => {
            setForm((f) => ({ ...f, notes: e.target.value }))
          }}
        />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            Save Log
          </Button>
        </div>
      </form>
    </Modal>
  )
}
