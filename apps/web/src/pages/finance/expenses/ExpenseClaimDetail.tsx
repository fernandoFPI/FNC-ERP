import { useTranslation } from 'react-i18next'
import { enumLabel } from '../../../i18n'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Select } from '../../../components/ui/Select'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EntityAttachments } from '../../../components/inventory/EntityAttachments'
import { api } from '../../../lib/axios'
import { useCompany } from '../../../hooks/useCompany'
import { usePermission } from '../../../hooks/usePermission'
import { buildExpenseClaimHTML } from '../../../lib/expenseClaimHtml'

interface ClaimLine {
  id: string
  expense_date: string
  category_name: string | null
  account_code: string | null
  account_name: string | null
  description: string | null
  amount: number
  currency_code: string
}

interface Claim {
  id: string
  claim_number: string
  employee_id: string
  employee_name: string
  description: string | null
  total_amount: number
  currency_code: string
  status: string
  notes: string | null
  submitted_at: string | null
  approved_at: string | null
  approved_by_name: string | null
  rejected_at: string | null
  rejected_by_name: string | null
  rejection_reason: string | null
  audited_at: string | null
  audited_by_name: string | null
  audit_fail_reason: string | null
  paid_at: string | null
  paid_by_name: string | null
  created_by_name: string | null
  journal_entry_id: string | null
  created_at: string
  reimbursement_account_id: string | null
  project_id: string | null
  project_code: string | null
  project_name: string | null
  funding_source: 'reimburse' | 'advance' | 'petty_cash' | null
  petty_cash_float_name: string | null
  settlement_number: string | null
  advance_number: string | null
  lines: ClaimLine[]
}

interface ExpenseCategoryOption {
  id: string
  name: string
}

interface EditLine {
  // Present for a pre-existing line (helps nothing server-side — PUT /:id
  // replaces every line regardless — but keeps React's key stable across
  // edits instead of reusing array index, which would misattach state to
  // the wrong row after a reorder/removal).
  key: string
  expense_date: string
  category_id: string
  description: string
  amount: string
}

interface FundingOptions {
  petty_cash_floats: { id: string; name: string; currency_code: string; current_balance: number }[]
  advances: { id: string; advance_number: string; purpose: string | null; outstanding_amount: number; currency_code: string }[]
}

const STATUS_BADGE: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'warning',
  audited: 'warning',
  rejected: 'danger',
  posted: 'warning',
  paid: 'success',
}

// 'approved' (legitimacy confirmed, no funding decided/posted yet) is a real
// resting state again — Finance's funding-source decision is a distinct
// step (POST /:id/post-payment) from the plain approve above it. See
// expense-claims.ts for why these were split. 'audited' sits between the
// two — Finance's own Pass/Fail Audit decision on an approved claim; Fail
// sends it back to 'draft' instead of appearing in this forward flow at all.
const FLOW = ['draft', 'submitted', 'approved', 'audited', 'posted', 'paid']

