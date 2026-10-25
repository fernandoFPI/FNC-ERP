import i18n from '../../../i18n'
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { formatCurrency } from '../../../lib/format'

interface JournalLine {
  id: string
  description: string
  debit: string
  credit: string
  currency_code: string
  account_name: string
  account_code: string
  reference: string
  je_date: string
  source_type: string
  je_status: string
}

interface CurrencyTotal {
  currency_code: string
  total_debits: string
  total_credits: string
}

interface CostCenterDetail {
  id: string
  code: string
  name: string
  type: 'department' | 'project' | 'entity' | 'overhead'
  is_active: boolean
  parent_id?: string | null
  parent_code?: string | null
  parent_name?: string | null
  default_recharge_fulfiller_email?: string | null
  default_recharge_fulfiller_email_2?: string | null
  journal_line_count: number
  currency_totals: CurrencyTotal[]
  lines: JournalLine[]
}

const TYPE_LABELS: Record<string, string> = {
  get department() { return i18n.t('fin.ccDetail.department', { defaultValue: "Department" }) },
  get project() { return i18n.t('fin.ccDetail.project', { defaultValue: "Project" }) },
  get entity() { return i18n.t('fin.ccDetail.entity', { defaultValue: "Entity" }) },
  get overhead() { return i18n.t('fin.ccDetail.overhead', { defaultValue: "Overhead" }) },
}
const TYPE_VARIANTS: Record<string, 'neutral' | 'info' | 'accent' | 'warning'> = {
  department: 'info',
  project: 'accent',
  entity: 'neutral',
  overhead: 'warning',
}

const SOURCE_LABELS: Record<string, string> = {
  get mo_completion() { return i18n.t('fin.ccDetail.moCompletion', { defaultValue: "MO Completion" }) },
  get po_completion() { return i18n.t('fin.ccDetail.poCompletion', { defaultValue: "PO Completion" }) },
  get interco_transaction() { return i18n.t('fin.ccDetail.intercoTransaction', { defaultValue: "Interco Transaction" }) },
  get manual() { return i18n.t('fin.ccDetail.manual', { defaultValue: "Manual" }) },
}

