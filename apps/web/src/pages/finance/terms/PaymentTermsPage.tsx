import i18n from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { LineItemEditor, type LineItemField } from '../../../components/ui/LineItemEditor'
import { api } from '../../../lib/axios'
import { usePermission } from '../../../hooks/usePermission'

interface TermLine {
  id?: string
  sequence: number
  description: string
  value_type: 'percent' | 'fixed'
  value: number
  due_type: 'immediate' | 'days' | 'end_of_month' | 'end_of_next_month' | 'retention'
  days: number
  is_retention: boolean
}

interface PaymentTerm {
  id: string
  name: string
  note: string | null
  is_active: boolean
  line_count: number
  retention_pct: number | null
  retention_lines: number
}

interface PaymentTermDetail extends PaymentTerm {
  lines: TermLine[]
}

const DUE_LABELS: Record<string, string> = {
  get immediate() { return i18n.t('fin.terms.immediate', { defaultValue: "Immediate" }) },
  get days() { return i18n.t('fin.terms.daysAfterInvoice', { defaultValue: "Days after invoice" }) },
  get end_of_month() { return i18n.t('fin.terms.endOfMonth', { defaultValue: "End of month" }) },
  get end_of_next_month() { return i18n.t('fin.terms.endOfNextMonth', { defaultValue: "End of next month" }) },
  get retention() { return i18n.t('fin.terms.retentionOnRelease', { defaultValue: "Retention (on release)" }) },
}

const emptyLine = (): TermLine => ({
  sequence: 10,
  description: '',
  value_type: 'percent',
  value: 0,
  due_type: 'days',
  days: 0,
  is_retention: false,
})

