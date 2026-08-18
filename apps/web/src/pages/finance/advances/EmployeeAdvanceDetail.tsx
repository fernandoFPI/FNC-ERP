import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import { api } from '../../../lib/axios'

interface Settlement {
  id: string
  settlement_number: string
  settlement_date: string
  description: string | null
  total_amount: number
  currency_code: string
  status: string
  line_count: number
  rejection_reason: string | null
}

interface Return {
  id: string
  return_number: string
  return_date: string
  amount: number
  currency_code: string
  cash_account_id: string
  description: string | null
  status: string
}

interface LedgerEntry {
  type: 'issuance' | 'settlement' | 'return'
  ref_id: string
  reference: string
  date: string
  amount: number
  description: string | null
  running_balance: number
}

interface Advance {
  id: string
  advance_number: string
  employee_name: string
  purpose: string | null
  project_id: string | null
  cost_center_id: string | null
  amount: number
  settled_amount: number
  returned_amount: number
  outstanding_amount: number
  currency_code: string
  status: string
  cash_account_id: string
  advance_account_id: string
  notes: string | null
  rejection_reason: string | null
  void_reason: string | null
  journal_entry_id: string | null
  created_at: string
  submitted_at: string | null
  approved_at: string | null
  settlements: Settlement[]
  returns: Return[]
}

interface GLAccount {
  id: string
  code: string
  name: string
}
interface CostCenter {
  id: string
  code: string
  name: string
}
interface Project {
  id: string
  code: string
  name: string
}
interface Category {
  id: string
  name: string
  gl_account_id: string | null
  is_project_related: boolean
}
interface PendingPOLine {
  id: string
  description: string
  total_price: number
  po_id: string
  po_number: string
  account_code: string | null
  account_name: string | null
  cost_center_code: string | null
  cost_center_name: string | null
  project_code: string | null
  project_name: string | null
}

const STATUS_BADGE: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  draft: 'neutral',
  pending_approval: 'info',
  submitted: 'info',
  approved: 'warning',
  partially_settled: 'warning',
  settled: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

const FLOW = ['draft', 'pending_approval', 'approved', 'settled']

interface LineForm {
  line_date: string
  gl_account_id: string
  category_id: string
  category_name: string
  project_id: string
  cost_center_id: string
  description: string
  amount: string
}

const emptyLine = (): LineForm => ({
  line_date: new Date().toISOString().slice(0, 10),
  gl_account_id: '',
  category_id: '',
  category_name: '',
  project_id: '',
  cost_center_id: '',
  description: '',
  amount: '',
})

interface ReturnForm {
  return_date: string
  amount: string
  cash_account_id: string
  description: string
}

const LEDGER_TYPE_LABEL: Record<LedgerEntry['type'], string> = {
  issuance: 'Issuance',
  settlement: 'Settlement',
  return: 'Return',
}