export default function CostCenterDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()

  const [cc, setCc] = useState<CostCenterDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .get<CostCenterDetail>(`/finance/cost-centers/${id}`)
      .then((res) => {
        setCc(res.data)
      })
      .catch(() => {
        setError(t('fin.ccDetail.failedToLoadCostCenter'))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [id])

  if (loading)
    return (
      <div style={{ padding: '24px' }}>
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    )
  if (error ?? !cc)
    return (
      <div style={{ padding: '24px' }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigate(-1)
          }}
        >
          {t('fin.ccDetail.back')}
        </Button>
        <p style={{ color: '#ef4444', marginTop: '16px' }}>{error ?? t('fin.ccDetail.costCenterNotFound')}</p>
      </div>
    )

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title={cc.name}
        subtitle={cc.code}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={TYPE_VARIANTS[cc.type] ?? 'neutral'}>
              {TYPE_LABELS[cc.type] ?? cc.type}
            </Badge>
            <Badge variant={cc.is_active ? 'success' : 'neutral'}>
              {cc.is_active ? t('fin.ccDetail.active') : t('fin.ccDetail.inactive')}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigate(-1)
              }}
            >
              {t('fin.ccDetail.back')}
            </Button>
          </div>
        }
      />

      {/* KPI row — one card per currency actually used by this cost
          center's journal lines (no-conversion policy). */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <Card padding="sm">
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
            {t('fin.ccDetail.totalLines')}
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: theme.textPrimary }}>
            {cc.journal_line_count.toLocaleString()}
          </div>
        </Card>
        {cc.currency_totals.map((ct) => {
          const debit = parseFloat(ct.total_debits)
          const credit = parseFloat(ct.total_credits)
          const balance = debit - credit
          return (
            <Card key={ct.currency_code} padding="sm">
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                {ct.currency_code}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: 'monospace', fontSize: '13px' }}>
                <span style={{ color: theme.textPrimary }}>
                  {t('fin.ccDetail.totalDebits')}: {formatCurrency(debit, ct.currency_code)}
                </span>
                <span style={{ color: theme.textPrimary }}>
                  {t('fin.ccDetail.totalCredits')}: {formatCurrency(credit, ct.currency_code)}
                </span>
                <span style={{ color: theme.textPrimary, fontWeight: 700 }}>
                  {t('fin.ccDetail.balanceDrCr')}: {formatCurrency(Math.abs(balance), ct.currency_code)}
                  {balance < 0 ? ' Cr' : ''}
                </span>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Parent / fulfiller info */}
      {(cc.parent_id ?? cc.default_recharge_fulfiller_email ?? cc.default_recharge_fulfiller_email_2) && (
        <Card padding="sm" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            {cc.parent_id && (
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                  {t('fin.ccDetail.parentCostCenter')}
                </div>
                <div style={{ fontWeight: 600, color: theme.textPrimary }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', marginInlineEnd: '6px' }}>
                    {cc.parent_code}
                  </span>
                  {cc.parent_name}
                </div>
              </div>
            )}
            {cc.default_recharge_fulfiller_email && (
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                  {t('fin.ccDetail.rechargeFulfiller')}
                </div>
                <div style={{ fontWeight: 600, color: theme.textPrimary }}>
                  {cc.default_recharge_fulfiller_email}
                </div>
              </div>
            )}
            {cc.default_recharge_fulfiller_email_2 && (
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                  {t('fin.ccDetail.secondRechargeFulfiller')}
                </div>
                <div style={{ fontWeight: 600, color: theme.textPrimary }}>
                  {cc.default_recharge_fulfiller_email_2}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Journal lines */}
      <Card padding="none">
        <div
          style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            fontWeight: 600,
            fontSize: '13px',
            color: theme.textPrimary,
          }}
        >
          {t('fin.ccDetail.journalLines')}{' '}
          {cc.lines.length >= 200 && (
            <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 400 }}>
              {t('fin.ccDetail.showingLatest200')}
            </span>
          )}
        </div>
        {cc.lines.length === 0 ? (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: theme.textMuted,
              fontSize: '13px',
            }}
          >
            {t('fin.ccDetail.noJournalLinesYet')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {[
                    t('fin.ccDetail.date'),
                    t('fin.ccDetail.reference'),
                    t('fin.ccDetail.account'),
                    t('fin.ccDetail.description'),
                    t('fin.ccDetail.source'),
                    t('fin.ccDetail.amountOrig'),
                    t('fin.ccDetail.status'),
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'start',
                        padding: '8px 12px',
                        color: theme.textMuted,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cc.lines.map((line) => (
                  <tr key={line.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                    <td
                      style={{ padding: '8px 12px', color: theme.textMuted, whiteSpace: 'nowrap' }}
                    >
                      {line.je_date ? new Date(line.je_date).toLocaleDateString() : '—'}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        fontFamily: 'monospace',
                        color: theme.accent,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {line.reference}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        color: theme.textSecondary,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                        {line.account_code}
                      </span>
                      <span style={{ marginInlineStart: '6px' }}>{line.account_name}</span>
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        color: theme.textPrimary,
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={line.description}
                    >
                      {line.description || '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: theme.textMuted }}>
                      {SOURCE_LABELS[line.source_type] ?? line.source_type ?? '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'end' }}>
                      {(() => {
                        const isDebit = parseFloat(line.debit) > 0
                        const isCredit = parseFloat(line.credit) > 0
                        const amt = isDebit ? parseFloat(line.debit) : parseFloat(line.credit)
                        const cur = line.currency_code.trim() || 'IQD'
                        return (
                          <span style={{ color: isCredit ? theme.success : theme.textPrimary }}>
                            <AmountDisplay amount={amt} currency={cur} size="sm" />
                            {isCredit && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  marginInlineStart: '3px',
                                  color: theme.success,
                                }}
                              >
                                {t('fin.ccDetail.cr')}
                              </span>
                            )}
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <Badge
                        variant={
                          line.je_status === 'posted'
                            ? 'success'
                            : line.je_status === 'cancelled'
                              ? 'danger'
                              : 'neutral'
                        }
                        size="sm"
                      >
                        {line.je_status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
