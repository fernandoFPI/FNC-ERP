import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { useAuthStore } from '../../../store/authStore'
import { api } from '../../../lib/axios'
import { apiErrMsg } from '../../../lib/apiError'
import { COMPANY_USERS_QUERY } from '../../../graphql/admin'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface CostCenter {
  id: string
  code: string
  name: string
  type: 'department' | 'project' | 'entity' | 'overhead'
  parent_id?: string
  is_active: boolean
  journal_line_count: number
  default_recharge_fulfiller_id?: string | null
  default_recharge_fulfiller_email?: string | null
}

const TYPE_LABELS: Record<string, string> = {
  department: 'Department',
  project: 'Project',
  entity: 'Entity',
  overhead: 'Overhead',
}
const TYPE_VARIANTS: Record<string, 'neutral' | 'info' | 'accent' | 'warning'> = {
  department: 'info',
  project: 'accent',
  entity: 'neutral',
  overhead: 'warning',
}

const EMPTY_FORM = {
  code: '',
  name: '',
  type: 'department' as CostCenter['type'],
  parent_id: '',
  default_recharge_fulfiller_id: '',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <div style={{ marginBottom: '12px' }}>
      <label
        style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}
      >
        {label}
      </label>
      {children}
    </div>
  )
}

export default function CostCentersPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const companyId = useAuthStore((s) => s.user?.companyId ?? '')
  const { data: usersData } = useQuery(COMPANY_USERS_QUERY, {
    variables: { companyId },
    skip: !companyId,
  })
  const companyUsers: { id: string; email: string }[] = usersData?.companyUsers ?? []

  const [items, setItems] = useState<CostCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CostCenter | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (activeOnly) params.is_active = 'true'
      if (search) params.search = search
      const res = await api.get<CostCenter[]>('/finance/cost-centers', { params })
      setItems(Array.isArray(res.data) ? res.data : [])
    } catch {
      addToast({ type: 'error', message: 'Failed to load cost centers' })
    } finally {
      setLoading(false)
    }
  }, [addToast, activeOnly, search])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }
  function openEdit(cc: CostCenter) {
    setEditing(cc)
    setForm({
      code: cc.code,
      name: cc.name,
      type: cc.type,
      parent_id: cc.parent_id ?? '',
      default_recharge_fulfiller_id: cc.default_recharge_fulfiller_id ?? '',
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.code.trim()) {
      addToast({ type: 'error', message: 'Code is required' })
      return
    }
    if (!form.name.trim()) {
      addToast({ type: 'error', message: 'Name is required' })
      return
    }
    setSaving(true)
    const payload = {
      ...form,
      parent_id: form.parent_id || undefined,
      // Always present (UUID or null) rather than omitted when empty, so the
      // backend can tell "clear the fulfiller" apart from "field not sent."
      default_recharge_fulfiller_id: form.default_recharge_fulfiller_id || null,
    }
    try {
      if (editing) {
        await api.put(`/finance/cost-centers/${editing.id}`, payload)
        addToast({ type: 'success', message: 'Cost center updated' })
      } else {
        await api.post('/finance/cost-centers', payload)
        addToast({ type: 'success', message: 'Cost center created' })
      }
      setModalOpen(false)
      void fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Save failed') })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deletingId) return
    setDeleteLoading(true)
    try {
      await api.delete(`/finance/cost-centers/${deletingId}`)
      addToast({ type: 'success', message: 'Cost center deactivated' })
      setDeletingId(null)
      void fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Delete failed') })
    } finally {
      setDeleteLoading(false)
    }
  }

  const parentOptions = items.filter((c) => !editing || c.id !== editing.id)

  const columns: Column<CostCenter>[] = [
    {
      key: 'code',
      header: 'Code',
      mobilePrimary: true,
      render: (cc) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent }}>{cc.code}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      mobileSecondary: true,
      render: (cc) => <span style={{ color: theme.textPrimary }}>{cc.name}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (cc) => (
        <Badge variant={TYPE_VARIANTS[cc.type] ?? 'neutral'} size="sm">
          {TYPE_LABELS[cc.type] ?? cc.type}
        </Badge>
      ),
    },
    {
      key: 'journal_line_count',
      header: 'Journal lines',
      render: (cc) => (
        <span style={{ color: theme.textSecondary }}>{cc.journal_line_count.toLocaleString()}</span>
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (cc) => (
        <Badge variant={cc.is_active ? 'success' : 'neutral'} size="sm">
          {cc.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (cc) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              openEdit(cc)
            }}
          >
            Edit
          </Button>
          {cc.is_active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeletingId(cc.id)
              }}
            >
              Deactivate
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1200px' }}>
      <PageHeader
        title="Cost Centers"
        subtitle="Track costs by department, project, entity, or overhead"
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            New cost center
          </Button>
        }
      />

      <Card padding="none">
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
            }}
            placeholder="Search code or name…"
            style={{
              flex: 1,
              minWidth: '160px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              background: theme.bgSurface,
              color: theme.textPrimary,
              fontSize: '12px',
            }}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: theme.textMuted,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => {
                setActiveOnly(e.target.checked)
              }}
            />
            Active only
          </label>
        </div>
        <Table
          columns={columns}
          data={items}
          rowKey="id"
          loading={loading}
          emptyMessage="No cost centers found"
          getRowStyle={(cc) => (cc.is_active ? {} : { opacity: 0.5 })}
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
        }}
        title={editing ? 'Edit cost center' : 'New cost center'}
      >
        <Field label="Code *">
          <input
            value={form.code}
            onChange={(e) => {
              setForm((p) => ({ ...p, code: e.target.value }))
            }}
            disabled={!!editing}
            placeholder="CC-001"
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              background: theme.bgSurface,
              color: theme.textPrimary,
              fontSize: '12px',
              opacity: editing ? 0.6 : 1,
            }}
          />
        </Field>
        <Field label="Name *">
          <input
            value={form.name}
            onChange={(e) => {
              setForm((p) => ({ ...p, name: e.target.value }))
            }}
            placeholder="Operations"
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: '6px',
              border: `1px solid ${theme.border}`,
              background: theme.bgSurface,
              color: theme.textPrimary,
              fontSize: '12px',
            }}
          />
        </Field>
        <Field label="Type">
          <SearchableSelect
            value={form.type}
            onChange={(v) => {
              setForm((p) => ({ ...p, type: v as CostCenter['type'] }))
            }}
            options={Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          />
        </Field>
        <Field label="Parent cost center (optional)">
          <SearchableSelect
            value={form.parent_id}
            onChange={(v) => {
              setForm((p) => ({ ...p, parent_id: v }))
            }}
            placeholder="None"
            options={parentOptions.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
          />
        </Field>
        <Field label="Default recharge fulfiller (optional)">
          <SearchableSelect
            value={form.default_recharge_fulfiller_id}
            onChange={(v) => {
              setForm((p) => ({ ...p, default_recharge_fulfiller_id: v }))
            }}
            placeholder="Unassigned"
            options={companyUsers.map((u) => ({ value: u.id, label: u.email }))}
          />
          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
            Gets notified and can fulfill phone recharge requests charged to this cost center.
          </div>
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setModalOpen(false)
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingId}
        onClose={() => {
          setDeletingId(null)
        }}
        onConfirm={handleDelete}
        title="Deactivate cost center"
        message="This will deactivate the cost center. It will no longer appear in dropdowns. Existing journal entries are unaffected."
        confirmLabel="Deactivate"
        loading={deleteLoading}
      />
    </div>
  )
}
