import { enumLabel, tlh } from '../../../i18n'
import { Trans, useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { api } from '../../../lib/axios'
import { formatCurrency } from '../../../lib/format'
import { usePermission } from '../../../hooks/usePermission'

interface BudgetLine {
  id: string
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  period: string
  amount: number
  notes: string | null
}

interface Budget {
  id: string
  name: string
  fiscal_year: number
  currency_code: string
  status: 'draft' | 'active' | 'locked'
  notes: string | null
  created_at: string
  lines: BudgetLine[]
}

interface VsActualRow {
  account_id: string
  account_code: string
  account_name: string
  account_type: string
  budget_amount: number
  actual_amount: number
  variance: number
  variance_pct: number | null
}

interface VsActualResult {
  budget: { name: string; fiscal_year: number; currency_code: string; status: string }
  period_from: string
  period_to: string
  rows: VsActualRow[]
  totals: { budget: number; actual: number; variance: number }
  outsideBudgetCurrency: { currencyCode: string; amount: number }[]
}

interface GLAccount {
  id: string
  code: string
  name: string
}

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const STATUS_BADGE: Record<string, 'neutral' | 'success' | 'info'> = {
  draft: 'neutral',
  active: 'success',
  locked: 'info',
}

export default function BudgetDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { can } = usePermission()
  const canEdit = can('finance.budget.edit', 'edit')
  const [budget, setBudget] = useState<Budget | null>(null)
  const [vsActual, setVsActual] = useState<VsActualResult | null>(null)
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'matrix' | 'variance'>('matrix')
  const [saving, setSaving] = useState(false)

  // Inline editing state: { [accountId_period]: value }
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [addRowAccountId, setAddRowAccountId] = useState('')
  const [showAccountPicker, setShowAccountPicker] = useState(false)
  const [accountSearch, setAccountSearch] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [budRes, glRes] = await Promise.all([
        api.get<Budget>(`/finance/budget/${id}`),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
      ])
      setBudget(budRes.data)
      setGlAccounts(glRes.data)

      if (activeTab === 'variance') {
        const yr = budRes.data.fiscal_year
        const va = await api.get<VsActualResult>(`/finance/budget/${id}/vs-actual`, {
          params: { period_from: `${yr}-01`, period_to: `${yr}-12` },
        })
        setVsActual(va.data)
      }
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [id, activeTab])

  useEffect(() => {
    void load()
  }, [load])

  function cellKey(accountId: string, period: string) {
    return `${accountId}_${period}`
  }

  function getAmount(accountId: string, period: string): number {
    const key = cellKey(accountId, period)
    if (key in edits) return Number(edits[key]) || 0
    return Number(
      budget?.lines.find((l) => l.account_id === accountId && l.period === period)?.amount ?? 0,
    )
  }

  function setCell(accountId: string, period: string, value: string) {
    setEdits((e) => ({ ...e, [cellKey(accountId, period)]: value }))
  }

  async function handleSave() {
    if (!budget || !Object.keys(edits).length) return
    setSaving(true)
    try {
      const lines = Object.entries(edits)
        .filter(([, v]) => v !== '')
        .map(([key, value]) => {
          const [accountId, period] = key.split('_') as [string, string]
          return { account_id: accountId, period, amount: Number(value) || 0 }
        })
      if (!lines.length) {
        setSaving(false)
        return
      }
      await api.post(`/finance/budget/${id}/lines`, { lines })
      setEdits({})
      void load()
    } catch {
      /* handled */
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(status: 'draft' | 'active' | 'locked') {
    if (!id) return
    try {
      await api.patch(`/finance/budget/${id}/status`, { status })
      void load()
    } catch {
      /* handled */
    }
  }

  const inputStyle = {
    background: 'transparent',
    border: 'none',
    padding: '2px 4px',
    fontSize: '11px',
    color: theme.textPrimary,
    fontFamily: 'monospace',
    width: '90px',
    textAlign: 'end' as const,
    outline: 'none',
  }

  if (loading && !budget)
    return (
      <div style={{ padding: '24px', color: theme.textMuted, fontSize: '13px' }}>
        {t('fin.budgetDetail.loadingBudget')}
      </div>
    )
  if (!budget)
    return (
      <div style={{ padding: '24px', color: theme.textMuted, fontSize: '13px' }}>
        {t('fin.budgetDetail.budgetNotFound')}
      </div>
    )

  const isLocked = budget.status === 'locked'
  const hasEdits = Object.keys(edits).length > 0
  const accountIds = Array.from(new Set(budget.lines.map((l) => l.account_id)))
  if (addRowAccountId && !accountIds.includes(addRowAccountId)) accountIds.push(addRowAccountId)

  // Build account map for display
  const accountMap = new Map<string, { code: string; name: string }>()
  budget.lines.forEach((l) =>
    accountMap.set(l.account_id, { code: l.account_code, name: l.account_name }),
  )
  glAccounts.forEach((g) => {
    if (!accountMap.has(g.id)) accountMap.set(g.id, { code: g.code, name: g.name })
  })

  const yearStr = String(budget.fiscal_year)
  const periods = MONTHS.map((m) => `${yearStr}-${m}`)

  const rowTotals = accountIds.map((aid) => ({
    accountId: aid,
    total: periods.reduce((s, p) => s + getAmount(aid, p), 0),
  }))
  const colTotals = periods.map((p) => ({
    period: p,
    total: accountIds.reduce((s, aid) => s + getAmount(aid, p), 0),
  }))
  const grandTotal = rowTotals.reduce((s, r) => s + r.total, 0)

  const filteredAccounts = glAccounts
    .filter(
      (g) =>
        !accountIds.includes(g.id) &&
        (g.code.toLowerCase().includes(accountSearch.toLowerCase()) ||
          g.name.toLowerCase().includes(accountSearch.toLowerCase())),
    )
    .slice(0, 20)

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={budget.name}
        subtitle={t('fin.budgetDetail.fiscalYear', { fiscal_year: budget.fiscal_year, currency_code: budget.currency_code })}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_BADGE[budget.status] ?? 'neutral'}>{enumLabel(budget.status)}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate(-1)
              }}
            >
              {t('fin.budgetDetail.back')}
            </Button>
            {canEdit && budget.status === 'draft' && (
              <Button variant="ghost" size="sm" onClick={() => void handleStatusChange('active')}>
                {t('fin.budgetDetail.activate')}
              </Button>
            )}
            {canEdit && budget.status === 'active' && (
              <Button variant="ghost" size="sm" onClick={() => void handleStatusChange('locked')}>
                {t('fin.budgetDetail.lock')}
              </Button>
            )}
            {canEdit && budget.status === 'locked' && (
              <Button variant="ghost" size="sm" onClick={() => void handleStatusChange('draft')}>
                {t('fin.budgetDetail.unlock')}
              </Button>
            )}
            {canEdit && hasEdits && !isLocked && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving ? t('fin.budgetDetail.saving') : t('fin.budgetDetail.saveChanges', { length: Object.keys(edits).length })}
              </Button>
            )}
          </div>
        }
      />

      {/* Tab selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {(['matrix', 'variance'] as const).map((tx) => (
          <button
            key={tx}
            onClick={() => {
              setActiveTab(tx)
            }}
            style={{
              padding: '6px 16px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              background: activeTab === tx ? theme.accent : theme.bgSurface,
              color: activeTab === tx ? '#fff' : theme.textSecondary,
              fontFamily: 'inherit',
              fontWeight: activeTab === tx ? 600 : 400,
            }}
          >
            {tx === 'matrix' ? t('fin.budgetDetail.budgetMatrix') : t('fin.budgetDetail.budgetVsActual')}
          </button>
        ))}
      </div>

      {/* ── Matrix Tab ─────────────────────────────────────────────────────────── */}
      {activeTab === 'matrix' && (
        <Card padding="none" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '11px', minWidth: '1200px' }}>
            <thead>
              <tr
                style={{ background: theme.bgSurface, borderBottom: `2px solid ${theme.border}` }}
              >
                <th
                  style={{
                    padding: '8px 10px',
                    textAlign: 'start',
                    color: theme.textMuted,
                    fontWeight: 500,
                    position: 'sticky',
                    left: 0,
                    background: theme.bgSurface,
                    minWidth: '200px',
                    zIndex: 2,
                  }}
                >
                  {t('fin.budgetDetail.account')}
                </th>
                {MONTH_LABELS.map((m, i) => (
                  <th
                    key={m}
                    style={{
                      padding: '8px 6px',
                      textAlign: 'end',
                      color: theme.textMuted,
                      fontWeight: 500,
                      minWidth: '90px',
                    }}
                  >
                    {m}
                    <br />
                    <span style={{ fontSize: '10px' }}>{periods[i]}</span>
                  </th>
                ))}
                <th
                  style={{
                    padding: '8px 10px',
                    textAlign: 'end',
                    color: theme.accent,
                    fontWeight: 600,
                    minWidth: '100px',
                  }}
                >
                  {t('fin.budgetDetail.total')}
                </th>
              </tr>
            </thead>
            <tbody>
              {accountIds.length === 0 && (
                <tr>
                  <td
                    colSpan={14}
                    style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                  >
                    {t('fin.budgetDetail.noAccountsAddedYetClickAdd')}
                  </td>
                </tr>
              )}
              {accountIds.map((aid) => {
                const acc = accountMap.get(aid)
                const total = rowTotals.find((r) => r.accountId === aid)?.total ?? 0
                return (
                  <tr key={aid} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td
                      style={{
                        padding: '5px 10px',
                        position: 'sticky',
                        left: 0,
                        background: theme.bgCanvas,
                        zIndex: 1,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          color: theme.textMuted,
                          fontFamily: 'monospace',
                        }}
                      >
                        {acc?.code}
                      </span>
                      <span
                        style={{ color: theme.textPrimary, marginInlineStart: '6px', fontSize: '11px' }}
                      >
                        {acc?.name}
                      </span>
                    </td>
                    {periods.map((p) => (
                      <td
                        key={p}
                        style={{
                          padding: '3px 4px',
                          textAlign: 'end',
                          background: cellKey(aid, p) in edits ? theme.accent + '10' : undefined,
                        }}
                      >
                        {isLocked ? (
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '11px',
                              color: theme.textPrimary,
                            }}
                          >
                            {getAmount(aid, p).toLocaleString()}
                          </span>
                        ) : (
                          <input
                            style={inputStyle}
                            value={
                              cellKey(aid, p) in edits
                                ? (edits[cellKey(aid, p)] ?? '')
                                : getAmount(aid, p) || ''
                            }
                            placeholder="0"
                            onFocus={(e) => {
                              if (!(cellKey(aid, p) in edits))
                                setCell(aid, p, String(getAmount(aid, p) || ''))
                              e.target.select()
                            }}
                            onChange={(e) => {
                              setCell(aid, p, e.target.value)
                            }}
                          />
                        )}
                      </td>
                    ))}
                    <td
                      style={{
                        padding: '5px 10px',
                        textAlign: 'end',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        color: total ? theme.accent : theme.textMuted,
                      }}
                    >
                      {total.toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${theme.border}`, background: theme.bgSurface }}>
                <td
                  style={{
                    padding: '8px 10px',
                    fontWeight: 700,
                    color: theme.textPrimary,
                    position: 'sticky',
                    left: 0,
                    background: theme.bgSurface,
                  }}
                >
                  {t('fin.budgetDetail.total')}
                </td>
                {colTotals.map((c) => (
                  <td
                    key={c.period}
                    style={{
                      padding: '8px 6px',
                      textAlign: 'end',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: c.total ? theme.textPrimary : theme.textMuted,
                    }}
                  >
                    {c.total.toLocaleString()}
                  </td>
                ))}
                <td
                  style={{
                    padding: '8px 10px',
                    textAlign: 'end',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: theme.accent,
                  }}
                >
                  {grandTotal.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>

          {canEdit && !isLocked && (
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${theme.border}` }}>
              {showAccountPicker ? (
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                  }}
                >
                  <input
                    style={{
                      ...inputStyle,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      padding: '6px 10px',
                      background: theme.bgSurface,
                      width: '240px',
                    }}
                    placeholder={t('fin.budgetDetail.searchAccountCodeOrName')}
                    autoFocus
                    value={accountSearch}
                    onChange={(e) => {
                      setAccountSearch(e.target.value)
                    }}
                  />
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '600px' }}>
                    {filteredAccounts.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => {
                          setAddRowAccountId(g.id)
                          setShowAccountPicker(false)
                          setAccountSearch('')
                        }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: `1px solid ${theme.border}`,
                          cursor: 'pointer',
                          fontSize: '11px',
                          background: theme.bgSurface,
                          color: theme.textPrimary,
                          fontFamily: 'inherit',
                        }}
                      >
                        {g.code} · {g.name}
                      </button>
                    ))}
                    {!filteredAccounts.length && (
                      <span style={{ fontSize: '11px', color: theme.textMuted }}>
                        {t('fin.budgetDetail.noAccountsFound')}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAccountPicker(false)
                    }}
                  >
                    {t('fin.budgetDetail.cancel')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAccountPicker(true)
                  }}
                >
                  {t('fin.budgetDetail.addAccountRow')}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── Variance Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'variance' && (
        <Card padding="none">
          {!vsActual ? (
            <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
              {t('fin.budgetDetail.loadingVarianceData')}
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${theme.border}`,
                  display: 'flex',
                  gap: '24px',
                }}
              >
                <span style={{ fontSize: '12px', color: theme.textMuted }}>
                  {t('fin.budgetDetail.period')}{' '}
                  <strong style={{ color: theme.textPrimary }}>
                    {vsActual.period_from} – {vsActual.period_to}
                  </strong>
                </span>
                <span style={{ fontSize: '12px', color: theme.textMuted }}><Trans i18nKey="fin.budgetDetail.totalBudget" values={{ budget: vsActual.totals.budget.toLocaleString() }} components={[<strong style={{ color: theme.accent, fontFamily: 'monospace' }} />]} /></span>
                <span style={{ fontSize: '12px', color: theme.textMuted }}><Trans i18nKey="fin.budgetDetail.totalActual" values={{ actual: vsActual.totals.actual.toLocaleString() }} components={[<strong style={{ color: theme.textPrimary, fontFamily: 'monospace' }} />]} /></span>
                <span style={{ fontSize: '12px', color: theme.textMuted }}><Trans i18nKey="fin.budgetDetail.variance" values={{ variance: vsActual.totals.variance.toLocaleString() }} components={[<strong style={{ color: vsActual.totals.variance >= 0 ? '#22c55e' : '#ef4444', fontFamily: 'monospace', }}  />]} /></span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr
                    style={{
                      background: theme.bgSurface,
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    {['Account', 'Type', 'Budget', 'Actual', 'Variance', 'Var %', 'Progress'].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: '8px 12px',
                            textAlign: h === 'Account' ? 'left' : 'right',
                            color: theme.textMuted,
                            fontWeight: 500,
                          }}
                        >
                          {tlh('fin.budgetDetail', h)}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {!vsActual.rows.length && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}
                      >
                        {t('fin.budgetDetail.noBudgetLinesWithDataFor')}
                      </td>
                    </tr>
                  )}
                  {vsActual.rows.map((row) => {
                    const pct =
                      row.budget_amount > 0
                        ? Math.min(100, Math.round((row.actual_amount / row.budget_amount) * 100))
                        : 0
                    const over = row.actual_amount > row.budget_amount
                    return (
                      <tr
                        key={row.account_id}
                        style={{ borderBottom: `1px solid ${theme.border}` }}
                      >
                        <td style={{ padding: '8px 12px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              color: theme.textMuted,
                              fontFamily: 'monospace',
                            }}
                          >
                            {row.account_code}
                          </span>
                          <span style={{ color: theme.textPrimary, marginInlineStart: '6px' }}>
                            {row.account_name}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'end' }}>
                          <Badge variant="neutral">{enumLabel(row.account_type)}</Badge>
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            textAlign: 'end',
                            fontFamily: 'monospace',
                          }}
                        >
                          {row.budget_amount.toLocaleString()}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            textAlign: 'end',
                            fontFamily: 'monospace',
                          }}
                        >
                          {row.actual_amount.toLocaleString()}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            textAlign: 'end',
                            fontFamily: 'monospace',
                            color: row.variance >= 0 ? '#22c55e' : '#ef4444',
                            fontWeight: 600,
                          }}
                        >
                          {row.variance >= 0 ? '+' : ''}
                          {row.variance.toLocaleString()}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            textAlign: 'end',
                            color: over ? '#ef4444' : theme.textSecondary,
                            fontFamily: 'monospace',
                          }}
                        >
                          {row.variance_pct !== null ? `${row.variance_pct}%` : '—'}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'end', minWidth: '100px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              justifyContent: 'flex-end',
                            }}
                          >
                            <div
                              style={{
                                flex: 1,
                                background: theme.border,
                                borderRadius: '3px',
                                height: '6px',
                                overflow: 'hidden',
                                minWidth: '60px',
                              }}
                            >
                              <div
                                style={{
                                  background: over ? '#ef4444' : theme.accent,
                                  width: `${pct}%`,
                                  height: '100%',
                                }}
                              />
                            </div>
                            <span
                              style={{ fontSize: '10px', color: theme.textMuted, minWidth: '28px' }}
                            >
                              {pct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr
                    style={{ borderTop: `2px solid ${theme.border}`, background: theme.bgSurface }}
                  >
                    <td
                      colSpan={2}
                      style={{ padding: '8px 12px', fontWeight: 700, color: theme.textPrimary }}
                    >
                      {t('fin.budgetDetail.grandTotal')}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        textAlign: 'end',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                      }}
                    >
                      {vsActual.totals.budget.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        textAlign: 'end',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                      }}
                    >
                      {vsActual.totals.actual.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        textAlign: 'end',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        color: vsActual.totals.variance >= 0 ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {vsActual.totals.variance >= 0 ? '+' : ''}
                      {vsActual.totals.variance.toLocaleString()}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>

              {vsActual.outsideBudgetCurrency.length > 0 && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: theme.textPrimary, marginBottom: '4px' }}>
                    {t('fin.budgetDetail.outsideBudgetCurrency')}
                  </div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '8px' }}>
                    {t('fin.budgetDetail.outsideBudgetCurrencyNote', { currency: vsActual.budget.currency_code })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {vsActual.outsideBudgetCurrency.map((c) => (
                      <div
                        key={c.currencyCode}
                        style={{
                          background: theme.bgSurface, border: `1px solid ${theme.border}`, borderRadius: '8px',
                          padding: '8px 12px', fontSize: '12px', fontFamily: 'monospace',
                        }}
                      >
                        {formatCurrency(c.amount, c.currencyCode)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )
}
