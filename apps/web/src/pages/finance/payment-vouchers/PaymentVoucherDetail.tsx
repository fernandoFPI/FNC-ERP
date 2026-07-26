import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@apollo/client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  PAYMENT_VOUCHER_QUERY,
  CREATE_PAYMENT_VOUCHER,
  UPDATE_PAYMENT_VOUCHER,
  APPROVE_PAYMENT_VOUCHER,
  MARK_PAYMENT_VOUCHER_PAID,
  PAYMENT_VOUCHERS_QUERY,
  JOURNAL_ENTRIES_QUERY,
} from '../../../graphql/finance'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { useToastStore } from '../../../store/toastStore'
import type { VoucherPrintLine, VoucherPrintJournal } from '../../../lib/voucherHtml'
import { buildPaymentVoucherHTML } from '../../../lib/voucherHtml'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoucherLine {
  id?: string
  statement: string
  acct_1: string
  acct_2: string
  acct_3: string
  acct_4: string
  acct_5: string
  amount_iqd: string
  amount_usd: string
  sequence: number
}

interface LinkedPO {
  po_id: string
  po_number: string
  vendor_name?: string
  status?: string
  total_amount?: string
  currency_code?: string
}

interface JournalSummary {
  id: string
  reference: string
  entry_date: string
  status: string
  description?: string
  source_type?: string
  total_debit?: string
  total_credit?: string
  payment_currency?: string
  audited_at?: string
  linked_pos?: LinkedPO[]
}

interface VoucherDetail {
  id: string
  voucher_number: string
  voucher_date: string
  received_from: string
  reference_to?: string
  bank_account_fund?: string
  receiver_name?: string
  notes?: string
  status: string
  total_amount_iqd: string
  total_amount_usd: string
  created_by_email?: string
  cashier_email?: string
  auditor_email?: string
  audited_at?: string
  pv_template_image?: string | null
  lines: VoucherLine[]
  journals: JournalSummary[]
}

interface FormState {
  voucher_date: string
  received_from: string
  reference_to: string
  bank_account_fund: string
  receiver_name: string
  notes: string
}

const EMPTY_LINE = (): VoucherLine => ({
  statement: '',
  acct_1: '',
  acct_2: '',
  acct_3: '',
  acct_4: '',
  acct_5: '',
  amount_iqd: '',
  amount_usd: '',
  sequence: 0,
})

