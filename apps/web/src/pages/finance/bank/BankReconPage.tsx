import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface BankAccount {
  id: string
  name: string
  account_number: string | null
  bank_name: string | null
  currency_code: string
  gl_account_name: string | null
  gl_account_code: string | null
  gl_account_id: string | null
  opening_balance: number
  is_active: boolean
  last_reconciled_date: string | null
  last_reconciled_balance: number | null
  pending_statements: number
  latest_period: string | null
}

interface GLAccount {
  id: string
  code: string
  name: string
}
interface CompanyBankAccount {
  id: string
  name: string
  bank_name: string | null
  branch: string | null
  account_number: string | null
  iban: string | null
  swift_code: string | null
  currency_code: string
}

const emptyForm = {
  name: '',
  account_number: '',
  bank_name: '',
  branch: '',
  swift_code: '',
  iban: '',
  currency_code: 'IQD',
  gl_account_id: '',
  opening_balance: '0',
  notes: '',
}

export default function BankReconPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [companyBankAccounts, setCompanyBankAccounts] = useState<CompanyBankAccount[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [acctRes, glRes, cbaRes] = await Promise.all([
        api.get<BankAccount[]>('/finance/bank/accounts'),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
        api.get<CompanyBankAccount[]>('/finance/bank/company-accounts'),
      ])
      setAccounts(acctRes.data)
      setGlAccounts(glRes.data)
      setCompanyBankAccounts(cbaRes.data)
    } catch {
      /* handled by interceptor */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openNew() {
    setForm(emptyForm)
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(a: BankAccount) {
    setForm({
      name: a.name,
      account_number: a.account_number ?? '',
      bank_name: a.bank_name ?? '',
      branch: '',
      swift_code: '',
      iban: '',
      currency_code: a.currency_code,
      gl_account_id: a.gl_account_id ?? '',
      opening_balance: String(a.opening_balance),
      notes: '',
    })
    setEditingId(a.id)
    setShowForm(true)
  }

  function handleImportCompanyAccount(id: string) {
    const cba = companyBankAccounts.find((a) => a.id === id)
    if (!cba) return
    setForm((f) => ({
      ...f,
      name: cba.name,
      bank_name: cba.bank_name ?? '',
      branch: cba.branch ?? '',
      account_number: cba.account_number ?? '',
      swift_code: cba.swift_code ?? '',
      iban: cba.iban ?? '',
      currency_code: cba.currency_code,
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const body = {
        name: form.name,
        account_number: form.account_number || undefined,
        bank_name: form.bank_name || undefined,
        branch: form.branch || undefined,
        swift_code: form.swift_code || undefined,
        iban: form.iban || undefined,
        currency_code: form.currency_code,
        gl_account_id: form.gl_account_id || undefined,
        opening_balance: Number(form.opening_balance) || 0,
        notes: form.notes || undefined,
      }
      if (editingId) {
        await api.put(`/finance/bank/accounts/${editingId}`, body)
      } else {
        await api.post('/finance/bank/accounts', body)
      }
      setShowForm(false)
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
    padding: '7px 10px',
    fontSize: '13px',
    color: theme.textPrimary,
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    fontSize: '11px',
    color: theme.textMuted,
    marginBottom: '4px',
    display: 'block' as const,
  }

  const totalAccounts = accounts.length
  const pendingTotal = accounts.reduce((s, a) => s + Number(a.pending_statements), 0)
  const lastReconDate = accounts.reduce<string | null>((best, a) => {
    if (!a.last_reconciled_date) return best
    return !best || a.last_reconciled_date > best ? a.last_reconciled_date : best
  }, null)

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Match bank statement lines to journal entries"
        actions={
          <Button variant="primary" size="sm" onClick={openNew}>
            + New Account
          </Button>
        }
      />

      {/* KPI strip */}
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
            Bank Accounts
          </p>
          <p style={{ fontSize: '22px', fontWeight: 700, color: theme.textPrimary }}>
            {totalAccounts}
          </p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Pending Statements
          </p>
          <p
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: pendingTotal > 0 ? theme.warning : theme.textPrimary,
            }}
          >
            {pendingTotal}
          </p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Last Reconciled
          </p>
          <p style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
            {lastReconDate ? new Date(lastReconDate).toLocaleDateString() : '—'}
          </p>
        </Card>
      </div>

      {/* Account Table */}
      <Card padding="none">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${theme.border}`, background: theme.bgSurface }}>
              {[
                'Account',
                'Bank / Branch',
                'Account No.',
                'GL Account',
                'Last Reconciled',
                'Last Balance',
                'Status',
                '',
              ].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: '10px 14px',
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
                  colSpan={8}
                  style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                >
                  Loading...
                </td>
              </tr>
            )}
            {!loading && !accounts.length && (
              <tr>
                <td
                  colSpan={8}
                  style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                >
                  No bank accounts configured.{' '}
                  <span style={{ color: theme.accent, cursor: 'pointer' }} onClick={openNew}>
                    Add your first account →
                  </span>
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: '10px 14px' }}>
                  <p style={{ fontWeight: 600, color: theme.textPrimary }}>{a.name}</p>
                  <p style={{ fontSize: '11px', color: theme.textMuted }}>{a.currency_code}</p>
                </td>
                <td style={{ padding: '10px 14px', color: theme.textSecondary }}>
                  {a.bank_name ?? '—'}
                </td>
                <td
                  style={{
                    padding: '10px 14px',
                    color: theme.textSecondary,
                    fontFamily: 'monospace',
                    fontSize: '12px',
                  }}
                >
                  {a.account_number ?? '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {a.gl_account_code ? (
                    <span style={{ fontSize: '12px', color: theme.textSecondary }}>
                      {a.gl_account_code} · {a.gl_account_name}
                    </span>
                  ) : (
                    <Badge variant="warning">No GL linked</Badge>
                  )}
                </td>
                <td style={{ padding: '10px 14px', color: theme.textSecondary, fontSize: '12px' }}>
                  {a.last_reconciled_date
                    ? new Date(a.last_reconciled_date).toLocaleDateString()
                    : '—'}
                  {a.latest_period && (
                    <p style={{ fontSize: '11px', color: theme.textMuted }}>
                      Latest: {a.latest_period}
                    </p>
                  )}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {a.last_reconciled_balance != null ? (
                    <AmountDisplay
                      amount={a.last_reconciled_balance}
                      currency={a.currency_code}
                      size="sm"
                    />
                  ) : (
                    <span style={{ color: theme.textMuted, fontSize: '12px' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {Number(a.pending_statements) > 0 ? (
                    <Badge variant="warning">{a.pending_statements} pending</Badge>
                  ) : a.last_reconciled_date ? (
                    <Badge variant="success">Up to date</Badge>
                  ) : (
                    <Badge variant="neutral">Not started</Badge>
                  )}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        navigate(`/finance/bank/${a.id}`)
                      }}
                    >
                      Reconcile
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        openEdit(a)
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* New / Edit Account Modal */}
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
          <Card padding="lg" style={{ width: '500px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '16px' }}>
                {editingId ? 'Edit Bank Account' : 'New Bank Account'}
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

            {companyBankAccounts.length > 0 && (
              <div
                style={{
                  background: theme.bgSurface,
                  borderRadius: '8px',
                  padding: '10px 12px',
                  marginBottom: '16px',
                  border: `1px solid ${theme.border}`,
                }}
              >
                <label style={{ ...labelStyle, marginBottom: '6px' }}>
                  Auto-fill from company bank account
                </label>
                <select
                  style={inputStyle}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handleImportCompanyAccount(e.target.value)
                  }}
                >
                  <option value="">— Select to auto-fill fields below —</option>
                  {companyBankAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.bank_name ? ` · ${a.bank_name}` : ''}
                      {a.account_number ? ` (${a.account_number})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Account Name *</label>
                <input
                  style={inputStyle}
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }}
                  placeholder="e.g. Rafidain Bank — Main"
                />
              </div>
              <div>
                <label style={labelStyle}>Bank Name</label>
                <input
                  style={inputStyle}
                  value={form.bank_name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, bank_name: e.target.value }))
                  }}
                  placeholder="Rafidain Bank"
                />
              </div>
              <div>
                <label style={labelStyle}>Branch</label>
                <input
                  style={inputStyle}
                  value={form.branch}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, branch: e.target.value }))
                  }}
                  placeholder="Main Branch"
                />
              </div>
              <div>
                <label style={labelStyle}>Account Number</label>
                <input
                  style={inputStyle}
                  value={form.account_number}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, account_number: e.target.value }))
                  }}
                  placeholder="XXXXXXXXXX"
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
                  <option value="IQD">IQD — Iraqi Dinar</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>SWIFT / BIC</label>
                <input
                  style={inputStyle}
                  value={form.swift_code}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, swift_code: e.target.value }))
                  }}
                  placeholder="RBNKIQBA"
                />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>IBAN</label>
                <input
                  style={inputStyle}
                  value={form.iban}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, iban: e.target.value }))
                  }}
                  placeholder="IQ98RBNK..."
                />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>GL Account (Bank Account in Chart of Accounts)</label>
                <select
                  style={inputStyle}
                  value={form.gl_account_id}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, gl_account_id: e.target.value }))
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
                <label style={labelStyle}>Opening Balance</label>
                <input
                  style={inputStyle}
                  type="number"
                  value={form.opening_balance}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, opening_balance: e.target.value }))
                  }}
                />
              </div>
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
                disabled={saving || !form.name.trim()}
              >
                {saving ? 'Saving...' : 'Save Account'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
