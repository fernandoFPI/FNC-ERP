import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
    <Modal open={open} onClose={onClose} title={t('ui.usageLog.logUsage', { assetName })}>
      <form
        onSubmit={(...args: Parameters<typeof handleSubmit>) => void handleSubmit(...args)}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}
      >
        <Input
          label={t('ui.usageLog.date')}
          type="date"
          value={form.usage_date}
          onChange={(e) => {
            setForm((f) => ({ ...f, usage_date: e.target.value }))
          }}
          required
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input
            label={t('ui.usageLog.hoursUsed')}
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
            label={t('ui.usageLog.mileageKm')}
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
              background: theme.warningBg,
              border: `1px solid ${theme.warning}`,
              borderRadius: '6px',
              fontSize: '13px',
              color: theme.warning,
            }}
          >{t('ui.usageLog.maintenanceWillBeDueAtH', { maintenanceDueHours, currentHours, projectedHours })}</div>
        )}

        <Input
          label={t('ui.usageLog.operatorName')}
          value={form.operator_name}
          onChange={(e) => {
            setForm((f) => ({ ...f, operator_name: e.target.value }))
          }}
          required
        />
        <Input
          label={t('ui.usageLog.notes')}
          value={form.notes ?? ''}
          onChange={(e) => {
            setForm((f) => ({ ...f, notes: e.target.value }))
          }}
        />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            {t('ui.usageLog.cancel')}
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            {t('ui.usageLog.saveLog')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
