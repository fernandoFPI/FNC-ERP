import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import {
  PROJECT_INVOICE_QUERY,
  VOID_PROJECT_INVOICE,
  UPDATE_PROJECT_INVOICE,
} from '../../../graphql/projects'
import {
  BANK_ACCOUNTS_QUERY,
  SET_INVOICE_BANK_ACCOUNT,
  SET_INVOICE_PAYMENT_TYPE,
} from '../../../graphql/admin'
import { useTheme } from '../../../theme/ThemeContext'
import { apiErrMsg } from '../../../lib/apiError'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { TabBar } from '../../../components/ui/TabBar'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { ActivityLog } from '../../../components/ui/ActivityLog'
import { useToastStore } from '../../../store/toastStore'
import { InvoicePaymentForm } from './InvoicePaymentForm'
import { formatCurrency } from '../../../lib/format'
import { api } from '../../../lib/axios'
import {
  buildInvoiceHTML,
  type BankAccount as InvoiceBankAccount,
  type InvoiceLine,
} from '../../../lib/invoiceHtml'
import QRCode from 'qrcode'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

type BankAccount = InvoiceBankAccount

const TABS = [
  { key: 'lines', label: 'Lines' },
  { key: 'payments', label: 'Payments' },
  { key: 'pdf', label: 'PDF' },
  { key: 'activity', label: 'Activity' },
]

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'danger'> = {
  draft: 'neutral',
  issued: 'warning',
  sent: 'warning',
  paid: 'success',
  void: 'danger',
  cancelled: 'danger',
}

