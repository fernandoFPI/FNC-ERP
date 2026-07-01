import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { SHIFT_CONFIGS_QUERY, CREATE_SHIFT_CONFIG, UPDATE_SHIFT_CONFIG } from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Table, Column } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { useToastStore } from '../../../store/toastStore'

interface ShiftConfig {
  id: string
  name: string
  start_time?: string
  end_time?: string
  break_minutes?: number
  overtime_threshold_hours?: string
  is_active: boolean
}

const emptyForm = {
  name: '',
  start_time: '08:00', end_time: '17:00', break_minutes: 60,
  overtime_threshold_hours: 8,
}

function calcRegularHours(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let totalMin = (eh * 60 + em) - (sh * 60 + sm)
  if (totalMin <= 0) totalMin += 1440 // overnight shift wraps past midnight
  return Math.max(0, (totalMin - breakMin) / 60)
}

export default function ShiftConfigsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data, loading, refetch } = useQuery(SHIFT_CONFIGS_QUERY, { fetchPolicy: 'cache-and-network' })
  const [createShift, { loading: creating }] = useMutation(CREATE_SHIFT_CONFIG)
  const [updateShift, { loading: updating }] = useMutation(UPDATE_SHIFT_CONFIG)

  const shifts: ShiftConfig[] = data?.shiftConfigs ?? []

  function openCreate() { setForm({ ...emptyForm }); setEditId(null); setModalOpen(true) }
  function openEdit(s: ShiftConfig) {
    setForm({ name: s.name, start_time: s.start_time ?? '08:00', end_time: s.end_time ?? '17:00', break_minutes: s.break_minutes ?? 60, overtime_threshold_hours: parseFloat(s.overtime_threshold_hours ?? '8') })
    setEditId(s.id); setModalOpen(true)
  }

  function updateTime(key: 'start_time' | 'end_time', val: string) {
    setForm((f) => {
      const updated = { ...f, [key]: val }
      const reg = calcRegularHours(updated.start_time, updated.end_time, updated.break_minutes)
      return { ...updated, overtime_threshold_hours: reg }
    })
  }

  async function handleSubmit() {
    const input = { ...form }
    try {
      if (editId) { await updateShift({ variables: { id: editId, input } }); addToast({ type: 'success', message: 'Shift updated' }) }
      else { await createShift({ variables: { input } }); addToast({ type: 'success', message: 'Shift created' }) }
      setModalOpen(false); refetch()
    } catch (err) { addToast({ type: 'error', message: (err as Error).message }) }
  }

  const columns: Column<ShiftConfig>[] = [
    { key: 'name', header: 'Name', render: (s) => <span style={{ fontWeight: 500, color: theme.textPrimary }}>{s.name}</span> },
    { key: 'start_time', header: 'Start', render: (s) => <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{s.start_time ?? '—'}</span> },
    { key: 'end_time', header: 'End', render: (s) => <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{s.end_time ?? '—'}</span> },
    { key: 'break_minutes', header: 'Break', render: (s) => <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{s.break_minutes ?? 0} min</span> },
    { key: 'overtime_threshold_hours', header: 'OT threshold', render: (s) => <span style={{ fontFamily: 'monospace', color: theme.warning }}>{s.overtime_threshold_hours ?? '—'}h</span> },
    { key: 'is_active', header: 'Status', render: (s) => <Badge variant={s.is_active ? 'success' : 'neutral'}>{s.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'id', header: '', render: (s) => <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>Edit</Button> },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader title="Shift Configurations" subtitle={`${shifts.length} shifts`}
        actions={<Button variant="primary" size="sm" onClick={openCreate}>New Shift</Button>} />

      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={shifts} loading={loading} rowKey="id" />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Shift' : 'New Shift'} size="md"
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="primary" onClick={handleSubmit} loading={creating || updating}>Save</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="e.g. Standard Office" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <Input label="Start time" type="time" value={form.start_time} onChange={(e) => updateTime('start_time', e.target.value)} />
            <Input label="End time" type="time" value={form.end_time} onChange={(e) => updateTime('end_time', e.target.value)} />
            <Input label="Break (min)" type="number" min="0" value={String(form.break_minutes)} onChange={(e) => { const v = parseInt(e.target.value) || 0; setForm((f) => { const reg = calcRegularHours(f.start_time, f.end_time, v); return { ...f, break_minutes: v, overtime_threshold_hours: reg } }) }} />
          </div>

          <div style={{ background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: theme.textSecondary }}>
            A {Math.round((() => { const [sh, sm] = form.start_time.split(':').map(Number); const [eh, em] = form.end_time.split(':').map(Number); let d = (eh * 60 + em) - (sh * 60 + sm); if (d <= 0) d += 1440; return d / 60 })())}h shift with {form.break_minutes} min break = <strong>{calcRegularHours(form.start_time, form.end_time, form.break_minutes).toFixed(1)} regular hours</strong>
          </div>

          <Input label="OT threshold (hrs)" type="number" step="0.5" value={String(form.overtime_threshold_hours)} onChange={(e) => setForm((f) => ({ ...f, overtime_threshold_hours: parseFloat(e.target.value) || 0 }))} />
          <div style={{ fontSize: '11px', color: theme.textMuted }}>Iraq Labour Law minimum OT multiplier: 1.5×</div>
        </div>
      </Modal>
    </div>
  )
}
