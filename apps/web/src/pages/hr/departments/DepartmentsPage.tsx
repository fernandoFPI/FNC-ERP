import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { DEPARTMENTS_QUERY, CREATE_DEPARTMENT, UPDATE_DEPARTMENT } from '../../../graphql/hr'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Table, Column } from '../../../components/ui/Table'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { useToastStore } from '../../../store/toastStore'

interface Department {
  id: string
  name: string
  is_active: boolean
}

const emptyForm = () => ({ name: '' })

export default function DepartmentsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())

  const { data, loading, refetch } = useQuery(DEPARTMENTS_QUERY, { fetchPolicy: 'cache-and-network' })
  const [createDept, { loading: creating }] = useMutation(CREATE_DEPARTMENT)
  const [updateDept, { loading: updating }] = useMutation(UPDATE_DEPARTMENT)

  const departments: Department[] = data?.departments ?? []

  function openCreate() { setForm(emptyForm()); setEditId(null); setModalOpen(true) }
  function openEdit(d: Department) {
    setForm({ name: d.name })
    setEditId(d.id); setModalOpen(true)
  }

  async function handleSubmit() {
    const input = { name: form.name }
    try {
      if (editId) {
        await updateDept({ variables: { id: editId, input } })
        addToast({ type: 'success', message: 'Department updated' })
      } else {
        await createDept({ variables: { input } })
        addToast({ type: 'success', message: 'Department created' })
      }
      setModalOpen(false); refetch()
    } catch (err) { addToast({ type: 'error', message: (err as Error).message }) }
  }

  const columns: Column<Department>[] = [
    { key: 'name', header: 'Name', render: (d) => <span style={{ fontWeight: 500, color: theme.textPrimary }}>{d.name}</span> },
    { key: 'is_active', header: 'Status', render: (d) => <Badge variant={d.is_active ? 'success' : 'neutral'}>{d.is_active ? 'Active' : 'Inactive'}</Badge> },
    { key: 'id', header: '', render: (d) => <Button variant="ghost" size="sm" onClick={() => openEdit(d)}>Edit</Button> },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader title="Departments" subtitle={`${departments.length} departments`}
        actions={<Button variant="primary" size="sm" onClick={openCreate}>New Department</Button>} />

      <Card style={{ marginTop: '20px' }}>
        <Table columns={columns} data={departments} loading={loading} rowKey="id" />
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Department' : 'New Department'} size="sm"
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button variant="primary" onClick={handleSubmit} loading={creating || updating}>Save</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </div>
      </Modal>
    </div>
  )
}
