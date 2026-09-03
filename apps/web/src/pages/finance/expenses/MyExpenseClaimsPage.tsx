import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../../../store/authStore'
import { useToastStore } from '../../../store/toastStore'
import { useTheme } from '../../../theme/ThemeContext'
import { usePagePadding } from '../../../hooks/usePagePadding'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Grid } from '../../../components/ui/Grid'
import { KPICard } from '../../../components/ui/KPICard'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { Select } from '../../../components/ui/Select'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Badge, type BadgeVariant } from '../../../components/ui/Badge'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'

interface ClaimLine {
  id: string
  expense_date: string
  category_name: string | null
  description: string | null
  amount: number
  currency_code: string
}

interface Claim {
  id: string
  claim_number: string
  description: string | null
  total_amount: number
  currency_code: string
  status: string
  rejection_reason: string | null
  created_at: string
  lines: ClaimLine[]
}

interface Category {
  id: string
  name: string
}

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Pending approval',
  posted: 'Approved · awaiting payment',
  paid: 'Paid',
  rejected: 'Rejected',
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  submitted: 'info',
  posted: 'warning',
  paid: 'success',
  rejected: 'danger',
}

interface LineForm {
  expense_date: string
  category_id: string
  description: string
  amount: string
}

const emptyLine = (): LineForm => ({
  expense_date: new Date().toISOString().slice(0, 10),
  category_id: '',
  description: '',
  amount: '',
})

const EMPTY_FORM = {
  description: '',
  currency_code: 'IQD',
  notes: '',
}

