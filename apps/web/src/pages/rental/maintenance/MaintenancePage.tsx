import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useSearchParams } from 'react-router-dom'
import {
  MAINTENANCE_SCHEDULES_QUERY,
  MAINTENANCE_RECORDS_QUERY,
  SCHEDULE_MAINTENANCE,
  RECORD_MAINTENANCE,
  EQUIPMENT_ASSETS_QUERY,
} from '../../../graphql/rental'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { TabBar } from '../../../components/ui/TabBar'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import type { MaintenanceEvent } from '../../../components/ui/MaintenanceCalendar'
import { MaintenanceCalendar } from '../../../components/ui/MaintenanceCalendar'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { useToastStore } from '../../../store/toastStore'
import { KPICard } from '../../../components/ui/KPICard'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { MaintenanceRecordDetail } from './MaintenanceRecordDetail'

const TABS = ['Calendar', 'Scheduled', 'Records'].map((t) => ({ key: t, label: t }))
const MAINTENANCE_TYPES = [
  'inspection',
  'oil_change',
  'tire_rotation',
  'brake_service',
  'engine_service',
  'electrical',
  'body_repair',
  'other',
]

interface Schedule {
  id: string
  asset_id: string
  asset_name?: string
  maintenance_type: string
  scheduled_date: string
  description?: string
  status: string
  estimated_cost?: number
  assigned_to?: string
}

interface Record {
  id: string
  asset_id: string
  maintenance_type: string
  performed_date: string
  description: string
  cost: number
  performed_by: string
  next_due_date?: string
}

