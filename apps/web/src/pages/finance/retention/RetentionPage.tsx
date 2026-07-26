import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface Summary {
  ar_held: number
  ap_held: number
  total_held_count: number
  partial_count: number
  overdue_amount: number
  overdue_count: number
  due_this_month: number
}

interface AgingRow {
  retention_type: 'ar' | 'ap'
  not_yet_due: number
  due_0_30: number
  due_31_90: number
  due_91_180: number
  over_180: number
  open_count: number
}

interface RetentionRecord {
  id: string
  record_number: string
  retention_type: 'ar' | 'ap'
  counterparty_name: string
  project_name: string | null
  source_ref: string | null
  invoice_amount: number
  retention_rate: number
  retention_amount: number
  released_amount: number
  status: 'held' | 'partially_released' | 'released'
  invoice_date: string
  expected_release_date: string | null
}

interface GLAccount {
  id: string
  code: string
  name: string
}

const STATUS_BADGE: Record<string, 'danger' | 'warning' | 'success'> = {
  held: 'danger',
  partially_released: 'warning',
  released: 'success',
}

const emptyForm = {
  retention_type: 'ar' as 'ar' | 'ap',
  source_ref: '',
  project_name: '',
  counterparty_name: '',
  invoice_amount: '',
  retention_rate: '10',
  invoice_date: new Date().toISOString().slice(0, 10),
  expected_release_date: '',
  retention_account_id: '',
  offset_account_id: '',
  notes: '',
  post_journal_entry: true,
}