export default function MyExpenseClaimsPage() {
  const { theme } = useTheme()
  const pagePadding = usePagePadding()
  const addToast = useToastStore((s) => s.addToast)
  const employeeId = useAuthStore((s) => s.user?.employeeId)
  const hasEmployeeLink = !!employeeId

  const [claims, setClaims] = useState<Claim[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  const [detailClaim, setDetailClaim] = useState<Claim | null>(null)

  const load = useCallback(async () => {
    if (!employeeId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [clRes, catRes] = await Promise.all([
        api.get<Claim[]>('/finance/expense-claims/mine'),
        api.get<Category[]>('/finance/expense-claims/categories/mine'),
      ])
      setClaims(clRes.data)
      setCategories(catRes.data)
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    void load()
  }, [load])

  function updateLine(i: number, field: keyof LineForm, value: string) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))
  }

  const totalLines = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)

  async function handleSubmit() {
    if (lines.some((l) => !l.amount || !l.expense_date || !l.category_id)) {
      addToast({ type: 'error', message: 'Every line needs a date, category, and amount' })
      return
    }
    setSubmitting(true)
    try {
      await api.post('/finance/expense-claims/request-self', {
        description: form.description || undefined,
        currency_code: form.currency_code,
        notes: form.notes || undefined,
        lines: lines.map((l) => ({
          expense_date: l.expense_date,
          category_id: l.category_id,
          description: l.description || undefined,
          amount: Number(l.amount),
        })),
      })
      addToast({ type: 'success', message: 'Expense claim submitted' })
      setShowForm(false)
      setForm(EMPTY_FORM)
      setLines([emptyLine()])
      void load()
    } catch (e: unknown) {
      const apiError = e as { response?: { data?: { error?: { message?: string } } } }
      addToast({
        type: 'error',
        message: apiError.response?.data?.error?.message ?? (e as Error).message,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const pendingCount = claims.filter((c) => c.status === 'submitted').length
  const awaitingPaymentCount = claims.filter((c) => c.status === 'posted').length
  const totalOwed = claims
    .filter((c) => c.status === 'posted')
    .reduce((sum, c) => sum + Number(c.total_amount), 0)

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
  return (
    <div style={{ ...pagePadding, margin: '0 auto', maxWidth: '1100px' }}>
      <PageHeader
        title="My Expense Claims"
        subtitle="Submit receipts for reimbursement and track what's owed to you"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              if (!hasEmployeeLink) {
                addToast({
                  type: 'error',
                  message:
                    'Your account isn’t linked to an employee record yet — ask HR to link it first.',
                })
                return
              }
              setShowForm(true)
            }}
          >
            + New Claim
          </Button>
        }
      />

      <Grid
        cols={3}
        tabletCols={3}
        phoneCols={1}
        gap={12}
        style={{ marginTop: '20px', marginBottom: '20px' }}
      >
        <KPICard
          label="Pending approval"
          value={pendingCount}
          iconColor={pendingCount > 0 ? 'warning' : 'accent'}
        />
        <KPICard label="Awaiting payment" value={awaitingPaymentCount} iconColor="accent" />
        <KPICard
          label="Owed to you"
          value={totalOwed.toLocaleString()}
          iconColor={totalOwed > 0 ? 'warning' : 'accent'}
        />
      </Grid>

      {!hasEmployeeLink ? (
        <EmptyState
          title="Your account isn’t linked to an employee record"
          message="Ask HR to link your user account to your employee profile before you can submit a claim."
        />
      ) : loading && claims.length === 0 ? (
        <div className="skeleton" style={{ height: '200px', borderRadius: '12px' }} />
      ) : claims.length === 0 ? (
        <EmptyState
          title="No expense claims yet"
          message="Submit a claim and finance will review it."
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setShowForm(true)
              }}
            >
              New Claim
            </Button>
          }
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Ref', 'Description', 'Lines', 'Amount', 'Status', ''].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: h === 'Amount' ? 'right' : 'left',
                        padding: '10px 16px',
                        color: theme.textMuted,
                        fontWeight: 600,
                        fontSize: '11px',
                        textTransform: 'uppercase',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setDetailClaim(c)
                    }}
                    style={{ borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  >
                    <td
                      style={{
                        padding: '10px 16px',
                        color: theme.accent,
                        fontFamily: 'monospace',
                        fontSize: '12px',
                      }}
                    >
                      {c.claim_number}
                    </td>
                    <td style={{ padding: '10px 16px', color: theme.textSecondary }}>
                      {c.description ?? '—'}
                    </td>
                    <td
                      style={{
                        padding: '10px 16px',
                        color: theme.textSecondary,
                        textAlign: 'center',
                      }}
                    >
                      {c.lines.length}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <AmountDisplay
                        amount={Number(c.total_amount)}
                        currency={c.currency_code}
                        size="sm"
                      />
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <Badge variant={STATUS_VARIANTS[c.status] ?? 'neutral'}>
                        {STATUS_LABELS[c.status] ?? c.status}
                      </Badge>
                    </td>
                    <td
                      style={{ padding: '10px 16px' }}
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDetailClaim(c)
                        }}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={showForm}
        onClose={() => {
          setShowForm(false)
          setForm(EMPTY_FORM)
          setLines([emptyLine()])
        }}
        title="New Expense Claim"
        description="A finance user will review this claim and approve it before reimbursement is booked."
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false)
                setForm(EMPTY_FORM)
                setLines([emptyLine()])
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={submitting} onClick={() => void handleSubmit()}>
              Submit Claim
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => {
                setForm((f) => ({ ...f, description: e.target.value }))
              }}
              placeholder="Brief purpose of claim"
            />
            <Select
              label="Currency"
              value={form.currency_code}
              onChange={(e) => {
                setForm((f) => ({ ...f, currency_code: e.target.value }))
              }}
            >
              <option value="IQD">IQD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </Select>
          </div>

          <div>
            <p
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: theme.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              Receipts
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 140px 1fr 100px 28px',
                    gap: '8px',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="date"
                    style={inputStyle}
                    value={line.expense_date}
                    onChange={(e) => {
                      updateLine(i, 'expense_date', e.target.value)
                    }}
                  />
                  <select
                    style={inputStyle}
                    value={line.category_id}
                    onChange={(e) => {
                      updateLine(i, 'category_id', e.target.value)
                    }}
                  >
                    <option value="">— Category —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    style={inputStyle}
                    value={line.description}
                    onChange={(e) => {
                      updateLine(i, 'description', e.target.value)
                    }}
                    placeholder="What was this for?"
                  />
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
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={lines.length <= 1}
                    onClick={() => {
                      setLines((ls) => ls.filter((_, idx) => idx !== i))
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '10px',
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLines((ls) => [...ls, emptyLine()])
                }}
              >
                + Add Receipt
              </Button>
              <div style={{ fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>
                Total:{' '}
                <span style={{ fontFamily: 'monospace', color: theme.accent }}>
                  {totalLines.toLocaleString()} {form.currency_code}
                </span>
              </div>
            </div>
          </div>

          <Textarea
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => {
              setForm((f) => ({ ...f, notes: e.target.value }))
            }}
            rows={2}
          />
        </div>
      </Modal>

      <Modal
        open={!!detailClaim}
        onClose={() => {
          setDetailClaim(null)
        }}
        title={detailClaim?.claim_number ?? ''}
        description={detailClaim?.description ?? undefined}
      >
        {detailClaim && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Badge variant={STATUS_VARIANTS[detailClaim.status] ?? 'neutral'}>
                {STATUS_LABELS[detailClaim.status] ?? detailClaim.status}
              </Badge>
              <AmountDisplay
                amount={Number(detailClaim.total_amount)}
                currency={detailClaim.currency_code}
                size="sm"
              />
            </div>
            {detailClaim.rejection_reason && (
              <div
                style={{
                  background: '#ef444410',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: '#ef4444',
                }}
              >
                <strong>Rejected:</strong> {detailClaim.rejection_reason}
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Date', 'Category', 'Description', 'Amount'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '6px 8px',
                        textAlign: h === 'Amount' ? 'right' : 'left',
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
                {detailClaim.lines.map((l) => (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td
                      style={{ padding: '6px 8px', color: theme.textSecondary, fontSize: '11px' }}
                    >
                      {new Date(l.expense_date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                      {l.category_name ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', color: theme.textSecondary }}>
                      {l.description ?? '—'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <AmountDisplay
                        amount={Number(l.amount)}
                        currency={l.currency_code}
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}
