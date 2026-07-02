import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface RetentionRecord {
  id: string; record_number: string; retention_type: 'ar' | 'ap'
  counterparty_name: string; project_name: string | null; source_ref: string | null
  invoice_amount: number; retention_rate: number; retention_amount: number
  released_amount: number; status: 'held' | 'partially_released' | 'released'
  invoice_date: string; expected_release_date: string | null
  retention_account_id: string | null; offset_account_id: string | null
  notes: string | null; release_notes: string | null; created_at: string
}

interface Release {
  id: string; release_date: string; amount: number
  journal_entry_id: string | null; notes: string | null
  released_by: string; created_at: string
}

interface GLAccount { id: string; code: string; name: string }

const STATUS_BADGE: Record<string, 'danger' | 'warning' | 'success'> = {
  held: 'danger', partially_released: 'warning', released: 'success',
}

export default function RetentionDetail() {
  const { id } = useParams<{ id: string }>()
  const { theme } = useTheme()
  const navigate  = useNavigate()
  const [record, setRecord]     = useState<RetentionRecord | null>(null)
  const [releases, setReleases] = useState<Release[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading]   = useState(true)
  const [showRelease, setShowRelease] = useState(false)
  const [showEdit, setShowEdit]       = useState(false)
  const [saving, setSaving] = useState(false)

  const [releaseForm, setReleaseForm] = useState({ amount: '', release_date: new Date().toISOString().slice(0, 10), notes: '', post_journal_entry: true })
  const [editForm, setEditForm] = useState({ expected_release_date: '', notes: '', retention_account_id: '', offset_account_id: '' })

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [recRes, relRes, glRes] = await Promise.all([
        api.get<RetentionRecord>(`/finance/retention/${id}`),
        api.get<Release[]>(`/finance/retention/${id}/releases`),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
      ])
      setRecord(recRes.data)
      setReleases(relRes.data)
      setGlAccounts(glRes.data)
      setEditForm({
        expected_release_date: recRes.data.expected_release_date ?? '',
        notes: recRes.data.notes ?? '',
        retention_account_id: recRes.data.retention_account_id ?? '',
        offset_account_id: recRes.data.offset_account_id ?? '',
      })
    } catch { /* handled */ }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { void load() }, [load])

  async function handleRelease() {
    if (!id || !releaseForm.amount || !releaseForm.release_date) return
    setSaving(true)
    try {
      await api.post(`/finance/retention/${id}/release`, {
        amount: Number(releaseForm.amount),
        release_date: releaseForm.release_date,
        notes: releaseForm.notes || undefined,
        post_journal_entry: releaseForm.post_journal_entry,
      })
      setShowRelease(false)
      setReleaseForm({ amount: '', release_date: new Date().toISOString().slice(0, 10), notes: '', post_journal_entry: true })
      void load()
    } catch { /* handled */ }
    finally { setSaving(false) }
  }

  async function handleEdit() {
    if (!id) return
    setSaving(true)
    try {
      await api.patch(`/finance/retention/${id}`, {
        expected_release_date: editForm.expected_release_date || undefined,
        notes: editForm.notes || undefined,
        retention_account_id: editForm.retention_account_id || undefined,
        offset_account_id: editForm.offset_account_id || undefined,
      })
      setShowEdit(false)
      void load()
    } catch { /* handled */ }
    finally { setSaving(false) }
  }

  const inputStyle = {
    background: theme.bgSurface, border: `1px solid ${theme.border}`,
    borderRadius: '8px', padding: '6px 10px', fontSize: '12px',
    color: theme.textPrimary, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: '11px', color: theme.textMuted, marginBottom: '3px', display: 'block' as const }

  if (loading) return (
    <div style={{ padding: '24px', color: theme.textMuted, fontSize: '13px' }}>Loading retention record...</div>
  )
  if (!record) return (
    <div style={{ padding: '24px', color: theme.textMuted, fontSize: '13px' }}>Record not found.</div>
  )

  const outstanding = Math.max(0, Number(record.retention_amount) - Number(record.released_amount))
  const isOverdue   = record.expected_release_date && new Date(record.expected_release_date) < new Date() && record.status !== 'released'
  const releasePct  = Number(record.retention_amount) > 0
    ? Math.round((Number(record.released_amount) / Number(record.retention_amount)) * 100)
    : 0
  const canRelease  = record.status !== 'released'

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={record.record_number}
        subtitle={`${record.retention_type.toUpperCase()} Retention · ${record.counterparty_name}`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>← Back</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>Edit</Button>
            {canRelease && (
              <Button variant="primary" size="sm" onClick={() => setShowRelease(true)}>Release Retention</Button>
            )}
          </div>
        }
      />

      {/* Status Bar */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px' }}>
        <Badge variant={STATUS_BADGE[record.status] ?? 'neutral'}>{record.status.replace('_', ' ')}</Badge>
        <Badge variant={record.retention_type === 'ar' ? 'info' : 'warning'}>
          {record.retention_type === 'ar' ? 'AR — Client owes us' : 'AP — We owe vendor'}
        </Badge>
        {isOverdue && <Badge variant="danger">Past Expected Release Date</Badge>}
      </div>

      {/* Progress Bar */}
      <Card padding="md" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: theme.textMuted }}>Release Progress</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary }}>{releasePct}%</span>
        </div>
        <div style={{ background: theme.border, borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
          <div style={{ background: theme.accent, width: `${releasePct}%`, height: '100%', borderRadius: '4px', transition: 'width 0.3s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '11px', color: theme.textMuted }}>Released: {Number(record.released_amount).toLocaleString()} IQD</span>
          <span style={{ fontSize: '11px', color: theme.textMuted }}>Remaining: {outstanding.toLocaleString()} IQD</span>
        </div>
      </Card>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '12px', marginBottom: '20px' }}>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Invoice Amount</p>
          <AmountDisplay amount={record.invoice_amount} currency="IQD" size="md" />
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Retention Rate</p>
          <p style={{ fontSize: '20px', fontWeight: 700, color: theme.textPrimary, fontFamily: 'monospace' }}>{record.retention_rate}%</p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Total Held</p>
          <AmountDisplay amount={record.retention_amount} currency="IQD" size="md" />
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Released</p>
          <AmountDisplay amount={Number(record.released_amount)} currency="IQD" size="md" />
        </Card>
        <Card padding="sm" style={{ border: outstanding > 0 && isOverdue ? '1px solid #ef4444' : undefined }}>
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Outstanding</p>
          <AmountDisplay amount={outstanding} currency="IQD" size="md" colored />
        </Card>
      </div>

      {/* Details + Release History side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '16px' }}>
        <div>
          <Card padding="md">
            <p style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Record Details</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <tbody>
                {[
                  ['Record #', record.record_number],
                  ['Type', record.retention_type === 'ar' ? 'AR (Client)' : 'AP (Vendor)'],
                  ['Counterparty', record.counterparty_name],
                  ['Project', record.project_name ?? '—'],
                  ['Source Ref', record.source_ref ?? '—'],
                  ['Invoice Date', new Date(record.invoice_date).toLocaleDateString()],
                  ['Expected Release', record.expected_release_date ? new Date(record.expected_release_date).toLocaleDateString() : '—'],
                  ['Created', new Date(record.created_at).toLocaleDateString()],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '7px 0', color: theme.textMuted, width: '50%' }}>{k}</td>
                    <td style={{ padding: '7px 0', color: theme.textPrimary, fontWeight: 500 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {record.notes && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: theme.textSecondary, background: theme.bgCanvas, borderRadius: '6px', padding: '8px 10px' }}>
                {record.notes}
              </div>
            )}
          </Card>
        </div>

        <div>
          <Card padding="none">
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Release History</p>
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{releases.length} releases</span>
            </div>
            {!releases.length ? (
              <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '12px' }}>
                No releases yet.{canRelease ? ' Click "Release Retention" to record the first release.' : ''}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
                    {['Date', 'Amount Released', 'Journal Entry', 'Notes'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: theme.textMuted, fontWeight: 500, fontSize: '11px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {releases.map(rel => (
                    <tr key={rel.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '8px 12px', color: theme.textPrimary }}>{new Date(rel.release_date).toLocaleDateString()}</td>
                      <td style={{ padding: '8px 12px' }}><AmountDisplay amount={rel.amount} currency="IQD" size="sm" colored /></td>
                      <td style={{ padding: '8px 12px', color: rel.journal_entry_id ? theme.accent : theme.textMuted, fontSize: '11px', fontFamily: 'monospace' }}>
                        {rel.journal_entry_id ? rel.journal_entry_id.slice(0, 8) + '…' : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: theme.textSecondary }}>{rel.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      {/* Release Modal */}
      {showRelease && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card padding="lg" style={{ width: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>Release Retention</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowRelease(false)}>✕</Button>
            </div>

            <div style={{ background: theme.bgCanvas, borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: theme.textMuted }}>Total held:</span>
                <span style={{ color: theme.textPrimary, fontWeight: 600, fontFamily: 'monospace' }}>{Number(record.retention_amount).toLocaleString()} IQD</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: theme.textMuted }}>Already released:</span>
                <span style={{ color: theme.textSecondary, fontFamily: 'monospace' }}>{Number(record.released_amount).toLocaleString()} IQD</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, paddingTop: '6px', borderTop: `1px solid ${theme.border}` }}>
                <span style={{ color: theme.textMuted }}>Max releasable:</span>
                <span style={{ color: theme.accent, fontFamily: 'monospace' }}>{outstanding.toLocaleString()} IQD</span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Release Amount *</label>
                <input type="number" style={inputStyle} value={releaseForm.amount} min="0.01" max={outstanding}
                  onChange={e => setReleaseForm(f => ({ ...f, amount: e.target.value }))} />
                <p style={{ fontSize: '10px', color: theme.textMuted, marginTop: '3px' }}>
                  Max: {outstanding.toLocaleString()} IQD (remaining balance)
                </p>
              </div>
              <div>
                <label style={labelStyle}>Release Date *</label>
                <input type="date" style={inputStyle} value={releaseForm.release_date}
                  onChange={e => setReleaseForm(f => ({ ...f, release_date: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input style={inputStyle} value={releaseForm.notes} placeholder="e.g. Project milestone completion"
                  onChange={e => setReleaseForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: theme.textSecondary, cursor: 'pointer' }}>
                  <input type="checkbox" checked={releaseForm.post_journal_entry}
                    onChange={e => setReleaseForm(f => ({ ...f, post_journal_entry: e.target.checked }))} />
                  Post journal entry (reverses the original retention entry)
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowRelease(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => void handleRelease()}
                disabled={saving || !releaseForm.amount || Number(releaseForm.amount) > outstanding || Number(releaseForm.amount) <= 0}>
                {saving ? 'Processing...' : 'Confirm Release'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Edit Modal */}
      {showEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <Card padding="lg" style={{ width: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>Edit Retention Record</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowEdit(false)}>✕</Button>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Expected Release Date</label>
                <input type="date" style={inputStyle} value={editForm.expected_release_date}
                  onChange={e => setEditForm(f => ({ ...f, expected_release_date: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>{record.retention_type === 'ar' ? 'Retention Receivable Account' : 'Retention Payable Account'}</label>
                <select style={inputStyle} value={editForm.retention_account_id}
                  onChange={e => setEditForm(f => ({ ...f, retention_account_id: e.target.value }))}>
                  <option value="">— Select GL account —</option>
                  {glAccounts.map(g => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{record.retention_type === 'ar' ? 'AR Account (offset)' : 'AP Account (offset)'}</label>
                <select style={inputStyle} value={editForm.offset_account_id}
                  onChange={e => setEditForm(f => ({ ...f, offset_account_id: e.target.value }))}>
                  <option value="">— Select GL account —</option>
                  {glAccounts.map(g => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input style={inputStyle} value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => void handleEdit()} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
