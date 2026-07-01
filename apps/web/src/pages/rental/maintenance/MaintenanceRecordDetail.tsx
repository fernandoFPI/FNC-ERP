import { useState, useEffect } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { api } from '../../../lib/axios'
import { Drawer } from '../../../components/ui/Drawer'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { CurrencyInput } from '../../../components/ui/CurrencyInput'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { ActivityLog } from '../../../components/ui/ActivityLog'
import { Spinner } from '../../../components/ui/Spinner'
import { useToastStore } from '../../../store/toastStore'
import { formatCurrency } from '../../../lib/format'

interface MaintenanceRecord {
  id: string
  asset_id: string
  asset_name?: string
  schedule_name?: string
  maintenance_type: string
  trigger_type?: string
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  due_date?: string
  due_engine_hours?: number
  estimated_cost?: number
  interval_description?: string
  started_at?: string
  completed_at?: string
  completed_by_name?: string
  engine_hours_at_service?: number
  actual_cost?: number
  findings?: string
  parts_replaced?: string
  next_service_notes?: string
  downtime_hours?: number
  next_service_due?: string
}

interface Props {
  recordId: string
  assetId: string
  open: boolean
  onClose: () => void
  onCompleted: () => void
}

function relativeTime(dateStr?: string): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
  scheduled: 'neutral', in_progress: 'warning', completed: 'success', cancelled: 'danger',
}