export default function PaymentTermsPage() {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { can } = usePermission()
  const canEdit = can('finance.terms.edit', 'edit')
  const [terms, setTerms] = useState<PaymentTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{
    name: string
    note: string
    is_active: boolean
    lines: TermLine[]
  }>({
    name: '',
    note: '',
    is_active: true,
    lines: [emptyLine()],
  })
  const [saving, setSaving] = useState(false)

  // Preview state
  const [previewAmount, setPreviewAmount] = useState('100000')
  const [previewDate, setPreviewDate] = useState(new Date().toISOString().slice(0, 10))
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<
    { description: string; amount: number; due_date: string | null; is_retention: boolean }[]
  >([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get<PaymentTerm[]>('/finance/payment-terms')
      setTerms(r.data)
    } catch {
      /* handled */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function openEdit(id: string) {
    try {
      const r = await api.get<PaymentTermDetail>(`/finance/payment-terms/${id}`)
      setForm({
        name: r.data.name,
        note: r.data.note ?? '',
        is_active: r.data.is_active,
        lines: r.data.lines,
      })
      setEditingId(id)
      setShowModal(true)
    } catch {
      /* handled */
    }
  }

  function openNew() {
    setForm({ name: '', note: '', is_active: true, lines: [emptyLine()] })
    setEditingId(null)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.lines.length) return
    setSaving(true)
    try {
      const body = {
        name: form.name,
        note: form.note || undefined,
        is_active: form.is_active,
        lines: form.lines.map((l, idx) => ({ ...l, sequence: (idx + 1) * 10 })),
      }
      if (editingId) await api.put(`/finance/payment-terms/${editingId}`, body)
      else await api.post('/finance/payment-terms', body)
      setShowModal(false)
      void load()
    } catch {
      /* handled */
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(t('fin.terms.deletePaymentTermThisCannotBe', { name }))) return
    try {
      await api.delete(`/finance/payment-terms/${id}`)
      void load()
    } catch {
      /* handled */
    }
  }

  async function handlePreview(id: string) {
    setPreviewId(id)
    try {
      const r = await api.post<{ schedule: typeof schedule }>(
        `/finance/payment-terms/${id}/compute`,
        {
          amount: Number(previewAmount),
          invoice_date: previewDate,
        },
      )
      setSchedule(r.data.schedule)
    } catch {
      /* handled */
    }
  }

  function updateLine(idx: number, patch: Partial<TermLine>) {
    setForm((f) => ({ ...f, lines: f.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }))
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

  const lineFields: LineItemField<TermLine>[] = [
    {
      key: 'description',
      label: t('fin.terms.description'),
      width: '30%',
      render: (line, idx) => (
        <input
          style={inputStyle}
          value={line.description}
          onChange={(e) => {
            updateLine(idx, { description: e.target.value })
          }}
          placeholder={line.is_retention ? t('fin.terms.retention') : t('fin.terms.installment', { value: idx + 1 })}
        />
      ),
    },
    {
      key: 'value_type',
      label: t('fin.terms.type'),
      width: '80px',
      render: (line, idx) => (
        <select
          style={inputStyle}
          value={line.value_type}
          onChange={(e) => {
            updateLine(idx, { value_type: e.target.value as 'percent' | 'fixed' })
          }}
        >
          <option value="percent">%</option>
          <option value="fixed">{t('fin.terms.fixed')}</option>
        </select>
      ),
    },
    {
      key: 'value',
      label: t('fin.terms.value'),
      width: '80px',
      render: (line, idx) => (
        <input
          type="number"
          style={inputStyle}
          value={line.value}
          onChange={(e) => {
            updateLine(idx, { value: Number(e.target.value) })
          }}
        />
      ),
    },
    {
      key: 'due_type',
      label: t('fin.terms.due'),
      width: '150px',
      render: (line, idx) => (
        <select
          style={inputStyle}
          value={line.due_type}
          onChange={(e) => {
            updateLine(idx, {
              due_type: e.target.value as TermLine['due_type'],
              is_retention: e.target.value === 'retention',
            })
          }}
        >
          {Object.entries(DUE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: 'days',
      label: t('fin.terms.days'),
      width: '65px',
      render: (line, idx) => (
        <input
          type="number"
          style={inputStyle}
          value={line.days}
          disabled={line.due_type !== 'days'}
          onChange={(e) => {
            updateLine(idx, { days: Number(e.target.value) })
          }}
        />
      ),
    },
    {
      key: 'is_retention',
      label: t('fin.terms.retention'),
      width: '70px',
      render: (line, idx) => (
        <input
          type="checkbox"
          checked={line.is_retention}
          onChange={(e) => {
            updateLine(idx, {
              is_retention: e.target.checked,
              due_type: e.target.checked ? 'retention' : 'days',
            })
          }}
        />
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('fin.terms.paymentTerms')}
        subtitle={t('fin.terms.defineInstallmentSchedulesAndRetentionHoldba')}
        actions={
          canEdit ? (
            <Button variant="primary" size="sm" onClick={openNew}>
              {t('fin.terms.newTerm')}
            </Button>
          ) : undefined
        }
      />

      {/* Terms List */}
      <div style={{ display: 'grid', gap: '12px' }}>
        {loading && <p style={{ color: theme.textMuted, fontSize: '13px' }}>{t('fin.terms.loading')}</p>}
        {!loading && !terms.length && (
          <Card padding="lg">
            <p style={{ color: theme.textMuted, textAlign: 'center', fontSize: '13px' }}>
              {t('fin.terms.noPaymentTermsYet')}{' '}
              {canEdit && (
                <span style={{ color: theme.accent, cursor: 'pointer' }} onClick={openNew}>
                  {t('fin.terms.createTheFirstOne')}
                </span>
              )}
            </p>
          </Card>
        )}
        {terms.map((tx) => (
          <Card key={tx.id} padding="md">
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}
                >
                  <span style={{ fontWeight: 600, fontSize: '14px', color: theme.textPrimary }}>
                    {tx.name}
                  </span>
                  {!tx.is_active && <Badge variant="neutral">{t('fin.terms.inactive')}</Badge>}
                  {Number(tx.retention_pct) > 0 && (
                    <Badge variant="warning">{t('fin.terms.retention2', { retention_pct: tx.retention_pct })}</Badge>
                  )}
                </div>
                {tx.note && (
                  <p style={{ fontSize: '12px', color: theme.textSecondary, margin: '0 0 8px' }}>
                    {tx.note}
                  </p>
                )}
                <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>{t('fin.terms.installmentLine', { count: Number(tx.line_count), line_count: tx.line_count })}</p>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginInlineStart: '16px' }}>
                <Button variant="ghost" size="sm" onClick={() => void handlePreview(tx.id)}>
                  {t('fin.terms.preview')}
                </Button>
                {canEdit && (
                  <Button variant="secondary" size="sm" onClick={() => void openEdit(tx.id)}>
                    {t('fin.terms.edit')}
                  </Button>
                )}
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => void handleDelete(tx.id, tx.name)}>
                    {t('fin.terms.delete')}
                  </Button>
                )}
              </div>
            </div>

            {/* Inline Preview */}
            {previewId === tx.id && schedule.length > 0 && (
              <div
                style={{
                  marginTop: '12px',
                  borderTop: `1px solid ${theme.border}`,
                  paddingTop: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    marginBottom: '10px',
                  }}
                >
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>{t('fin.terms.previewFor')}</span>
                  <input
                    type="number"
                    value={previewAmount}
                    onChange={(e) => {
                      setPreviewAmount(e.target.value)
                    }}
                    style={{ ...inputStyle, width: '100px' }}
                  />
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>{t('fin.terms.on')}</span>
                  <input
                    type="date"
                    value={previewDate}
                    onChange={(e) => {
                      setPreviewDate(e.target.value)
                    }}
                    style={{ ...inputStyle, width: '130px' }}
                  />
                  <Button variant="ghost" size="sm" onClick={() => void handlePreview(tx.id)}>
                    {t('fin.terms.recalculate')}
                  </Button>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto auto',
                    gap: '0',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  {[t('fin.terms.description'), t('fin.terms.amount'), t('fin.terms.dueDate'), t('fin.terms.type')].map((h) => (
                    <div
                      key={h}
                      style={{
                        padding: '6px 10px',
                        background: theme.bgSurface,
                        fontSize: '10px',
                        color: theme.textMuted,
                        fontWeight: 500,
                      }}
                    >
                      {h}
                    </div>
                  ))}
                  {schedule.map((row, i) => [
                    <div
                      key={`d${i}`}
                      style={{
                        padding: '6px 10px',
                        fontSize: '12px',
                        color: theme.textPrimary,
                        borderTop: `1px solid ${theme.border}`,
                      }}
                    >
                      {row.description}
                    </div>,
                    <div
                      key={`a${i}`}
                      style={{
                        padding: '6px 10px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        color: theme.textPrimary,
                        borderTop: `1px solid ${theme.border}`,
                      }}
                    >
                      {Number(row.amount).toLocaleString()}
                    </div>,
                    <div
                      key={`dt${i}`}
                      style={{
                        padding: '6px 10px',
                        fontSize: '12px',
                        color: theme.textSecondary,
                        borderTop: `1px solid ${theme.border}`,
                      }}
                    >
                      {row.due_date ?? t('fin.terms.onRelease')}
                    </div>,
                    <div
                      key={`t${i}`}
                      style={{ padding: '6px 10px', borderTop: `1px solid ${theme.border}` }}
                    >
                      {row.is_retention && <Badge variant="warning">{t('fin.terms.retention')}</Badge>}
                    </div>,
                  ])}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
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
          <Card padding="lg" style={{ width: '680px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, color: theme.textPrimary, fontSize: '15px' }}>
                {editingId ? t('fin.terms.editPaymentTerm') : t('fin.terms.newPaymentTerm')}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowModal(false)
                }}
              >
                ✕
              </Button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              <div>
                <label style={labelStyle}>{t('fin.terms.termName')}</label>
                <input
                  style={inputStyle}
                  value={form.name}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }}
                  placeholder={t('fin.terms.eG306010Retention')}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: theme.textSecondary,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, is_active: e.target.checked }))
                    }}
                  />
                  {t('fin.terms.active')}
                </label>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>{t('fin.terms.noteDescription')}</label>
                <input
                  style={inputStyle}
                  value={form.note}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, note: e.target.value }))
                  }}
                  placeholder={t('fin.terms.eG30Upfront60On')}
                />
              </div>
            </div>

            {/* Lines Editor */}
            <h4
              style={{
                fontSize: '12px',
                color: theme.textMuted,
                fontWeight: 600,
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t('fin.terms.installmentLines')}
            </h4>
            <div style={{ marginBottom: '10px' }}>
              <LineItemEditor
                fields={lineFields}
                rows={form.lines}
                onRemoveRow={(idx) => {
                  setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))
                }}
              />
            </div>

            {/* Line total validation */}
            {(() => {
              const pctTotal = form.lines
                .filter((l) => l.value_type === 'percent')
                .reduce((s, l) => s + Number(l.value), 0)
              const isValid =
                Math.abs(pctTotal - 100) < 0.01 || form.lines.every((l) => l.value_type === 'fixed')
              return (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                  }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))
                    }}
                  >
                    {t('fin.terms.addLine')}
                  </Button>
                  {form.lines.some((l) => l.value_type === 'percent') && (
                    <span
                      style={{
                        fontSize: '11px',
                        color: isValid ? '#22c55e' : '#ef4444',
                        fontFamily: 'monospace',
                      }}
                    >{t('fin.terms.total', { pctTotal: pctTotal.toFixed(2), value: isValid ? '✓' : '≠ 100%' })}</span>
                  )}
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowModal(false)
                }}
              >
                {t('fin.terms.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving || !form.name.trim()}
              >
                {saving ? t('fin.terms.saving') : t('fin.terms.saveTerm')}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
