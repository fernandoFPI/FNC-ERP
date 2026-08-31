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
  fx_rate: string
  amount_company_currency: string
  account_name: string
  account_code: string
  reference: string
  je_date: string
  source_type: string
  je_status: string
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
  total_debits: string
  total_credits: string
  lines: JournalLine[]
}

const TYPE_LABELS: Record<string, string> = {
  department: 'Department',
  project: 'Project',
  entity: 'Entity',
  overhead: 'Overhead',
}
const TYPE_VARIANTS: Record<string, 'neutral' | 'info' | 'accent' | 'warning'> = {
  department: 'info',
  project: 'accent',
  entity: 'neutral',
  overhead: 'warning',
}

const SOURCE_LABELS: Record<string, string> = {
  mo_completion: 'MO Completion',
  po_completion: 'PO Completion',
  interco_transaction: 'Interco Transaction',
  manual: 'Manual',
}

export default function CostCenterDetail() {
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
        setError('Failed to load cost center')
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
  if (error || !cc)
    return (
      <div style={{ padding: '24px' }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigate(-1)
          }}
        >
          ← Back
        </Button>
        <p style={{ color: '#ef4444', marginTop: '16px' }}>{error ?? 'Cost center not found'}</p>
      </div>
    )

  const totalDebits = parseFloat(cc.total_debits)
  const totalCredits = parseFloat(cc.total_credits)
  const balance = totalDebits - totalCredits

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
              {cc.is_active ? 'Active' : 'Inactive'}
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
          </div>
        }
      />

      {/* KPI row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <Card padding="sm">
          <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
            Total Lines
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: theme.textPrimary }}>
            {cc.journal_line_count.toLocaleString()}
          </div>
        </Card>
        {[
          { label: 'Total Debits', iqd: totalDebits },
          { label: 'Total Credits', iqd: totalCredits },
          { label: 'Balance (Dr − Cr)', iqd: Math.abs(balance), suffix: balance < 0 ? ' Cr' : '' },
        ].map(({ label, iqd, suffix = '' }) => (
          <Card key={label} padding="sm">
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
              {label}
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: '15px',
                color: theme.textPrimary,
                fontFamily: 'monospace',
              }}
            >
              {formatCurrency(iqd, 'IQD')}
              {suffix}
            </div>
          </Card>
        ))}
      </div>

      {/* Parent / fulfiller info */}
      {(cc.parent_id || cc.default_recharge_fulfiller_email || cc.default_recharge_fulfiller_email_2) && (
        <Card padding="sm" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            {cc.parent_id && (
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                  Parent Cost Center
                </div>
                <div style={{ fontWeight: 600, color: theme.textPrimary }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', marginRight: '6px' }}>
                    {cc.parent_code}
                  </span>
                  {cc.parent_name}
                </div>
              </div>
            )}
            {cc.default_recharge_fulfiller_email && (
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                  Recharge Fulfiller
                </div>
                <div style={{ fontWeight: 600, color: theme.textPrimary }}>
                  {cc.default_recharge_fulfiller_email}
                </div>
              </div>
            )}
            {cc.default_recharge_fulfiller_email_2 && (
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                  Second Recharge Fulfiller
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
          Journal Lines{' '}
          {cc.lines.length >= 200 && (
            <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 400 }}>
              (showing latest 200)
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
            No journal lines yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {[
                    'Date',
                    'Reference',
                    'Account',
                    'Description',
                    'Source',
                    'Amount (orig.)',
                    'IQD Equiv.',
                    'Status',
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
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
                      <span style={{ marginLeft: '6px' }}>{line.account_name}</span>
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
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {(() => {
                        const isDebit = parseFloat(line.debit) > 0
                        const isCredit = parseFloat(line.credit) > 0
                        const amt = isDebit ? parseFloat(line.debit) : parseFloat(line.credit)
                        const cur = line.currency_code?.trim() || 'IQD'
                        return (
                          <>
                            <span style={{ color: isCredit ? theme.success : theme.textPrimary }}>
                              <AmountDisplay amount={amt} currency={cur} size="sm" />
                              {isCredit && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    marginLeft: '3px',
                                    color: theme.success,
                                  }}
                                >
                                  Cr
                                </span>
                              )}
                            </span>
                            {cur !== 'IQD' && parseFloat(line.fx_rate) !== 1 && (
                              <div style={{ fontSize: '10px', color: theme.textMuted }}>
                                @ {parseFloat(line.fx_rate).toFixed(4)}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <AmountDisplay
                        amount={parseFloat(line.amount_company_currency)}
                        currency="IQD"
                        size="sm"
                      />
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
