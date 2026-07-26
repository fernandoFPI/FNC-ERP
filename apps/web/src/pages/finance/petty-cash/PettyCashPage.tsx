import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'

interface Float_ {
  id: string
  name: string
  location: string | null
  custodian_name: string | null
  currency_code: string
  authorized_limit: number
  current_balance: number
  pct_remaining: number | null
  account_code: string | null
  account_name: string | null
  is_active: boolean
  gl_account_id: string | null
}

interface Transaction {
  id: string
  transaction_date: string
  description: string
  category_name: string | null
  amount: number
  transaction_type: string
  balance_after: number | null
  created_at: string
}

interface Replenishment {
  id: string
  replenishment_number: string
  requested_amount: number
  approved_amount: number | null
  status: string
  created_at: string
  notes: string | null
}

interface FloatDetail extends Float_ {
  transactions: Transaction[]
  replenishments: Replenishment[]
}
interface Category {
  id: string
  name: string
  gl_account_id: string | null
}
interface GLAccount {
  id: string
  code: string
  name: string
}

const STATUS_BADGE: Record<string, 'neutral' | 'info' | 'success' | 'danger'> = {
  pending: 'info',
  approved: 'success',
  posted: 'success',
  rejected: 'danger',
}

export default function PettyCashPage() {
  const { theme } = useTheme()
  const [floats, setFloats] = useState<Float_[]>([])
  const [selected, setSelected] = useState<FloatDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])

  const [showNewFloat, setShowNewFloat] = useState(false)
  const [showSpend, setShowSpend] = useState(false)
  const [showReplen, setShowReplen] = useState(false)
  const [showApprove, setShowApprove] = useState<Replenishment | null>(null)
  const [saving, setSaving] = useState(false)

  const [floatForm, setFloatForm] = useState({
    name: '',
    location: '',
    custodian_name: '',
    currency_code: 'IQD',
    authorized_limit: '',
    opening_balance: '0',
    gl_account_id: '',
    notes: '',
  })
  const [spendForm, setSpendForm] = useState({
    transaction_date: new Date().toISOString().slice(0, 10),
    description: '',
    category_id: '',
    gl_account_id: '',
    amount: '',
  })
  const [replenForm, setReplenForm] = useState({ requested_amount: '', notes: '' })
  const [approveForm, setApproveForm] = useState({ approved_amount: '', offset_account_id: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [fRes, catRes, glRes] = await Promise.all([
        api.get<Float_[]>('/finance/petty-cash/floats'),
        api.get<Category[]>('/finance/expense-claims/categories'),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
      ])
      setFloats(fRes.data)
      setCategories(catRes.data)
      setGlAccounts(glRes.data)
      if (selected) {
        const dRes = await api.get<FloatDetail>(`/finance/petty-cash/floats/${selected.id}`)
        setSelected(dRes.data)
      }
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [selected?.id])

  useEffect(() => {
    void load()
  }, [])

  async function loadFloat(id: string) {
    try {
      const r = await api.get<FloatDetail>(`/finance/petty-cash/floats/${id}`)
      setSelected(r.data)
    } catch {
      /* handled */
    }
  }

  async function handleCreateFloat() {
    setSaving(true)
    try {
      await api.post('/finance/petty-cash/floats', {
        ...floatForm,
        authorized_limit: Number(floatForm.authorized_limit),
        opening_balance: Number(floatForm.opening_balance),
        gl_account_id: floatForm.gl_account_id || undefined,
      })
      setShowNewFloat(false)
      setFloatForm({
        name: '',
        location: '',
        custodian_name: '',
        currency_code: 'IQD',
        authorized_limit: '',
        opening_balance: '0',
        gl_account_id: '',
        notes: '',
      })
      const r = await api.get<Float_[]>('/finance/petty-cash/floats')
      setFloats(r.data)
    } catch {
      /* handled */
    } finally {
      setSaving(false)
    }
  }

  async function handleSpend() {
    if (!selected) return
    setSaving(true)
    try {
      await api.post(`/finance/petty-cash/floats/${selected.id}/spend`, {
        ...spendForm,
        amount: Number(spendForm.amount),
        category_id: spendForm.category_id || undefined,
        gl_account_id: spendForm.gl_account_id || undefined,
      })
      setShowSpend(false)
      setSpendForm({
        transaction_date: new Date().toISOString().slice(0, 10),
        description: '',
        category_id: '',
        gl_account_id: '',
        amount: '',
      })
      await loadFloat(selected.id)
    } catch {
      /* handled */
    } finally {
      setSaving(false)
    }
  }

  async function handleReplen() {
    if (!selected) return
    setSaving(true)
    try {
      await api.post(`/finance/petty-cash/floats/${selected.id}/replenish`, {
        requested_amount: Number(replenForm.requested_amount),
        notes: replenForm.notes || undefined,
      })
      setShowReplen(false)
      setReplenForm({ requested_amount: '', notes: '' })
      await loadFloat(selected.id)
    } catch {
      /* handled */
    } finally {
      setSaving(false)
    }
  }

  async function handleApproveReplen() {
    if (!showApprove) return
    setSaving(true)
    try {
      await api.post(`/finance/petty-cash/replenishments/${showApprove.id}/approve`, {
        approved_amount: Number(approveForm.approved_amount),
        offset_account_id: approveForm.offset_account_id || undefined,
      })
      setShowApprove(null)
      setApproveForm({ approved_amount: '', offset_account_id: '' })
      if (selected) await loadFloat(selected.id)
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

  const totalBalance = floats.reduce((s, f) => s + Number(f.current_balance), 0)
  const totalAuthorized = floats.reduce((s, f) => s + Number(f.authorized_limit), 0)

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Petty Cash"
        subtitle="Manage petty cash floats per location — record spend, request replenishment, post journal entries"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setShowNewFloat(true)
            }}
          >
            + New Float
          </Button>
        }
      />

      {/* Summary row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Active Floats
          </p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: theme.textPrimary }}>
            {floats.filter((f) => f.is_active).length}
          </p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Total Cash Held
          </p>
          <AmountDisplay amount={totalBalance} currency="IQD" size="md" colored />
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Total Authorized
          </p>
          <AmountDisplay amount={totalAuthorized} currency="IQD" size="md" />
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            Overall Utilization
          </p>
          <p
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: theme.accent,
              fontFamily: 'monospace',
            }}
          >
            {totalAuthorized > 0 ? Math.round((1 - totalBalance / totalAuthorized) * 100) : 0}%
          </p>
          <p style={{ fontSize: '10px', color: theme.textMuted }}>spent of authorized</p>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px' }}>
        {/* Float list */}
        <div>
          <Card padding="none">
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${theme.border}` }}>
              <p
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  margin: 0,
                }}
              >
                Floats
              </p>
            </div>
            {loading && (
              <p style={{ padding: '16px', fontSize: '12px', color: theme.textMuted }}>
                Loading...
              </p>
            )}
            {floats.map((f) => {
              const pct =
                f.pct_remaining !== null
                  ? Number(f.pct_remaining)
                  : f.authorized_limit > 0
                    ? Math.round((f.current_balance / f.authorized_limit) * 100)
                    : 0
              const low = pct < 20
              return (
                <div
                  key={f.id}
                  onClick={() => void loadFloat(f.id)}
                  style={{
                    padding: '12px 14px',
                    borderBottom: `1px solid ${theme.border}`,
                    cursor: 'pointer',
                    background: selected?.id === f.id ? theme.accent + '15' : undefined,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: selected?.id === f.id ? theme.accent : theme.textPrimary,
                      }}
                    >
                      {f.name}
                    </span>
                    {low && <Badge variant="danger">Low</Badge>}
                  </div>
                  {f.location && (
                    <p style={{ fontSize: '10px', color: theme.textMuted, margin: '0 0 6px' }}>
                      {f.location}
                    </p>
                  )}
                  <div
                    style={{
                      background: theme.border,
                      borderRadius: '3px',
                      height: '5px',
                      overflow: 'hidden',
                      marginBottom: '4px',
                    }}
                  >
                    <div
                      style={{
                        background: low ? '#ef4444' : theme.accent,
                        width: `${pct}%`,
                        height: '100%',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                      color: theme.textMuted,
                    }}
                  >
                    <span>
                      {Number(f.current_balance).toLocaleString()} {f.currency_code}
                    </span>
                    <span>of {Number(f.authorized_limit).toLocaleString()}</span>
                  </div>
                </div>
              )
            })}
            {!loading && !floats.length && (
              <p
                style={{
                  padding: '24px',
                  fontSize: '12px',
                  color: theme.textMuted,
                  textAlign: 'center',
                }}
              >
                No floats yet.
              </p>
            )}
          </Card>
        </div>

        {/* Float detail */}
        <div>
          {!selected ? (
            <Card padding="lg" style={{ textAlign: 'center' }}>
              <p style={{ color: theme.textMuted, fontSize: '13px' }}>
                Select a float to view transactions and manage it.
              </p>
            </Card>
          ) : (
            <>
              {/* Float header */}
              <Card padding="md" style={{ marginBottom: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div>
                    <h3 style={{ margin: '0 0 4px', color: theme.textPrimary, fontSize: '15px' }}>
                      {selected.name}
                    </h3>
                    {selected.location && (
                      <p style={{ margin: '0 0 2px', fontSize: '12px', color: theme.textMuted }}>
                        {selected.location}
                      </p>
                    )}
                    {selected.custodian_name && (
                      <p style={{ margin: 0, fontSize: '12px', color: theme.textSecondary }}>
                        Custodian: {selected.custodian_name}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowSpend(true)
                      }}
                    >
                      Record Spend
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setShowReplen(true)
                      }}
                    >
                      Request Replenishment
                    </Button>
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3,1fr)',
                    gap: '12px',
                    marginTop: '12px',
                  }}
                >
                  <div>
                    <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>
                      Current Balance
                    </p>
                    <p
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color:
                          Number(selected.current_balance) < Number(selected.authorized_limit) * 0.2
                            ? '#ef4444'
                            : '#22c55e',
                        fontFamily: 'monospace',
                      }}
                    >
                      {Number(selected.current_balance).toLocaleString()} {selected.currency_code}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>
                      Authorized Limit
                    </p>
                    <p
                      style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: theme.textSecondary,
                        fontFamily: 'monospace',
                      }}
                    >
                      {Number(selected.authorized_limit).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '2px' }}>
                      GL Account
                    </p>
                    <p
                      style={{
                        fontSize: '12px',
                        color: selected.account_code ? theme.textPrimary : theme.textMuted,
                      }}
                    >
                      {selected.account_code
                        ? `${selected.account_code} · ${selected.account_name}`
                        : 'Not linked'}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Transactions */}
              <Card padding="none" style={{ marginBottom: '12px' }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${theme.border}` }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '11px',
                      fontWeight: 600,
                      color: theme.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Recent Transactions
                  </p>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr
                      style={{
                        background: theme.bgSurface,
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      {['Date', 'Description', 'Category', 'Type', 'Amount', 'Balance'].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '7px 12px',
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
                    {!selected.transactions.length && (
                      <tr>
                        <td
                          colSpan={6}
                          style={{ padding: '20px', textAlign: 'center', color: theme.textMuted }}
                        >
                          No transactions yet.
                        </td>
                      </tr>
                    )}
                    {selected.transactions.map((t) => (
                      <tr key={t.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td
                          style={{
                            padding: '7px 12px',
                            color: theme.textSecondary,
                            fontSize: '11px',
                          }}
                        >
                          {new Date(t.transaction_date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '7px 12px', color: theme.textPrimary }}>
                          {t.description}
                        </td>
                        <td style={{ padding: '7px 12px', color: theme.textMuted }}>
                          {t.category_name ?? '—'}
                        </td>
                        <td style={{ padding: '7px 12px' }}>
                          <Badge variant={t.transaction_type === 'spend' ? 'danger' : 'success'}>
                            {t.transaction_type}
                          </Badge>
                        </td>
                        <td
                          style={{
                            padding: '7px 12px',
                            fontFamily: 'monospace',
                            color: t.transaction_type === 'spend' ? '#ef4444' : '#22c55e',
                            fontWeight: 600,
                          }}
                        >
                          {t.transaction_type === 'spend' ? '-' : '+'}
                          {Number(t.amount).toLocaleString()}
                        </td>
                        <td
                          style={{
                            padding: '7px 12px',
                            fontFamily: 'monospace',
                            color: theme.textSecondary,
                          }}
                        >
                          {t.balance_after !== null
                            ? Number(t.balance_after).toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {/* Replenishments */}
              {selected.replenishments.length > 0 && (
                <Card padding="none">
                  <div style={{ padding: '10px 14px', borderBottom: `1px solid ${theme.border}` }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '11px',
                        fontWeight: 600,
                        color: theme.textMuted,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      Replenishment Requests
                    </p>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr
                        style={{
                          background: theme.bgSurface,
                          borderBottom: `1px solid ${theme.border}`,
                        }}
                      >
                        {['Ref', 'Requested', 'Approved', 'Status', 'Date', ''].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: '7px 12px',
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
                      {selected.replenishments.map((r) => (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <td
                            style={{
                              padding: '7px 12px',
                              fontFamily: 'monospace',
                              fontSize: '11px',
                              color: theme.accent,
                            }}
                          >
                            {r.replenishment_number}
                          </td>
                          <td style={{ padding: '7px 12px' }}>
                            <AmountDisplay
                              amount={Number(r.requested_amount)}
                              currency={selected.currency_code}
                              size="sm"
                            />
                          </td>
                          <td style={{ padding: '7px 12px' }}>
                            {r.approved_amount !== null ? (
                              <AmountDisplay
                                amount={Number(r.approved_amount)}
                                currency={selected.currency_code}
                                size="sm"
                              />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td style={{ padding: '7px 12px' }}>
                            <Badge variant={STATUS_BADGE[r.status] ?? 'neutral'}>{r.status}</Badge>
                          </td>
                          <td
                            style={{
                              padding: '7px 12px',
                              color: theme.textMuted,
                              fontSize: '11px',
                            }}
                          >
                            {new Date(r.created_at).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '7px 12px' }}>
                            {r.status === 'pending' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setShowApprove(r)
                                  setApproveForm({
                                    approved_amount: String(r.requested_amount),
                                    offset_account_id: '',
                                  })
                                }}
                              >
                                Approve
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* New Float Modal */}
      {showNewFloat && (
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
          <Card padding="lg" style={{ width: '480px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>
                New Petty Cash Float
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNewFloat(false)
                }}
              >
                ✕
              </Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Float Name *</label>
                <input
                  style={inputStyle}
                  value={floatForm.name}
                  placeholder="e.g. Head Office Petty Cash"
                  onChange={(e) => {
                    setFloatForm((f) => ({ ...f, name: e.target.value }))
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Location</label>
                <input
                  style={inputStyle}
                  value={floatForm.location}
                  onChange={(e) => {
                    setFloatForm((f) => ({ ...f, location: e.target.value }))
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Custodian Name</label>
                <input
                  style={inputStyle}
                  value={floatForm.custodian_name}
                  onChange={(e) => {
                    setFloatForm((f) => ({ ...f, custodian_name: e.target.value }))
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Authorized Limit *</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={floatForm.authorized_limit}
                  onChange={(e) => {
                    setFloatForm((f) => ({ ...f, authorized_limit: e.target.value }))
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Opening Balance</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={floatForm.opening_balance}
                  onChange={(e) => {
                    setFloatForm((f) => ({ ...f, opening_balance: e.target.value }))
                  }}
                />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>GL Account (Petty Cash)</label>
                <select
                  style={inputStyle}
                  value={floatForm.gl_account_id}
                  onChange={(e) => {
                    setFloatForm((f) => ({ ...f, gl_account_id: e.target.value }))
                  }}
                >
                  <option value="">— Select account —</option>
                  {glAccounts.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} · {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowNewFloat(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleCreateFloat()}
                disabled={saving || !floatForm.name || !floatForm.authorized_limit}
              >
                {saving ? 'Creating...' : 'Create Float'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Record Spend Modal */}
      {showSpend && selected && (
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
          <Card padding="lg" style={{ width: '440px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>
                Record Spend — {selected.name}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSpend(false)
                }}
              >
                ✕
              </Button>
            </div>
            <div
              style={{
                background: theme.bgCanvas,
                borderRadius: '8px',
                padding: '8px 12px',
                marginBottom: '16px',
                fontSize: '12px',
              }}
            >
              Available balance:{' '}
              <strong style={{ color: theme.accent, fontFamily: 'monospace' }}>
                {Number(selected.current_balance).toLocaleString()} {selected.currency_code}
              </strong>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Date *</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={spendForm.transaction_date}
                    onChange={(e) => {
                      setSpendForm((f) => ({ ...f, transaction_date: e.target.value }))
                    }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Amount *</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={spendForm.amount}
                    min="0.01"
                    max={selected.current_balance}
                    onChange={(e) => {
                      setSpendForm((f) => ({ ...f, amount: e.target.value }))
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Description *</label>
                <input
                  style={inputStyle}
                  value={spendForm.description}
                  onChange={(e) => {
                    setSpendForm((f) => ({ ...f, description: e.target.value }))
                  }}
                  placeholder="What was purchased?"
                />
              </div>
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  style={inputStyle}
                  value={spendForm.category_id}
                  onChange={(e) => {
                    const cat = categories.find((c) => c.id === e.target.value)
                    setSpendForm((f) => ({
                      ...f,
                      category_id: e.target.value,
                      gl_account_id: cat?.gl_account_id ?? f.gl_account_id,
                    }))
                  }}
                >
                  <option value="">— Select category —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Expense GL Account (for journal entry)</label>
                <select
                  style={inputStyle}
                  value={spendForm.gl_account_id}
                  onChange={(e) => {
                    setSpendForm((f) => ({ ...f, gl_account_id: e.target.value }))
                  }}
                >
                  <option value="">— Select account —</option>
                  {glAccounts.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} · {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSpend(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleSpend()}
                disabled={
                  saving ||
                  !spendForm.description ||
                  !spendForm.amount ||
                  Number(spendForm.amount) > selected.current_balance
                }
              >
                {saving ? 'Recording...' : 'Record Spend'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Replenishment Request Modal */}
      {showReplen && selected && (
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
          <Card padding="lg" style={{ width: '380px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>
                Request Replenishment
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowReplen(false)
                }}
              >
                ✕
              </Button>
            </div>
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px' }}>
              Current balance:{' '}
              <strong style={{ fontFamily: 'monospace' }}>
                {Number(selected.current_balance).toLocaleString()}
              </strong>{' '}
              · Authorized limit:{' '}
              <strong style={{ fontFamily: 'monospace' }}>
                {Number(selected.authorized_limit).toLocaleString()}
              </strong>
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Amount to Replenish *</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={replenForm.requested_amount}
                  max={Number(selected.authorized_limit) - Number(selected.current_balance)}
                  onChange={(e) => {
                    setReplenForm((f) => ({ ...f, requested_amount: e.target.value }))
                  }}
                />
                <p style={{ fontSize: '10px', color: theme.textMuted, marginTop: '3px' }}>
                  Max top-up:{' '}
                  {(
                    Number(selected.authorized_limit) - Number(selected.current_balance)
                  ).toLocaleString()}
                </p>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input
                  style={inputStyle}
                  value={replenForm.notes}
                  onChange={(e) => {
                    setReplenForm((f) => ({ ...f, notes: e.target.value }))
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
                  setShowReplen(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleReplen()}
                disabled={saving || !replenForm.requested_amount}
              >
                {saving ? 'Sending...' : 'Submit Request'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Approve Replenishment Modal */}
      {showApprove && (
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
          <Card padding="lg" style={{ width: '420px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>
                Approve Replenishment
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowApprove(null)
                }}
              >
                ✕
              </Button>
            </div>
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '16px' }}>
              Requested:{' '}
              <strong style={{ fontFamily: 'monospace' }}>
                {Number(showApprove.requested_amount).toLocaleString()}
              </strong>
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label
                  style={{
                    fontSize: '11px',
                    color: theme.textMuted,
                    marginBottom: '3px',
                    display: 'block',
                  }}
                >
                  Approved Amount *
                </label>
                <input
                  type="number"
                  style={inputStyle}
                  value={approveForm.approved_amount}
                  onChange={(e) => {
                    setApproveForm((f) => ({ ...f, approved_amount: e.target.value }))
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: '11px',
                    color: theme.textMuted,
                    marginBottom: '3px',
                    display: 'block',
                  }}
                >
                  Bank / Cash Offset Account (for JE)
                </label>
                <select
                  style={inputStyle}
                  value={approveForm.offset_account_id}
                  onChange={(e) => {
                    setApproveForm((f) => ({ ...f, offset_account_id: e.target.value }))
                  }}
                >
                  <option value="">— Optional — needed for JE —</option>
                  {glAccounts.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} · {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowApprove(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleApproveReplen()}
                disabled={saving || !approveForm.approved_amount}
              >
                {saving ? 'Approving...' : 'Approve & Post'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
