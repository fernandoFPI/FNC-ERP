import { Trans, useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'
import { usePermission } from '../../../hooks/usePermission'

interface Float_ {
  id: string
  name: string
  // Legacy free-text fields — no longer collected on new floats (superseded
  // by gl_account_id and custodian_employee_id below), kept only so an
  // older float's pre-existing values still display.
  location: string | null
  custodian_name: string | null
  custodian_employee_id: string | null
  // Server-resolved display name: the custodian employee's name when set,
  // falling back to the legacy custodian_name for older floats.
  custodian_display_name: string | null
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
interface Employee {
  id: string
  first_name: string
  last_name: string
}

const STATUS_BADGE: Record<string, 'neutral' | 'info' | 'success' | 'danger'> = {
  pending: 'info',
  approved: 'success',
  posted: 'success',
  rejected: 'danger',
}

export default function PettyCashPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { can } = usePermission()
  const canEdit = can('finance.petty_cash.edit', 'edit')
  const canApprove = can('finance.petty_cash.approve', 'approve')
  const [floats, setFloats] = useState<Float_[]>([])
  const [selected, setSelected] = useState<FloatDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])
  // Unfiltered — used only by Record Spend's Expense GL Account picker,
  // which legitimately spans every expense-type account.
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  // A petty cash float's own account must be a real, postable CASH account
  // (e.g. code 1211 Main Cashbox) — this is what a cash box actually is in
  // the Chart of Accounts, not any of the ~300 accounts of every type.
  const [cashAccounts, setCashAccounts] = useState<GLAccount[]>([])
  // A replenishment can be funded from another cashbox or a bank account.
  const [cashAndBankAccounts, setCashAndBankAccounts] = useState<GLAccount[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])

  const [showNewFloat, setShowNewFloat] = useState(false)
  const [showSpend, setShowSpend] = useState(false)
  const [showReplen, setShowReplen] = useState(false)
  const [showApprove, setShowApprove] = useState<Replenishment | null>(null)
  const [saving, setSaving] = useState(false)

  const [floatForm, setFloatForm] = useState({
    name: '',
    custodian_employee_id: '',
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
      const [fRes, catRes, glRes, cashRes, cashBankRes, empRes] = await Promise.all([
        api.get<Float_[]>('/finance/petty-cash/floats'),
        api.get<Category[]>('/finance/expense-claims/categories'),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
        api.get<GLAccount[]>('/finance/accounts?category=CASH&is_postable=true&is_active=true'),
        api.get<GLAccount[]>('/finance/accounts?category=CASH,BANK&is_postable=true&is_active=true'),
        api.get<Employee[]>('/hr/employees?limit=500'),
      ])
      setFloats(fRes.data)
      setCategories(catRes.data)
      setGlAccounts(glRes.data)
      setCashAccounts(cashRes.data)
      setCashAndBankAccounts(cashBankRes.data)
      setEmployees(empRes.data)
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
    if (!floatForm.gl_account_id) return
    setSaving(true)
    try {
      await api.post('/finance/petty-cash/floats', {
        ...floatForm,
        authorized_limit: Number(floatForm.authorized_limit),
        opening_balance: Number(floatForm.opening_balance),
        custodian_employee_id: floatForm.custodian_employee_id || undefined,
      })
      setShowNewFloat(false)
      setFloatForm({
        name: '',
        custodian_employee_id: '',
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
        title={t('fin.petty.pettyCash')}
        subtitle={t('fin.petty.managePettyCashFloatsPerLocation')}
        actions={
          canEdit ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowNewFloat(true)
              }}
            >
              {t('fin.petty.newFloat')}
            </Button>
          ) : undefined
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
            {t('fin.petty.activeFloats')}
          </p>
          <p style={{ fontSize: '24px', fontWeight: 700, color: theme.textPrimary }}>
            {floats.filter((f) => f.is_active).length}
          </p>
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('fin.petty.totalCashHeld')}
          </p>
          <AmountDisplay amount={totalBalance} currency="IQD" size="md" colored />
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('fin.petty.totalAuthorized')}
          </p>
          <AmountDisplay amount={totalAuthorized} currency="IQD" size="md" />
        </Card>
        <Card padding="sm">
          <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('fin.petty.overallUtilization')}
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
          <p style={{ fontSize: '10px', color: theme.textMuted }}>{t('fin.petty.spentOfAuthorized')}</p>
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
                {t('fin.petty.floats')}
              </p>
            </div>
            {loading && (
              <p style={{ padding: '16px', fontSize: '12px', color: theme.textMuted }}>
                {t('fin.petty.loading')}
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
                    {low && <Badge variant="danger">{t('fin.petty.low')}</Badge>}
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
                {t('fin.petty.noFloatsYet')}
              </p>
            )}
          </Card>
        </div>

        {/* Float detail */}
        <div>
          {!selected ? (
            <Card padding="lg" style={{ textAlign: 'center' }}>
              <p style={{ color: theme.textMuted, fontSize: '13px' }}>
                {t('fin.petty.selectAFloatToViewTransactions')}
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
                    {selected.custodian_display_name && (
                      <p style={{ margin: 0, fontSize: '12px', color: theme.textSecondary }}>{t('fin.petty.custodian2', { custodian_display_name: selected.custodian_display_name })}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowSpend(true)
                        }}
                      >
                        {t('fin.petty.recordSpend')}
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setShowReplen(true)
                        }}
                      >
                        {t('fin.petty.requestReplenishment')}
                      </Button>
                    )}
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
                      {t('fin.petty.currentBalance')}
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
                      {t('fin.petty.authorizedLimit')}
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
                      {t('fin.petty.glAccount')}
                    </p>
                    <p
                      style={{
                        fontSize: '12px',
                        color: selected.account_code ? theme.textPrimary : theme.textMuted,
                      }}
                    >
                      {selected.account_code
                        ? `${selected.account_code} · ${selected.account_name}`
                        : t('fin.petty.notLinked')}
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
                    {t('fin.petty.recentTransactions')}
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
                      {[t('fin.petty.date2'), t('fin.petty.description2'), t('fin.petty.category'), t('fin.petty.type'), t('fin.petty.amount2'), t('fin.petty.balance')].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '7px 12px',
                            textAlign: 'start',
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
                          {t('fin.petty.noTransactionsYet')}
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
                      {t('fin.petty.replenishmentRequests')}
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
                        {[t('fin.petty.ref'), t('fin.petty.requested2'), t('fin.petty.approved'), t('fin.petty.status'), t('fin.petty.date2'), ''].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: '7px 12px',
                              textAlign: 'start',
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
                            <Badge variant={STATUS_BADGE[r.status] ?? 'neutral'}>{enumLabel(r.status)}</Badge>
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
                            {canApprove && r.status === 'pending' && (
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
                                {t('fin.petty.approve')}
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
                {t('fin.petty.newPettyCashFloat')}
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
                <label style={labelStyle}>{t('fin.petty.floatName')}</label>
                <input
                  style={inputStyle}
                  value={floatForm.name}
                  placeholder={t('fin.petty.eGHeadOfficePettyCash')}
                  onChange={(e) => {
                    setFloatForm((f) => ({ ...f, name: e.target.value }))
                  }}
                />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>{t('fin.petty.cashboxGlAccount')}</label>
                <select
                  style={inputStyle}
                  value={floatForm.gl_account_id}
                  onChange={(e) => {
                    setFloatForm((f) => ({ ...f, gl_account_id: e.target.value }))
                  }}
                >
                  <option value="">{t('fin.petty.selectCashbox')}</option>
                  {cashAccounts.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.code} · {g.name}
                    </option>
                  ))}
                </select>
                {cashAccounts.length === 0 && (
                  <p style={{ fontSize: '10px', color: theme.textMuted, marginTop: '3px' }}>
                    {t('fin.petty.noPostableCashAccountsFoundAsk')}
                  </p>
                )}
              </div>
              <div>
                <label style={labelStyle}>{t('fin.petty.custodian')}</label>
                <select
                  style={inputStyle}
                  value={floatForm.custodian_employee_id}
                  onChange={(e) => {
                    setFloatForm((f) => ({ ...f, custodian_employee_id: e.target.value }))
                  }}
                >
                  <option value="">{t('fin.petty.selectEmployee')}</option>
                  {employees.map((em) => (
                    <option key={em.id} value={em.id}>
                      {em.first_name} {em.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t('fin.petty.authorizedLimit2')}</label>
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
                <label style={labelStyle}>{t('fin.petty.openingBalance')}</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={floatForm.opening_balance}
                  onChange={(e) => {
                    setFloatForm((f) => ({ ...f, opening_balance: e.target.value }))
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
                  setShowNewFloat(false)
                }}
              >
                {t('fin.petty.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleCreateFloat()}
                disabled={
                  saving || !floatForm.name || !floatForm.authorized_limit || !floatForm.gl_account_id
                }
              >
                {saving ? t('fin.petty.creating') : t('fin.petty.createFloat')}
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
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>{t('fin.petty.recordSpend2', { name: selected.name })}</h3>
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
              {t('fin.petty.availableBalance')}{' '}
              <strong style={{ color: theme.accent, fontFamily: 'monospace' }}>
                {Number(selected.current_balance).toLocaleString()} {selected.currency_code}
              </strong>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{t('fin.petty.date')}</label>
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
                  <label style={labelStyle}>{t('fin.petty.amount')}</label>
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
                <label style={labelStyle}>{t('fin.petty.description')}</label>
                <input
                  style={inputStyle}
                  value={spendForm.description}
                  onChange={(e) => {
                    setSpendForm((f) => ({ ...f, description: e.target.value }))
                  }}
                  placeholder={t('fin.petty.whatWasPurchased')}
                />
              </div>
              <div>
                <label style={labelStyle}>{t('fin.petty.category')}</label>
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
                  <option value="">{t('fin.petty.selectCategory')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{t('fin.petty.expenseGlAccountForJournalEntry')}</label>
                <select
                  style={inputStyle}
                  value={spendForm.gl_account_id}
                  onChange={(e) => {
                    setSpendForm((f) => ({ ...f, gl_account_id: e.target.value }))
                  }}
                >
                  <option value="">{t('fin.petty.selectAccount')}</option>
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
                {t('fin.petty.cancel')}
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
                {saving ? t('fin.petty.recording') : t('fin.petty.recordSpend')}
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
                {t('fin.petty.requestReplenishment')}
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
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px' }}><Trans i18nKey="fin.petty.currentBalanceAuthorizedLimit" values={{ value: Number(selected.current_balance).toLocaleString(), value2: Number(selected.authorized_limit).toLocaleString() }} components={[<strong style={{ fontFamily: 'monospace' }} />, <strong style={{ fontFamily: 'monospace' }} />]} /></p>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={labelStyle}>{t('fin.petty.amountToReplenish')}</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={replenForm.requested_amount}
                  max={Number(selected.authorized_limit) - Number(selected.current_balance)}
                  onChange={(e) => {
                    setReplenForm((f) => ({ ...f, requested_amount: e.target.value }))
                  }}
                />
                <p style={{ fontSize: '10px', color: theme.textMuted, marginTop: '3px' }}>{t('fin.petty.maxTopUp', { value: ( Number(selected.authorized_limit) - Number(selected.current_balance) ).toLocaleString() })}</p>
              </div>
              <div>
                <label style={labelStyle}>{t('fin.petty.notes')}</label>
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
                {t('fin.petty.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleReplen()}
                disabled={saving || !replenForm.requested_amount}
              >
                {saving ? t('fin.petty.sending') : t('fin.petty.submitRequest')}
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
                {t('fin.petty.approveReplenishment')}
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
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '16px' }}><Trans i18nKey="fin.petty.requested" values={{ value: Number(showApprove.requested_amount).toLocaleString() }} components={[<strong style={{ fontFamily: 'monospace' }} />]} /></p>
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
                  {t('fin.petty.approvedAmount')}
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
                  {t('fin.petty.bankCashOffsetAccountForJe')}
                </label>
                <select
                  style={inputStyle}
                  value={approveForm.offset_account_id}
                  onChange={(e) => {
                    setApproveForm((f) => ({ ...f, offset_account_id: e.target.value }))
                  }}
                >
                  <option value="">{t('fin.petty.optionalNeededForJe')}</option>
                  {cashAndBankAccounts.map((g) => (
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
                {t('fin.petty.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleApproveReplen()}
                disabled={saving || !approveForm.approved_amount}
              >
                {saving ? t('fin.petty.approving') : t('fin.petty.approvePost')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
