import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { api } from '../../../lib/axios'
import { apiErrMsg } from '../../../lib/apiError'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface Category {
  id: string
  name: string
  gl_account_id: string | null
  account_code: string | null
  account_name: string | null
  is_project_related: boolean
  is_active: boolean
}

interface GLAccount {
  id: string
  code: string
  name: string
}

const EMPTY_FORM = {
  name: '',
  gl_account_id: '',
  is_project_related: false,
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

export default function ExpenseCategoriesPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [items, setItems] = useState<Category[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [deactivateLoading, setDeactivateLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [catRes, glRes] = await Promise.all([
        api.get<Category[]>('/finance/expense-claims/categories'),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
      ])
      setItems(Array.isArray(catRes.data) ? catRes.data : [])
      setGlAccounts(Array.isArray(glRes.data) ? glRes.data : [])
    } catch {
      addToast({ type: 'error', message: 'Failed to load expense categories' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }
  function openEdit(cat: Category) {
    setEditing(cat)
    setForm({
      name: cat.name,
      gl_account_id: cat.gl_account_id ?? '',
      is_project_related: cat.is_project_related,
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      addToast({ type: 'error', message: 'Name is required' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/finance/expense-claims/categories/${editing.id}`, {
          name: form.name,
          gl_account_id: form.gl_account_id || undefined,
          is_project_related: form.is_project_related,
          is_active: editing.is_active,
        })
        addToast({ type: 'success', message: 'Category updated' })
      } else {
        await api.post('/finance/expense-claims/categories', {
          name: form.name,
          gl_account_id: form.gl_account_id || undefined,
          is_project_related: form.is_project_related,
        })
        addToast({ type: 'success', message: 'Category created' })
      }
      setModalOpen(false)
      void fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Save failed') })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!deactivatingId) return
    const cat = items.find((c) => c.id === deactivatingId)
    if (!cat) return
    setDeactivateLoading(true)
    try {
      await api.put(`/finance/expense-claims/categories/${deactivatingId}`, {
        name: cat.name,
        gl_account_id: cat.gl_account_id ?? undefined,
        is_project_related: cat.is_project_related,
        is_active: false,
      })
      addToast({ type: 'success', message: 'Category deactivated' })
      setDeactivatingId(null)
      void fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Deactivate failed') })
    } finally {
      setDeactivateLoading(false)
    }
  }

  const visible = items.filter((c) => {
    if (activeOnly && !c.is_active) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const columns: Column<Category>[] = [
    {
      key: 'name',
      header: 'Name',
      mobilePrimary: true,
      render: (c) => <span style={{ color: theme.textPrimary }}>{c.name}</span>,
    },
    {
      key: 'is_project_related',
      header: 'Requires project',
      render: (c) =>
        c.is_project_related ? (
          <Badge variant="warning" size="sm">
            Required
          </Badge>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: '11px' }}>—</span>
        ),
    },
    {
      key: 'gl_account_id',
      header: 'Default GL account',
      mobileSecondary: true,
      render: (c) =>
        c.account_code ? (
          <span style={{ color: theme.textSecondary, fontSize: '12px' }}>
            {c.account_code} · {c.account_name}
          </span>
        ) : (
          <span style={{ color: theme.textMuted, fontSize: '11px' }}>Not set</span>
        ),
    },
    {
      key: 'is_active',
      header: 'Status',
      render: (c) => (
        <Badge variant={c.is_active ? 'success' : 'neutral'} size="sm">
          {c.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (c) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              openEdit(c)
            }}
          >
            Edit
          </Button>
          {c.is_active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeactivatingId(c.id)
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
        title="Expense Categories"
        subtitle="Used when settling expense claims, petty cash, and employee advances"
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            New category
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
            placeholder="Search name…"
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
          data={visible}
          rowKey="id"
          loading={loading}
          emptyMessage="No expense categories found"
          getRowStyle={(c) => (c.is_active ? {} : { opacity: 0.5 })}
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
        }}
        title={editing ? 'Edit category' : 'New category'}
      >
        <Field label="Name *">
          <input
            value={form.name}
            onChange={(e) => {
              setForm((p) => ({ ...p, name: e.target.value }))
            }}
            placeholder="Site Materials"
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
        <Field label="Default GL account (optional)">
          <SearchableSelect
            value={form.gl_account_id}
            onChange={(v) => {
              setForm((p) => ({ ...p, gl_account_id: v }))
            }}
            placeholder="Not set"
            options={glAccounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))}
          />
          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
            Pre-fills the GL account when this category is picked, but can still be changed per
            line.
          </div>
        </Field>
        <Field label="Requires a project">
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: theme.textSecondary,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={form.is_project_related}
              onChange={(e) => {
                setForm((p) => ({ ...p, is_project_related: e.target.checked }))
              }}
            />
            Lines using this category must be tagged with a project
          </label>
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
        open={!!deactivatingId}
        onClose={() => {
          setDeactivatingId(null)
        }}
        onConfirm={handleDeactivate}
        title="Deactivate category"
        message="This will deactivate the category. It will no longer appear in dropdowns for new lines. Existing entries are unaffected."
        confirmLabel="Deactivate"
        loading={deactivateLoading}
      />
    </div>
  )
}
