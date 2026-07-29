import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { useCompanyStore } from '../../../store/companyStore'
import { useToastStore } from '../../../store/toastStore'
import { api } from '../../../lib/axios'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { AmountDisplay } from '../../../components/ui/AmountDisplay'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Grid } from '../../../components/ui/Grid'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import { usePagePadding } from '../../../hooks/usePagePadding'

interface ARSummary {
  total_outstanding: string
  total_invoiced: string
  total_collected: string
  bucket_0_30: string
  bucket_31_60: string
  bucket_61_90: string
  bucket_over_90: string
  open_count: number
  overdue_count: number
  collected_this_month?: string
}

interface ARInvoice {
  id: string
  invoice_number: string
  total_amount: string
  amount_paid: string
  outstanding: string
  due_date: string
  status: string
  currency_code: string
  source_type: 'project' | 'rental'
  client_name: string
  source_name: string
  source_id: string
  days_overdue: number
}

interface ARByClient {
  client_name: string
  invoice_count: number
  total_outstanding: string
  oldest_due_date: string
  overdue_count: number
  overdue_amount: string
}

function fmtAmt(val: string | number | undefined) {
  return parseFloat(String(val ?? 0)).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

function AgingBar({
  label,
  amount,
  total,
  color,
}: {
  label: string
  amount: number
  total: number
  color: string
}) {
  const { theme } = useTheme()
  const pct = total > 0 ? Math.min((amount / total) * 100, 100) : 0
  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '4px',
          fontSize: '12px',
        }}
      >
        <span style={{ color: theme.textSecondary }}>{label}</span>
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>
          IQD {fmtAmt(amount)} &nbsp;
          <span style={{ color: theme.textMuted }}>({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div
        style={{
          height: '6px',
          borderRadius: '3px',
          background: theme.bgSurfaceHover,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: '3px',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  )
}

function DaysCell({ days }: { days: number }) {
  const { theme } = useTheme()
  if (days < -1)
    return (
      <span style={{ color: theme.textMuted, fontSize: '12px' }}>Due in {Math.abs(days)}d</span>
    )
  if (days === 0)
    return (
      <span style={{ color: theme.warning, fontSize: '12px', fontWeight: 500 }}>Due today</span>
    )
  if (days <= 30)
    return (
      <span style={{ color: theme.warning, fontSize: '12px', fontWeight: 500 }}>
        {days}d overdue
      </span>
    )
  return (
    <span style={{ color: theme.danger, fontSize: '12px', fontWeight: 600 }}>{days}d overdue</span>
  )
}

export default function ARDashboard() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const activeCompany = useCompanyStore((s) => s.activeCompany)
  const pagePadding = usePagePadding()

  const [summary, setSummary] = useState<ARSummary | null>(null)
  const [invoices, setInvoices] = useState<ARInvoice[]>([])
  const [byClient, setByClient] = useState<ARByClient[]>([])
  const [whtRecoverable, setWhtRecoverable] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [selectedClient, setSelectedClient] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, clientRes, whtRes] = await Promise.all([
        api.get<ARSummary>('/finance/ar/summary'),
        api.get<ARByClient[]>('/finance/ar/by-client'),
        api.get<{ wht_recoverable: number }>('/finance/ar/wht-recoverable'),
      ])
      setSummary(summaryRes.data)
      setByClient(clientRes.data)
      setWhtRecoverable(whtRes.data.wht_recoverable)
    } catch {
      addToast({ type: 'error', message: 'Failed to load AR data' })
    } finally {
      setLoading(false)
    }
  }, [addToast])

  const fetchInvoices = useCallback(async () => {
    try {
      const params: Record<string, string | number | boolean> = { page, limit: 20 }
      if (sourceFilter) params.source_type = sourceFilter
      if (overdueOnly) params.overdue = 'true'
      if (selectedClient) params.client_name = selectedClient
      const res = await api.get<{ items?: ARInvoice[]; data?: ARInvoice[] }>(
        '/finance/ar/invoices',
        { params },
      )
      const data = res.data as unknown as ARInvoice[] | { items?: ARInvoice[] }
      if (Array.isArray(data)) {
        setInvoices(data)
        setTotal(data.length)
      } else {
        setInvoices((data as { items?: ARInvoice[] }).items ?? [])
        setTotal((data as { total?: number }).total ?? 0)
      }
    } catch {
      /* silent */
    }
  }, [page, sourceFilter, overdueOnly, selectedClient])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])
  useEffect(() => {
    void fetchInvoices()
  }, [fetchInvoices])

  const s = summary
  const totalOutstanding = parseFloat(s?.total_outstanding ?? '0')
  const b0 = parseFloat(s?.bucket_0_30 ?? '0')
  const b31 = parseFloat(s?.bucket_31_60 ?? '0')
  const b61 = parseFloat(s?.bucket_61_90 ?? '0')
  const b90 = parseFloat(s?.bucket_over_90 ?? '0')
  const collectedThisMonth = parseFloat(s?.collected_this_month ?? '0')

  // Source breakdown
  const projectInvs = invoices.filter((i) => i.source_type === 'project')
  const rentalInvs = invoices.filter((i) => i.source_type === 'rental')
  const projectTotal = projectInvs.reduce((acc, i) => acc + parseFloat(i.outstanding), 0)
  const rentalTotal = rentalInvs.reduce((acc, i) => acc + parseFloat(i.outstanding), 0)
  const donutData = [
    { name: 'Project', value: projectTotal },
    { name: 'Rental', value: rentalTotal },
  ].filter((d) => d.value > 0)

  const filteredInvoices = invoices.filter((inv) => {
    if (!search) return true
    const q = search.toLowerCase()
    return inv.invoice_number.toLowerCase().includes(q) || inv.client_name.toLowerCase().includes(q)
  })

  function exportCSV() {
    const header = 'Invoice #,Client,Source,Amount,Paid,Outstanding,Due Date,Status,Days\n'
    const rows = filteredInvoices
      .map((i) =>
        [
          i.invoice_number,
          i.client_name,
          i.source_type,
          i.total_amount,
          i.amount_paid,
          i.outstanding,
          i.due_date,
          i.status,
          i.days_overdue,
        ].join(','),
      )
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ar-invoices.csv'
    a.click()
  }

  function invoiceLink(inv: ARInvoice) {
    if (inv.source_type === 'project') return `/projects/invoices/${inv.id}`
    return `/rental/contracts/${inv.source_id}`
  }

  const statusVariant = (s: string): 'success' | 'warning' | 'danger' | 'accent' | 'neutral' => {
    if (s === 'paid') return 'success'
    if (s === 'partial') return 'warning'
    if (s === 'overdue') return 'danger'
    return 'accent'
  }

  return (
    <div style={{ ...pagePadding, margin: '0 auto', maxWidth: '1600px' }}>
      <PageHeader
        title="Accounts Receivable"
        subtitle={`${activeCompany?.name ?? ''} · as of today`}
      />

      {/* KPI row */}
      <Grid cols={5} tabletCols={3} phoneCols={2} gap={14} style={{ marginBottom: '24px' }}>
        {[
          {
            label: 'Total Outstanding',
            value: `IQD ${fmtAmt(totalOutstanding)}`,
            sub: `IQD ${fmtAmt(collectedThisMonth)} collected this month`,
            color: theme.info,
          },
          {
            label: 'Open Invoices',
            value: `${s?.open_count ?? 0}`,
            sub: s?.overdue_count ? `${s.overdue_count} overdue` : undefined,
            subDanger: (s?.overdue_count ?? 0) > 0,
          },
          {
            label: 'Overdue Amount',
            value: `IQD ${fmtAmt(b31 + b61 + b90)}`,
            sub: `across ${s?.overdue_count ?? 0} invoices`,
            color: b31 + b61 + b90 > 0 ? theme.danger : theme.textMuted,
          },
          {
            label: 'Collected This Month',
            value: `IQD ${fmtAmt(collectedThisMonth)}`,
            color: theme.success,
          },
          {
            label: 'WHT Recoverable YTD',
            value: `IQD ${fmtAmt(whtRecoverable)}`,
            sub: 'Client-withheld WHT this year',
            color: theme.accent,
          },
        ].map((kpi, i) => (
          <Card key={i} padding="md" style={{ background: theme.bgSurface }}>
            {loading ? (
              <div className="skeleton" style={{ height: 60 }} />
            ) : (
              <>
                <p
                  style={{
                    fontSize: '11px',
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '6px',
                  }}
                >
                  {kpi.label}
                </p>
                <p
                  style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: kpi.color ?? theme.textPrimary,
                    margin: 0,
                  }}
                >
                  {kpi.value}
                </p>
                {kpi.sub && (
                  <p
                    style={{
                      fontSize: '11px',
                      color: kpi.subDanger ? theme.danger : theme.textMuted,
                      marginTop: '4px',
                    }}
                  >
                    {kpi.sub}
                  </p>
                )}
              </>
            )}
          </Card>
        ))}
      </Grid>

      {/* Aging + Source breakdown */}
      <Grid cols={2} tabletCols={1} phoneCols={1} gap={16} style={{ marginBottom: '24px' }}>
        <Card padding="md">
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '16px',
            }}
          >
            Aging analysis
          </h3>
          {loading ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : (
            <>
              <AgingBar
                label="0-30 days (current)"
                amount={b0}
                total={totalOutstanding}
                color={theme.success}
              />
              <AgingBar
                label="31-60 days"
                amount={b31}
                total={totalOutstanding}
                color={theme.warning}
              />
              <AgingBar
                label="61-90 days"
                amount={b61}
                total={totalOutstanding}
                color={theme.danger}
              />
              <AgingBar
                label="Over 90 days"
                amount={b90}
                total={totalOutstanding}
                color="#dc2626"
              />
              <div
                style={{
                  borderTop: `1px solid ${theme.border}`,
                  paddingTop: '10px',
                  marginTop: '8px',
                  textAlign: 'right',
                  fontSize: '13px',
                  color: theme.textSecondary,
                }}
              >
                <strong>IQD {fmtAmt(totalOutstanding)}</strong> total outstanding
              </div>
            </>
          )}
        </Card>

        <Card padding="md">
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '16px',
            }}
          >
            By source
          </h3>
          {loading ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : (
            <>
              {donutData.length > 0 ? (
                <div className="no-theme-transition">
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        innerRadius={32}
                        outerRadius={52}
                        paddingAngle={2}
                      >
                        <Cell fill={theme.accent} />
                        <Cell fill={theme.warning} />
                      </Pie>
                      <Tooltip
                        formatter={(v) => [`IQD ${fmtAmt(v as number)}`, '']}
                        contentStyle={{
                          background: theme.bgSurface,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: theme.accent,
                        display: 'inline-block',
                      }}
                    />
                    Project invoices
                  </span>
                  <span style={{ color: theme.textPrimary, fontWeight: 500 }}>
                    IQD {fmtAmt(projectTotal)} · {projectInvs.length}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 2,
                        background: theme.warning,
                        display: 'inline-block',
                      }}
                    />
                    Rental invoices
                  </span>
                  <span style={{ color: theme.textPrimary, fontWeight: 500 }}>
                    IQD {fmtAmt(rentalTotal)} · {rentalInvs.length}
                  </span>
                </div>
              </div>
            </>
          )}
        </Card>
      </Grid>

      {/* By-client + invoices grid */}
      <Grid cols={2} tabletCols={1} phoneCols={1} gap={16} style={{ marginBottom: '24px' }}>
        <Card padding="md">
          <h3
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: theme.textPrimary,
              marginBottom: '14px',
            }}
          >
            By client
          </h3>
          {loading ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : byClient.length === 0 ? (
            <EmptyState message="No outstanding receivables" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Client', 'Open', 'Outstanding', 'Oldest due', 'Overdue'].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          padding: '6px 8px',
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
                  {byClient.slice(0, 10).map((c) => (
                    <tr
                      key={c.client_name}
                      onClick={() => {
                        setSelectedClient(selectedClient === c.client_name ? '' : c.client_name)
                      }}
                      style={{
                        borderBottom: `1px solid ${theme.tableBorder}`,
                        cursor: 'pointer',
                        background:
                          selectedClient === c.client_name ? theme.accentBg : 'transparent',
                      }}
                    >
                      <td style={{ padding: '7px 8px', color: theme.textPrimary, fontWeight: 500 }}>
                        {c.client_name}
                      </td>
                      <td style={{ padding: '7px 8px', color: theme.textMuted }}>
                        {c.invoice_count}
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <AmountDisplay
                          amount={parseFloat(c.total_outstanding)}
                          currency="IQD"
                          size="sm"
                        />
                      </td>
                      <td
                        style={{
                          padding: '7px 8px',
                          color:
                            new Date(c.oldest_due_date) < new Date()
                              ? theme.danger
                              : theme.textMuted,
                        }}
                      >
                        {c.oldest_due_date?.slice(0, 10) ?? '—'}
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        {c.overdue_count > 0 ? (
                          <Badge variant="danger" size="sm">
                            {c.overdue_count}
                          </Badge>
                        ) : (
                          <span style={{ color: theme.textMuted }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectedClient && (
                <p
                  style={{
                    fontSize: '11px',
                    color: theme.accent,
                    marginTop: '8px',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setSelectedClient('')
                  }}
                >
                  Clear filter ×
                </p>
              )}
            </div>
          )}
        </Card>

        <Card padding="md">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
            }}
          >
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary }}>
              Outstanding invoices
            </h3>
            <Button variant="ghost" size="sm" onClick={exportCSV}>
              Export CSV
            </Button>
          </div>

          {/* Filter bar */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
              }}
              placeholder="Search invoice # or client…"
              style={{
                flex: 1,
                minWidth: '140px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${theme.border}`,
                background: theme.bgSurface,
                color: theme.textPrimary,
                fontSize: '12px',
              }}
            />
            <div style={{ minWidth: '140px' }}>
              <SearchableSelect
                value={sourceFilter}
                onChange={(v) => {
                  setSourceFilter(v)
                }}
                placeholder="All sources"
                options={[
                  { value: 'project', label: 'Project' },
                  { value: 'rental', label: 'Rental' },
                ]}
              />
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '12px',
                color: theme.textSecondary,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => {
                  setOverdueOnly(e.target.checked)
                }}
              />
              Overdue only
            </label>
          </div>

          {loading ? (
            <div className="skeleton" style={{ height: 200 }} />
          ) : filteredInvoices.length === 0 ? (
            <EmptyState message="No invoices found" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    {['Invoice #', 'Client', 'Type', 'Outstanding', 'Due', 'Status', 'Days'].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: 'left',
                            padding: '6px 8px',
                            color: theme.textMuted,
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => {
                        navigate(invoiceLink(inv))
                      }}
                      style={{ borderBottom: `1px solid ${theme.tableBorder}`, cursor: 'pointer' }}
                    >
                      <td
                        style={{ padding: '7px 8px', fontFamily: 'monospace', color: theme.accent }}
                      >
                        {inv.invoice_number}
                      </td>
                      <td style={{ padding: '7px 8px', color: theme.textSecondary }}>
                        {inv.client_name}
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <Badge
                          variant={inv.source_type === 'project' ? 'accent' : 'warning'}
                          size="sm"
                        >
                          {inv.source_type}
                        </Badge>
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <AmountDisplay
                          amount={parseFloat(inv.outstanding)}
                          currency={inv.currency_code}
                          size="sm"
                        />
                      </td>
                      <td
                        style={{
                          padding: '7px 8px',
                          color: inv.days_overdue > 0 ? theme.danger : theme.textMuted,
                        }}
                      >
                        {inv.due_date?.slice(0, 10)}
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <Badge variant={statusVariant(inv.status)} size="sm">
                          {inv.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <DaysCell days={inv.days_overdue} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {total > 20 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '12px',
                  }}
                >
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>{total} total</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => {
                        setPage((p) => p - 1)
                      }}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page * 20 >= total}
                      onClick={() => {
                        setPage((p) => p + 1)
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </Grid>
    </div>
  )
}
