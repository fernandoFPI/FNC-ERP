import { tl } from '../../i18n'
import i18n from '../../i18n'
import { Trans, useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'
import { Select } from './Select'
import { AmountDisplay } from './AmountDisplay'

export type BillingMethod = 'fixed' | 'milestone' | 'time_material' | 'percentage'

export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  tax_pct?: number
}

export interface InvoiceBuilderResult {
  billing_method: BillingMethod
  lines: InvoiceLineItem[]
  notes?: string
  due_date?: string
  discount_pct: number
  discount_amount: number
  wht_applies: boolean
  wht_scenario: 'client_withholds' | 'fnc_pays' | null
  wht_rate: number
}

interface Props {
  open: boolean
  projectId: string
  projectName: string
  contractAmount?: number
  currency?: string
  milestones?: { id: string; name: string; amount: number; status: string }[]
  onConfirm: (result: InvoiceBuilderResult) => Promise<void>
  onClose: () => void
}

const STEPS = ['Billing Method', 'Line Items', 'Preview', 'Confirm'] as const
type Step = 0 | 1 | 2 | 3

const METHOD_OPTIONS: { value: BillingMethod; label: string; description: string }[] = [
  {
    value: 'fixed',
    get label() { return i18n.t('fin.invBuilder.fixedPrice', { defaultValue: "Fixed Price" }) },
    get description() { return i18n.t('fin.invBuilder.invoiceAFixedAmountForThe', { defaultValue: "Invoice a fixed amount for the entire project or a phase" }) },
  },
  {
    value: 'milestone',
    get label() { return i18n.t('fin.invBuilder.milestone', { defaultValue: "Milestone" }) },
    get description() { return i18n.t('fin.invBuilder.billUponReachingSpecificProjectMilestones', { defaultValue: "Bill upon reaching specific project milestones" }) },
  },
  {
    value: 'time_material',
    get label() { return i18n.t('fin.invBuilder.timeMaterial', { defaultValue: "Time & Material" }) },
    get description() { return i18n.t('fin.invBuilder.billBasedOnRecordedHoursAnd', { defaultValue: "Bill based on recorded hours and materials used" }) },
  },
  {
    value: 'percentage',
    get label() { return i18n.t('fin.invBuilder.percentageOfContract', { defaultValue: "Percentage of Contract" }) },
    get description() { return i18n.t('fin.invBuilder.invoiceAPercentageOfTheTotal', { defaultValue: "Invoice a percentage of the total contract value" }) },
  },
]

