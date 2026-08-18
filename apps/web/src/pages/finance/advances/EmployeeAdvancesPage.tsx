import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface Advance {
  id: string
  advance_number: string
  employee_name: string
  purpose: string | null
  amount: number
  settled_amount: number
  outstanding_amount: number
  currency_code: string
  status: string
  created_at: string
}

interface Summary {
  pending_count: number
  pending_amount: number
  active_count: number
  total_outstanding: number
  settled_count: number
}

interface Employee {
  id: string
  first_name: string
  last_name: string
}
interface Project {
  id: string
  code: string
  name: string
}

const STATUS_BADGE: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  draft: 'neutral',
  pending_approval: 'info',
  approved: 'warning',
  partially_settled: 'warning',
  settled: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

const emptyForm = () => ({
  employee_id: '',
  employee_name: '',
  purpose: '',
  currency_code: 'IQD',
  amount: '',
  project_id: '',
  notes: '',
})

export default function EmployeeAdvancesPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [advances, setAdvances] = useState<Advance[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [form, setForm] = useState(emptyForm())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [advRes, sumRes, empRes, projRes] = await Promise.all([
        api.get<Advance[]>('/finance/advances', { params: { status: statusFilter || undefined } }),
        api.get<Summary>('/finance/advances/summary'),
        api.get<Employee[]>('/hr/employees?limit=500'),
        api.get<{ data: Project[] }>('/projects', { params: { limit: 500 } }),
      ])
      setAdvances(advRes.data)
      setSummary(sumRes.data)
      setEmployees(empRes.data)
      setProjects(projRes.data.data)
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    if (!form.employee_id || !form.amount || Number(form.amount) <= 0) return
    setSaving(true)
    try {
      const r = await api.post<Advance>('/finance/advances', {
        ...form,
        amount: Number(form.amount),
        purpose: form.purpose || undefined,
        project_id: form.project_id || undefined,
        notes: form.notes || undefined,
      })
      setShowForm(false)
      setForm(emptyForm())
      navigate(`/finance/advances/${r.data.id}`)
    } catch {
      /* handled */
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = {
    background: theme.bgSurface,
    border: `1px solid ${theme.border}`,
    borderRadius: '6px',
    padding: '5px 8px',
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

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Employee Advances"
        subtitle="Cash issued to employees ahead of spending, settled against receipts"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate('/finance/advances/dashboard')
              }}
            >
              Dashboard
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowForm(true)
              }}
            >
              + New Advance
            </Button>
          </div>
        }
      />

      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Pending Approval
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: '#3b82f6' }}>
              {summary.pending_count}
            </p>
            <AmountDisplay amount={Number(summary.pending_amount)} currency="IQD" size="sm" />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Active Advances
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: theme.textSecondary }}>
              {summary.active_count}
            </p>
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Total Outstanding
            </p>
            <AmountDisplay
              amount={Number(summary.total_outstanding)}
              currency="IQD"
              size="md"
              colored
            />
          </Card>
          <Card padding="sm">
            <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
              Fully Settled
            </p>
            <p style={{ fontSize: '22px', fontWeight: 700, color: '#22c55e' }}>
              {summary.settled_count}
            </p>
          </Card>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
          }}
          style={{ ...inputStyle, width: 'auto' }}
        >
          <option value="">All Statuses</option>
          {[
            'draft',
            'pending_approval',
            'approved',
            'partially_settled',
            'settled',
            'rejected',
            'cancelled',
          ].map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <Card padding="none">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
              {['Ref', 'Employee', 'Purpose', 'Amount', 'Outstanding', 'Status', ''].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '9px 12px',
                    textAlign: 'left',
                    color: theme.textMuted,
                    fontWeight: 500,
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
                  colSpan={7}
                  style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && !advances.length && (
              <tr>
                <td
                  colSpan={7}
                  style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                >
                  No employee advances found.
                </td>
              </tr>
            )}
            {advances.map((a) => (
              <tr
                key={a.id}
                style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                onClick={() => {
                  navigate(`/finance/advances/${a.id}`)
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
                  {a.advance_number}
                </td>
                <td style={{ padding: '9px 12px', fontWeight: 500, color: theme.textPrimary }}>
                  {a.employee_name}
                </td>
                <td style={{ padding: '9px 12px', color: theme.textSecondary }}>
                  {a.purpose ?? '—'}
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <AmountDisplay amount={Number(a.amount)} currency={a.currency_code} size="sm" />
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <AmountDisplay
                    amount={Number(a.outstanding_amount)}
                    currency={a.currency_code}
                    size="sm"
                  />
                </td>
                <td style={{ padding: '9px 12px' }}>
                  <Badge variant={STATUS_BADGE[a.status] ?? 'neutral'}>
                    {a.status.replace(/_/g, ' ')}
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
                      navigate(`/finance/advances/${a.id}`)
                    }}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

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
            padding: '16px',
          }}
        >
          <Card padding="lg" style={{ width: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>New Advance</h3>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Employee *</label>
                <select
                  style={inputStyle}
                  value={form.employee_id}
                  onChange={(e) => {
                    const emp = employees.find((em) => em.id === e.target.value)
                    setForm((f) => ({
                      ...f,
                      employee_id: e.target.value,
                      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : '',
                    }))
                  }}
                >
                  <option value="">— Select employee —</option>
                  {employees.map((em) => (
                    <option key={em.id} value={em.id}>
                      {em.first_name} {em.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Amount *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    style={inputStyle}
                    value={form.amount}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, amount: e.target.value }))
                    }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Currency</label>
                  <select
                    style={inputStyle}
                    value={form.currency_code}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, currency_code: e.target.value }))
                    }}
                  >
                    <option value="IQD">IQD</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Purpose</label>
                <input
                  style={inputStyle}
                  value={form.purpose}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, purpose: e.target.value }))
                  }}
                  placeholder="e.g. Purchase electrical and plumbing materials"
                />
              </div>
              <div>
                <label style={labelStyle}>Project</label>
                <select
                  style={inputStyle}
                  value={form.project_id}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, project_id: e.target.value }))
                  }}
                >
                  <option value="">— Not set —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>
                Cash and advance-control accounts are resolved automatically from the employee and
                currency. Cost center is set by finance when the advance is approved, once what it's
                for is known.
              </p>
              <div>
                <label style={labelStyle}>Notes</label>
                <input
                  style={inputStyle}
                  value={form.notes}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }}
                />
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
                disabled={saving || !form.employee_id || !form.amount || Number(form.amount) <= 0}
              >
                {saving ? 'Creating...' : 'Create Advance'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