export default function ExpenseClaimDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { activeCompany } = useCompany()
  const { can } = usePermission()
  const canEdit = can('finance.expenses.edit', 'edit')
  const canApprove = can('finance.expenses.approve', 'approve')
  const canAudit = can('finance.expenses.audit', 'approve')
  const [claim, setClaim] = useState<Claim | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showPrintModal, setShowPrintModal] = useState(false)
  const printIframeRef = useRef<HTMLIFrameElement>(null)

  // Fail Audit — mirrors the Reject modal above exactly, just posting to a
  // different endpoint and landing on 'draft' instead of the terminal
  // 'rejected'.
  const [showFailAudit, setShowFailAudit] = useState(false)
  const [failAuditReason, setFailAuditReason] = useState('')

  // Edit mode (draft only — PUT /:id itself enforces this server-side too).
  // Categories fetched lazily on first entry into edit mode, same pattern as
  // fundingOptions below — most claims are never viewed while in 'draft'.
  const [isEditing, setIsEditing] = useState(false)
  const [editDescription, setEditDescription] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editCurrency, setEditCurrency] = useState('IQD')
  const [editLines, setEditLines] = useState<EditLine[]>([])
  const [categories, setCategories] = useState<ExpenseCategoryOption[] | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  // Post Payment — Finance's funding-source decision, made on an already-
  // 'approved' claim. fundingOptions is fetched lazily when the modal opens
  // (GET /:id/funding-options), not on page load, since most claims never
  // reach 'approved' from most viewers' perspective.
  const [showPostPayment, setShowPostPayment] = useState(false)
  const [postPaymentSource, setPostPaymentSource] = useState<'reimburse' | 'advance' | 'petty_cash'>('reimburse')
  const [fundingOptions, setFundingOptions] = useState<FundingOptions | null>(null)
  const [loadingFundingOptions, setLoadingFundingOptions] = useState(false)
  const [selectedFloatId, setSelectedFloatId] = useState('')
  const [selectedAdvanceId, setSelectedAdvanceId] = useState('')
  const [postPaymentError, setPostPaymentError] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const clRes = await api.get<Claim>(`/finance/expense-claims/${id}`)
      setClaim(clRes.data)
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function act(action: string, body?: Record<string, unknown>) {
    if (!id) return
    setActing(true)
    try {
      await api.post(`/finance/expense-claims/${id}/${action}`, body ?? {})
      void load()
    } catch {
      /* handled */
    } finally {
      setActing(false)
    }
  }

  function startEdit() {
    if (!claim) return
    setEditDescription(claim.description ?? '')
    setEditNotes(claim.notes ?? '')
    setEditCurrency(claim.currency_code)
    setEditLines(
      claim.lines.map((l) => ({
        key: l.id,
        expense_date: l.expense_date.slice(0, 10),
        category_id: '',
        description: l.description ?? '',
        amount: String(l.amount),
      })),
    )
    setEditError('')
    setIsEditing(true)
    if (!categories && !loadingCategories) {
      setLoadingCategories(true)
      api
        .get<ExpenseCategoryOption[]>('/finance/expense-claims/categories')
        .then((r) => {
          setCategories(r.data)
        })
        .catch(() => {
          setCategories([])
        })
        .finally(() => {
          setLoadingCategories(false)
        })
    }
  }

  function cancelEdit() {
    setIsEditing(false)
    setEditError('')
  }

  function updateEditLine(key: string, patch: Partial<EditLine>) {
    setEditLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function addEditLine() {
    setEditLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        expense_date: new Date().toISOString().slice(0, 10),
        category_id: '',
        description: '',
        amount: '',
      },
    ])
  }

  function removeEditLine(key: string) {
    setEditLines((prev) => prev.filter((l) => l.key !== key))
  }

  async function saveEdit() {
    if (!id || !claim) return
    if (editLines.length === 0) {
      setEditError(t('fin.expDetail.atLeastOneLineIsRequired'))
      return
    }
    for (const l of editLines) {
      if (!l.expense_date || !l.amount || isNaN(parseFloat(l.amount)) || parseFloat(l.amount) <= 0) {
        setEditError(t('fin.expDetail.everyLineNeedsADateAnd'))
        return
      }
    }
    setSavingEdit(true)
    setEditError('')
    try {
      await api.put(`/finance/expense-claims/${id}`, {
        employee_id: claim.employee_id,
        employee_name: claim.employee_name,
        description: editDescription || undefined,
        currency_code: editCurrency,
        project_id: claim.project_id ?? undefined,
        notes: editNotes || undefined,
        lines: editLines.map((l) => ({
          expense_date: l.expense_date,
          category_id: l.category_id || undefined,
          description: l.description || undefined,
          amount: parseFloat(l.amount),
          currency_code: editCurrency,
        })),
      })
      setIsEditing(false)
      void load()
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: { message?: string } } } }
      setEditError(apiError.response?.data?.error?.message ?? t('fin.expDetail.couldNotSaveChanges'))
    } finally {
      setSavingEdit(false)
    }
  }

  async function openPostPayment() {
    if (!id) return
    setShowPostPayment(true)
    setPostPaymentSource('reimburse')
    setSelectedFloatId('')
    setSelectedAdvanceId('')
    setPostPaymentError('')
    setLoadingFundingOptions(true)
    try {
      const r = await api.get<FundingOptions>(`/finance/expense-claims/${id}/funding-options`)
      setFundingOptions(r.data)
    } catch {
      setFundingOptions({ petty_cash_floats: [], advances: [] })
    } finally {
      setLoadingFundingOptions(false)
    }
  }

  async function submitPostPayment() {
    if (!id) return
    if (postPaymentSource === 'petty_cash' && !selectedFloatId) {
      setPostPaymentError(t('fin.expDetail.selectAPettyCashFloat'))
      return
    }
    if (postPaymentSource === 'advance' && !selectedAdvanceId) {
      setPostPaymentError(t('fin.expDetail.selectWhichAdvanceToSettleAgainst'))
      return
    }
    setActing(true)
    setPostPaymentError('')
    try {
      await api.post(`/finance/expense-claims/${id}/post-payment`, {
        funding_source: postPaymentSource,
        petty_cash_float_id: postPaymentSource === 'petty_cash' ? selectedFloatId : undefined,
        advance_id: postPaymentSource === 'advance' ? selectedAdvanceId : undefined,
      })
      setShowPostPayment(false)
      void load()
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { error?: { message?: string } } } }
      setPostPaymentError(apiError.response?.data?.error?.message ?? t('fin.expDetail.couldNotPostPayment'))
    } finally {
      setActing(false)
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

  if (loading) return <div style={{ padding: '24px', color: theme.textMuted }}>{t('fin.expDetail.loading')}</div>
  if (!claim) return <div style={{ padding: '24px', color: theme.textMuted }}>{t('fin.expDetail.claimNotFound')}</div>

  const stepIdx = FLOW.indexOf(claim.status)

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={claim.claim_number}
        subtitle={`${claim.employee_name} · ${claim.currency_code}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_BADGE[claim.status] ?? 'neutral'}>{enumLabel(claim.status)}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowPrintModal(true)
              }}
            >
              {t('fin.expDetail.print')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate(-1)
              }}
            >
              {t('fin.expDetail.back')}
            </Button>
            {canEdit && claim.status === 'draft' && !isEditing && (
              <>
                <Button variant="ghost" size="sm" onClick={startEdit}>
                  {t('fin.expDetail.edit')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void act('submit')}
                  disabled={acting}
                >
                  {t('fin.expDetail.submitForApproval')}
                </Button>
              </>
            )}
            {isEditing && (
              <>
                <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={savingEdit}>
                  {t('fin.expDetail.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void saveEdit()}
                  disabled={savingEdit}
                >
                  {t('fin.expDetail.saveChanges')}
                </Button>
              </>
            )}
            {(claim.status === 'submitted' || claim.status === 'approved') && canApprove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowReject(true)
                }}
              >
                {t('fin.expDetail.reject')}
              </Button>
            )}
            {claim.status === 'submitted' && canApprove && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void act('approve')}
                disabled={acting}
              >
                {t('fin.expDetail.approve')}
              </Button>
            )}
            {claim.status === 'approved' && canAudit && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowFailAudit(true)
                  }}
                  disabled={acting}
                >
                  {t('fin.expDetail.failAudit')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void act('pass-audit')}
                  disabled={acting}
                >
                  {t('fin.expDetail.passAudit')}
                </Button>
              </>
            )}
            {claim.status === 'audited' && canApprove && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void openPostPayment()}
                disabled={acting}
              >
                {t('fin.expDetail.decideFundingPost')}
              </Button>
            )}
            {canApprove && claim.status === 'posted' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void act('mark-paid')}
                disabled={acting}
              >
                {t('fin.expDetail.markAsPaid')}
              </Button>
            )}
          </div>
        }
      />

      {/* Progress stepper */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0',
          marginBottom: '24px',
          overflowX: 'auto',
        }}
      >
        {FLOW.map((step, i) => {
          const done = i < stepIdx
          const current = i === stepIdx
          const skip = claim.status === 'rejected' && step === 'submitted' ? false : false
          return (
            <div
              key={step}
              style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: '80px' }}
            >
              <div
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: done ? '#22c55e' : current ? theme.accent : theme.border,
                    color: done || current ? '#fff' : theme.textMuted,
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {done ? '✓' : i + 1}
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    color: current ? theme.accent : done ? '#22c55e' : theme.textMuted,
                    marginTop: '4px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {step.charAt(0).toUpperCase() + step.slice(1)}
                </span>
              </div>
              {i < FLOW.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: '2px',
                    background: done ? '#22c55e' : theme.border,
                    margin: '0 2px',
                    minWidth: '20px',
                  }}
                />
              )}
            </div>
          )
          void skip
        })}
        {claim.status === 'rejected' && (
          <div style={{ marginInlineStart: '12px' }}>
            <Badge variant="danger">{t('fin.expDetail.rejected')}</Badge>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: '16px' }}>
        {/* Details panel */}
        <div>
          <Card padding="md">
            <p
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '12px',
              }}
            >
              {t('fin.expDetail.claimDetails')}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <tbody>
                {[
                  [t('fin.expDetail.claim'), claim.claim_number],
                  [t('fin.expDetail.employee'), claim.employee_name],
                  [
                    t('fin.expDetail.requestedBy'),
                    claim.created_by_name && claim.created_by_name !== claim.employee_name
                      ? claim.created_by_name
                      : claim.employee_name,
                  ],
                  [
                    t('fin.expDetail.project'),
                    claim.project_code ? `${claim.project_code} — ${claim.project_name}` : '—',
                  ],
                  [t('fin.expDetail.currency'), claim.currency_code],
                  [t('fin.expDetail.totalAmount'), null],
                  ...(claim.funding_source
                    ? [
                        [
                          t('fin.expDetail.paidVia'),
                          claim.funding_source === 'reimburse'
                            ? t('fin.expDetail.reimbursement')
                            : claim.funding_source === 'petty_cash'
                              ? t('fin.expDetail.pettyCashFloat', { name: claim.petty_cash_float_name ?? '—' })
                              : t('fin.expDetail.advanceSettlementRef', {
                                number: claim.settlement_number ?? '',
                                advance: claim.advance_number ?? '—',
                              }),
                        ] as [string, string],
                      ]
                    : []),
                  [t('fin.expDetail.created'), new Date(claim.created_at).toLocaleDateString()],
                  [
                    t('fin.expDetail.submitted'),
                    claim.submitted_at ? new Date(claim.submitted_at).toLocaleDateString() : '—',
                  ],
                  [
                    t('fin.expDetail.approved'),
                    claim.approved_at
                      ? `${new Date(claim.approved_at).toLocaleDateString()}${claim.approved_by_name ? ` — ${claim.approved_by_name}` : ''}`
                      : '—',
                  ],
                  [
                    t('fin.expDetail.rejected'),
                    claim.rejected_at
                      ? `${new Date(claim.rejected_at).toLocaleDateString()}${claim.rejected_by_name ? ` — ${claim.rejected_by_name}` : ''}`
                      : '—',
                  ],
                  [
                    t('fin.expDetail.audited'),
                    claim.audited_at
                      ? `${new Date(claim.audited_at).toLocaleDateString()}${claim.audited_by_name ? ` — ${claim.audited_by_name}` : ''}`
                      : '—',
                  ],
                  [
                    t('fin.expDetail.paid'),
                    claim.paid_at
                      ? `${new Date(claim.paid_at).toLocaleDateString()}${claim.paid_by_name ? ` — ${claim.paid_by_name}` : ''}`
                      : '—',
                  ],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '7px 0', color: theme.textMuted, width: '45%' }}>{k}</td>
                    <td style={{ padding: '7px 0', color: theme.textPrimary, fontWeight: 500 }}>
                      {k === t('fin.expDetail.totalAmount') ? (
                        <AmountDisplay
                          amount={Number(claim.total_amount)}
                          currency={claim.currency_code}
                          size="sm"
                        />
                      ) : (
                        v
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {claim.description && (
              <div
                style={{
                  marginTop: '12px',
                  fontSize: '12px',
                  color: theme.textSecondary,
                  background: theme.bgCanvas,
                  borderRadius: '6px',
                  padding: '8px 10px',
                }}
              >
                {claim.description}
              </div>
            )}
            {claim.rejection_reason && (
              <div
                style={{
                  marginTop: '12px',
                  background: '#ef444410',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: '#ef4444',
                }}
              >
                <strong>{t('fin.expDetail.rejected2')}</strong> {claim.rejection_reason}
              </div>
            )}
            {claim.status === 'draft' && claim.audit_fail_reason && (
              <div
                style={{
                  marginTop: '12px',
                  background: theme.warningBg,
                  border: `1px solid ${theme.warningBorder}`,
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: theme.warning,
                }}
              >
                <strong>{t('fin.expDetail.sentBackFromAudit')}</strong> {claim.audit_fail_reason}
              </div>
            )}
            {claim.journal_entry_id && (
              <div
                style={{
                  marginTop: '12px',
                  background: theme.accent + '10',
                  border: `1px solid ${theme.accent}`,
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: theme.accent,
                }}
              >
                {t('fin.expDetail.jePosted')}{' '}
                <span style={{ fontFamily: 'monospace' }}>
                  {claim.journal_entry_id.slice(0, 8)}…
                </span>
              </div>
            )}
          </Card>

          <div style={{ marginTop: '16px' }}>
            <EntityAttachments
              entityType="expense_claim"
              entityId={claim.id}
              title={t('fin.expDetail.receipts')}
              description={t('fin.expDetail.oneSharedReceiptForTheWhole')}
              uploadButtonLabel={t('fin.expDetail.uploadReceipt')}
              emptyMessage={t('fin.expDetail.noReceiptsAttached')}
              groupBy={[
                { match: 'expense_claim', title: t('fin.expDetail.sharedReceiptWholeClaim') },
                { match: 'expense_claim_line', title: t('fin.expDetail.perLineReceipts') },
              ]}
            />
          </div>
        </div>

        {/* Lines table */}
        <div>
          {isEditing ? (
            <Card padding="md">
              <p
                style={{
                  margin: '0 0 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {t('fin.expDetail.editingExpenseLines')}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <label style={{ fontSize: '11px', color: theme.textMuted }}>{t('fin.expDetail.description')}</label>
                  <input
                    style={inputStyle}
                    value={editDescription}
                    onChange={(e) => {
                      setEditDescription(e.target.value)
                    }}
                  />
                </div>
                <div style={{ width: '110px' }}>
                  <label style={{ fontSize: '11px', color: theme.textMuted }}>{t('fin.expDetail.currency')}</label>
                  <input
                    style={inputStyle}
                    value={editCurrency}
                    maxLength={3}
                    onChange={(e) => {
                      setEditCurrency(e.target.value.toUpperCase())
                    }}
                  />
                </div>
                <div style={{ flex: '1 1 220px' }}>
                  <label style={{ fontSize: '11px', color: theme.textMuted }}>{t('fin.expDetail.notes')}</label>
                  <input
                    style={inputStyle}
                    value={editNotes}
                    onChange={(e) => {
                      setEditNotes(e.target.value)
                    }}
                  />
                </div>
              </div>
              {editLines.map((l) => (
                <div
                  key={l.key}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-end',
                    marginBottom: '10px',
                    paddingBottom: '10px',
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  <div style={{ width: '130px' }}>
                    <label style={{ fontSize: '11px', color: theme.textMuted }}>{t('fin.expDetail.date')}</label>
                    <input
                      type="date"
                      style={inputStyle}
                      value={l.expense_date}
                      onChange={(e) => {
                        updateEditLine(l.key, { expense_date: e.target.value })
                      }}
                    />
                  </div>
                  <div style={{ flex: '1 1 150px' }}>
                    <label style={{ fontSize: '11px', color: theme.textMuted }}>{t('fin.expDetail.category')}</label>
                    <Select
                      value={l.category_id}
                      onChange={(e) => {
                        updateEditLine(l.key, { category_id: e.target.value })
                      }}
                      options={[
                        { value: '', label: loadingCategories ? t('fin.expDetail.loading2') : t('fin.expDetail.selectCategory') },
                        ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                  <div style={{ flex: '1 1 180px' }}>
                    <label style={{ fontSize: '11px', color: theme.textMuted }}>{t('fin.expDetail.description')}</label>
                    <input
                      style={inputStyle}
                      value={l.description}
                      onChange={(e) => {
                        updateEditLine(l.key, { description: e.target.value })
                      }}
                    />
                  </div>
                  <div style={{ width: '110px' }}>
                    <label style={{ fontSize: '11px', color: theme.textMuted }}>{t('fin.expDetail.amount')}</label>
                    <input
                      type="number"
                      min="0"
                      style={inputStyle}
                      value={l.amount}
                      onChange={(e) => {
                        updateEditLine(l.key, { amount: e.target.value })
                      }}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      removeEditLine(l.key)
                    }}
                    disabled={editLines.length <= 1}
                  >
                    {t('fin.expDetail.remove')}
                  </Button>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addEditLine}>
                {t('fin.expDetail.addLine')}
              </Button>
              {editError && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: theme.danger }}>
                  {editError}
                </div>
              )}
            </Card>
          ) : (
            <Card padding="none">
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '11px',
                    fontWeight: 600,
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >{t('fin.expDetail.expenseLines', { length: claim.lines.length })}</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr
                    style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}
                  >
                    {[t('fin.expDetail.date'), t('fin.expDetail.category'), t('fin.expDetail.account'), t('fin.expDetail.description'), t('fin.expDetail.amount')].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 12px',
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
                  {claim.lines.map((l, i) => (
                    <tr
                      key={l.id}
                      style={{
                        borderBottom: `1px solid ${theme.border}`,
                        background: i % 2 ? theme.bgCanvas : undefined,
                      }}
                    >
                      <td
                        style={{ padding: '8px 12px', color: theme.textSecondary, fontSize: '11px' }}
                      >
                        {new Date(l.expense_date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '8px 12px', color: theme.textSecondary }}>
                        {l.category_name ?? '—'}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {l.account_code ? (
                          <span>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                color: theme.textMuted,
                                fontSize: '10px',
                              }}
                            >
                              {l.account_code}
                            </span>
                            <span style={{ marginInlineStart: '4px', color: theme.textPrimary }}>
                              {l.account_name}
                            </span>
                          </span>
                        ) : (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', color: theme.textSecondary }}>
                        {l.description ?? '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'end' }}>
                        <AmountDisplay
                          amount={Number(l.amount)}
                          currency={l.currency_code}
                          size="sm"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${theme.border}`, background: theme.bgSurface }}>
                    <td
                      colSpan={4}
                      style={{ padding: '8px 12px', fontWeight: 700, color: theme.textPrimary }}
                    >
                      {t('fin.expDetail.total')}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'end', fontWeight: 700 }}>
                      <AmountDisplay
                        amount={Number(claim.total_amount)}
                        currency={claim.currency_code}
                        size="sm"
                      />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          )}
        </div>
      </div>

      {/* Reject modal */}
      {showReject && (
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
          <Card padding="lg" style={{ width: '400px' }}>
            <h3 style={{ margin: '0 0 12px', color: theme.textPrimary, fontSize: '15px' }}>
              {t('fin.expDetail.rejectClaim')}
            </h3>
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px' }}>
              {t('fin.expDetail.provideAReasonThisWillBe')}
            </p>
            <textarea
              style={{ ...inputStyle, height: '80px', resize: 'vertical' as const }}
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value)
              }}
              placeholder={t('fin.expDetail.reasonForRejection')}
            />
            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowReject(false)
                }}
              >
                {t('fin.expDetail.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void (async () => {
                  await act('reject', { reason: rejectReason })
                  setShowReject(false)
                  setRejectReason('')
                })()}
                disabled={acting || !rejectReason}
              >
                {t('fin.expDetail.rejectClaim')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Fail Audit modal */}
      {showFailAudit && (
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
          <Card padding="lg" style={{ width: '400px' }}>
            <h3 style={{ margin: '0 0 12px', color: theme.textPrimary, fontSize: '15px' }}>
              {t('fin.expDetail.failAudit')}
            </h3>
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px' }}>
              {t('fin.expDetail.sendsThisClaimBackToDraft')}
            </p>
            <textarea
              style={{ ...inputStyle, height: '80px', resize: 'vertical' as const }}
              value={failAuditReason}
              onChange={(e) => {
                setFailAuditReason(e.target.value)
              }}
              placeholder={t('fin.expDetail.whatNeedsToBeCorrected')}
            />
            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowFailAudit(false)
                }}
              >
                {t('fin.expDetail.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void (async () => {
                  await act('fail-audit', { reason: failAuditReason })
                  setShowFailAudit(false)
                  setFailAuditReason('')
                })()}
                disabled={acting || !failAuditReason}
              >
                {t('fin.expDetail.failAudit')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Post Payment modal — Finance's funding-source decision */}
      {showPostPayment && (
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
            <h3 style={{ margin: '0 0 12px', color: theme.textPrimary, fontSize: '15px' }}>
              {t('fin.expDetail.decideFundingPost')}
            </h3>
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px' }}>{t('fin.expDetail.howIsThisActuallyBeingPaid', { total_amount: claim.total_amount.toLocaleString(), currency_code: claim.currency_code })}</p>
            <Select
              label={t('fin.expDetail.fundingSource')}
              value={postPaymentSource}
              onChange={(e) => {
                setPostPaymentSource(e.target.value as 'reimburse' | 'advance' | 'petty_cash')
                setPostPaymentError('')
              }}
            >
              <option value="reimburse">{t('fin.expDetail.reimbursePayFromTheDefaultCash')}</option>
              <option value="petty_cash">{t('fin.expDetail.payFromAPettyCashFloat')}</option>
              <option value="advance">{t('fin.expDetail.settleAgainstTheEmployeeSAdvance')}</option>
            </Select>

            {loadingFundingOptions && (
              <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '12px' }}>
                {t('fin.expDetail.loadingOptions')}
              </p>
            )}

            {!loadingFundingOptions && postPaymentSource === 'petty_cash' && (
              <div style={{ marginTop: '12px' }}>
                <Select
                  label={t('fin.expDetail.pettyCashFloat')}
                  value={selectedFloatId}
                  onChange={(e) => {
                    setSelectedFloatId(e.target.value)
                  }}
                  options={[
                    { value: '', label: t('fin.expDetail.selectFloat') },
                    ...(fundingOptions?.petty_cash_floats ?? []).map((f) => ({
                      value: f.id,
                      label: t('fin.expDetail.available', { name: f.name, value: Number(f.current_balance).toLocaleString(), currency_code: f.currency_code }),
                    })),
                  ]}
                />
                {fundingOptions?.petty_cash_floats.length === 0 && (
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px' }}>
                    {t('fin.expDetail.noActivePettyCashFloatsFound')}
                  </div>
                )}
              </div>
            )}

            {!loadingFundingOptions && postPaymentSource === 'advance' && (
              <div style={{ marginTop: '12px' }}>
                <Select
                  label={t('fin.expDetail.advance')}
                  value={selectedAdvanceId}
                  onChange={(e) => {
                    setSelectedAdvanceId(e.target.value)
                  }}
                  options={[
                    { value: '', label: t('fin.expDetail.selectAdvance') },
                    ...(fundingOptions?.advances ?? []).map((a) => ({
                      value: a.id,
                      label: `${a.advance_number} — ${Number(a.outstanding_amount).toLocaleString()} ${a.currency_code} outstanding${a.purpose ? ` (${a.purpose})` : ''}`,
                    })),
                  ]}
                />
                {fundingOptions?.advances.length === 0 && (
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px' }}>
                    {t('fin.expDetail.thisEmployeeHasNoApprovedAdvance')}
                  </div>
                )}
              </div>
            )}

            {postPaymentError && (
              <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '12px' }}>
                {postPaymentError}
              </div>
            )}

            <div
              style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPostPayment(false)
                }}
              >
                {t('fin.expDetail.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void submitPostPayment()}
                disabled={acting || loadingFundingOptions}
              >
                {t('fin.expDetail.postPayment')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Print dialog */}
      {showPrintModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => {
            setShowPrintModal(false)
          }}
        >
          <div
            style={{
              background: theme.bgSurface,
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              width: '94vw',
              maxWidth: '1100px',
              height: '92vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.border}`,
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>{t('fin.expDetail.printExpenseClaim', { claim_number: claim.claim_number })}</span>
              <button
                onClick={() => {
                  setShowPrintModal(false)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  fontSize: '18px',
                  lineHeight: 1,
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', background: '#f3f4f6', minHeight: 0 }}>
              <iframe
                ref={printIframeRef}
                srcDoc={buildExpenseClaimHTML({
                  claimNumber: claim.claim_number,
                  employeeName: claim.employee_name,
                  currencyCode: claim.currency_code,
                  totalAmount: Number(claim.total_amount),
                  description: claim.description,
                  createdAt: claim.created_at,
                  submittedAt: claim.submitted_at,
                  approvedAt: claim.approved_at,
                  approvedByName: claim.approved_by_name,
                  paidAt: claim.paid_at,
                  paidByName: claim.paid_by_name,
                  requestedByName: claim.created_by_name,
                  companyName: activeCompany?.name,
                  lines: claim.lines.map((l) => ({
                    expenseDate: l.expense_date,
                    categoryName: l.category_name,
                    accountCode: l.account_code,
                    accountName: l.account_name,
                    description: l.description,
                    amount: Number(l.amount),
                    currencyCode: l.currency_code,
                  })),
                })}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                title={t('fin.expDetail.expenseClaim', { claim_number: claim.claim_number })}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                padding: '14px 20px',
                borderTop: `1px solid ${theme.border}`,
                flexShrink: 0,
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPrintModal(false)
                }}
              >
                {t('fin.expDetail.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => printIframeRef.current?.contentWindow?.print()}
              >
                {t('fin.expDetail.printSaveAsPdf')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