export function MaintenanceRecordDetail({ recordId, assetId, open, onClose, onCompleted }: Props) {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [record,    setRecord]    = useState<MaintenanceRecord | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [starting,  setStarting]  = useState(false)
  const [completing,setCompleting]= useState(false)
  const [showCancel,setShowCancel]= useState(false)
  const [cancelling,setCancelling]= useState(false)

  const [form, setForm] = useState({
    engineHoursAtService: '',
    actualCost: '' as number | '',
    findings: '',
    partsReplaced: '',
    nextServiceNotes: '',
    downtimeHours: '',
  })

  async function fetchRecord() {
    setLoading(true)
    try {
      const res = await api.get(`/rental/assets/${assetId}/maintenance/${recordId}`)
      setRecord(res.data as MaintenanceRecord)
    } catch {
      addToast({ type: 'error', message: 'Failed to load maintenance record' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) fetchRecord()
    else { setRecord(null); setForm({ engineHoursAtService: '', actualCost: '', findings: '', partsReplaced: '', nextServiceNotes: '', downtimeHours: '' }) }
  }, [open, assetId, recordId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStart() {
    setStarting(true)
    try {
      await api.post(`/rental/assets/${assetId}/maintenance/${recordId}/start`)
      addToast({ type: 'success', message: 'Maintenance started' })
      fetchRecord()
    } catch {
      addToast({ type: 'error', message: 'Failed to start maintenance' })
    } finally {
      setStarting(false)
    }
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      const res = await api.post(`/rental/assets/${assetId}/maintenance/${recordId}/complete`, {
        engine_hours_at_service: form.engineHoursAtService ? parseFloat(form.engineHoursAtService) : null,
        actual_cost:             form.actualCost !== '' ? form.actualCost : null,
        findings:                form.findings        || null,
        parts_replaced:          form.partsReplaced   || null,
        next_service_notes:      form.nextServiceNotes|| null,
        downtime_hours:          form.downtimeHours   ? parseFloat(form.downtimeHours) : null,
      })
      const nextDue = (res.data as { nextServiceDue?: string })?.nextServiceDue
      addToast({ type: 'success', message: nextDue ? `Next service due: ${nextDue}` : 'Asset returned to available status' })
      onCompleted()
      onClose()
    } catch {
      addToast({ type: 'error', message: 'Failed to complete maintenance' })
    } finally {
      setCompleting(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    try {
      await api.post(`/rental/assets/${assetId}/maintenance/${recordId}/cancel`)
      addToast({ type: 'success', message: 'Maintenance schedule cancelled' })
      onCompleted()
      onClose()
    } catch {
      addToast({ type: 'error', message: 'Failed to cancel maintenance' })
    } finally {
      setCancelling(false)
      setShowCancel(false)
    }
  }

  const drawerTitle = loading
    ? 'Loading…'
    : (record?.schedule_name ?? record?.maintenance_type?.replace(/_/g, ' ') ?? 'Maintenance Record')

  return (
    <>
      <Drawer open={open} onClose={onClose} title={drawerTitle} width="460px">
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '32px' }}>
            <Spinner size="md" />
          </div>
        )}

        {!loading && record && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Asset + status header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: theme.textPrimary }}>
                  {record.asset_name ?? 'Unknown Asset'}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px', textTransform: 'capitalize' }}>
                  {record.maintenance_type?.replace(/_/g, ' ')}
                </div>
              </div>
              <Badge variant={STATUS_VARIANT[record.status] ?? 'neutral'}>
                {record.status.replace(/_/g, ' ')}
              </Badge>
            </div>

            {/* Schedule info */}
            <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: theme.textMuted, marginBottom: '10px' }}>
                Schedule Info
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                {[
                  ['Type',           record.maintenance_type?.replace(/_/g, ' ') ?? '—'],
                  ['Trigger',        record.trigger_type?.replace(/_/g, ' ')     ?? '—'],
                  ['Due Date',       record.due_date                              ?? '—'],
                  ['Due Engine Hrs', record.due_engine_hours != null ? `${record.due_engine_hours}h` : '—'],
                  ['Est. Cost',      record.estimated_cost ? formatCurrency(record.estimated_cost, 'IQD') : '—'],
                  ['Interval',       record.interval_description                  ?? '—'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>{label}</div>
                    <div style={{ fontSize: '12px', color: theme.textSecondary, textTransform: 'capitalize' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scheduled → start / cancel */}
            {record.status === 'scheduled' && (
              <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '6px' }}>
                  Ready to begin maintenance
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '14px' }}>
                  Starting maintenance will set this asset to "In maintenance" status until work is complete.
                </div>
                <Button variant="primary" size="md" loading={starting} onClick={handleStart}
                  style={{ width: '100%' }}>
                  Start Maintenance
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowCancel(true)}
                  style={{ width: '100%', marginTop: '8px', color: theme.danger }}>
                  Cancel Schedule
                </Button>
              </div>
            )}

            {/* In progress → completion form */}
            {record.status === 'in_progress' && (
              <>
                <div style={{ padding: '8px 12px', background: theme.warningBg, border: `1px solid ${theme.warningBorder}`, borderRadius: '8px', fontSize: '11px', color: theme.warning }}>
                  Maintenance started {relativeTime(record.started_at)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {record.trigger_type?.includes('hour') && (
                    <Input
                      label="Engine hours at service"
                      type="number"
                      value={form.engineHoursAtService}
                      onChange={e => setForm(f => ({ ...f, engineHoursAtService: e.target.value }))}
                      placeholder="Current cumulative engine hours"
                    />
                  )}
                  <CurrencyInput
                    label="Actual cost"
                    value={form.actualCost}
                    onChange={v => setForm(f => ({ ...f, actualCost: v }))}
                    currency="IQD"
                  />
                  <Textarea
                    label="Findings"
                    value={form.findings}
                    onChange={e => setForm(f => ({ ...f, findings: e.target.value }))}
                    placeholder="Describe the condition found during maintenance…"
                    rows={3}
                  />
                  <Textarea
                    label="Parts replaced"
                    value={form.partsReplaced}
                    onChange={e => setForm(f => ({ ...f, partsReplaced: e.target.value }))}
                    placeholder="List parts replaced, with part numbers if known…"
                    rows={2}
                  />
                  <Input
                    label="Downtime hours"
                    type="number"
                    step="0.5"
                    value={form.downtimeHours}
                    onChange={e => setForm(f => ({ ...f, downtimeHours: e.target.value }))}
                    placeholder="Total hours asset was out of service"
                  />
                  <Textarea
                    label="Notes for next service"
                    value={form.nextServiceNotes}
                    onChange={e => setForm(f => ({ ...f, nextServiceNotes: e.target.value }))}
                    rows={2}
                  />
                  <Button variant="primary" size="md" loading={completing} onClick={handleComplete}
                    style={{ width: '100%' }}>
                    Complete Maintenance
                  </Button>
                </div>
              </>
            )}

            {/* Completed → read-only */}
            {record.status === 'completed' && (
              <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, marginBottom: '10px' }}>
                  Completion Record
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                  {[
                    ['Completed',     record.completed_at
                      ? `${relativeTime(record.completed_at)}${record.completed_by_name ? ` · ${record.completed_by_name}` : ''}` : '—'],
                    ['Engine hours',  record.engine_hours_at_service != null ? `${record.engine_hours_at_service}h` : '—'],
                    ['Actual cost',   record.actual_cost ? formatCurrency(record.actual_cost, 'IQD') : '—'],
                    ['Downtime',      record.downtime_hours != null ? `${record.downtime_hours}h` : '—'],
                    ['Findings',      record.findings      ?? '—'],
                    ['Parts replaced',record.parts_replaced ?? '—'],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '8px' }}>
                      <span style={{ color: theme.textMuted }}>{label}</span>
                      <span style={{ color: theme.textSecondary }}>{value}</span>
                    </div>
                  ))}
                </div>
                {record.next_service_due && (
                  <div style={{ marginTop: '12px', padding: '8px 12px', background: theme.infoBg, border: `1px solid ${theme.infoBorder}`, borderRadius: '8px', fontSize: '11px', color: theme.info }}>
                    Next service due: {record.next_service_due}
                  </div>
                )}
              </div>
            )}

            {/* Activity log */}
            <ActivityLog recordId={recordId} tableName="asset_maintenance_records" />

          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={showCancel}
        title="Cancel Maintenance Schedule"
        message="This will cancel the maintenance schedule and return the asset to its previous status."
        confirmLabel="Cancel Schedule"
        variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setShowCancel(false)}
        loading={cancelling}
      />
    </>
  )
}