interface Payment {
  id: string
  paymentDate: string
  amount: number
  paymentReference?: string
  paymentMethod?: string
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [tab, setTab] = useState('lines')
  const [showVoid, setShowVoid] = useState(false)
  const [paymentFormOpen, setPaymentFormOpen] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editLines, setEditLines] = useState<
    { _key: string; id: string; description: string; qty: string; unitCost: string }[]
  >([])
  const [editDate, setEditDate] = useState('')

  const { data, loading, refetch } = useQuery(PROJECT_INVOICE_QUERY, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  })
  const { data: bankData } = useQuery(BANK_ACCOUNTS_QUERY, { fetchPolicy: 'cache-and-network' })
  const [setBankAccount, { loading: settingBank }] = useMutation(SET_INVOICE_BANK_ACCOUNT)
  const [setPaymentType, { loading: settingPaymentType }] = useMutation(SET_INVOICE_PAYMENT_TYPE)
  const [voidInvoice, { loading: voiding }] = useMutation(VOID_PROJECT_INVOICE)
  const [updateInvoice, { loading: saving }] = useMutation(UPDATE_PROJECT_INVOICE)

  const inv = data?.projectInvoice
  const bankAccounts: BankAccount[] =
    bankData?.bankAccounts?.filter((a: BankAccount) => a.isActive) ?? []
  const selectedBank = bankAccounts.find((a) => a.id === inv?.bankAccountId) ?? null

  useEffect(() => {
    if (tab !== 'pdf' || !inv?.verificationToken || qrDataUrl) return
    const baseUrl =
      (import.meta.env.VITE_APP_BASE_URL as string | undefined) ?? window.location.origin
    const url = `${baseUrl}/verify/${inv.verificationToken}`
    void QRCode.toDataURL(url, {
      width: 120,
      margin: 1,
      color: { dark: '#1a3c5e', light: '#ffffff' },
    }).then(setQrDataUrl)
  }, [tab, inv?.verificationToken])

  async function handleSetBank(bankAccountId: string | null) {
    try {
      await setBankAccount({ variables: { invoiceId: id, bankAccountId } })
      addToast({
        type: 'success',
        message: bankAccountId ? 'Bank account set' : 'Bank account removed',
      })
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleSetPaymentType(pt: string) {
    try {
      await setPaymentType({ variables: { invoiceId: id, paymentType: pt } })
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message })
    }
  }

  async function handleTransition(
    action: 'submit-for-review' | 'approve' | 'issue',
    successMsg: string,
  ) {
    setTransitioning(true)
    try {
      await api.post(`/projects/invoices/${id}/${action}`, {})
      addToast({ type: 'success', message: successMsg })
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Action failed') })
    } finally {
      setTransitioning(false)
    }
  }

  async function handleVoid() {
    await voidInvoice({
      variables: { id },
      refetchQueries: [{ query: PROJECT_INVOICE_QUERY, variables: { id } }],
    })
    addToast({ type: 'success', message: 'Invoice voided' })
    setShowVoid(false)
    void refetch()
  }

  function startEdit() {
    const lines = (inv?.lines ?? []) as InvoiceLine[]
    setEditLines(
      lines.map((l) => ({
        _key: l.id ?? String(Date.now() + Math.random()),
        id: l.id ?? '',
        description: l.description,
        qty: String(l.qty),
        unitCost: String(l.unitCost),
      })),
    )
    setEditDate(inv?.invoiceDate ?? '')
    setEditMode(true)
    setTab('lines')
  }

  function cancelEdit() {
    setEditMode(false)
    setEditLines([])
  }

  function addEditLine() {
    setEditLines((p) => [
      ...p,
      {
        _key: String(Date.now()),
        id: '',
        description: '',
        qty: '1',
        unitCost: '0',
      },
    ])
  }

  function removeEditLine(key: string) {
    setEditLines((p) => p.filter((l) => l._key !== key))
  }

  async function saveEdit() {
    try {
      await updateInvoice({
        variables: {
          id,
          invoiceDate: editDate || undefined,
          lines: editLines.map((l) => ({
            id: l.id || undefined,
            description: l.description,
            qty: parseFloat(l.qty) || 0,
            unitCost: parseFloat(l.unitCost) || 0,
          })),
        },
      })
      addToast({ type: 'success', message: 'Invoice updated' })
      setEditMode(false)
      void refetch()
    } catch (e: unknown) {
      addToast({ type: 'error', message: (e as Error).message ?? 'Save failed' })
    }
  }

  function handlePrint() {
    iframeRef.current?.contentWindow?.print()
  }

  if (loading || !inv)
    return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</div>

  const cur = (inv.currencyCode ?? 'IQD') as string
  const payments: Payment[] = inv.payments ?? []
  const totalPaid = payments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const whtApplies = inv.whtApplies ?? false
  const whtScenario = inv.whtScenario ?? null
  const whtAmt = whtApplies ? (inv.whtAmount ?? 0) : 0
  const cashTarget =
    whtApplies && whtScenario === 'client_withholds'
      ? Math.max(0, (inv.netPayable ?? 0) - whtAmt)
      : (inv.netPayable ?? 0)
  const outstanding = Math.max(0, cashTarget - totalPaid)
  const paidPct = cashTarget > 0 ? Math.min(100, (totalPaid / cashTarget) * 100) : 0
  const canPay = ['issued', 'sent', 'partial'].includes(inv.status)

  const paymentColumns: Column<Payment>[] = [
    {
      key: 'amount',
      header: 'Amount',
      mobilePrimary: true,
      render: (p) => (
        <span style={{ fontWeight: 600 }}>
          <AmountDisplay amount={p.amount} currency={cur} />
        </span>
      ),
    },
    {
      key: 'paymentDate',
      header: 'Date',
      mobileSecondary: true,
      render: (p) => (
        <span style={{ color: theme.textSecondary, fontSize: '13px' }}>{p.paymentDate}</span>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      mobilePriority: 1,
      render: (p) =>
        p.paymentMethod ? (
          <Badge variant="neutral">{p.paymentMethod.replace('_', ' ')}</Badge>
        ) : (
          <span style={{ color: theme.textMuted }}>—</span>
        ),
    },
    {
      key: 'paymentReference',
      header: 'Reference',
      mobilePriority: 2,
      render: (p) => (
        <span style={{ color: theme.textMuted, fontSize: '12px', fontFamily: 'monospace' }}>
          {p.paymentReference ?? '—'}
        </span>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1160px' }}>
      <PageHeader
        title={`Invoice ${inv.invoiceNumber}`}
        subtitle={`${inv.billingMethod} · ${inv.invoiceDate}`}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={STATUS_VARIANT[inv.status] ?? 'neutral'}>{inv.status}</Badge>
            {editMode ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  loading={saving}
                  onClick={() => void saveEdit()}
                >
                  Save Changes
                </Button>
                <Button variant="ghost" size="sm" onClick={cancelEdit}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={startEdit}>
                Edit
              </Button>
            )}
            {inv.status === 'draft' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  loading={transitioning}
                  onClick={() =>
                    handleTransition('submit-for-review', 'Invoice submitted for review')
                  }
                >
                  Submit for Review
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowVoid(true)
                  }}
                >
                  Void
                </Button>
              </>
            )}
            {inv.status === 'review' && (
              <Button
                variant="primary"
                size="sm"
                loading={transitioning}
                onClick={() => handleTransition('approve', 'Invoice approved')}
              >
                Approve
              </Button>
            )}
            {inv.status === 'approved' && (
              <Button
                variant="primary"
                size="sm"
                loading={transitioning}
                onClick={() => handleTransition('issue', 'Invoice issued')}
              >
                Issue Invoice
              </Button>
            )}
            {canPay && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setPaymentFormOpen(true)
                }}
              >
                Record Payment
              </Button>
            )}
          </div>
        }
      />

      {/* Summary KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginTop: '20px',
        }}
      >
        {[
          { label: 'Gross Total', value: inv.grossTotal },
          { label: 'Retention', value: inv.retentionAmount },
          { label: 'Net Payable', value: inv.netPayable },
        ].map(({ label, value }) => (
          <Card key={label} style={{ padding: '16px' }}>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
              {label}
            </div>
            <AmountDisplay amount={value} currency={cur} />
          </Card>
        ))}
      </div>

      {/* Payment type + bank account selectors (editable before issued) */}
      {!['issued', 'paid', 'void', 'cancelled'].includes(inv.status) ? (
        <Card
          style={{
            padding: '14px 16px',
            marginTop: '14px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '12px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
            Payment type:
          </span>
          <SearchableSelect
            value={inv.paymentType ?? 'wire_transfer'}
            onChange={(v) => void handleSetPaymentType(v)}
            disabled={settingPaymentType}
            options={[
              { value: 'wire_transfer', label: 'Wire Transfer' },
              { value: 'cash', label: 'Cash' },
            ]}
          />
          {(inv.paymentType ?? 'wire_transfer') === 'wire_transfer' && (
            <>
              <span style={{ fontSize: '12px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
                Bank account:
              </span>
              <SearchableSelect
                value={inv.bankAccountId ?? ''}
                onChange={(v) => void handleSetBank(v || null)}
                disabled={settingBank}
                placeholder="— None selected —"
                options={bankAccounts.map((a) => ({
                  value: a.id,
                  label: `${a.accountName} (${a.bankName} · ${a.currencyCode})`,
                }))}
              />
            </>
          )}
        </Card>
      ) : (
        <Card
          style={{
            padding: '14px 16px',
            marginTop: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <Badge variant="neutral">{inv.paymentType === 'cash' ? 'Cash' : 'Wire Transfer'}</Badge>
          {selectedBank && (
            <>
              <span style={{ fontSize: '13px', fontWeight: 500, color: theme.textPrimary }}>
                {selectedBank.accountName}
              </span>
              <span style={{ fontSize: '12px', color: theme.textMuted }}>
                {selectedBank.bankName}
              </span>
              {selectedBank.iban && (
                <span style={{ fontSize: '12px', color: theme.textMuted, fontFamily: 'monospace' }}>
                  {selectedBank.iban}
                </span>
              )}
            </>
          )}
        </Card>
      )}

      {/* Tab bar */}
      <div style={{ marginTop: '14px', borderBottom: `1px solid ${theme.border}` }}>
        <TabBar tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div style={{ marginTop: '16px' }}>
        {/* Lines tab */}
        {tab === 'lines' && (
          <Card style={{ padding: '20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>
                Invoice Lines
              </div>
              {editMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>Invoice date:</span>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => {
                      setEditDate(e.target.value)
                    }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: `1px solid ${theme.border}`,
                      background: theme.bgCanvas,
                      color: theme.textPrimary,
                      fontSize: '12px',
                    }}
                  />
                </div>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.bgSurfaceHover }}>
                  {(editMode
                    ? ['#', 'Description', 'Source', 'Qty', 'Unit Cost', 'Total (preview)', '']
                    : [
                        '#',
                        'Description',
                        'Source',
                        'Qty',
                        'Unit Cost',
                        'Subtotal',
                        'Margin',
                        'Total',
                      ]
                  ).map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontSize: '11px',
                        color: theme.textMuted,
                        fontWeight: 600,
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {editMode
                  ? editLines.map((el, idx) => {
                      const original = (inv.lines ?? ([] as InvoiceLine[])).find(
                        (l: InvoiceLine) => l.id === el.id,
                      )
                      const qty = parseFloat(el.qty) || 0
                      const unit = parseFloat(el.unitCost) || 0
                      const preview = qty * unit
                      const inpStyle: React.CSSProperties = {
                        width: '100%',
                        padding: '4px 8px',
                        borderRadius: '5px',
                        border: `1px solid ${theme.border}`,
                        background: theme.bgCanvas,
                        color: theme.textPrimary,
                        fontSize: '12px',
                        boxSizing: 'border-box',
                      }
                      return (
                        <tr key={el._key} style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <td
                            style={{
                              padding: '6px 12px',
                              color: theme.textMuted,
                              fontSize: '12px',
                            }}
                          >
                            {idx + 1}
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              style={{ ...inpStyle, minWidth: '200px' }}
                              value={el.description}
                              onChange={(e) => {
                                setEditLines((p) =>
                                  p.map((r) =>
                                    r._key === el._key ? { ...r, description: e.target.value } : r,
                                  ),
                                )
                              }}
                            />
                          </td>
                          <td style={{ padding: '6px 12px' }}>
                            <Badge variant="neutral">{original?.sourceType ?? 'manual'}</Badge>
                          </td>
                          <td style={{ padding: '6px 8px', width: '80px' }}>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              style={inpStyle}
                              value={el.qty}
                              onFocus={(e) => {
                                e.target.select()
                              }}
                              onChange={(e) => {
                                setEditLines((p) =>
                                  p.map((r) =>
                                    r._key === el._key ? { ...r, qty: e.target.value } : r,
                                  ),
                                )
                              }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px', width: '130px' }}>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              style={{ ...inpStyle, fontFamily: 'monospace' }}
                              value={el.unitCost}
                              onFocus={(e) => {
                                e.target.select()
                              }}
                              onChange={(e) => {
                                setEditLines((p) =>
                                  p.map((r) =>
                                    r._key === el._key ? { ...r, unitCost: e.target.value } : r,
                                  ),
                                )
                              }}
                            />
                          </td>
                          <td
                            style={{
                              padding: '6px 12px',
                              fontFamily: 'monospace',
                              fontSize: '13px',
                              color: theme.textPrimary,
                              fontWeight: 600,
                            }}
                          >
                            {preview.toLocaleString(undefined, { maximumFractionDigits: 2 })} {cur}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <button
                              onClick={() => {
                                removeEditLine(el._key)
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: theme.danger ?? '#ef4444',
                                fontSize: '16px',
                                lineHeight: 1,
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                              title="Remove line"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  : (inv.lines ?? []).map((l: InvoiceLine) => (
                      <tr key={l.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td
                          style={{ padding: '8px 12px', color: theme.textMuted, fontSize: '12px' }}
                        >
                          {l.lineNumber}
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            color: theme.textPrimary,
                            fontSize: '13px',
                          }}
                        >
                          {l.description}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <Badge variant="neutral">{l.sourceType}</Badge>
                        </td>
                        <td
                          style={{
                            padding: '8px 12px',
                            fontFamily: 'monospace',
                            fontSize: '13px',
                            color: theme.textSecondary,
                          }}
                        >
                          {l.qty}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <AmountDisplay amount={l.unitCost} currency={cur} size="sm" />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <AmountDisplay amount={l.subtotal} currency={cur} size="sm" />
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '12px', color: theme.success }}>
                          {l.marginPct}%
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                          <AmountDisplay amount={l.lineTotal} currency={cur} size="sm" />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {editMode && (
              <>
                <div style={{ marginTop: '10px' }}>
                  <button
                    onClick={addEditLine}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '5px 12px',
                      border: `1px dashed ${theme.border}`,
                      borderRadius: '6px',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: theme.accent,
                    }}
                  >
                    + Add Line
                  </button>
                </div>
                <div
                  style={{
                    marginTop: '10px',
                    padding: '10px 12px',
                    background: theme.bgSurfaceHover,
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: theme.textMuted,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>⚠</span>
                  <span>
                    Editing recalculates totals from qty × unit cost. Margin percentage is
                    preserved; net payable is recalculated automatically.
                  </span>
                </div>
              </>
            )}
          </Card>
        )}

        {/* Payments tab */}
        {tab === 'payments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Running total + progress */}
            <Card style={{ padding: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px',
                }}
              >
                <div style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 500 }}>
                  {formatCurrency(totalPaid, cur)} paid of {formatCurrency(inv.netPayable, cur)}
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: outstanding > 0 ? theme.accent : theme.success,
                  }}
                >
                  {outstanding > 0
                    ? `${formatCurrency(outstanding, cur)} outstanding`
                    : 'Fully paid'}
                </div>
              </div>
              <div
                style={{
                  height: '8px',
                  background: theme.border,
                  borderRadius: '999px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${paidPct}%`,
                    background: paidPct >= 100 ? theme.success : theme.accent,
                    borderRadius: '999px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
              {canPay && (
                <div style={{ marginTop: '12px' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setPaymentFormOpen(true)
                    }}
                  >
                    Record Payment
                  </Button>
                </div>
              )}
            </Card>

            {/* Payments table */}
            {payments.length > 0 ? (
              <Card style={{ padding: '20px' }}>
                <div
                  style={{
                    fontWeight: 600,
                    color: theme.textPrimary,
                    marginBottom: '12px',
                    fontSize: '14px',
                  }}
                >
                  Payment History
                </div>
                <Table columns={paymentColumns} data={payments} rowKey="id" />
              </Card>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: theme.textMuted,
                  fontSize: '13px',
                }}
              >
                No payments recorded yet
              </div>
            )}
          </div>
        )}

        {/* PDF tab */}
        {tab === 'pdf' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <Button variant="primary" size="sm" onClick={handlePrint}>
                Print / Save as PDF
              </Button>
            </div>
            <div
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#f5f5f5',
              }}
            >
              <iframe
                ref={iframeRef}
                srcDoc={buildInvoiceHTML(
                  inv,
                  selectedBank,
                  inv.paymentType ?? 'wire_transfer',
                  inv.companyStampImage,
                  qrDataUrl,
                )}
                style={{ width: '100%', height: '820px', border: 'none', display: 'block' }}
                title={`Invoice ${inv.invoiceNumber}`}
              />
            </div>
          </div>
        )}

        {/* Activity tab */}
        {tab === 'activity' && id && <ActivityLog recordId={id} tableName="project_invoices" />}
      </div>

      <ConfirmDialog
        open={showVoid}
        title="Void Invoice"
        message="This will permanently void the invoice. This cannot be undone."
        confirmLabel="Void Invoice"
        variant="danger"
        onConfirm={handleVoid}
        onCancel={() => {
          setShowVoid(false)
        }}
        loading={voiding}
      />

      <InvoicePaymentForm
        open={paymentFormOpen}
        invoiceId={id ?? ''}
        invoiceNumber={inv.invoiceNumber}
        grossTotal={inv.grossTotal ?? 0}
        retentionAmount={inv.retentionAmount ?? 0}
        netPayable={inv.netPayable ?? 0}
        totalPaid={totalPaid}
        currency={cur}
        whtApplies={inv.whtApplies ?? false}
        whtScenario={inv.whtScenario ?? null}
        whtAmount={inv.whtAmount ?? 0}
        onClose={() => {
          setPaymentFormOpen(false)
        }}
        onSuccess={() => {
          setPaymentFormOpen(false)
          refetch()
        }}
      />
    </div>
  )
}
