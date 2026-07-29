import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface AnalyticAccount {
  id: string
  code: string
  name: string
  cost_center_id?: string
  cost_center_code?: string
  cost_center_name?: string
  is_active: boolean
  journal_line_count: number
  total_debits: string
  total_credits: string
  project_id?: string
  project_name?: string
  project_status?: string
}

interface CostCenter {
  id: string
  code: string
  name: string
}

const EMPTY_FORM = { code: '', name: '', cost_center_id: '' }

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

export default function AnalyticAccountsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const navigate = useNavigate()

  const [items, setItems] = useState<AnalyticAccount[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AnalyticAccount | null>(null)
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
      const [aaRes, ccRes] = await Promise.all([
        api.get<AnalyticAccount[]>('/finance/analytic-accounts', { params }),
        api.get<CostCenter[]>('/finance/cost-centers'),
      ])
      setItems(Array.isArray(aaRes.data) ? aaRes.data : [])
      setCostCenters(Array.isArray(ccRes.data) ? ccRes.data : [])
    } catch {
      addToast({ type: 'error', message: 'Failed to load analytic accounts' })
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
  function openEdit(aa: AnalyticAccount) {
    setEditing(aa)
    setForm({ code: aa.code, name: aa.name, cost_center_id: aa.cost_center_id ?? '' })
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
    const payload = { ...form, cost_center_id: form.cost_center_id || undefined }
    try {
      if (editing) {
        await api.put(`/finance/analytic-accounts/${editing.id}`, payload)
        addToast({ type: 'success', message: 'Analytic account updated' })
      } else {
        await api.post('/finance/analytic-accounts', payload)
        addToast({ type: 'success', message: 'Analytic account created' })
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
      await api.delete(`/finance/analytic-accounts/${deletingId}`)
      addToast({ type: 'success', message: 'Analytic account deactivated' })
      setDeletingId(null)
      void fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Delete failed') })
    } finally {
      setDeleteLoading(false)
    }
  }

  const balance = (aa: AnalyticAccount) =>
    parseFloat(aa.total_debits ?? '0') - parseFloat(aa.total_credits ?? '0')

  const columns: Column<AnalyticAccount>[] = [
    {
      key: 'name',
      header: 'Name',
      mobilePrimary: true,
      render: (aa) => <span style={{ color: theme.textPrimary }}>{aa.name}</span>,
    },
    {
      key: 'code',
      header: 'Code',
      mobileSecondary: true,
      render: (aa) => (
        <span style={{ fontFamily: 'monospace', color: theme.accent }}>{aa.code}</span>
      ),
    },
    {
      key: 'cost_center_code',
      header: 'Cost center',
      mobilePriority: 3,
      render: (aa) => (
        <span style={{ color: theme.textMuted, fontFamily: 'monospace', fontSize: '11px' }}>
          {aa.cost_center_code ?? '—'}
        </span>
      ),
    },
    {
      key: 'project_name',
      header: 'Project',
      mobilePriority: 4,
      render: (aa) =>
        aa.project_name ? (
          <span title={aa.project_name} style={{ color: theme.textSecondary }}>
            {aa.project_name.slice(0, 20)}
            {aa.project_name.length > 20 ? '…' : ''}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'journal_line_count',
      header: 'Lines',
      mobilePriority: 7,
      render: (aa) => aa.journal_line_count.toLocaleString(),
    },
    {
      key: 'total_debits',
      header: 'Debits',
      mobilePriority: 5,
      render: (aa) => (
        <AmountDisplay amount={parseFloat(aa.total_debits ?? '0')} currency="IQD" size="sm" />
      ),
    },
    {
      key: 'total_credits',
      header: 'Credits',
      mobilePriority: 6,
      render: (aa) => (
        <AmountDisplay amount={parseFloat(aa.total_credits ?? '0')} currency="IQD" size="sm" />
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      mobilePriority: 2,
      render: (aa) => {
        const bal = balance(aa)
        return (
          <span style={{ color: bal >= 0 ? theme.textPrimary : theme.danger, fontWeight: 500 }}>
            {Math.abs(bal).toLocaleString('en-US', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })}
            {bal < 0 ? ' Cr' : ''}
          </span>
        )
      },
    },
    {
      key: 'is_active',
      header: 'Status',
      mobilePriority: 1,
      render: (aa) => (
        <Badge variant={aa.is_active ? 'success' : 'neutral'} size="sm">
          {aa.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      mobileAction: true,
      render: (aa) => (
        <div
          style={{ display: 'flex', gap: '6px' }}
          onClick={(ev) => {
            ev.stopPropagation()
          }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              openEdit(aa)
            }}
          >
            Edit
          </Button>
          {aa.is_active && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDeletingId(aa.id)
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
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title="Analytic Accounts"
        subtitle="Project and cost tracking by analytic dimension"
        actions={
          <Button variant="primary" size="sm" onClick={openCreate}>
            New analytic account
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
          emptyMessage="No analytic accounts found"
          onRowClick={(aa) => {
            navigate(`/finance/analytic-accounts/${aa.id}`)
          }}
          getRowStyle={(aa) => (aa.is_active ? {} : { opacity: 0.5 })}
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
        }}
        title={editing ? 'Edit analytic account' : 'New analytic account'}
      >
        <Field label="Code *">
          <input
            value={form.code}
            onChange={(e) => {
              setForm((p) => ({ ...p, code: e.target.value }))
            }}
            disabled={!!editing}
            placeholder="AA-001"
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
            placeholder="Project Alpha"
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
        <Field label="Cost center (optional)">
          <SearchableSelect
            value={form.cost_center_id}
            onChange={(v) => {
              setForm((p) => ({ ...p, cost_center_id: v }))
            }}
            placeholder="None"
            options={costCenters.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
          />
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
        title="Deactivate analytic account"
        message="This will deactivate the analytic account. Existing journal entries are unaffected."
        confirmLabel="Deactivate"
        loading={deleteLoading}
      />
    </div>
  )
}
