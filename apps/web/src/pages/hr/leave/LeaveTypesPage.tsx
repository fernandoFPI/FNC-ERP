import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { LEAVE_TYPES_QUERY, CREATE_LEAVE_TYPE, DELETE_LEAVE_TYPE } from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Table, Column } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Checkbox } from '../../../components/ui/Checkbox'
import { PermissionGate } from '../../../components/ui/PermissionGate'
import { useToastStore } from '../../../store/toastStore'

interface LeaveType {
  id: string
  name: string
  is_paid: boolean
  max_days_per_year?: number
  requires_approval: boolean
  is_active: boolean
}

const emptyForm = { name: '', is_paid: true, max_days_per_year: '', requires_approval: true }

export default function LeaveTypesPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null)

  const { data, loading, refetch } = useQuery(LEAVE_TYPES_QUERY, { fetchPolicy: 'cache-and-network' })
  const [createLeaveType, { loading: creating }] = useMutation(CREATE_LEAVE_TYPE)
  const [deleteLeaveType, { loading: deleting }] = useMutation(DELETE_LEAVE_TYPE)

  const leaveTypes: LeaveType[] = data?.leaveTypes ?? []

  async function handleSubmit() {
    const input = { name: form.name, is_paid: form.is_paid, max_days_per_year: form.max_days_per_year ? parseInt(form.max_days_per_year) : undefined, requires_approval: form.requires_approval }
    try {
      await createLeaveType({ variables: { input } })
      addToast({ type: 'success', message: 'Leave type created' })
      setModalOpen(false); setForm(emptyForm); refetch()
    } catch (err) { addToast({ type: 'error', message: (err as Error).message }) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteLeaveType({ variables: { id: deleteTarget.id } })
      addToast({ type: 'success', message: `"${deleteTarget.name}" deleted` })
      setDeleteTarget(null); refetch()
    } catch (err) { addToast({ type: 'error', message: (err as Error).message }) }
  }

  const columns: Column<LeaveType>[] = [
    { key: 'name', header: 'Name', render: (l) => <span style={{ fontWeight: 500, color: theme.textPrimary }}>{l.name}</span> },
    { key: 'is_paid', header: 'Paid', render: (l) => <Badge variant={l.is_paid ? 'success' : 'neutral'}>{l.is_paid ? 'Paid' : 'Unpaid'}</Badge> },
    { key: 'max_days_per_year', header: 'Max days/yr', render: (l) => <span style={{ fontFamily: 'monospace', color: theme.textSecondary }}>{l.max_days_per_year ?? 'Unlimited'}</span> },
    { key: 'requires_approval', header: 'Requires approval', render: (l) => <Badge variant={l.requires_approval ? 'info' : 'neutral'}>{l.requires_approval ? 'Yes' : 'No'}</Badge> },
    { key: 'is_active', header: 'Status', render: (l) => <Badge variant={l.is_active ? 'success' : 'neutral'}>{l.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'id', header: '', render: (l) => (
      <PermissionGate permission="hr.leave.approve" minLevel="approve">
        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(l)}
          style={{ color: theme.danger }}>Delete</Button>
      </PermissionGate>
    ) },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader title="Leave Types" subtitle={`${leaveTypes.length} leave types`}
        actions={
          <PermissionGate permission="hr.leave.approve" minLevel="approve">
            <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>Add Leave Type</Button>
          </PermissionGate>
        } />

      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={leaveTypes} loading={loading} rowKey="id" />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Leave Type" size="sm"
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="primary" onClick={handleSubmit} loading={creating}>Create</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="e.g. Annual leave" />
          <Input label="Max days per year" type="number" min="1" value={form.max_days_per_year} onChange={(e) => setForm((f) => ({ ...f, max_days_per_year: e.target.value }))} placeholder="Leave blank for unlimited" />
          <Checkbox label="Paid leave" checked={form.is_paid} onChange={(checked) => setForm((f) => ({ ...f, is_paid: checked }))} />
          <Checkbox label="Requires approval" checked={form.requires_approval} onChange={(checked) => setForm((f) => ({ ...f, requires_approval: checked }))} />
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete leave type" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button variant="danger" onClick={handleDelete} loading={deleting}>Delete</Button></>}>
        <p style={{ margin: 0, color: theme.textPrimary }}>
          Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          This cannot be undone. If this type has existing leave requests, the deletion will be blocked.
        </p>
      </Modal>
    </div>
  )
}
