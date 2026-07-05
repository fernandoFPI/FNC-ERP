import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface Claim {
  id: string; claim_number: string; employee_name: string; description: string | null
  total_amount: number; currency_code: string; status: string
  submitted_at: string | null; line_count: number; created_at: string
}

interface Summary {
  draft_count: number; pending_count: number; approved_count: number
  pending_amount: number; approved_amount: number; posted_amount: number; paid_amount: number
}

interface Category { id: string; name: string; gl_account_id: string | null; account_code: string | null; account_name: string | null }
interface GLAccount { id: string; code: string; name: string }
interface Employee  { id: string; full_name: string }

const STATUS_BADGE: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  draft: 'neutral', submitted: 'info', approved: 'success',
  rejected: 'danger', posted: 'warning', paid: 'success',
}

interface LineForm {
  expense_date: string; category_id: string; category_name: string
  gl_account_id: string; description: string; amount: string; currency_code: string
}

const emptyLine = (): LineForm => ({
  expense_date: new Date().toISOString().slice(0,10),
  category_id: '', category_name: '', gl_account_id: '',
  description: '', amount: '', currency_code: 'IQD',
})

export default function ExpenseClaimsPage() {
  const { theme } = useTheme()
  const navigate  = useNavigate()
  const [claims, setClaims]   = useState<Claim[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [employees, setEmployees]   = useState<Employee[]>([])

  const [form, setForm] = useState({
    employee_id: '', employee_name: '', description: '',
    currency_code: 'IQD', notes: '', reimbursement_account_id: '',
  })
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [clRes, sumRes, catRes, glRes, empRes] = await Promise.all([
        api.get<Claim[]>('/finance/expense-claims', { params: { status: statusFilter || undefined } }),
        api.get<Summary>('/finance/expense-claims/summary'),
        api.get<Category[]>('/finance/expense-claims/categories'),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
        api.get<Employee[]>('/hr/employees?limit=500'),
      ])
      setClaims(clRes.data)
      setSummary(sumRes.data)
      setCategories(catRes.data)
      setGlAccounts(glRes.data)
      setEmployees(empRes.data)
    } catch { /* handled */ }
    finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { void load() }, [load])

  function updateLine(i: number, field: keyof LineForm, value: string) {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  function applyCategory(i: number, catId: string) {
    const cat = categories.find(c => c.id === catId)
    setLines(ls => ls.map((l, idx) => idx === i ? {
      ...l, category_id: catId, category_name: cat?.name ?? '',
      gl_account_id: cat?.gl_account_id ?? l.gl_account_id,
    } : l))
  }

  async function handleSave() {
    if (!form.employee_id || lines.some(l => !l.amount || !l.expense_date)) return
    setSaving(true)
    try {
      const r = await api.post<Claim>('/finance/expense-claims', {
        ...form,
        lines: lines.map(l => ({
          expense_date:  l.expense_date,
          category_id:   l.category_id || undefined,
          category_name: l.category_name || undefined,
          gl_account_id: l.gl_account_id || undefined,
          description:   l.description || undefined,
          amount:        Number(l.amount),
          currency_code: l.currency_code,
        })),
      })
      setShowForm(false)
      setForm({ employee_id: '', employee_name: '', description: '', currency_code: 'IQD', notes: '', reimbursement_account_id: '' })
      setLines([emptyLine()])
      navigate(`/finance/expense-claims/${r.data.id}`)
    } catch { /* handled */ }
    finally { setSaving(false) }
  }

  const inputStyle = {
    background: theme.bgSurface, border: `1px solid ${theme.border}`,
    borderRadius: '6px', padding: '5px 8px', fontSize: '12px',
    color: theme.textPrimary, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
  }
  const labelStyle = { fontSize: '11px', color: theme.textMuted, marginBottom: '3px', display: 'block' as const }

  const totalLines = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Expense Claims"
        subtitle="Employee expense reimbursements — submit, approve, and post to the GL"
        actions={<Button variant="primary" size="sm" onClick={() => setShowForm(true)}>+ New Claim</Button>}
      />

      {/* KPI strip */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '12px', marginBottom: '20px' }}>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Draft</p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: theme.textSecondary }}>{summary.draft_count}</p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Pending Approval</p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: '#3b82f6' }}>{summary.pending_count}</p>
            <AmountDisplay amount={Number(summary.pending_amount)} currency="IQD" size="sm" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Approved</p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: '#22c55e' }}>{summary.approved_count}</p>
            <AmountDisplay amount={Number(summary.approved_amount)} currency="IQD" size="sm" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Posted (to pay)</p>
            <AmountDisplay amount={Number(summary.posted_amount)} currency="IQD" size="md" colored />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>Paid Out</p>
            <AmountDisplay amount={Number(summary.paid_amount)} currency="IQD" size="md" />
          </Card>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto' }}>
          <option value="">All Statuses</option>
          {['draft','submitted','approved','rejected','posted','paid'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={() => void load()}>Refresh</Button>
      </div>

      {/* Claims table */}
      <Card padding="none">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
              {['Ref', 'Employee', 'Description', 'Lines', 'Total', 'Status', 'Submitted', ''].map(h => (
                <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: theme.textMuted, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>Loading...</td></tr>}
            {!loading && !claims.length && (
              <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>No expense claims found.</td></tr>
            )}
            {claims.map(c => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  onClick={() => navigate(`/finance/expense-claims/${c.id}`)}>
                <td style={{ padding: '9px 12px', color: theme.accent, fontFamily: 'monospace', fontSize: '11px' }}>{c.claim_number}</td>
                <td style={{ padding: '9px 12px', fontWeight: 500, color: theme.textPrimary }}>{c.employee_name}</td>
                <td style={{ padding: '9px 12px', color: theme.textSecondary }}>{c.description ?? '—'}</td>
                <td style={{ padding: '9px 12px', color: theme.textSecondary, textAlign: 'center' }}>{c.line_count}</td>
                <td style={{ padding: '9px 12px' }}><AmountDisplay amount={Number(c.total_amount)} currency={c.currency_code} size="sm" /></td>
                <td style={{ padding: '9px 12px' }}><Badge variant={STATUS_BADGE[c.status] ?? 'neutral'}>{c.status}</Badge></td>
                <td style={{ padding: '9px 12px', color: theme.textMuted, fontSize: '11px' }}>
                  {c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '9px 12px' }} onClick={e => e.stopPropagation()}>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/finance/expense-claims/${c.id}`)}>View</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* New Claim Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <Card padding="lg" style={{ width: '720px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>New Expense Claim</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>✕</Button>
            </div>

            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Employee *</label>
                <select style={inputStyle} value={form.employee_id} onChange={e => {
                  const emp = employees.find(em => em.id === e.target.value)
                  setForm(f => ({ ...f, employee_id: e.target.value, employee_name: emp?.full_name ?? '' }))
                }}>
                  <option value="">— Select employee —</option>
                  {employees.map(em => <option key={em.id} value={em.id}>{em.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Currency</label>
                <select style={inputStyle} value={form.currency_code} onChange={e => setForm(f => ({ ...f, currency_code: e.target.value }))}>
                  <option value="IQD">IQD</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Description</label>
                <input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief purpose of claim" />
              </div>
              <div>
                <label style={labelStyle}>Reimbursement Account</label>
                <select style={inputStyle} value={form.reimbursement_account_id} onChange={e => setForm(f => ({ ...f, reimbursement_account_id: e.target.value }))}>
                  <option value="">— Set when posting —</option>
                  {glAccounts.map(g => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            {/* Lines */}
            <p style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Expense Lines</p>
            <div style={{ overflowX: 'auto', marginBottom: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
                    {['Date','Category','GL Account','Description','Amount',''].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: theme.textMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '4px 6px' }}>
                        <input type="date" style={{ ...inputStyle, width: '120px' }} value={l.expense_date} onChange={e => updateLine(i, 'expense_date', e.target.value)} />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select style={{ ...inputStyle, width: '140px' }} value={l.category_id} onChange={e => applyCategory(i, e.target.value)}>
                          <option value="">— Category —</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <select style={{ ...inputStyle, width: '160px' }} value={l.gl_account_id} onChange={e => updateLine(i, 'gl_account_id', e.target.value)}>
                          <option value="">— Account —</option>
                          {glAccounts.map(g => <option key={g.id} value={g.id}>{g.code} · {g.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input style={{ ...inputStyle, width: '160px' }} value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} placeholder="What was this for?" />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        <input type="number" style={{ ...inputStyle, width: '100px', textAlign: 'right' }} value={l.amount} min="0.01" step="0.01" onChange={e => updateLine(i, 'amount', e.target.value)} placeholder="0.00" />
                      </td>
                      <td style={{ padding: '4px 6px' }}>
                        {lines.length > 1 && (
                          <button onClick={() => setLines(ls => ls.filter((_, idx) => idx !== i))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px', padding: '0 4px' }}>✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <Button variant="ghost" size="sm" onClick={() => setLines(ls => [...ls, emptyLine()])}>+ Add Line</Button>
              <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>
                Total: <span style={{ fontFamily: 'monospace', color: theme.accent }}>{totalLines.toLocaleString()} {form.currency_code}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => void handleSave()}
                disabled={saving || !form.employee_id || lines.some(l => !l.amount || !l.expense_date)}>
                {saving ? 'Creating...' : 'Create Claim'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
