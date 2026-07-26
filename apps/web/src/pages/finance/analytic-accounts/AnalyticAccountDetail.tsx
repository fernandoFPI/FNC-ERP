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

interface AccountDetail {
  id: string
  code: string
  name: string
  is_active: boolean
  journal_line_count: number
  total_debits: string
  total_credits: string
  project_id?: string
  project_name?: string
  project_status?: string
  project_budget_currency?: string
  project_fx_rate?: string
  lines: JournalLine[]
}

const SOURCE_LABELS: Record<string, string> = {
  mo_completion: 'MO Completion',
  po_completion: 'PO Completion',
  interco_transaction: 'Interco Transaction',
  manual: 'Manual',
}

export default function AnalyticAccountDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { theme } = useTheme()

  const [account, setAccount] = useState<AccountDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .get<AccountDetail>(`/finance/analytic-accounts/${id}`)
      .then((res) => {
        setAccount(res.data)
      })
      .catch(() => {
        setError('Failed to load analytic account')
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
  if (error || !account)
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
        <p style={{ color: '#ef4444', marginTop: '16px' }}>{error ?? 'Account not found'}</p>
      </div>
    )

  const totalDebitsIQD = parseFloat(account.total_debits)
  const totalCreditsIQD = parseFloat(account.total_credits)
  const balance = totalDebitsIQD - totalCreditsIQD

  const projCurrency = account.project_budget_currency?.trim()
  const projFxRate = parseFloat(account.project_fx_rate ?? '0')
  const showDual = !!projCurrency && projCurrency !== 'IQD' && projFxRate > 0

  const toProj = (iqd: number) => (projFxRate > 0 ? iqd / projFxRate : 0)

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        title={account.name}
        subtitle={account.code}
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Badge variant={account.is_active ? 'success' : 'neutral'}>
              {account.is_active ? 'Account Active' : 'Account Inactive'}
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
            {account.journal_line_count.toLocaleString()}
          </div>
        </Card>
        {[
          { label: 'Total Debits', iqd: totalDebitsIQD },
          { label: 'Total Credits', iqd: totalCreditsIQD },
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
            {showDual && (
              <div
                style={{
                  fontSize: '12px',
                  color: theme.accent,
                  fontFamily: 'monospace',
                  marginTop: '2px',
                }}
              >
                {formatCurrency(toProj(iqd), projCurrency)}
                {suffix}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Linked project */}
      {account.project_id && (
        <Card padding="sm" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                Linked Project
              </div>
              <div style={{ fontWeight: 600, color: theme.textPrimary }}>
                {account.project_name}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {account.project_status && (
                <Badge
                  variant={
                    account.project_status === 'active'
                      ? 'success'
                      : account.project_status === 'completed'
                        ? 'neutral'
                        : 'warning'
                  }
                >
                  {account.project_status}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigate(`/projects/${account.project_id}`)
                }}
              >
                View Project →
              </Button>
            </div>
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
          {account.lines.length >= 200 && (
            <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: 400 }}>
              (showing latest 200)
            </span>
          )}
        </div>
        {account.lines.length === 0 ? (
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
              {account.lines.map((line) => (
                <tr key={line.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                  <td style={{ padding: '8px 12px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
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
        )}
      </Card>
    </div>
  )
}
