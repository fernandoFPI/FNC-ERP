import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { api } from '../../../lib/axios'
import { useCompany } from '../../../hooks/useCompany'
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
  paid_at: string | null
  paid_by_name: string | null
  created_by_name: string | null
  journal_entry_id: string | null
  created_at: string
  reimbursement_account_id: string | null
  lines: ClaimLine[]
}

const STATUS_BADGE: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  draft: 'neutral',
  submitted: 'info',
  rejected: 'danger',
  posted: 'warning',
  paid: 'success',
}

// Approving now posts the reimbursement journal in the same step (see
// expense-claims.ts's merged /:id/approve) — there's no separate resting
// 'approved' state to show as its own stepper node any more.
const FLOW = ['draft', 'submitted', 'posted', 'paid']

export default function ExpenseClaimDetail() {
  const { id } = useParams<{ id: string }>()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { activeCompany } = useCompany()
  const [claim, setClaim] = useState<Claim | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showPrintModal, setShowPrintModal] = useState(false)
  const printIframeRef = useRef<HTMLIFrameElement>(null)

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

  if (loading) return <div style={{ padding: '24px', color: theme.textMuted }}>Loading...</div>
  if (!claim) return <div style={{ padding: '24px', color: theme.textMuted }}>Claim not found.</div>

  const stepIdx = FLOW.indexOf(claim.status)

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={claim.claim_number}
        subtitle={`${claim.employee_name} · ${claim.currency_code}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_BADGE[claim.status] ?? 'neutral'}>{claim.status}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowPrintModal(true)
              }}
            >
              Print
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate(-1)
              }}
            >
              ← Back
            </Button>
            {claim.status === 'draft' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void act('submit')}
                disabled={acting}
              >
                Submit for Approval
              </Button>
            )}
            {claim.status === 'submitted' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowReject(true)
                  }}
                >
                  Reject
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void act('approve')}
                  disabled={acting}
                >
                  Approve
                </Button>
              </>
            )}
            {claim.status === 'posted' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void act('mark-paid')}
                disabled={acting}
              >
                Mark as Paid
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
          <div style={{ marginLeft: '12px' }}>
            <Badge variant="danger">Rejected</Badge>
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
              Claim Details
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <tbody>
                {[
                  ['Claim #', claim.claim_number],
                  ['Employee', claim.employee_name],
                  [
                    'Requested By',
                    claim.created_by_name && claim.created_by_name !== claim.employee_name
                      ? claim.created_by_name
                      : claim.employee_name,
                  ],
                  ['Currency', claim.currency_code],
                  ['Total Amount', null],
                  ['Created', new Date(claim.created_at).toLocaleDateString()],
                  [
                    'Submitted',
                    claim.submitted_at ? new Date(claim.submitted_at).toLocaleDateString() : '—',
                  ],
                  [
                    'Approved',
                    claim.approved_at
                      ? `${new Date(claim.approved_at).toLocaleDateString()}${claim.approved_by_name ? ` — ${claim.approved_by_name}` : ''}`
                      : '—',
                  ],
                  [
                    'Rejected',
                    claim.rejected_at
                      ? `${new Date(claim.rejected_at).toLocaleDateString()}${claim.rejected_by_name ? ` — ${claim.rejected_by_name}` : ''}`
                      : '—',
                  ],
                  [
                    'Paid',
                    claim.paid_at
                      ? `${new Date(claim.paid_at).toLocaleDateString()}${claim.paid_by_name ? ` — ${claim.paid_by_name}` : ''}`
                      : '—',
                  ],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '7px 0', color: theme.textMuted, width: '45%' }}>{k}</td>
                    <td style={{ padding: '7px 0', color: theme.textPrimary, fontWeight: 500 }}>
                      {k === 'Total Amount' ? (
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
                <strong>Rejected:</strong> {claim.rejection_reason}
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
                JE posted:{' '}
                <span style={{ fontFamily: 'monospace' }}>
                  {claim.journal_entry_id.slice(0, 8)}…
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* Lines table */}
        <div>
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
              >
                Expense Lines ({claim.lines.length})
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr
                  style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}
                >
                  {['Date', 'Category', 'Account', 'Description', 'Amount'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 12px',
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
                          <span style={{ marginLeft: '4px', color: theme.textPrimary }}>
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
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
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
                    Total
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
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
              Reject Claim
            </h3>
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px' }}>
              Provide a reason — this will be shown to the employee.
            </p>
            <textarea
              style={{ ...inputStyle, height: '80px', resize: 'vertical' as const }}
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value)
              }}
              placeholder="Reason for rejection..."
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
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  await act('reject', { reason: rejectReason })
                  setShowReject(false)
                  setRejectReason('')
                }}
                disabled={acting || !rejectReason}
              >
                Reject Claim
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
              <span style={{ fontWeight: 600, fontSize: '15px', color: theme.textPrimary }}>
                Print Expense Claim — {claim.claim_number}
              </span>
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
                title={`Expense Claim ${claim.claim_number}`}
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
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => printIframeRef.current?.contentWindow?.print()}
              >
                Print / Save as PDF
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