const STATUS_VARIANT: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  draft: 'warning',
  approved: 'info',
  paid: 'success',
  cancelled: 'danger',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentVoucherDetail() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [form, setForm] = useState<FormState>({
    voucher_date: new Date().toISOString().split('T')[0],
    received_from: '',
    reference_to: '',
    bank_account_fund: '',
    receiver_name: '',
    notes: '',
  })
  const [lines, setLines] = useState<VoucherLine[]>([EMPTY_LINE()])
  const [linkedJournalIds, setLinkedJournalIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showPaidDialog, setShowPaidDialog] = useState(false)
  const [journalSearch, setJournalSearch] = useState('')
  const [tab, setTab] = useState<'details' | 'preview'>('details')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Queries
  const {
    data: voucherData,
    loading: loadingVoucher,
    refetch,
  } = useQuery<{ paymentVoucher: VoucherDetail }>(PAYMENT_VOUCHER_QUERY, {
    variables: { id },
    skip: isNew || !id,
    fetchPolicy: 'cache-and-network',
  })
  const { data: journalsData } = useQuery<{ journalEntries: JournalSummary[] }>(
    JOURNAL_ENTRIES_QUERY,
    {
      variables: { status: 'posted' },
      fetchPolicy: 'cache-and-network',
    },
  )

  // Mutations
  const [createVoucher, { loading: creating }] = useMutation(CREATE_PAYMENT_VOUCHER)
  const [updateVoucher, { loading: updating }] = useMutation(UPDATE_PAYMENT_VOUCHER)
  const [approveVoucher, { loading: approving }] = useMutation(APPROVE_PAYMENT_VOUCHER)
  const [markVoucherPaid, { loading: markingPaid }] = useMutation(MARK_PAYMENT_VOUCHER_PAID)

  // Populate form from loaded voucher
  const voucher: VoucherDetail | undefined = voucherData?.paymentVoucher

  useEffect(() => {
    if (!voucher) return
    setForm({
      voucher_date: voucher.voucher_date,
      received_from: voucher.received_from,
      reference_to: voucher.reference_to ?? '',
      bank_account_fund: voucher.bank_account_fund ?? '',
      receiver_name: voucher.receiver_name ?? '',
      notes: voucher.notes ?? '',
    })
    setLines(
      voucher.lines.length > 0
        ? voucher.lines.map((l) => ({
            ...l,
            statement: l.statement ?? '',
            acct_1: l.acct_1 ?? '',
            acct_2: l.acct_2 ?? '',
            acct_3: l.acct_3 ?? '',
            acct_4: l.acct_4 ?? '',
            acct_5: l.acct_5 ?? '',
            amount_iqd: l.amount_iqd ?? '',
            amount_usd: l.amount_usd ?? '',
          }))
        : [EMPTY_LINE()],
    )
    setLinkedJournalIds(new Set(voucher.journals.map((j) => j.id)))
  }, [voucher])

  // Computed totals
  const totalIqd = lines.reduce((s, l) => s + (parseFloat(l.amount_iqd) || 0), 0)
  const totalUsd = lines.reduce((s, l) => s + (parseFloat(l.amount_usd) || 0), 0)

  const isReadOnly =
    !isNew &&
    (voucher?.status === 'approved' ||
      voucher?.status === 'paid' ||
      voucher?.status === 'cancelled')

  // Build input from current state
  function buildInput() {
    return {
      voucher_date: form.voucher_date,
      received_from: form.received_from,
      reference_to: form.reference_to || null,
      bank_account_fund: form.bank_account_fund || null,
      receiver_name: form.receiver_name || null,
      notes: form.notes || null,
      lines: lines
        .filter((l) => l.statement.trim() !== '')
        .map((l, i) => ({
          statement: l.statement,
          acct_1: l.acct_1 || null,
          acct_2: l.acct_2 || null,
          acct_3: l.acct_3 || null,
          acct_4: l.acct_4 || null,
          acct_5: l.acct_5 || null,
          amount_iqd: parseFloat(l.amount_iqd) || 0,
          amount_usd: parseFloat(l.amount_usd) || 0,
          sequence: i + 1,
        })),
      journal_ids: Array.from(linkedJournalIds),
    }
  }

  async function handleSave() {
    if (!form.received_from.trim()) {
      addToast({ type: 'error', message: '"Received From" is required' })
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        const { data } = await createVoucher({
          variables: { input: buildInput() },
          refetchQueries: [{ query: PAYMENT_VOUCHERS_QUERY }],
        })
        addToast({
          type: 'success',
          message: `Voucher ${data.createPaymentVoucher.voucher_number} created`,
        })
        navigate(`/finance/payment-vouchers/${data.createPaymentVoucher.id}`)
      } else {
        const effectiveId = voucher?.id ?? id
        if (!effectiveId) {
          addToast({ type: 'error', message: 'Voucher ID not found — please reload the page' })
          return
        }
        await updateVoucher({
          variables: { id: effectiveId, input: buildInput() },
          refetchQueries: [{ query: PAYMENT_VOUCHER_QUERY, variables: { id: effectiveId } }],
        })
        addToast({ type: 'success', message: 'Voucher saved' })
        refetch()
      }
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove() {
    try {
      await approveVoucher({
        variables: { id },
        refetchQueries: [{ query: PAYMENT_VOUCHER_QUERY, variables: { id } }],
      })
      addToast({ type: 'success', message: 'Voucher approved' })
      setShowApproveDialog(false)
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  async function handleMarkPaid() {
    try {
      await markVoucherPaid({
        variables: { id },
        refetchQueries: [{ query: PAYMENT_VOUCHER_QUERY, variables: { id } }],
      })
      addToast({ type: 'success', message: 'Voucher marked as paid' })
      setShowPaidDialog(false)
      refetch()
    } catch (err) {
      addToast({ type: 'error', message: (err as Error).message })
    }
  }

  function handlePrint() {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print()
      return
    }
    const win = window.open('', '_blank', 'width=1100,height=850')
    if (win) {
      win.document.write(previewHtml)
      win.document.close()
      setTimeout(() => {
        win.print()
      }, 600)
    }
  }

  // Line helpers
  const updateLine = useCallback((idx: number, field: keyof VoucherLine, value: string) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)))
  }, [])

  function addLine() {
    setLines((prev) => [...prev, EMPTY_LINE()])
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
  }

  function toggleJournal(jid: string) {
    if (isReadOnly) return
    const next = new Set(linkedJournalIds)
    if (next.has(jid)) next.delete(jid)
    else next.add(jid)
    setLinkedJournalIds(next)

    // Auto-fill payment lines from the updated journal selection
    const selected = allJournals.filter((j) => next.has(j.id))
    if (selected.length === 0) {
      setLines([EMPTY_LINE()])
    } else {
      setLines(
        selected.map((j, idx) => {
          const isUsd = (j.payment_currency ?? 'IQD') !== 'IQD'
          const amount = j.total_debit ? String(parseFloat(j.total_debit).toFixed(2)) : ''
          return {
            id: undefined,
            statement: j.description || j.reference,
            acct_1: '',
            acct_2: '',
            acct_3: '',
            acct_4: '',
            acct_5: '',
            amount_iqd: isUsd ? '' : amount,
            amount_usd: isUsd ? amount : '',
            sequence: idx + 1,
          }
        }),
      )
    }
  }

  // Filtered journals for selector
  const allJournals: JournalSummary[] = journalsData?.journalEntries ?? []
  const filteredJournals = journalSearch.trim()
    ? allJournals.filter(
        (j) =>
          j.reference.toLowerCase().includes(journalSearch.toLowerCase()) ||
          (j.description ?? '').toLowerCase().includes(journalSearch.toLowerCase()),
      )
    : allJournals

  // Active journals (linked to this voucher)
  const activeJournals = allJournals.filter((j) => linkedJournalIds.has(j.id))

  // Live preview HTML — recomputes whenever form, lines, or journal selection changes
  const previewHtml = useMemo(() => {
    const printLines: VoucherPrintLine[] = lines.map((l) => ({
      statement: l.statement,
      acct_1: l.acct_1 || undefined,
      acct_2: l.acct_2 || undefined,
      acct_3: l.acct_3 || undefined,
      acct_4: l.acct_4 || undefined,
      acct_5: l.acct_5 || undefined,
      amount_iqd: parseFloat(l.amount_iqd) || 0,
      amount_usd: parseFloat(l.amount_usd) || 0,
    }))
    const linkedJournals = allJournals.filter((j) => linkedJournalIds.has(j.id))
    const printJournals: VoucherPrintJournal[] = linkedJournals.map((j) => ({
      reference: j.reference,
      entry_date: j.entry_date,
      description: j.description,
    }))
    return buildPaymentVoucherHTML({
      voucher_number: voucher?.voucher_number ?? 'DRAFT',
      voucher_date: form.voucher_date,
      received_from: form.received_from,
      reference_to: form.reference_to || undefined,
      bank_account_fund: form.bank_account_fund || undefined,
      receiver_name: form.receiver_name || undefined,
      total_amount_iqd: totalIqd,
      total_amount_usd: totalUsd,
      lines: printLines,
      journals: printJournals,
      cashier_email: voucher?.cashier_email,
      auditor_email: voucher?.auditor_email,
      pvTemplateImage: voucher?.pv_template_image ?? null,
    })
  }, [form, lines, linkedJournalIds, allJournals, voucher, totalIqd, totalUsd])

  if (loadingVoucher && !voucher) {
    return <div style={{ padding: '24px', color: theme.textMuted }}>Loading…</div>
  }

  // Style helpers
  const inputStyle: React.CSSProperties = {
    background: isReadOnly ? theme.bgSurface : theme.bgCanvas,
    border: `1px solid ${theme.border}`,
    borderRadius: '6px',
    color: theme.textPrimary,
    padding: '6px 10px',
    fontSize: '13px',
    width: '100%',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: theme.textMuted,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '4px',
    display: 'block',
  }

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1400px' }}>
      <PageHeader
        title={isNew ? 'New Payment Voucher' : (voucher?.voucher_number ?? 'Payment Voucher')}
        subtitle={isNew ? 'Create payment voucher' : (voucher?.voucher_date ?? '')}
        backPath="/finance/payment-vouchers"
        status={
          !isNew && voucher ? (
            <Badge variant={STATUS_VARIANT[voucher.status] ?? 'neutral'}>{voucher.status}</Badge>
          ) : undefined
        }
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {!isReadOnly && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                loading={saving || creating || updating}
              >
                {isNew ? 'Create Voucher' : 'Save Changes'}
              </Button>
            )}
            {!isNew && voucher?.status === 'draft' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowApproveDialog(true)
                }}
              >
                Approve
              </Button>
            )}
            {!isNew && voucher?.status === 'approved' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowPaidDialog(true)
                }}
              >
                Mark Paid
              </Button>
            )}
            {!isNew && (
              <Button variant="ghost" size="sm" onClick={handlePrint}>
                Print / Save PDF
              </Button>
            )}
          </div>
        }
      />

      {/* Tab bar */}
      {!isNew && (
        <div
          style={{
            display: 'flex',
            gap: '2px',
            borderBottom: `1px solid ${theme.border}`,
            marginTop: '12px',
          }}
        >
          {(['details', 'preview'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
              }}
              style={{
                padding: '8px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? theme.accent : theme.textMuted,
                borderBottom: tab === t ? `2px solid ${theme.accent}` : '2px solid transparent',
                textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Audit info bar */}
      {voucher?.audited_at && tab === 'details' && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 14px',
            background: theme.bgSurface,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            display: 'flex',
            gap: '20px',
            fontSize: '12px',
            color: theme.textSecondary,
          }}
        >
          <span>
            Auditor: <strong>{voucher.auditor_email ?? '—'}</strong>
          </span>
          <span>
            Audited at: <strong>{new Date(voucher.audited_at).toLocaleString()}</strong>
          </span>
          {voucher.cashier_email && (
            <span>
              Cashier: <strong>{voucher.cashier_email}</strong>
            </span>
          )}
        </div>
      )}

      {/* Preview tab */}
      {tab === 'preview' && (
        <div style={{ marginTop: '16px' }}>
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
              srcDoc={previewHtml}
              style={{ width: '100%', height: '820px', border: 'none', display: 'block' }}
              title={`Payment Voucher ${voucher?.voucher_number ?? ''}`}
            />
          </div>
        </div>
      )}

      {/* Details tab */}
      {(tab === 'details' || isNew) && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 400px',
            gap: '16px',
            marginTop: '16px',
            alignItems: 'start',
          }}
        >
          {/* Main column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header fields */}
            <Card>
              <div style={{ padding: '16px', borderBottom: `1px solid ${theme.border}` }}>
                <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>
                  Voucher Details
                </span>
              </div>
              <div
                style={{
                  padding: '16px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '14px',
                }}
              >
                <div>
                  <label style={labelStyle}>Date *</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={form.voucher_date}
                    readOnly={isReadOnly}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, voucher_date: e.target.value }))
                    }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Received From (ادفعوا لأمر) *</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={form.received_from}
                    readOnly={isReadOnly}
                    placeholder="Supplier / employee name"
                    onChange={(e) => {
                      setForm((f) => ({ ...f, received_from: e.target.value }))
                    }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Reference To (وذلك عن)</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={form.reference_to}
                    readOnly={isReadOnly}
                    placeholder="Invoice / contract reference"
                    onChange={(e) => {
                      setForm((f) => ({ ...f, reference_to: e.target.value }))
                    }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Bank Account / Fund (حسابات البنك/الصندوق)</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={form.bank_account_fund}
                    readOnly={isReadOnly}
                    placeholder="Account name or fund"
                    onChange={(e) => {
                      setForm((f) => ({ ...f, bank_account_fund: e.target.value }))
                    }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Receiver Name (المستلم)</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={form.receiver_name}
                    readOnly={isReadOnly}
                    placeholder="Name of person receiving payment"
                    onChange={(e) => {
                      setForm((f) => ({ ...f, receiver_name: e.target.value }))
                    }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={form.notes}
                    readOnly={isReadOnly}
                    placeholder="Optional internal note"
                    onChange={(e) => {
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }}
                  />
                </div>
              </div>
            </Card>

            {/* Lines table */}
            <Card>
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: `1px solid ${theme.border}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>
                  Payment Lines
                </span>
                {!isReadOnly && (
                  <Button variant="ghost" size="sm" onClick={addLine}>
                    + Add Line
                  </Button>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: theme.bgSurface }}>
                      {[
                        'Acct 1',
                        'Acct 2',
                        'Acct 3',
                        'Acct 4',
                        'Acct 5',
                        'Statement (البيان)',
                        'Amount IQD',
                        'Amount USD',
                        '',
                      ].map((h) => (
                        <th
                          key={h}
                          style={{
                            padding: '8px 8px',
                            textAlign: 'left',
                            fontWeight: 600,
                            fontSize: '11px',
                            color: theme.textMuted,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            borderBottom: `1px solid ${theme.border}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                        {(['acct_1', 'acct_2', 'acct_3', 'acct_4', 'acct_5'] as const).map((f) => (
                          <td key={f} style={{ padding: '6px 6px' }}>
                            <input
                              type="text"
                              readOnly={isReadOnly}
                              value={line[f]}
                              maxLength={12}
                              style={{
                                ...inputStyle,
                                width: '64px',
                                textAlign: 'center',
                                fontFamily: 'monospace',
                                fontSize: '11px',
                              }}
                              onChange={(e) => {
                                updateLine(idx, f, e.target.value)
                              }}
                            />
                          </td>
                        ))}
                        <td style={{ padding: '6px 6px' }}>
                          <input
                            type="text"
                            readOnly={isReadOnly}
                            value={line.statement}
                            placeholder="Description…"
                            style={{ ...inputStyle, minWidth: '200px' }}
                            onChange={(e) => {
                              updateLine(idx, 'statement', e.target.value)
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <input
                            type="number"
                            readOnly={isReadOnly}
                            value={line.amount_iqd}
                            min="0"
                            step="0.01"
                            style={{
                              ...inputStyle,
                              width: '110px',
                              textAlign: 'right',
                              fontFamily: 'monospace',
                            }}
                            onChange={(e) => {
                              updateLine(idx, 'amount_iqd', e.target.value)
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <input
                            type="number"
                            readOnly={isReadOnly}
                            value={line.amount_usd}
                            min="0"
                            step="0.01"
                            style={{
                              ...inputStyle,
                              width: '100px',
                              textAlign: 'right',
                              fontFamily: 'monospace',
                            }}
                            onChange={(e) => {
                              updateLine(idx, 'amount_usd', e.target.value)
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          {!isReadOnly && lines.length > 1 && (
                            <button
                              onClick={() => {
                                removeLine(idx)
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: theme.danger ?? '#e53e3e',
                                fontSize: '16px',
                                lineHeight: 1,
                              }}
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}

                    {/* Totals row */}
                    <tr style={{ background: theme.bgSurface, fontWeight: 600 }}>
                      <td colSpan={5}></td>
                      <td
                        style={{
                          padding: '8px',
                          fontSize: '12px',
                          color: theme.textSecondary,
                          textAlign: 'right',
                          paddingRight: '16px',
                        }}
                      >
                        Total
                      </td>
                      <td style={{ padding: '8px', fontFamily: 'monospace', textAlign: 'right' }}>
                        <AmountDisplay amount={totalIqd} currency="IQD" />
                      </td>
                      <td style={{ padding: '8px', fontFamily: 'monospace', textAlign: 'right' }}>
                        {totalUsd > 0 ? (
                          <AmountDisplay amount={totalUsd} currency="USD" />
                        ) : (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Linked journals detail (when journals are selected) */}
            {activeJournals.length > 0 && (
              <Card>
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}` }}>
                  <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>
                    Linked Journal Entries
                  </span>
                </div>
                <div style={{ padding: '12px' }}>
                  {activeJournals.map((j) => (
                    <div
                      key={j.id}
                      style={{
                        marginBottom: '12px',
                        padding: '12px',
                        background: theme.bgSurface,
                        borderRadius: '8px',
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '6px',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              color: theme.accent,
                              fontWeight: 600,
                              marginRight: '10px',
                            }}
                          >
                            {j.reference}
                          </span>
                          <span style={{ fontSize: '12px', color: theme.textMuted }}>
                            {j.entry_date}
                          </span>
                          {j.audited_at && (
                            <span style={{ marginLeft: '8px' }}>
                              <Badge variant="success">Audited</Badge>
                            </span>
                          )}
                        </div>
                        <Badge variant={j.status === 'posted' ? 'success' : 'warning'}>
                          {j.status}
                        </Badge>
                      </div>
                      {j.description && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: theme.textSecondary,
                            marginBottom: '6px',
                          }}
                        >
                          {j.description}
                        </div>
                      )}
                      {j.linked_pos && j.linked_pos.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {j.linked_pos.map((po) => (
                            <span
                              key={po.po_id}
                              style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                background: theme.bgCanvas,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '4px',
                                color: theme.textSecondary,
                              }}
                            >
                              {po.po_number}
                              {po.vendor_name ? ` – ${po.vendor_name}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Right column: journal selector */}
          <div style={{ position: 'sticky', top: '16px' }}>
            <Card>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${theme.border}` }}>
                <span style={{ fontWeight: 600, color: theme.textPrimary, fontSize: '14px' }}>
                  Link Journal Entries
                </span>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                  Posted journals to include in this voucher
                </div>
              </div>

              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${theme.border}` }}>
                <input
                  type="search"
                  placeholder="Search journals…"
                  value={journalSearch}
                  style={{ ...inputStyle, width: '100%' }}
                  onChange={(e) => {
                    setJournalSearch(e.target.value)
                  }}
                />
              </div>

              <div style={{ maxHeight: '460px', overflowY: 'auto' }}>
                {filteredJournals.length === 0 ? (
                  <div
                    style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: theme.textMuted,
                      fontSize: '13px',
                    }}
                  >
                    No posted journals found
                  </div>
                ) : (
                  filteredJournals.map((j) => {
                    const checked = linkedJournalIds.has(j.id)
                    return (
                      <label
                        key={j.id}
                        style={{
                          display: 'flex',
                          gap: '10px',
                          alignItems: 'flex-start',
                          padding: '10px 14px',
                          cursor: isReadOnly ? 'default' : 'pointer',
                          borderBottom: `1px solid ${theme.border}`,
                          background: checked ? theme.bgSurface : 'transparent',
                          transition: 'background 0.15s',
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={checked}
                          onChange={() => !isReadOnly && toggleJournal(j.id)}
                          style={{ marginTop: '3px', accentColor: theme.accent, flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: theme.accent,
                              }}
                            >
                              {j.reference}
                            </span>
                            <span style={{ fontSize: '11px', color: theme.textMuted }}>
                              {j.entry_date}
                            </span>
                            {j.audited_at && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  background: '#dcf5e7',
                                  color: '#166534',
                                  borderRadius: '4px',
                                }}
                              >
                                audited
                              </span>
                            )}
                          </div>
                          {j.description && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: theme.textSecondary,
                                marginTop: '2px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '260px',
                              }}
                            >
                              {j.description}
                            </div>
                          )}
                          {j.linked_pos && j.linked_pos.length > 0 && (
                            <div
                              style={{ fontSize: '10px', color: theme.textMuted, marginTop: '2px' }}
                            >
                              POs: {j.linked_pos.map((p) => p.po_number).join(', ')}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })
                )}
              </div>

              <div
                style={{
                  padding: '10px 14px',
                  borderTop: `1px solid ${theme.border}`,
                  fontSize: '12px',
                  color: theme.textMuted,
                }}
              >
                {linkedJournalIds.size} journal{linkedJournalIds.size !== 1 ? 's' : ''} selected
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={showApproveDialog}
        title="Approve Payment Voucher"
        message="Approve this payment voucher? This marks it as auditor-approved and ready for payment."
        confirmLabel="Approve"
        variant="primary"
        onConfirm={handleApprove}
        onCancel={() => {
          setShowApproveDialog(false)
        }}
        loading={approving}
      />
      <ConfirmDialog
        open={showPaidDialog}
        title="Mark as Paid"
        message="Confirm that this payment has been disbursed by the cashier?"
        confirmLabel="Mark Paid"
        variant="primary"
        onConfirm={handleMarkPaid}
        onCancel={() => {
          setShowPaidDialog(false)
        }}
        loading={markingPaid}
      />
    </div>
  )
}
