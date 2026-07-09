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
import { EmptyState } from '../../../components/ui/EmptyState'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

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

interface CostCenter { id: string; code: string; name: string }

const EMPTY_FORM = { code: '', name: '', cost_center_id: '' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>{label}</label>
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
      if (activeOnly) params['is_active'] = 'true'
      if (search) params['search'] = search
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

  useEffect(() => { void fetchData() }, [fetchData])

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true) }
  function openEdit(aa: AnalyticAccount) {
    setEditing(aa)
    setForm({ code: aa.code, name: aa.name, cost_center_id: aa.cost_center_id ?? '' })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.code.trim()) { addToast({ type: 'error', message: 'Code is required' }); return }
    if (!form.name.trim()) { addToast({ type: 'error', message: 'Name is required' }); return }
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

  const balance = (aa: AnalyticAccount) => parseFloat(aa.total_debits ?? '0') - parseFloat(aa.total_credits ?? '0')

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title="Analytic Accounts"
        subtitle="Project and cost tracking by analytic dimension"
        actions={<Button variant="primary" size="sm" onClick={openCreate}>New analytic account</Button>}
      />

      <Card padding="none">
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or name…"
            style={{ flex: 1, minWidth: '160px', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bgSurface, color: theme.textPrimary, fontSize: '12px' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textMuted, cursor: 'pointer' }}>
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} />
            Active only
          </label>
        </div>
        {loading ? (
          <div style={{ padding: '20px' }}><div className="skeleton" style={{ height: 200 }} /></div>
        ) : items.length === 0 ? (
          <EmptyState message="No analytic accounts found" />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {['Code', 'Name', 'Cost center', 'Project', 'Lines', 'Debits', 'Credits', 'Balance', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: theme.textMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(aa => {
                const bal = balance(aa)
                return (
                  <tr key={aa.id} style={{ borderBottom: `1px solid ${theme.tableBorder}`, opacity: aa.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: theme.accent, cursor: 'pointer' }}
                        onClick={() => navigate(`/finance/analytic-accounts/${aa.id}`)}>{aa.code}</td>
                    <td style={{ padding: '9px 12px', color: theme.textPrimary, cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => navigate(`/finance/analytic-accounts/${aa.id}`)}>{aa.name}</td>
                    <td style={{ padding: '9px 12px', color: theme.textMuted, fontFamily: 'monospace', fontSize: '11px' }}>{aa.cost_center_code ?? '—'}</td>
                    <td style={{ padding: '9px 12px', color: theme.textSecondary, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {aa.project_name ? (
                        <span title={aa.project_name}>{aa.project_name.slice(0, 20)}{aa.project_name.length > 20 ? '…' : ''}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', color: theme.textSecondary }}>{aa.journal_line_count.toLocaleString()}</td>
                    <td style={{ padding: '9px 12px' }}><AmountDisplay amount={parseFloat(aa.total_debits ?? '0')} currency="IQD" size="sm" /></td>
                    <td style={{ padding: '9px 12px' }}><AmountDisplay amount={parseFloat(aa.total_credits ?? '0')} currency="IQD" size="sm" /></td>
                    <td style={{ padding: '9px 12px', color: bal >= 0 ? theme.textPrimary : theme.danger, fontWeight: 500 }}>
                      {Math.abs(bal).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}{bal < 0 ? ' Cr' : ''}
                    </td>
                    <td style={{ padding: '9px 12px' }}><Badge variant={aa.is_active ? 'success' : 'neutral'} size="sm">{aa.is_active ? 'Active' : 'Inactive'}</Badge></td>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(aa)}>Edit</Button>
                        {aa.is_active && <Button variant="ghost" size="sm" onClick={() => setDeletingId(aa.id)}>Deactivate</Button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit analytic account' : 'New analytic account'}>
        <Field label="Code *">
          <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} disabled={!!editing}
            placeholder="AA-001"
            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bgSurface, color: theme.textPrimary, fontSize: '12px', opacity: editing ? 0.6 : 1 }} />
        </Field>
        <Field label="Name *">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Project Alpha"
            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bgSurface, color: theme.textPrimary, fontSize: '12px' }} />
        </Field>
        <Field label="Cost center (optional)">
          <SearchableSelect
            value={form.cost_center_id}
            onChange={(v) => setForm(p => ({ ...p, cost_center_id: v }))}
            placeholder="None"
            options={costCenters.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
          />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingId}
        onClose={() => setDeletingId(null)}
        onConfirm={handleDelete}
        title="Deactivate analytic account"
        message="This will deactivate the analytic account. Existing journal entries are unaffected."
        confirmLabel="Deactivate"
        loading={deleteLoading}
      />
    </div>
  )
}
