import i18n from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { useToastStore } from '../../../store/toastStore'
import { usePermission } from '../../../hooks/usePermission'
import { api } from '../../../lib/axios'
import { apiErrMsg } from '../../../lib/apiError'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Modal } from '../../../components/ui/Modal'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

interface InvoiceLine {
  id: string
  po_line_id?: string
  description: string
  qty: string
  unit_price: string
  total_price: string
  account_code?: string
  account_name?: string
}

interface Payment {
  id: string
  payment_date: string
  amount: string
  currency_code: string
  payment_method: string
  payment_reference?: string
  posted: boolean
  created_by_email?: string
}

interface VendorInvoice {
  id: string
  vendor_id: string
  vendor_name: string
  vendor_email?: string
  po_id?: string
  po_number?: string
  invoice_number: string
  invoice_date: string
  due_date: string
  subtotal: string
  tax_amount: string
  wht_amount: string
  total_amount: string
  net_payable: string
  amount_paid: string
  currency_code: string
  status: string
  notes?: string
  rejection_reason?: string
  submitted_by_email?: string
  submitted_at?: string
  approved_by_email?: string
  approved_at?: string
  analytic_code?: string
  cost_center_code?: string
  lines: InvoiceLine[]
  payments: Payment[]
}

const STATUS_LABELS: Record<string, string> = {
  get draft() { return i18n.t('fin.apInvDetail.draft', { defaultValue: "Draft" }) },
  get submitted() { return i18n.t('fin.apInvDetail.pendingApproval', { defaultValue: "Pending approval" }) },
  get approved() { return i18n.t('fin.apInvDetail.approved', { defaultValue: "Approved" }) },
  get partially_paid() { return i18n.t('fin.apInvDetail.partiallyPaid', { defaultValue: "Partially paid" }) },
  get paid() { return i18n.t('fin.apInvDetail.paid', { defaultValue: "Paid" }) },
  get cancelled() { return i18n.t('fin.apInvDetail.cancelled', { defaultValue: "Cancelled" }) },
}
const STATUS_VARIANTS: Record<
  string,
  'neutral' | 'warning' | 'accent' | 'info' | 'success' | 'danger'
> = {
  draft: 'neutral',
  submitted: 'warning',
  approved: 'accent',
  partially_paid: 'info',
  paid: 'success',
  cancelled: 'danger',
}
const PAYMENT_METHODS: Record<string, string> = {
  get bank_transfer() { return i18n.t('fin.apInvDetail.bankTransfer', { defaultValue: "Bank transfer" }) },
  get cheque() { return i18n.t('fin.apInvDetail.cheque', { defaultValue: "Cheque" }) },
  get cash() { return i18n.t('fin.apInvDetail.cash', { defaultValue: "Cash" }) },
  get other() { return i18n.t('fin.apInvDetail.other', { defaultValue: "Other" }) },
}

function fmtAmt(v: string | number) {
  return parseFloat(String(v)).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  const { theme } = useTheme()
  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        padding: '6px 0',
        borderBottom: `1px solid ${theme.tableBorder}`,
      }}
    >
      <span style={{ width: '160px', flexShrink: 0, color: theme.textMuted, fontSize: '12px' }}>
        {label}
      </span>
      <span style={{ color: theme.textPrimary, fontSize: '12px' }}>{value}</span>
    </div>
  )
}