export default function MaintenancePage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [searchParams] = useSearchParams()
  const preselectedAssetId = searchParams.get('assetId') ?? ''
  const [tab, setTab] = useState('Calendar')
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [detailDrawer, setDetailDrawer] = useState<{ recordId: string; assetId: string } | null>(
    null,
  )
  const [scheduleForm, setScheduleForm] = useState({
    asset_id: preselectedAssetId,
    maintenance_type: 'inspection',
    scheduled_date: '',
    description: '',
    estimated_cost: '',
    assigned_to: '',
  })
  const [recordForm, setRecordForm] = useState({
    asset_id: preselectedAssetId,
    maintenance_type: 'inspection',
    performed_date: new Date().toISOString().slice(0, 10),
    description: '',
    cost: '',
    performed_by: '',
    next_due_date: '',
  })

  const {
    data: schedulesData,
    loading: schedulesLoading,
    refetch: refetchSchedules,
  } = useQuery(MAINTENANCE_SCHEDULES_QUERY, {
    variables: { assetId: preselectedAssetId || undefined },
    fetchPolicy: 'cache-and-network',
  })
  const {
    data: recordsData,
    loading: recordsLoading,
    refetch: refetchRecords,
  } = useQuery(MAINTENANCE_RECORDS_QUERY, {
    variables: { assetId: preselectedAssetId || undefined },
    fetchPolicy: 'cache-and-network',
  })
  const { data: assetsData } = useQuery(EQUIPMENT_ASSETS_QUERY, {})
  const [scheduleMaintenance, { loading: scheduling }] = useMutation(SCHEDULE_MAINTENANCE)
  const [recordMaintenance, { loading: recording }] = useMutation(RECORD_MAINTENANCE)

  const schedules: Schedule[] = schedulesData?.maintenanceSchedules ?? []
  const records: Record[] = recordsData?.maintenanceRecords ?? []
  const assets = assetsData?.equipmentAssets ?? []

  const overdueCount = schedules.filter(
    (s) => s.status === 'scheduled' && s.scheduled_date < new Date().toISOString().slice(0, 10),
  ).length
  const dueSoonCount = schedules.filter((s) => {
    if (s.status !== 'scheduled') return false
    const days = Math.ceil((new Date(s.scheduled_date).getTime() - Date.now()) / 864e5)
    return days >= 0 && days <= 7
  }).length

  const calendarEvents: MaintenanceEvent[] = schedules.map((s) => ({
    id: s.id,
    title: `${s.asset_name ?? 'Asset'}: ${s.maintenance_type}`,
    date: s.scheduled_date,
    type:
      s.status === 'completed'
        ? 'completed'
        : s.scheduled_date < new Date().toISOString().slice(0, 10)
          ? 'overdue'
          : 'scheduled',
    assetName: s.asset_name,
  }))

  const selectStyle: React.CSSProperties = {
    width: '100%',
    background: theme.bgSurface,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '13px',
  }

  async function handleScheduleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = {
      ...scheduleForm,
      estimated_cost: scheduleForm.estimated_cost ? parseFloat(scheduleForm.estimated_cost) : null,
      assigned_to: scheduleForm.assigned_to || null,
    }
    try {
      await scheduleMaintenance({ variables: { input } })
      addToast({ type: 'success', message: 'Maintenance scheduled' })
      setShowScheduleForm(false)
      refetchSchedules()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleRecordSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = {
      ...recordForm,
      cost: parseFloat(recordForm.cost) || 0,
      next_due_date: recordForm.next_due_date || null,
    }
    try {
      await recordMaintenance({ variables: { input } })
      addToast({ type: 'success', message: 'Maintenance recorded' })
      setShowRecordForm(false)
      refetchRecords()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  const scheduleColumns: Column<Schedule>[] = [
    {
      key: 'asset_name',
      header: 'Asset',
      render: (s) => (
        <span style={{ color: theme.textPrimary, fontWeight: 500, fontSize: '13px' }}>
          {s.asset_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'maintenance_type',
      header: 'Type',
      render: (s) => <Badge variant="neutral">{s.maintenance_type.replace('_', ' ')}</Badge>,
    },
    {
      key: 'scheduled_date',
      header: 'Date',
      render: (s) => {
        const isOverdue =
          s.status === 'scheduled' && s.scheduled_date < new Date().toISOString().slice(0, 10)
        return (
          <span
            style={{
              color: isOverdue ? theme.danger : theme.textSecondary,
              fontSize: '13px',
              fontWeight: isOverdue ? 600 : 400,
            }}
          >
            {s.scheduled_date}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (s) => {
        const isOverdue =
          s.status === 'scheduled' && s.scheduled_date < new Date().toISOString().slice(0, 10)
        return (
          <Badge variant={s.status === 'completed' ? 'success' : isOverdue ? 'danger' : 'neutral'}>
            {isOverdue ? 'OVERDUE' : s.status}
          </Badge>
        )
      },
    },
    {
      key: 'estimated_cost',
      header: 'Est. Cost',
      render: (s) =>
        s.estimated_cost ? (
          <AmountDisplay amount={s.estimated_cost} currency="IQD" size="sm" />
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'assigned_to',
      header: 'Assigned To',
      render: (s) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{s.assigned_to ?? '—'}</span>
      ),
    },
  ]

  const recordColumns: Column<Record>[] = [
    {
      key: 'asset_id',
      header: 'Asset',
      render: (r) => (
        <span style={{ color: theme.textMuted, fontFamily: 'monospace', fontSize: '12px' }}>
          {r.asset_id}
        </span>
      ),
    },
    {
      key: 'maintenance_type',
      header: 'Type',
      render: (r) => <Badge variant="neutral">{r.maintenance_type.replace('_', ' ')}</Badge>,
    },
    {
      key: 'performed_date',
      header: 'Performed',
      render: (r) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{r.performed_date}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (r) => (
        <span style={{ color: theme.textPrimary, fontSize: '13px' }}>{r.description}</span>
      ),
    },
    {
      key: 'cost',
      header: 'Cost',
      render: (r) => <AmountDisplay amount={r.cost} currency="IQD" size="sm" />,
    },
    {
      key: 'performed_by',
      header: 'Performed By',
      render: (r) => (
        <span style={{ color: theme.textSecondary, fontSize: '12px' }}>{r.performed_by}</span>
      ),
    },
    {
      key: 'next_due_date',
      header: 'Next Due',
      render: (r) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>{r.next_due_date ?? '—'}</span>
      ),
    },
    {
      key: 'id',
      header: '',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDetailDrawer({ recordId: r.id, assetId: r.asset_id })
          }}
        >
          View
        </Button>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1500px' }}>
      <PageHeader
        title="Maintenance"
        subtitle="Equipment maintenance scheduling and records"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowRecordForm(true)
              }}
            >
              Record Service
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowScheduleForm(true)
              }}
            >
              Schedule Maintenance
            </Button>
          </div>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginTop: '16px',
        }}
      >
        <KPICard
          title="Scheduled"
          value={schedules.filter((s) => s.status === 'scheduled').length}
          subtitle="upcoming"
          iconColor="info"
        />
        <KPICard
          title="Due This Week"
          value={dueSoonCount}
          subtitle="within 7 days"
          iconColor="warning"
        />
        <KPICard
          title="Overdue"
          value={overdueCount}
          subtitle="past due date"
          iconColor={overdueCount > 0 ? 'danger' : 'success'}
        />
      </div>

      <div style={{ marginTop: '16px' }}>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div style={{ marginTop: '16px' }}>
        {tab === 'Calendar' && (
          <Card style={{ padding: '20px' }}>
            <MaintenanceCalendar events={calendarEvents} />
          </Card>
        )}

        {tab === 'Scheduled' && (
          <Card>
            <Table
              columns={scheduleColumns}
              data={schedules}
              loading={schedulesLoading}
              rowKey="id"
            />
          </Card>
        )}

        {tab === 'Records' && (
          <Card>
            <Table columns={recordColumns} data={records} loading={recordsLoading} rowKey="id" />
          </Card>
        )}
      </div>

      {/* Schedule Modal */}
      <Modal
        open={showScheduleForm}
        onClose={() => {
          setShowScheduleForm(false)
        }}
        title="Schedule Maintenance"
      >
        <form
          onSubmit={handleScheduleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}
        >
          <div>
            <SearchableSelect
              label="Asset"
              value={scheduleForm.asset_id}
              onChange={(v) => {
                setScheduleForm((f) => ({ ...f, asset_id: v }))
              }}
              placeholder="Select asset…"
              options={assets.map((a: { id: string; asset_number: string; name: string }) => ({
                value: a.id,
                label: `${a.asset_number} — ${a.name}`,
              }))}
            />
          </div>
          <div>
            <SearchableSelect
              label="Maintenance Type"
              value={scheduleForm.maintenance_type}
              onChange={(v) => {
                setScheduleForm((f) => ({ ...f, maintenance_type: v }))
              }}
              options={MAINTENANCE_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))}
            />
          </div>
          <Input
            label="Scheduled Date"
            type="date"
            value={scheduleForm.scheduled_date}
            onChange={(e) => {
              setScheduleForm((f) => ({ ...f, scheduled_date: e.target.value }))
            }}
            required
          />
          <Input
            label="Description"
            value={scheduleForm.description}
            onChange={(e) => {
              setScheduleForm((f) => ({ ...f, description: e.target.value }))
            }}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <Input
              label="Estimated Cost"
              type="number"
              step="0.01"
              value={scheduleForm.estimated_cost}
              onChange={(e) => {
                setScheduleForm((f) => ({ ...f, estimated_cost: e.target.value }))
              }}
            />
            <Input
              label="Assigned To"
              value={scheduleForm.assigned_to}
              onChange={(e) => {
                setScheduleForm((f) => ({ ...f, assigned_to: e.target.value }))
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setShowScheduleForm(false)
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={scheduling}>
              Schedule
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Modal */}
      <Modal
        open={showRecordForm}
        onClose={() => {
          setShowRecordForm(false)
        }}
        title="Record Maintenance Service"
      >
        <form
          onSubmit={handleRecordSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}
        >
          <div>
            <SearchableSelect
              label="Asset"
              value={recordForm.asset_id}
              onChange={(v) => {
                setRecordForm((f) => ({ ...f, asset_id: v }))
              }}
              placeholder="Select asset…"
              options={assets.map((a: { id: string; asset_number: string; name: string }) => ({
                value: a.id,
                label: `${a.asset_number} — ${a.name}`,
              }))}
            />
          </div>
          <div>
            <SearchableSelect
              label="Maintenance Type"
              value={recordForm.maintenance_type}
              onChange={(v) => {
                setRecordForm((f) => ({ ...f, maintenance_type: v }))
              }}
              options={MAINTENANCE_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))}
            />
          </div>
          <Input
            label="Performed Date"
            type="date"
            value={recordForm.performed_date}
            onChange={(e) => {
              setRecordForm((f) => ({ ...f, performed_date: e.target.value }))
            }}
            required
          />
          <Input
            label="Description"
            value={recordForm.description}
            onChange={(e) => {
              setRecordForm((f) => ({ ...f, description: e.target.value }))
            }}
            required
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <Input
              label="Cost"
              type="number"
              step="0.01"
              value={recordForm.cost}
              onChange={(e) => {
                setRecordForm((f) => ({ ...f, cost: e.target.value }))
              }}
              required
            />
            <Input
              label="Performed By"
              value={recordForm.performed_by}
              onChange={(e) => {
                setRecordForm((f) => ({ ...f, performed_by: e.target.value }))
              }}
              required
            />
          </div>
          <Input
            label="Next Due Date (optional)"
            type="date"
            value={recordForm.next_due_date}
            onChange={(e) => {
              setRecordForm((f) => ({ ...f, next_due_date: e.target.value }))
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setShowRecordForm(false)
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={recording}>
              Save Record
            </Button>
          </div>
        </form>
      </Modal>

      {detailDrawer && (
        <MaintenanceRecordDetail
          open={!!detailDrawer}
          recordId={detailDrawer.recordId}
          assetId={detailDrawer.assetId}
          onClose={() => {
            setDetailDrawer(null)
          }}
          onCompleted={() => {
            setDetailDrawer(null)
            refetchRecords()
            refetchSchedules()
          }}
        />
      )}
    </div>
  )
}