export default function RetentionPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'ar' | 'ap'>('ar')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [aging, setAging] = useState<AgingRow[]>([])
  const [records, setRecords] = useState<RetentionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, agingRes, recRes, glRes] = await Promise.all([
        api.get<Summary>('/finance/retention/summary'),
        api.get<AgingRow[]>('/finance/retention/aging'),
        api.get<RetentionRecord[]>('/finance/retention', {
          params: { type: tab, status: statusFilter || undefined },
        }),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
      ])
      setSummary(sumRes.data)
      setAging(agingRes.data)
      setRecords(recRes.data)
      setGlAccounts(glRes.data)
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [tab, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    if (!form.counterparty_name || !form.invoice_amount || !form.retention_rate) return
    setSaving(true)
    try {
      await api.post('/finance/retention', {
        retention_type: form.retention_type,
        source_ref: form.source_ref || undefined,
        project_name: form.project_name || undefined,
        counterparty_name: form.counterparty_name,
        invoice_amount: Number(form.invoice_amount),
        retention_rate: Number(form.retention_rate),
        invoice_date: form.invoice_date,
        expected_release_date: form.expected_release_date || undefined,
        retention_account_id: form.retention_account_id || undefined,
        offset_account_id: form.offset_account_id || undefined,
        notes: form.notes || undefined,
        post_journal_entry: form.post_journal_entry,
      })
      setShowForm(false)
      setForm(emptyForm)
      void load()
    } catch {
      /* handled */
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    padding: '6px 10px',
    fontSize: '12px',
    color: theme.textPrimary,
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    fontSize: '11px',
    color: theme.textMuted,
    marginBottom: '3px',
    display: 'block' as const,
  }

  const arAging = aging.find((a) => a.retention_type === 'ar')
  const apAging = aging.find((a) => a.retention_type === 'ap')
  const curAging = tab === 'ar' ? arAging : apAging

  const retentionPreview =
    form.invoice_amount && form.retention_rate
      ? Math.round((Number(form.retention_rate) / 100) * Number(form.invoice_amount) * 100) / 100
      : null

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Retention Management"
        subtitle="Track held-back retention on client invoices (AR) and vendor payments (AP)"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setShowForm(true)
            }}
          >
            + New Retention
          </Button>
        }
      />

      {/* KPI Strip */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              AR Retention Held
            </p>
            <AmountDisplay amount={Number(summary.ar_held) || 0} currency="IQD" size="md" />
            <p style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>
              Owed to us by clients
            </p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              AP Retention Held
            </p>
            <AmountDisplay amount={Number(summary.ap_held) || 0} currency="IQD" size="md" />
            <p style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>
              Held from vendors by us
            </p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Due This Month
            </p>
            <AmountDisplay
              amount={Number(summary.due_this_month) || 0}
              currency="IQD"
              size="md"
              colored
            />
          </Card>
          <Card
            padding="sm"
            style={{ border: Number(summary.overdue_count) > 0 ? `1px solid #ef4444` : undefined }}
          >
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Overdue</p>
            <AmountDisplay amount={Number(summary.overdue_amount) || 0} currency="IQD" size="md" />
            {Number(summary.overdue_count) > 0 && (
              <p style={{ fontSize: '10px', color: '#ef4444', marginTop: '4px' }}>
                {summary.overdue_count} records past due date
              </p>
            )}
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Open Records
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: theme.textPrimary }}>
              {summary.total_held_count}
            </p>
            <p style={{ fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>
              {summary.partial_count} partially released
            </p>
          </Card>
        </div>
      )}

      {/* Aging Analysis */}
      {curAging && (
        <Card padding="md" style={{ marginBottom: '16px' }}>
          <p
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: theme.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '10px',
            }}
          >
            {tab.toUpperCase()} Retention Aging
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '8px' }}>
            {[
              { label: 'Not Yet Due', value: curAging.not_yet_due, color: theme.textSecondary },
              { label: '0–30 Days Overdue', value: curAging.due_0_30, color: '#f59e0b' },
              { label: '31–90 Days', value: curAging.due_31_90, color: '#f97316' },
              { label: '91–180 Days', value: curAging.due_91_180, color: '#ef4444' },
              { label: '180+ Days', value: curAging.over_180, color: '#991b1b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
                  {label}
                </p>
                <p style={{ fontSize: '14px', fontWeight: 700, color, fontFamily: 'monospace' }}>
                  {Number(value || 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tab + Filters */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          marginBottom: '12px',
          flexWrap: 'wrap',
        }}
      >
        {(['ar', 'ap'] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t)
            }}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              background: tab === t ? theme.accent : theme.bgSurface,
              color: tab === t ? '#fff' : theme.textSecondary,
              fontFamily: 'inherit',
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === 'ar' ? 'AR Retention (Client)' : 'AP Retention (Vendor)'}
          </button>
        ))}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
          }}
          style={{ ...inputStyle, width: 'auto', marginLeft: 'auto' }}
        >
          <option value="">All Statuses</option>
          <option value="held">Held</option>
          <option value="partially_released">Partially Released</option>
          <option value="released">Released</option>
        </select>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {/* Records Table */}
      <Card padding="none">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}`, background: theme.bgSurface }}>
              {[
                'Ref',
                tab === 'ar' ? 'Client' : 'Vendor',
                'Project',
                'Invoice Amt',
                'Rate',
                'Held',
                'Released',
                'Outstanding',
                'Expected Release',
                'Status',
                '',
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '9px 12px',
                    textAlign: 'left',
                    color: theme.textMuted,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={11}
                  style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && !records.length && (
              <tr>
                <td
                  colSpan={11}
                  style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                >
                  No {tab.toUpperCase()} retention records found.
                </td>
              </tr>
            )}
            {records.map((r) => {
              const outstanding = Math.max(
                0,
                Number(r.retention_amount) - Number(r.released_amount),
              )
              const isOverdue =
                r.expected_release_date &&
                new Date(r.expected_release_date) < new Date() &&
                r.status !== 'released'
              return (
                <tr
                  key={r.id}
                  style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  onClick={() => {
                    navigate(`/finance/retention/${r.id}`)
                  }}
                >
                  <td
                    style={{
                      padding: '9px 12px',
                      color: theme.accent,
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  >
                    {r.record_number}
                  </td>
                  <td style={{ padding: '9px 12px', color: theme.textPrimary, fontWeight: 500 }}>
                    {r.counterparty_name}
                  </td>
                  <td style={{ padding: '9px 12px', color: theme.textSecondary }}>
                    {r.project_name ?? r.source_ref ?? '—'}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <AmountDisplay amount={r.invoice_amount} currency="IQD" size="sm" />
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      color: theme.textSecondary,
                      fontFamily: 'monospace',
                    }}
                  >
                    {r.retention_rate}%
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <AmountDisplay amount={r.retention_amount} currency="IQD" size="sm" />
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <AmountDisplay amount={Number(r.released_amount)} currency="IQD" size="sm" />
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <AmountDisplay amount={outstanding} currency="IQD" size="sm" colored />
                  </td>
                  <td
                    style={{
                      padding: '9px 12px',
                      color: isOverdue ? '#ef4444' : theme.textSecondary,
                      fontSize: '11px',
                    }}
                  >
                    {r.expected_release_date
                      ? new Date(r.expected_release_date).toLocaleDateString()
                      : '—'}
                    {isOverdue && <span style={{ marginLeft: '4px', fontSize: '10px' }}>⚠</span>}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <Badge variant={STATUS_BADGE[r.status] ?? 'neutral'}>
                      {r.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td
                    style={{ padding: '9px 12px' }}
                    onClick={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigate(`/finance/retention/${r.id}`)
                      }}
                    >
                      View
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* New Retention Modal */}
      {showForm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <Card padding="lg" style={{ width: '540px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>
                New Retention Record
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false)
                }}
              >
                ✕
              </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Retention Type *</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['ar', 'ap'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setForm((f) => ({ ...f, retention_type: t }))
                      }}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: `2px solid ${form.retention_type === t ? theme.accent : theme.border}`,
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        background:
                          form.retention_type === t ? theme.accent + '15' : theme.bgSurface,
                        color: form.retention_type === t ? theme.accent : theme.textSecondary,
                        fontFamily: 'inherit',
                      }}
                    >
                      {t === 'ar'
                        ? 'AR — Client holds back from us'
                        : 'AP — We hold back from vendor'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>
                  {form.retention_type === 'ar' ? 'Client Name' : 'Vendor Name'} *
                </label>
                <input
                  style={inputStyle}
                  value={form.counterparty_name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, counterparty_name: e.target.value }))
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Source Ref (Invoice / PO No.)</label>
                <input
                  style={inputStyle}
                  value={form.source_ref}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, source_ref: e.target.value }))
                  }}
                  placeholder="INV-2025-001"
                />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Project Name</label>
                <input
                  style={inputStyle}
                  value={form.project_name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, project_name: e.target.value }))
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Invoice Amount *</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.invoice_amount}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, invoice_amount: e.target.value }))
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Retention Rate % *</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={form.retention_rate}
                  min="0"
                  max="100"
                  step="0.5"
                  onChange={(e) => {
                    setForm((f) => ({ ...f, retention_rate: e.target.value }))
                  }}
                />
              </div>

              {retentionPreview !== null && (
                <div
                  style={{
                    gridColumn: '1/-1',
                    background: theme.accent + '10',
                    border: `1px solid ${theme.accent}`,
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: theme.textPrimary,
                  }}
                >
                  Retention amount: <strong>{retentionPreview.toLocaleString()} IQD</strong> (
                  {form.retention_rate}% of {Number(form.invoice_amount).toLocaleString()})
                </div>
              )}

              <div>
                <label style={labelStyle}>Invoice Date *</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={form.invoice_date}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, invoice_date: e.target.value }))
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Expected Release Date</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={form.expected_release_date}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, expected_release_date: e.target.value }))
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>
                  {form.retention_type === 'ar'
                    ? 'Retention Receivable Account'
                    : 'Retention Payable Account'}
                </label>
                <select
                  style={inputStyle}
                  value={form.retention_account_id}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, retention_account_id: e.target.value }))
                  }}
                >
                  <option value="">— Select GL account —</option>
                  {glAccounts.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} · {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>
                  {form.retention_type === 'ar'
                    ? 'Accounts Receivable Account'
                    : 'Accounts Payable Account'}
                </label>
                <select
                  style={inputStyle}
                  value={form.offset_account_id}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, offset_account_id: e.target.value }))
                  }}
                >
                  <option value="">— Select GL account —</option>
                  {glAccounts.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} · {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Notes</label>
                <input
                  style={inputStyle}
                  value={form.notes}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }}
                />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: theme.textSecondary,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.post_journal_entry}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, post_journal_entry: e.target.checked }))
                    }}
                  />
                  Post journal entry immediately (requires both GL accounts above)
                </label>
              </div>
            </div>

            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowForm(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving || !form.counterparty_name || !form.invoice_amount}
              >
                {saving ? 'Saving...' : 'Create Record'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