export default function VendorInvoiceDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const { can } = usePermission()
  const canApproveAP = can('finance.ap.approve', 'approve')

  const [invoice, setInvoice] = useState<VendorInvoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'submit' | 'approve' | 'cancel' | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'bank_transfer',
    payment_reference: '',
    notes: '',
  })
  const [payLoading, setPayLoading] = useState(false)
  const [linkPOId, setLinkPOId] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [poOptions, setPoOptions] = useState<{ value: string; label: string }[]>([])

  async function fetchInvoice() {
    setLoading(true)
    try {
      const res = await api.get<VendorInvoice>(`/finance/vendor-invoices/${id}`)
      setInvoice(res.data)
    } catch {
      addToast({ type: 'error', message: t('fin.apInvDetail.failedToLoadInvoice') })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchInvoice()
  }, [id])

  useEffect(() => {
    if (!invoice || invoice.po_id) return
    interface PORow {
      id: string
      po_number: string
    }
    api
      .get<PORow[] | { items?: PORow[] }>('/procurement/purchase-orders', {
        params: { limit: 200 },
      })
      .then((r) => {
        const d = r.data
        const list: PORow[] = Array.isArray(d) ? d : ((d as { items?: PORow[] }).items ?? [])
        setPoOptions(list.map((p) => ({ value: p.id, label: p.po_number })))
      })
      .catch(() => {
        /* ignore: link-PO dropdown just stays empty if this fails */
      })
  }, [invoice])

  async function handleLinkPO() {
    if (!linkPOId) return
    setLinkLoading(true)
    try {
      await api.patch(`/finance/vendor-invoices/${id}/link-po`, { po_id: linkPOId })
      addToast({ type: 'success', message: t('fin.apInvDetail.poLinkedSuccessfully') })
      void fetchInvoice()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, t('fin.apInvDetail.failedToLinkPo')) })
    } finally {
      setLinkLoading(false)
    }
  }

  async function runAction(action: 'submit' | 'approve' | 'cancel') {
    setActionLoading(true)
    try {
      await api.post(`/finance/vendor-invoices/${id}/${action}`)
      addToast({ type: 'success', message: t('fin.apInvDetail.invoiceEd', { action }) })
      void fetchInvoice()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, t('fin.apInvDetail.failedTo', { action })) })
    } finally {
      setActionLoading(false)
      setConfirmAction(null)
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      addToast({ type: 'error', message: t('fin.apInvDetail.reasonIsRequired') })
      return
    }
    setActionLoading(true)
    try {
      await api.post(`/finance/vendor-invoices/${id}/reject`, { reason: rejectReason })
      addToast({ type: 'success', message: t('fin.apInvDetail.invoiceRejected') })
      setRejectOpen(false)
      void fetchInvoice()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, t('fin.apInvDetail.rejectFailed')) })
    } finally {
      setActionLoading(false)
    }
  }

  async function handlePay() {
    const amt = parseFloat(payForm.amount)
    if (!amt || amt <= 0) {
      addToast({ type: 'error', message: t('fin.apInvDetail.validAmountRequired') })
      return
    }
    setPayLoading(true)
    try {
      await api.post(`/finance/vendor-invoices/${id}/payments`, {
        ...payForm,
        amount: parseFloat(payForm.amount),
        currency_code: inv.currency_code,
      })
      addToast({ type: 'success', message: t('fin.apInvDetail.paymentRecorded') })
      setPayOpen(false)
      setPayForm({
        amount: '',
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: 'bank_transfer',
        payment_reference: '',
        notes: '',
      })
      void fetchInvoice()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, t('fin.apInvDetail.paymentFailed')) })
    } finally {
      setPayLoading(false)
    }
  }

  if (loading)
    return (
      <div style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: 400 }} />
      </div>
    )
  if (!invoice) return <div style={{ padding: '24px', color: '#ef4444' }}>{t('fin.apInvDetail.invoiceNotFound')}</div>

  const inv = invoice
  const outstanding =
    (Math.round(parseFloat(inv.net_payable) * 100) -
      Math.round(parseFloat(inv.amount_paid) * 100)) /
    100
  const canEdit = inv.status === 'draft'
  const canSubmit = inv.status === 'draft'
  const canApprove = canApproveAP && inv.status === 'submitted'
  const canReject = canApproveAP && inv.status === 'submitted'
  const canPay = ['approved', 'partially_paid'].includes(inv.status)
  const canCancel = ['draft', 'submitted'].includes(inv.status)
  const dueDate = new Date(inv.due_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000)
  const isOverdue = daysOverdue > 0 && !['paid', 'cancelled'].includes(inv.status)

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1300px' }}>
      <PageHeader
        title={t('fin.apInvDetail.invoice', { invoice_number: inv.invoice_number })}
        subtitle={inv.vendor_name}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate('/finance/ap')
              }}
            >
              {t('fin.apInvDetail.back')}
            </Button>
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigate(`/finance/ap/${id}/edit`)
                }}
              >
                {t('fin.apInvDetail.edit')}
              </Button>
            )}
            {canSubmit && inv.lines.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setConfirmAction('submit')
                }}
              >
                {t('fin.apInvDetail.submitForApproval')}
              </Button>
            )}
            {canApprove && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setConfirmAction('approve')
                }}
              >
                {t('fin.apInvDetail.approve')}
              </Button>
            )}
            {canReject && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setRejectOpen(true)
                }}
              >
                {t('fin.apInvDetail.reject')}
              </Button>
            )}
            {canPay && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const prefill = (Math.round(outstanding * 100) / 100).toFixed(2)
                  setPayForm((f) => ({
                    ...f,
                    amount: prefill,
                    payment_date: new Date().toISOString().slice(0, 10),
                  }))
                  setPayOpen(true)
                }}
              >
                {t('fin.apInvDetail.recordPayment')}
              </Button>
            )}
            {canCancel && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmAction('cancel')
                }}
              >
                {t('fin.apInvDetail.cancel')}
              </Button>
            )}
          </div>
        }
      />

      {isOverdue && (
        <div
          style={{
            padding: '10px 14px',
            background: `${theme.warning}18`,
            border: `1px solid ${theme.warning}`,
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '12px',
            color: theme.warning,
          }}
        >
          This invoice is <strong>{t('fin.apInvDetail.daysOverdue', { daysOverdue })}</strong>. Due{' '}
          {inv.due_date.slice(0, 10)}.
        </div>
      )}
      {inv.rejection_reason && (
        <div
          style={{
            padding: '10px 14px',
            background: `${theme.danger}18`,
            border: `1px solid ${theme.danger}`,
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '12px',
            color: theme.danger,
          }}
        >
          <strong>{t('fin.apInvDetail.rejected')}</strong> {inv.rejection_reason}
        </div>
      )}

      {!inv.po_id && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '8px',
            background: theme.warningBg,
            border: `1px solid ${theme.warningBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: '180px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: theme.warning }}>
              {t('fin.apInvDetail.notLinkedToAPo')}
            </div>
            <div
              style={{ fontSize: '11px', color: theme.warning, opacity: 0.85, marginTop: '2px' }}
            >
              {t('fin.apInvDetail.linkThisInvoiceToAPo')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: '260px' }}>
            <div style={{ flex: 1 }}>
              <SearchableSelect
                value={linkPOId}
                onChange={setLinkPOId}
                options={poOptions}
                placeholder={t('fin.apInvDetail.selectPo')}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={linkLoading}
              disabled={!linkPOId}
              onClick={() => void handleLinkPO()}
            >
              {t('fin.apInvDetail.link')}
            </Button>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        {/* Info */}
        <Card padding="md">
          <h3
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '10px',
            }}
          >
            {t('fin.apInvDetail.invoiceInfo')}
          </h3>
          <Row
            label={t('fin.apInvDetail.status')}
            value={
              <Badge variant={STATUS_VARIANTS[inv.status] ?? 'neutral'} size="sm">
                {STATUS_LABELS[inv.status] ?? inv.status}
              </Badge>
            }
          />
          <Row
            label={t('fin.apInvDetail.invoiceNumber')}
            value={<span style={{ fontFamily: 'monospace' }}>{inv.invoice_number}</span>}
          />
          <Row label={t('fin.apInvDetail.invoiceDate')} value={inv.invoice_date.slice(0, 10)} />
          <Row
            label={t('fin.apInvDetail.dueDate')}
            value={
              <span style={{ color: isOverdue ? theme.danger : theme.textPrimary }}>
                {inv.due_date.slice(0, 10)}
              </span>
            }
          />
          <Row
            label={t('fin.apInvDetail.poNumber')}
            value={
              inv.po_number ? <span style={{ fontFamily: 'monospace' }}>{inv.po_number}</span> : '—'
            }
          />
          <Row label={t('fin.apInvDetail.currency')} value={inv.currency_code} />
          {inv.analytic_code && <Row label={t('fin.apInvDetail.analyticAccount')} value={inv.analytic_code} />}
          {inv.cost_center_code && <Row label={t('fin.apInvDetail.costCenter')} value={inv.cost_center_code} />}
          {inv.notes && <Row label={t('fin.apInvDetail.notes')} value={inv.notes} />}
        </Card>

        {/* Amounts */}
        <Card padding="md">
          <h3
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '10px',
            }}
          >
            {t('fin.apInvDetail.amounts')}
          </h3>
          <Row label={t('fin.apInvDetail.subtotal')} value={`${inv.currency_code} ${fmtAmt(inv.subtotal)}`} />
          <Row label={t('fin.apInvDetail.tax')} value={`${inv.currency_code} ${fmtAmt(inv.tax_amount)}`} />
          <Row label={t('fin.apInvDetail.wht')} value={`${inv.currency_code} ${fmtAmt(inv.wht_amount)}`} />
          <Row
            label={t('fin.apInvDetail.total')}
            value={
              <strong>
                {inv.currency_code} {fmtAmt(inv.total_amount)}
              </strong>
            }
          />
          <Row
            label={t('fin.apInvDetail.netPayable')}
            value={
              <AmountDisplay
                amount={parseFloat(inv.net_payable)}
                currency={inv.currency_code}
                size="md"
              />
            }
          />
          <Row
            label={t('fin.apInvDetail.paid')}
            value={
              <span style={{ color: theme.success }}>
                {inv.currency_code} {fmtAmt(inv.amount_paid)}
              </span>
            }
          />
          <Row
            label={t('fin.apInvDetail.outstanding')}
            value={
              outstanding > 0 ? (
                <span style={{ color: theme.danger, fontWeight: 600 }}>
                  {inv.currency_code} {fmtAmt(outstanding)}
                </span>
              ) : (
                <span style={{ color: theme.success }}>{t('fin.apInvDetail.fullyPaid')}</span>
              )
            }
          />
        </Card>
      </div>

      {/* Lines */}
      <Card padding="none" style={{ marginBottom: '16px' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
            {t('fin.apInvDetail.invoiceLines')}
          </h3>
        </div>
        {inv.lines.length === 0 ? (
          <div
            style={{
              padding: '20px',
              color: theme.textMuted,
              fontSize: '12px',
              textAlign: 'center',
            }}
          >
            {t('fin.apInvDetail.noLinesYet')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {[t('fin.apInvDetail.description'), t('fin.apInvDetail.account'), t('fin.apInvDetail.qty'), t('fin.apInvDetail.unitPrice'), t('fin.apInvDetail.total')].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'start',
                      padding: '8px 14px',
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
              {inv.lines.map((line) => (
                <tr key={line.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                  <td style={{ padding: '8px 14px', color: theme.textPrimary }}>
                    {line.description}
                  </td>
                  <td
                    style={{
                      padding: '8px 14px',
                      color: theme.textMuted,
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  >
                    {line.account_code ?? '—'}
                  </td>
                  <td style={{ padding: '8px 14px', color: theme.textSecondary }}>
                    {fmtAmt(line.qty)}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <AmountDisplay
                      amount={parseFloat(line.unit_price)}
                      currency={inv.currency_code}
                      size="sm"
                    />
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <AmountDisplay
                      amount={parseFloat(line.total_price)}
                      currency={inv.currency_code}
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Payments */}
      <Card padding="none">
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>{t('fin.apInvDetail.payments')}</h3>
        </div>
        {inv.payments.length === 0 ? (
          <div
            style={{
              padding: '20px',
              color: theme.textMuted,
              fontSize: '12px',
              textAlign: 'center',
            }}
          >
            {t('fin.apInvDetail.noPaymentsRecorded')}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                {[t('fin.apInvDetail.date'), t('fin.apInvDetail.amount'), t('fin.apInvDetail.method'), t('fin.apInvDetail.reference'), t('fin.apInvDetail.posted')].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'start',
                      padding: '8px 14px',
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
              {inv.payments.map((pmt) => (
                <tr key={pmt.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                  <td style={{ padding: '8px 14px', color: theme.textSecondary }}>
                    {pmt.payment_date.slice(0, 10)}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <AmountDisplay
                      amount={parseFloat(pmt.amount)}
                      currency={pmt.currency_code}
                      size="sm"
                    />
                  </td>
                  <td style={{ padding: '8px 14px', color: theme.textMuted }}>
                    {PAYMENT_METHODS[pmt.payment_method] ?? pmt.payment_method}
                  </td>
                  <td
                    style={{
                      padding: '8px 14px',
                      color: theme.textMuted,
                      fontFamily: 'monospace',
                      fontSize: '11px',
                    }}
                  >
                    {pmt.payment_reference ?? '—'}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    <Badge variant={pmt.posted ? 'success' : 'neutral'} size="sm">
                      {pmt.posted ? t('fin.apInvDetail.posted') : t('fin.apInvDetail.pending')}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Action confirms */}
      <ConfirmDialog
        open={confirmAction === 'submit'}
        onClose={() => {
          setConfirmAction(null)
        }}
        onConfirm={() => void runAction('submit')}
        title={t('fin.apInvDetail.submitForApproval')}
        message={t('fin.apInvDetail.submitInvoiceForApproval', { invoice_number: inv.invoice_number })}
        confirmLabel={t('fin.apInvDetail.submit')}
        loading={actionLoading}
      />
      <ConfirmDialog
        open={confirmAction === 'approve'}
        onClose={() => {
          setConfirmAction(null)
        }}
        onConfirm={() => void runAction('approve')}
        title={t('fin.apInvDetail.approveInvoice')}
        message={t('fin.apInvDetail.approveInvoiceFrom', { invoice_number: inv.invoice_number, vendor_name: inv.vendor_name })}
        confirmLabel={t('fin.apInvDetail.approve')}
        loading={actionLoading}
      />
      <ConfirmDialog
        open={confirmAction === 'cancel'}
        onClose={() => {
          setConfirmAction(null)
        }}
        onConfirm={() => void runAction('cancel')}
        title={t('fin.apInvDetail.cancelInvoice')}
        message={t('fin.apInvDetail.cancelInvoiceThisCannotBeUndone', { invoice_number: inv.invoice_number })}
        confirmLabel={t('fin.apInvDetail.cancelInvoice')}
        loading={actionLoading}
      />

      {/* Reject modal */}
      <Modal
        open={rejectOpen}
        onClose={() => {
          setRejectOpen(false)
        }}
        title={t('fin.apInvDetail.rejectInvoice')}
      >
        <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '10px' }}>
          {t('fin.apInvDetail.provideAReasonForRejection')}
        </p>
        <textarea
          value={rejectReason}
          onChange={(e) => {
            setRejectReason(e.target.value)
          }}
          rows={4}
          placeholder={t('fin.apInvDetail.rejectionReason')}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '6px',
            border: `1px solid ${theme.border}`,
            background: theme.bgSurface,
            color: theme.textPrimary,
            fontSize: '12px',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRejectOpen(false)
            }}
          >
            {t('fin.apInvDetail.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={(...args: Parameters<typeof handleReject>) => void handleReject(...args)} disabled={actionLoading}>
            {t('fin.apInvDetail.rejectInvoice')}
          </Button>
        </div>
      </Modal>

      {/* Pay modal */}
      <Modal
        open={payOpen}
        onClose={() => {
          setPayOpen(false)
        }}
        title={t('fin.apInvDetail.recordPayment')}
      >
        <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '10px' }}>
          {t('fin.apInvDetail.outstanding2')}{' '}
          <strong>
            {inv.currency_code} {fmtAmt(outstanding)}
          </strong>
        </p>
        {[
          { label: t('fin.apInvDetail.amount'), key: 'amount', type: 'number', placeholder: '0.00' },
          { label: t('fin.apInvDetail.paymentDate'), key: 'payment_date', type: 'date', placeholder: '' },
          {
            label: t('fin.apInvDetail.reference'),
            key: 'payment_reference',
            type: 'text',
            placeholder: t('fin.apInvDetail.chequeNoBankRef'),
          },
          { label: t('fin.apInvDetail.notes'), key: 'notes', type: 'text', placeholder: '' },
        ].map((f) => (
          <div key={f.key} style={{ marginBottom: '10px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                color: theme.textMuted,
                marginBottom: '4px',
              }}
            >
              {f.label}
            </label>
            <input
              type={f.type}
              value={(payForm as Record<string, string>)[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => {
                setPayForm((prev) => ({ ...prev, [f.key]: e.target.value }))
              }}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                background: theme.bgSurface,
                color: theme.textPrimary,
                fontSize: '12px',
                boxSizing: 'border-box',
              }}
            />
          </div>
        ))}
        <div style={{ marginBottom: '10px' }}>
          <SearchableSelect
            label={t('fin.apInvDetail.paymentMethod')}
            value={payForm.payment_method}
            onChange={(v) => {
              setPayForm((prev) => ({ ...prev, payment_method: v }))
            }}
            options={Object.entries(PAYMENT_METHODS).map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPayOpen(false)
            }}
          >
            {t('fin.apInvDetail.cancel')}
          </Button>
          <Button variant="primary" size="sm" onClick={(...args: Parameters<typeof handlePay>) => void handlePay(...args)} disabled={payLoading}>
            {t('fin.apInvDetail.recordPayment')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