export function InvoiceBuilder({
  open,
  projectName,
  contractAmount = 0,
  currency = 'IQD',
  milestones = [],
  onConfirm,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [step, setStep] = useState<Step>(0)
  const [method, setMethod] = useState<BillingMethod>('fixed')
  const [lines, setLines] = useState<InvoiceLineItem[]>([])
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [percentage, setPercentage] = useState(100)
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<string[]>([])
  const [discountPct, setDiscountPct] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [whtApplies, setWhtApplies] = useState(false)
  const [whtScenario, setWhtScenario] = useState<'client_withholds' | 'fnc_pays'>(
    'client_withholds',
  )
  const [whtRatePct, setWhtRatePct] = useState('3')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setStep(0)
    setMethod('fixed')
    setLines([])
    setNotes('')
    setDueDate('')
    setPercentage(100)
    setSelectedMilestoneIds([])
    setDiscountPct(0)
    setDiscountAmount(0)
    setWhtApplies(false)
    setWhtScenario('client_withholds')
    setWhtRatePct('3')
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function addLine() {
    setLines((l) => [
      ...l,
      { id: `l-${Date.now()}`, description: '', quantity: 1, unit_price: 0, tax_pct: 0 },
    ])
  }

  function removeLine(id: string) {
    setLines((l) => l.filter((x) => x.id !== id))
  }

  function updateLine(id: string, patch: Partial<InvoiceLineItem>) {
    setLines((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  }

  function buildLinesFromMethod(): InvoiceLineItem[] {
    if (method === 'fixed') return lines
    if (method === 'percentage') {
      return [
        {
          id: 'pct-line',
          description: t('fin.invBuilder.ofContractValue', { percentage }),
          quantity: 1,
          unit_price: (contractAmount * percentage) / 100,
          tax_pct: 0,
        },
      ]
    }
    if (method === 'milestone') {
      return milestones
        .filter((m) => selectedMilestoneIds.includes(m.id))
        .map((m) => ({
          id: m.id,
          description: t('fin.invBuilder.milestone2', { name: m.name }),
          quantity: 1,
          unit_price: m.amount,
          tax_pct: 0,
        }))
    }
    return lines
  }

  const previewLines = buildLinesFromMethod()
  const subtotal = previewLines.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const tax = previewLines.reduce(
    (s, l) => s + l.quantity * l.unit_price * ((l.tax_pct ?? 0) / 100),
    0,
  )
  const grossTotal = subtotal + tax
  const discountValue = discountAmount + (grossTotal * discountPct) / 100
  const total = Math.max(0, grossTotal - discountValue)
  const whtRate = whtApplies ? parseFloat(whtRatePct || '0') / 100 : 0
  const whtAmount = whtApplies ? Math.round(total * whtRate * 100) / 100 : 0

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      await onConfirm({
        billing_method: method,
        lines: previewLines,
        notes: notes || undefined,
        due_date: dueDate || undefined,
        discount_pct: discountPct,
        discount_amount: discountAmount,
        wht_applies: whtApplies,
        wht_scenario: whtApplies ? whtScenario : null,
        wht_rate: whtRate,
      })
      handleClose()
    } catch (err) {
      const msg = (err as { message?: string } | null | undefined)?.message ?? t('fin.invBuilder.failedToCreateInvoice')
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const canProceed = (() => {
    if (step === 0) return true
    if (step === 1) {
      if (method === 'milestone') return selectedMilestoneIds.length > 0
      if (method === 'percentage') return percentage > 0 && percentage <= 100
      return lines.length > 0 && lines.every((l) => l.description && l.unit_price >= 0)
    }
    return true
  })()

  const inputStyle: React.CSSProperties = {
    background: theme.bgSurface,
    color: theme.textPrimary,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '13px',
    width: '100%',
    fontFamily: 'inherit',
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('fin.invBuilder.invoiceBuilder', { projectName })}
      size="xl"
      closeOnBackdrop={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '580px' }}>
        {/* Step indicator */}
        <div
          style={{
            display: 'flex',
            borderBottom: `1px solid ${theme.border}`,
            background: theme.bgSurfaceHover,
          }}
        >
          {STEPS.map((label, i) => {
            const isActive = i === step
            const isPast = i < step
            return (
              <div
                key={label}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  textAlign: 'center',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? theme.accent : isPast ? theme.success : theme.textMuted,
                  borderBottom: isActive ? `2px solid ${theme.accent}` : '2px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ marginInlineEnd: '4px' }}>{isPast ? '✓' : i + 1}.</span>
                {tl('fin.invBuilder.stepOpts', label, label)}
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* Step 0: Billing Method */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {METHOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setMethod(opt.value)
                  }}
                  style={{
                    textAlign: 'start',
                    padding: '16px',
                    borderRadius: '8px',
                    border: `2px solid ${method === opt.value ? theme.accent : theme.border}`,
                    background: method === opt.value ? theme.accentBg : theme.bgSurface,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: method === opt.value ? theme.accent : theme.textPrimary,
                      fontSize: '14px',
                      marginBottom: '4px',
                    }}
                  >
                    {opt.label}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>{opt.description}</div>
                </button>
              ))}
            </div>
          )}

          {/* Step 1: Line Items */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {method === 'percentage' && (
                <div>
                  <Input
                    label={t('fin.invBuilder.percentageOfContract2', { currency, contractAmount: contractAmount.toLocaleString() })}
                    type="number"
                    min="1"
                    max="100"
                    step="0.1"
                    value={String(percentage)}
                    onChange={(e) => {
                      setPercentage(parseFloat(e.target.value) || 0)
                    }}
                  />
                  <div
                    style={{
                      marginTop: '8px',
                      fontSize: '13px',
                      color: theme.accent,
                      fontFamily: 'monospace',
                    }}
                  >{t('fin.invBuilder.invoiceAmount', { value: ((contractAmount * percentage) / 100).toLocaleString(), currency })}</div>
                </div>
              )}

              {method === 'milestone' && (
                <div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: theme.textSecondary,
                      marginBottom: '8px',
                      fontWeight: 500,
                    }}
                  >
                    {t('fin.invBuilder.selectMilestonesToInvoice')}
                  </div>
                  {milestones.map((m) => (
                    <label
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px',
                        border: `1px solid ${theme.border}`,
                        borderRadius: '6px',
                        marginBottom: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedMilestoneIds.includes(m.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedMilestoneIds((ids) => [...ids, m.id])
                          else setSelectedMilestoneIds((ids) => ids.filter((x) => x !== m.id))
                        }}
                        style={{ accentColor: theme.accent }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{ fontSize: '13px', color: theme.textPrimary, fontWeight: 500 }}
                        >
                          {m.name}
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>{t('fin.invBuilder.status', { status: m.status })}</div>
                      </div>
                      <AmountDisplay amount={m.amount} currency={currency} />
                    </label>
                  ))}
                  {milestones.length === 0 && (
                    <div style={{ color: theme.textMuted, fontSize: '13px' }}>
                      {t('fin.invBuilder.noMilestonesDefinedForThisProject')}
                    </div>
                  )}
                </div>
              )}

              {(method === 'fixed' || method === 'time_material') && (
                <div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: theme.bgSurfaceHover }}>
                        {[t('fin.invBuilder.description'), t('fin.invBuilder.qty2'), t('fin.invBuilder.unitPrice'), t('fin.invBuilder.tax2'), t('fin.invBuilder.total'), ''].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding: '6px 8px',
                              textAlign: 'start',
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
                      {lines.map((line) => (
                        <tr key={line.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              value={line.description}
                              onChange={(e) => {
                                updateLine(line.id, { description: e.target.value })
                              }}
                              placeholder={t('fin.invBuilder.description')}
                              style={{ ...inputStyle, width: '200px' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.quantity}
                              onFocus={(e) => {
                                e.target.select()
                              }}
                              onChange={(e) => {
                                updateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })
                              }}
                              style={{ ...inputStyle, width: '60px' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.unit_price}
                              onFocus={(e) => {
                                e.target.select()
                              }}
                              onChange={(e) => {
                                updateLine(line.id, { unit_price: parseFloat(e.target.value) || 0 })
                              }}
                              style={{ ...inputStyle, width: '100px', fontFamily: 'monospace' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              value={line.tax_pct ?? 0}
                              onFocus={(e) => {
                                e.target.select()
                              }}
                              onChange={(e) => {
                                updateLine(line.id, { tax_pct: parseFloat(e.target.value) || 0 })
                              }}
                              style={{ ...inputStyle, width: '60px' }}
                            />
                          </td>
                          <td
                            style={{
                              padding: '4px 12px',
                              fontFamily: 'monospace',
                              fontSize: '13px',
                              color: theme.textPrimary,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {(line.quantity * line.unit_price).toLocaleString()}
                          </td>
                          <td style={{ padding: '4px' }}>
                            <button
                              onClick={() => {
                                removeLine(line.id)
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: theme.danger,
                                fontSize: '16px',
                              }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Button variant="ghost" size="sm" onClick={addLine} style={{ marginTop: '8px' }}>
                    {t('fin.invBuilder.addLine')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{ background: theme.bgSurfaceHover, borderRadius: '8px', padding: '16px' }}
              >
                <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>
                  {t('fin.invBuilder.billingMethod')}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary }}>
                  {METHOD_OPTIONS.find((m) => m.value === method)?.label}
                </div>
              </div>

              <div>
                <div
                  style={{
                    fontSize: '13px',
                    color: theme.textSecondary,
                    fontWeight: 600,
                    marginBottom: '8px',
                  }}
                >
                  {t('fin.invBuilder.lineItems')}
                </div>
                {previewLines.map((line) => (
                  <div
                    key={line.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: `1px solid ${theme.border}`,
                      fontSize: '13px',
                    }}
                  >
                    <div>
                      <div style={{ color: theme.textPrimary }}>{line.description}</div>
                      <div style={{ color: theme.textMuted, fontSize: '11px' }}>{t('fin.invBuilder.qty', { quantity: line.quantity, unit_price: line.unit_price.toLocaleString(), value: (line.tax_pct ?? 0) > 0 ? ` + ${line.tax_pct}% tax` : '' })}</div>
                    </div>
                    <AmountDisplay amount={line.quantity * line.unit_price} currency={currency} />
                  </div>
                ))}

                <div
                  style={{
                    marginTop: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    borderTop: `2px solid ${theme.border}`,
                    paddingTop: '12px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      color: theme.textSecondary,
                    }}
                  >
                    <span>{t('fin.invBuilder.subtotal')}</span>
                    <AmountDisplay amount={subtotal} currency={currency} />
                  </div>
                  {tax > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        color: theme.textSecondary,
                      }}
                    >
                      <span>{t('fin.invBuilder.tax')}</span>
                      <AmountDisplay amount={tax} currency={currency} />
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '13px',
                      color: theme.textSecondary,
                    }}
                  >
                    <span>{t('fin.invBuilder.grossTotal')}</span>
                    <AmountDisplay amount={grossTotal} currency={currency} />
                  </div>
                  {discountValue > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        color: theme.danger,
                      }}
                    >
                      <span>{t('fin.invBuilder.discount2', { value: discountPct > 0 ? ` (${discountPct}%)` : '' })}</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        − {discountValue.toLocaleString()} {currency}
                      </span>
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: theme.textPrimary,
                      borderTop: `1px solid ${theme.border}`,
                      paddingTop: '6px',
                    }}
                  >
                    <span>{t('fin.invBuilder.netPayable')}</span>
                    <AmountDisplay amount={total} currency={currency} />
                  </div>
                  {whtApplies && whtAmount > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '13px',
                        color: whtScenario === 'client_withholds' ? '#2563eb' : '#d97706',
                      }}
                    >
                      <span>{t('fin.invBuilder.wht', { value: (whtRate * 100).toFixed(1), value2: whtScenario === 'client_withholds' ? t('fin.invBuilder.clientWithholds') : t('fin.invBuilder.fncPays') })}</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        {whtAmount.toLocaleString()} {currency}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Discount */}
              <div
                style={{
                  background: theme.bgSurface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {t('fin.invBuilder.discountOptional')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <Input
                    label={t('fin.invBuilder.discount')}
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={discountPct > 0 ? String(discountPct) : ''}
                    onChange={(e) => {
                      setDiscountPct(parseFloat(e.target.value) || 0)
                    }}
                    placeholder="0"
                  />
                  <Input
                    label={t('fin.invBuilder.flatDiscount', { currency })}
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount > 0 ? String(discountAmount) : ''}
                    onChange={(e) => {
                      setDiscountAmount(parseFloat(e.target.value) || 0)
                    }}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* WHT section */}
              <div
                style={{
                  background: theme.bgSurface,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  padding: '14px',
                }}
              >
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {t('fin.invBuilder.withholdingTaxWht')}
                </div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: theme.textPrimary,
                    marginBottom: '10px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={whtApplies}
                    onChange={(e) => {
                      setWhtApplies(e.target.checked)
                    }}
                    style={{ width: '15px', height: '15px' }}
                  />
                  {t('fin.invBuilder.applyWhtToThisInvoice')}
                </label>
                {whtApplies && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <Select
                      label={t('fin.invBuilder.whtScenario')}
                      value={whtScenario}
                      onChange={(e) => {
                        setWhtScenario(e.target.value as 'client_withholds' | 'fnc_pays')
                      }}
                      options={[
                        {
                          value: 'client_withholds',
                          label: t('fin.invBuilder.clientWithholdsPaysTaxAuthority'),
                        },
                        { value: 'fnc_pays', label: t('fin.invBuilder.clientPaysFullFncRemitsAnnually') },
                      ]}
                    />
                    <Input
                      label={t('fin.invBuilder.whtRate')}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={whtRatePct}
                      onChange={(e) => {
                        setWhtRatePct(e.target.value)
                      }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input
                  label={t('fin.invBuilder.dueDate')}
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value)
                  }}
                />
                <Input
                  label={t('fin.invBuilder.notes')}
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value)
                  }}
                />
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: theme.textPrimary,
                  marginBottom: '8px',
                }}
              >
                {t('fin.invBuilder.readyToCreateInvoice')}
              </div>
              <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}><Trans i18nKey="fin.invBuilder.invoiceFor" values={{ projectName }} components={[<strong style={{ color: theme.accent }} />]} /></div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: theme.textPrimary,
                  marginBottom: '4px',
                }}
              >
                {total.toLocaleString()} {currency}
              </div>
              {discountValue > 0 && (
                <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '20px' }}>{t('fin.invBuilder.afterDiscount', { discountValue: discountValue.toLocaleString(), currency })}</div>
              )}
              {error && (
                <div
                  style={{
                    margin: '0 auto 16px',
                    maxWidth: '360px',
                    padding: '10px 14px',
                    background: theme.dangerBg,
                    border: `1px solid ${theme.danger}`,
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: theme.danger,
                    textAlign: 'start',
                  }}
                >
                  {error}
                </div>
              )}
              <Button variant="primary" size="lg" onClick={(...args: Parameters<typeof handleConfirm>) => void handleConfirm(...args)} loading={loading}>
                {t('fin.invBuilder.createInvoice')}
              </Button>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderTop: `1px solid ${theme.border}`,
            background: theme.bgSurfaceHover,
          }}
        >
          <Button
            variant="ghost"
            onClick={
              step === 0
                ? handleClose
                : () => {
                    setStep((s) => (s - 1) as Step)
                  }
            }
          >
            {step === 0 ? t('fin.invBuilder.cancel') : t('fin.invBuilder.back')}
          </Button>
          {step < 3 && (
            <Button
              variant="primary"
              disabled={!canProceed}
              onClick={() => {
                setStep((s) => (s + 1) as Step)
              }}
            >
              {step === 2 ? t('fin.invBuilder.proceed') : t('fin.invBuilder.next')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