export default function EmployeeAdvanceDetail() {
  const { id } = useParams<{ id: string }>()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [advance, setAdvance] = useState<Advance | null>(null)
  const [glAccounts, setGlAccounts] = useState<GLAccount[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [showApprove, setShowApprove] = useState(false)
  const [approveCostCenterId, setApproveCostCenterId] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [showSettlementForm, setShowSettlementForm] = useState(false)
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  const [settlementDescription, setSettlementDescription] = useState('')
  const [savingSettlement, setSavingSettlement] = useState(false)
  const [rejectingSettlementId, setRejectingSettlementId] = useState<string | null>(null)
  const [settlementRejectReason, setSettlementRejectReason] = useState('')
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [showReturnForm, setShowReturnForm] = useState(false)
  const [returnForm, setReturnForm] = useState<ReturnForm>({
    return_date: new Date().toISOString().slice(0, 10),
    amount: '',
    cash_account_id: '',
    description: '',
  })
  const [savingReturn, setSavingReturn] = useState(false)
  const [showVoid, setShowVoid] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [pendingPOLines, setPendingPOLines] = useState<PendingPOLine[]>([])
  const [selectedPOLineIds, setSelectedPOLineIds] = useState<Set<string>>(new Set())
  const [bundling, setBundling] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [advRes, glRes, ccRes, projRes, catRes, ledgerRes, poLinesRes] = await Promise.all([
        api.get<Advance>(`/finance/advances/${id}`),
        api.get<GLAccount[]>('/finance/accounts?limit=500'),
        api.get<CostCenter[]>('/finance/cost-centers'),
        api.get<{ data: { id: string; code: string; name: string }[] }>('/projects', {
          params: { limit: 500 },
        }),
        api.get<Category[]>('/finance/expense-claims/categories'),
        api.get<LedgerEntry[]>(`/finance/advances/${id}/ledger`),
        api.get<PendingPOLine[]>(`/finance/advances/${id}/pending-po-lines`),
      ])
      setAdvance(advRes.data)
      setGlAccounts(glRes.data)
      setCostCenters(ccRes.data)
      setProjects(projRes.data.data)
      setCategories(catRes.data)
      setLedger(ledgerRes.data)
      setPendingPOLines(poLinesRes.data)
      setSelectedPOLineIds(new Set())
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
      await api.post(`/finance/advances/${id}/${action}`, body ?? {})
      void load()
    } catch {
      /* handled */
    } finally {
      setActing(false)
    }
  }

  async function actOnSettlement(settlementId: string, action: string, body?: Record<string, unknown>) {
    setActing(true)
    try {
      await api.post(`/finance/advances/settlements/${settlementId}/${action}`, body ?? {})
      void load()
    } catch {
      /* handled */
    } finally {
      setActing(false)
    }
  }

  async function actOnReturn(returnId: string, action: string, body?: Record<string, unknown>) {
    setActing(true)
    try {
      await api.post(`/finance/advances/returns/${returnId}/${action}`, body ?? {})
      void load()
    } catch {
      /* handled */
    } finally {
      setActing(false)
    }
  }

  function openReturnForm() {
    setReturnForm({
      return_date: new Date().toISOString().slice(0, 10),
      amount: '',
      cash_account_id: advance?.cash_account_id ?? '',
      description: '',
    })
    setShowReturnForm(true)
  }

  async function handleCreateReturn() {
    if (!id || !returnForm.amount) return
    setSavingReturn(true)
    try {
      await api.post('/finance/advances/returns', {
        advance_id: id,
        return_date: returnForm.return_date,
        amount: Number(returnForm.amount),
        cash_account_id: returnForm.cash_account_id || undefined,
        description: returnForm.description || undefined,
      })
      setShowReturnForm(false)
      void load()
    } catch {
      /* handled */
    } finally {
      setSavingReturn(false)
    }
  }

  function updateLine(i: number, field: keyof LineForm, value: string) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))
  }

  function applyCategory(i: number, catId: string) {
    const cat = categories.find((c) => c.id === catId)
    setLines((ls) =>
      ls.map((l, idx) =>
        idx === i
          ? {
              ...l,
              category_id: catId,
              category_name: cat?.name ?? '',
              gl_account_id: cat?.gl_account_id ?? l.gl_account_id,
            }
          : l,
      ),
    )
  }

  function lineIsProjectRequired(line: LineForm): boolean {
    const cat = categories.find((c) => c.id === line.category_id)
    return cat?.is_project_related ?? false
  }

  const linesValid =
    lines.length > 0 &&
    lines.every(
      (l) =>
        l.gl_account_id &&
        l.cost_center_id &&
        l.description &&
        Number(l.amount) > 0 &&
        (!lineIsProjectRequired(l) || l.project_id),
    )

  async function handleCreateSettlement() {
    if (!id || !linesValid) return
    setSavingSettlement(true)
    try {
      await api.post('/finance/advances/settlements', {
        advance_id: id,
        description: settlementDescription || undefined,
        lines: lines.map((l) => ({
          line_date: l.line_date,
          gl_account_id: l.gl_account_id,
          category_id: l.category_id || undefined,
          category_name: l.category_name || undefined,
          project_id: l.project_id || undefined,
          cost_center_id: l.cost_center_id,
          description: l.description,
          amount: Number(l.amount),
        })),
      })
      setShowSettlementForm(false)
      setLines([emptyLine()])
      setSettlementDescription('')
      void load()
    } catch {
      /* handled */
    } finally {
      setSavingSettlement(false)
    }
  }

  function togglePOLine(lineId: string) {
    setSelectedPOLineIds((prev) => {
      const next = new Set(prev)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

  async function handleBundleSettlement() {
    if (!id || selectedPOLineIds.size === 0) return
    setBundling(true)
    try {
      await api.post('/finance/advances/settlements', {
        advance_id: id,
        po_line_ids: Array.from(selectedPOLineIds),
      })
      void load()
    } catch {
      /* handled */
    } finally {
      setBundling(false)
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

  if (loading) return <div style={{ padding: '24px', color: theme.textMuted }}>Loading...</div>
  if (!advance)
    return <div style={{ padding: '24px', color: theme.textMuted }}>Advance not found.</div>

  const canSettle = ['approved', 'partially_settled'].includes(advance.status)
  const canVoid =
    advance.status === 'approved' &&
    Number(advance.settled_amount) === 0 &&
    Number(advance.returned_amount) === 0
  const stepStatus = ['partially_settled', 'settled'].includes(advance.status)
    ? 'settled'
    : advance.status
  const stepIdx = FLOW.indexOf(stepStatus)
  const totalLines = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const selectedPOTotal = pendingPOLines
    .filter((l) => selectedPOLineIds.has(l.id))
    .reduce((s, l) => s + Number(l.total_price), 0)

  const lineFields: LineItemField<LineForm>[] = [
    {
      key: 'line_date',
      label: 'Date',
      width: '120px',
      render: (line, i) => (
        <input
          type="date"
          style={inputStyle}
          value={line.line_date}
          onChange={(e) => {
            updateLine(i, 'line_date', e.target.value)
          }}
        />
      ),
    },
    {
      key: 'category_id',
      label: 'Category',
      width: '150px',
      render: (line, i) => (
        <select
          style={inputStyle}
          value={line.category_id}
          onChange={(e) => {
            applyCategory(i, e.target.value)
          }}
        >
          <option value="">— Category —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_project_related ? ' *' : ''}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'gl_account_id',
      label: 'GL Account',
      width: '170px',
      render: (line, i) => (
        <select
          style={inputStyle}
          value={line.gl_account_id}
          onChange={(e) => {
            updateLine(i, 'gl_account_id', e.target.value)
          }}
        >
          <option value="">— Account —</option>
          {glAccounts.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} · {g.name}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'project_id',
      label: 'Project',
      width: '160px',
      render: (line, i) => (
        <select
          style={{
            ...inputStyle,
            borderColor: lineIsProjectRequired(line) && !line.project_id ? theme.danger : theme.border,
          }}
          value={line.project_id}
          onChange={(e) => {
            updateLine(i, 'project_id', e.target.value)
          }}
        >
          <option value="">{lineIsProjectRequired(line) ? '— Required —' : '— None —'}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'cost_center_id',
      label: 'Cost Center',
      width: '150px',
      render: (line, i) => (
        <select
          style={inputStyle}
          value={line.cost_center_id}
          onChange={(e) => {
            updateLine(i, 'cost_center_id', e.target.value)
          }}
        >
          <option value="">— Required —</option>
          {costCenters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      width: '160px',
      render: (line, i) => (
        <input
          style={inputStyle}
          value={line.description}
          onChange={(e) => {
            updateLine(i, 'description', e.target.value)
          }}
          placeholder="What was this for?"
        />
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      width: '100px',
      render: (line, i) => (
        <input
          type="number"
          style={{ ...inputStyle, textAlign: 'right' }}
          value={line.amount}
          min="0.01"
          step="0.01"
          onChange={(e) => {
            updateLine(i, 'amount', e.target.value)
          }}
          placeholder="0.00"
        />
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={advance.advance_number}
        subtitle={`${advance.employee_name} · ${advance.currency_code}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_BADGE[advance.status] ?? 'neutral'}>
              {advance.status.replace(/_/g, ' ')}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate(-1)
              }}
            >
              ← Back
            </Button>
            {advance.status === 'draft' && (
              <Button variant="primary" size="sm" onClick={() => void act('submit')} disabled={acting}>
                Submit for Approval
              </Button>
            )}
            {advance.status === 'pending_approval' && (
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
                  onClick={() => {
                    setApproveCostCenterId(advance.cost_center_id ?? '')
                    setShowApprove(true)
                  }}
                  disabled={acting}
                >
                  Approve &amp; Issue
                </Button>
              </>
            )}
            {canSettle && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setShowSettlementForm(true)
                }}
              >
                + New Settlement
              </Button>
            )}
            {canSettle && (
              <Button variant="secondary" size="sm" onClick={openReturnForm}>
                + New Return
              </Button>
            )}
            {canVoid && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setShowVoid(true)
                }}
              >
                Void Advance
              </Button>
            )}
          </div>
        }
      />

      {/* Progress stepper */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', overflowX: 'auto' }}>
        {FLOW.map((step, i) => {
          const done = i < stepIdx
          const current = i === stepIdx
          return (
            <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: '90px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
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
                  {step.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}
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
        })}
        {advance.status === 'rejected' && (
          <div style={{ marginLeft: '12px' }}>
            <Badge variant="danger">Rejected</Badge>
          </div>
        )}
        {advance.status === 'cancelled' && (
          <div style={{ marginLeft: '12px' }}>
            <Badge variant="neutral">Voided</Badge>
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
              Advance Details
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <tbody>
                {[
                  ['Advance #', advance.advance_number],
                  ['Employee', advance.employee_name],
                  ['Original Amount', null],
                  ['Settled', null],
                  ['Returned', null],
                  ['Outstanding', null],
                  ['Created', new Date(advance.created_at).toLocaleDateString()],
                  [
                    'Approved',
                    advance.approved_at ? new Date(advance.approved_at).toLocaleDateString() : '—',
                  ],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '7px 0', color: theme.textMuted, width: '45%' }}>{k}</td>
                    <td style={{ padding: '7px 0', color: theme.textPrimary, fontWeight: 500 }}>
                      {k === 'Original Amount' ? (
                        <AmountDisplay amount={Number(advance.amount)} currency={advance.currency_code} size="sm" />
                      ) : k === 'Settled' ? (
                        <AmountDisplay amount={Number(advance.settled_amount)} currency={advance.currency_code} size="sm" />
                      ) : k === 'Returned' ? (
                        <AmountDisplay amount={Number(advance.returned_amount)} currency={advance.currency_code} size="sm" />
                      ) : k === 'Outstanding' ? (
                        <AmountDisplay
                          amount={Number(advance.outstanding_amount)}
                          currency={advance.currency_code}
                          size="sm"
                          colored
                        />
                      ) : (
                        v
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {advance.purpose && (
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
                {advance.purpose}
              </div>
            )}
            {(advance.rejection_reason ?? advance.void_reason) && (
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
                <strong>{advance.status === 'cancelled' ? 'Voided:' : 'Rejected:'}</strong>{' '}
                {advance.status === 'cancelled' ? advance.void_reason : advance.rejection_reason}
              </div>
            )}
            {advance.journal_entry_id && (
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
                Issuance JE posted:{' '}
                <span style={{ fontFamily: 'monospace' }}>
                  {advance.journal_entry_id.slice(0, 8)}…
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* Settlements table */}
        <div>
          {canSettle && pendingPOLines.length > 0 && (
            <Card padding="none" style={{ marginBottom: '16px' }}>
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${theme.border}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
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
                  Pending PO Line Items ({pendingPOLines.length})
                </p>
                <span style={{ fontSize: '11px', color: theme.textMuted }}>
                  Completed POs funded by this advance, awaiting settlement
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
                    {['', 'PO #', 'Project', 'Description', 'Account', 'Cost Center', 'Amount'].map(
                      (h, i) => (
                        <th
                          key={h}
                          style={{
                            padding: '8px 12px',
                            textAlign: i === 6 ? 'right' : 'left',
                            color: theme.textMuted,
                            fontWeight: 500,
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {pendingPOLines.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => {
                        togglePOLine(l.id)
                      }}
                      style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                    >
                      <td style={{ padding: '8px 12px' }}>
                        <input
                          type="checkbox"
                          checked={selectedPOLineIds.has(l.id)}
                          onChange={() => {
                            togglePOLine(l.id)
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px 12px', color: theme.accent, fontFamily: 'monospace', fontSize: '11px' }}>
                        {l.po_number}
                      </td>
                      <td style={{ padding: '8px 12px', color: theme.textSecondary, fontSize: '11px' }}>
                        {l.project_code ? (
                          `${l.project_code} · ${l.project_name ?? ''}`
                        ) : (
                          <span style={{ fontStyle: 'italic' }}>General</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', color: theme.textSecondary }}>{l.description}</td>
                      <td style={{ padding: '8px 12px', color: theme.textSecondary, fontSize: '11px' }}>
                        {l.account_code ? `${l.account_code} · ${l.account_name ?? ''}` : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: theme.textSecondary, fontSize: '11px' }}>
                        {l.cost_center_code ? `${l.cost_center_code} · ${l.cost_center_name ?? ''}` : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <AmountDisplay amount={Number(l.total_price)} currency={advance.currency_code} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderTop: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ fontSize: '12px', color: theme.textMuted }}>
                  {selectedPOLineIds.size} selected · Total:{' '}
                  <span style={{ fontFamily: 'monospace', color: theme.accent, fontWeight: 700 }}>
                    {selectedPOTotal.toLocaleString()} {advance.currency_code}
                  </span>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleBundleSettlement()}
                  disabled={bundling || selectedPOLineIds.size === 0}
                >
                  {bundling ? 'Creating...' : 'Create Settlement from Selected'}
                </Button>
              </div>
            </Card>
          )}

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
                Settlements ({advance.settlements.length})
              </p>
            </div>
            {advance.settlements.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '12px' }}>
                No settlements submitted yet.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
                    {['Ref', 'Date', 'Lines', 'Total', 'Status', ''].map((h) => (
                      <th
                        key={h}
                        style={{ padding: '8px 12px', textAlign: 'left', color: theme.textMuted, fontWeight: 500 }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {advance.settlements.map((s) => (
                    <tr key={s.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '8px 12px', color: theme.accent, fontFamily: 'monospace', fontSize: '11px' }}>
                        {s.settlement_number}
                      </td>
                      <td style={{ padding: '8px 12px', color: theme.textSecondary, fontSize: '11px' }}>
                        {new Date(s.settlement_date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: theme.textSecondary }}>
                        {s.line_count}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <AmountDisplay amount={Number(s.total_amount)} currency={s.currency_code} size="sm" />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <Badge variant={STATUS_BADGE[s.status] ?? 'neutral'}>{s.status}</Badge>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {s.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void actOnSettlement(s.id, 'submit')}
                              disabled={acting}
                            >
                              Submit
                            </Button>
                          )}
                          {s.status === 'submitted' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setRejectingSettlementId(s.id)
                                }}
                              >
                                Reject
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => void actOnSettlement(s.id, 'approve')}
                                disabled={acting}
                              >
                                Approve
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Returns table */}
          <div style={{ marginTop: '16px' }}>
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
                  Returns ({advance.returns.length})
                </p>
              </div>
              {advance.returns.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '12px' }}>
                  No cash returned yet.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
                      {['Ref', 'Date', 'Amount', 'Status', ''].map((h) => (
                        <th
                          key={h}
                          style={{ padding: '8px 12px', textAlign: 'left', color: theme.textMuted, fontWeight: 500 }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {advance.returns.map((ret) => (
                      <tr key={ret.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td style={{ padding: '8px 12px', color: theme.accent, fontFamily: 'monospace', fontSize: '11px' }}>
                          {ret.return_number}
                        </td>
                        <td style={{ padding: '8px 12px', color: theme.textSecondary, fontSize: '11px' }}>
                          {new Date(ret.return_date).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <AmountDisplay amount={Number(ret.amount)} currency={ret.currency_code} size="sm" />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <Badge variant={STATUS_BADGE[ret.status] ?? 'neutral'}>{ret.status}</Badge>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {ret.status === 'draft' && (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void actOnReturn(ret.id, 'cancel')}
                                disabled={acting}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => void actOnReturn(ret.id, 'approve')}
                                disabled={acting}
                              >
                                Approve
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Ledger */}
      <div style={{ marginTop: '16px' }}>
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
              Ledger
            </p>
          </div>
          {ledger.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '12px' }}>
              No posted activity yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
                    {['Date', 'Type', 'Reference', 'Description', 'Amount', 'Balance'].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 12px',
                          textAlign: i >= 4 ? 'right' : 'left',
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
                  {ledger.map((entry) => (
                    <tr key={entry.ref_id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '8px 12px', color: theme.textSecondary, fontSize: '11px' }}>
                        {new Date(entry.date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <Badge
                          variant={
                            entry.type === 'issuance' ? 'info' : entry.type === 'settlement' ? 'warning' : 'success'
                          }
                          size="sm"
                        >
                          {LEDGER_TYPE_LABEL[entry.type]}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px 12px', color: theme.accent, fontFamily: 'monospace', fontSize: '11px' }}>
                        {entry.reference}
                      </td>
                      <td style={{ padding: '8px 12px', color: theme.textSecondary, fontSize: '11px' }}>
                        {entry.description ?? '—'}
                      </td>
                      <td
                        style={{
                          padding: '8px 12px',
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          color: entry.amount >= 0 ? theme.textPrimary : theme.danger,
                        }}
                      >
                        {entry.amount >= 0 ? '+' : ''}
                        {Number(entry.amount).toLocaleString()}
                      </td>
                      <td
                        style={{
                          padding: '8px 12px',
                          textAlign: 'right',
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: theme.textPrimary,
                        }}
                      >
                        {Number(entry.running_balance).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Reject advance modal */}
      {/* Approve advance modal */}
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
            <h3 style={{ margin: '0 0 12px', color: theme.textPrimary, fontSize: '15px' }}>
              Approve &amp; Issue Advance
            </h3>
            {advance.purpose && (
              <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px' }}>
                <strong>Purpose:</strong> {advance.purpose}
              </p>
            )}
            <div style={{ marginBottom: '4px' }}>
              <label style={labelStyle}>Cost Center (optional)</label>
              <select
                style={inputStyle}
                value={approveCostCenterId}
                onChange={(e) => {
                  setApproveCostCenterId(e.target.value)
                }}
              >
                <option value="">— Not set —</option>
                {costCenters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </div>
            <p style={{ fontSize: '11px', color: theme.textMuted, margin: '4px 0 0' }}>
              Classify this advance now that you know what it's for — it's informational at
              issuance, but helps track which department the spend belongs to.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowApprove(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  await act('approve', { cost_center_id: approveCostCenterId || undefined })
                  setShowApprove(false)
                }}
                disabled={acting}
              >
                Approve &amp; Issue
              </Button>
            </div>
          </Card>
        </div>
      )}

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
              Reject Advance
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
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
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
                Reject Advance
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Reject settlement modal */}
      {rejectingSettlementId && (
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
              Reject Settlement
            </h3>
            <textarea
              style={{ ...inputStyle, height: '80px', resize: 'vertical' as const }}
              value={settlementRejectReason}
              onChange={(e) => {
                setSettlementRejectReason(e.target.value)
              }}
              placeholder="Reason for rejection..."
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRejectingSettlementId(null)
                  setSettlementRejectReason('')
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  await actOnSettlement(rejectingSettlementId, 'reject', {
                    reason: settlementRejectReason,
                  })
                  setRejectingSettlementId(null)
                  setSettlementRejectReason('')
                }}
                disabled={acting || !settlementRejectReason}
              >
                Reject Settlement
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* New Settlement modal */}
      {showSettlementForm && (
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
          <Card padding="lg" style={{ width: '1150px', maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>New Settlement</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSettlementForm(false)
                }}
              >
                ✕
              </Button>
            </div>
            <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
              Outstanding balance:{' '}
              <AmountDisplay amount={Number(advance.outstanding_amount)} currency={advance.currency_code} size="sm" />
              {' · '}Categories marked with * require a project.{' '}
              <a
                href="/finance/categories"
                target="_blank"
                rel="noreferrer"
                style={{ color: theme.accent }}
              >
                Manage categories
              </a>
            </p>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Description</label>
              <input
                style={inputStyle}
                value={settlementDescription}
                onChange={(e) => {
                  setSettlementDescription(e.target.value)
                }}
                placeholder="Brief summary of this settlement"
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <LineItemEditor
                fields={lineFields}
                rows={lines}
                onRemoveRow={(i) => {
                  setLines((ls) => ls.filter((_, idx) => idx !== i))
                }}
                removeDisabled={() => lines.length <= 1}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLines((ls) => [...ls, emptyLine()])
                }}
              >
                + Add Line
              </Button>
              <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>
                Total:{' '}
                <span style={{ fontFamily: 'monospace', color: theme.accent }}>
                  {totalLines.toLocaleString()} {advance.currency_code}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowSettlementForm(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleCreateSettlement()}
                disabled={savingSettlement || !linesValid}
              >
                {savingSettlement ? 'Creating...' : 'Create Settlement'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* New Return modal */}
      {showReturnForm && (
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
            <h3 style={{ margin: '0 0 12px', color: theme.textPrimary, fontSize: '15px' }}>
              New Return
            </h3>
            <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
              Outstanding balance:{' '}
              <AmountDisplay amount={Number(advance.outstanding_amount)} currency={advance.currency_code} size="sm" />
            </p>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                style={inputStyle}
                value={returnForm.return_date}
                onChange={(e) => {
                  setReturnForm((p) => ({ ...p, return_date: e.target.value }))
                }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                style={inputStyle}
                value={returnForm.amount}
                onChange={(e) => {
                  setReturnForm((p) => ({ ...p, amount: e.target.value }))
                }}
                placeholder="0.00"
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Cash account</label>
              <select
                style={inputStyle}
                value={returnForm.cash_account_id}
                onChange={(e) => {
                  setReturnForm((p) => ({ ...p, cash_account_id: e.target.value }))
                }}
              >
                <option value="">— Account —</option>
                {glAccounts.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code} · {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Description (optional)</label>
              <input
                style={inputStyle}
                value={returnForm.description}
                onChange={(e) => {
                  setReturnForm((p) => ({ ...p, description: e.target.value }))
                }}
                placeholder="What is this cash return for?"
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowReturnForm(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleCreateReturn()}
                disabled={savingReturn || !returnForm.amount || !returnForm.cash_account_id}
              >
                {savingReturn ? 'Creating...' : 'Create Return'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Void advance modal */}
      {showVoid && (
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
            <h3 style={{ margin: '0 0 12px', color: theme.textPrimary, fontSize: '15px' }}>
              Void Advance
            </h3>
            <p style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px' }}>
              Reverses the issuance journal entry and cancels this advance. Only possible because
              nothing has been settled or returned against it yet — provide a reason for the record.
            </p>
            <textarea
              style={{ ...inputStyle, height: '80px', resize: 'vertical' as const }}
              value={voidReason}
              onChange={(e) => {
                setVoidReason(e.target.value)
              }}
              placeholder="Reason for voiding..."
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowVoid(false)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  await act('void', { reason: voidReason })
                  setShowVoid(false)
                  setVoidReason('')
                }}
                disabled={acting || !voidReason}
              >
                Void Advance
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
