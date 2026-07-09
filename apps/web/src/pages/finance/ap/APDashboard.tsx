import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../../theme/ThemeContext'
import { useCompanyStore } from '../../../store/companyStore'
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
import { EmptyState } from '../../../components/ui/EmptyState'

interface APSummary {
  total_outstanding: string
  bucket_0_30: string
  bucket_31_60: string
  bucket_61_90: string
  bucket_over_90: string
  open_invoice_count: number
  overdue_count: number
  pending_approval_count: number
  paid_this_month: string
}

interface VendorInvoice {
  id: string
  vendor_name: string
  po_number?: string
  invoice_number: string
  invoice_date: string
  due_date: string
  total_amount: string
  net_payable: string
  amount_paid: string
  outstanding: string
  currency_code: string
  status: string
  days_overdue: number
  submitted_by_email?: string
  approved_by_email?: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Pending approval',
  approved: 'Approved',
  partially_paid: 'Partial',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

const STATUS_VARIANTS: Record<string, 'neutral' | 'warning' | 'accent' | 'info' | 'success' | 'danger'> = {
  draft: 'neutral',
  submitted: 'warning',
  approved: 'accent',
  partially_paid: 'info',
  paid: 'success',
  cancelled: 'danger',
}

function fmtAmt(val: string | number | undefined) {
  return parseFloat(String(val ?? 0)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function AgingBar({ label, amount, total, color }: { label: string; amount: number; total: number; color: string }) {
  const { theme } = useTheme()
  const pct = total > 0 ? Math.min((amount / total) * 100, 100) : 0
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
        <span style={{ color: theme.textSecondary }}>{label}</span>
        <span style={{ color: theme.textPrimary, fontWeight: 500 }}>IQD {fmtAmt(amount)}</span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', background: theme.bgSurfaceHover }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

export default function APDashboard() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)
  const activeCompany = useCompanyStore((s) => s.activeCompany)
  const { can } = usePermission()
  const canApproveAP = can('finance.ap.approve', 'approve')

  const [summary, setSummary] = useState<APSummary | null>(null)
  const [invoices, setInvoices] = useState<VendorInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveLoading, setApproveLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, invRes] = await Promise.all([
        api.get<APSummary>('/finance/vendor-invoices/ap-summary'),
        api.get<{ items: VendorInvoice[] } | VendorInvoice[]>('/finance/vendor-invoices', {
          params: statusFilter ? { status: statusFilter } : undefined,
        }),
      ])
      setSummary(sumRes.data)
      const raw = invRes.data as unknown
      if (Array.isArray(raw)) setInvoices(raw as VendorInvoice[])
      else setInvoices((raw as { items?: VendorInvoice[] }).items ?? [])
    } catch {
      addToast({ type: 'error', message: 'Failed to load AP data' })
    } finally {
      setLoading(false)
    }
  }, [addToast, statusFilter])

  useEffect(() => { void fetchData() }, [fetchData])

  async function handleApprove() {
    if (!approvingId) return
    setApproveLoading(true)
    try {
      await api.post(`/finance/vendor-invoices/${approvingId}/approve`)
      addToast({ type: 'success', message: 'Invoice approved' })
      setApprovingId(null)
      void fetchData()
    } catch (e: unknown) {
      addToast({ type: 'error', message: apiErrMsg(e, 'Approval failed') })
    } finally {
      setApproveLoading(false)
    }
  }

  const s = summary
  const totalOutstanding = parseFloat(s?.total_outstanding ?? '0')
  const b0 = parseFloat(s?.bucket_0_30 ?? '0')
  const b31 = parseFloat(s?.bucket_31_60 ?? '0')
  const b61 = parseFloat(s?.bucket_61_90 ?? '0')
  const b90 = parseFloat(s?.bucket_over_90 ?? '0')

  const approvingInv = invoices.find(i => i.id === approvingId)

  const filtered = invoices.filter(inv => {
    if (!search) return true
    const q = search.toLowerCase()
    return inv.invoice_number.toLowerCase().includes(q) || inv.vendor_name.toLowerCase().includes(q)
  }).sort((a, b) => {
    // pending approval first, then overdue, then by due date
    const scoreA = a.status === 'submitted' ? 0 : a.days_overdue > 0 ? 1 : 2
    const scoreB = b.status === 'submitted' ? 0 : b.days_overdue > 0 ? 1 : 2
    if (scoreA !== scoreB) return scoreA - scoreB
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  })

  return (
    <div style={{ padding: '24px', margin: '0 auto', maxWidth: '1600px' }}>
      <PageHeader
        title="Accounts Payable"
        subtitle={activeCompany?.name ?? ''}
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate('/finance/ap/new')}>New vendor invoice</Button>
        }
      />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Total Outstanding', value: `IQD ${fmtAmt(totalOutstanding)}`, color: totalOutstanding > 0 ? theme.danger : theme.textPrimary },
          { label: 'Pending Approval', value: `${s?.pending_approval_count ?? 0}`, sub: 'invoices', color: (s?.pending_approval_count ?? 0) > 0 ? theme.warning : theme.textPrimary, onClick: () => setStatusFilter('submitted') },
          { label: 'Overdue', value: `${s?.overdue_count ?? 0}`, sub: `IQD ${fmtAmt(b31 + b61 + b90)} overdue`, color: (s?.overdue_count ?? 0) > 0 ? theme.danger : theme.textPrimary },
          { label: 'Paid This Month', value: `IQD ${fmtAmt(s?.paid_this_month ?? 0)}`, color: theme.success },
        ].map((kpi, i) => (
          <div key={i} style={{ cursor: kpi.onClick ? 'pointer' : undefined }} onClick={kpi.onClick}>
            <Card padding="md">
              {loading ? <div className="skeleton" style={{ height: 60 }} /> : (
                <>
                  <p style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{kpi.label}</p>
                  <p style={{ fontSize: '22px', fontWeight: 700, color: kpi.color, margin: 0 }}>{kpi.value}</p>
                  {kpi.sub && <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>{kpi.sub}</p>}
                </>
              )}
            </Card>
          </div>
        ))}
      </div>

      {/* Aging */}
      <Card padding="md" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>AP aging</h3>
        <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '14px' }}>What FNC owes vendors by age</p>
        {loading ? <div className="skeleton" style={{ height: 100 }} /> : (
          <>
            <AgingBar label="0-30 days (current)" amount={b0} total={totalOutstanding} color={theme.success} />
            <AgingBar label="31-60 days" amount={b31} total={totalOutstanding} color={theme.warning} />
            <AgingBar label="61-90 days" amount={b61} total={totalOutstanding} color={theme.danger} />
            <AgingBar label="Over 90 days" amount={b90} total={totalOutstanding} color="#dc2626" />
          </>
        )}
      </Card>

      {/* Invoice table */}
      <Card padding="none">
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: theme.textPrimary, marginRight: '8px' }}>Vendor invoices</h3>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search invoice # or vendor…"
            style={{ flex: 1, minWidth: '160px', padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bgSurface, color: theme.textPrimary, fontSize: '12px' }}
          />
          {(['', 'draft', 'submitted', 'approved', 'partially_paid', 'paid', 'cancelled'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{
                padding: '4px 10px', borderRadius: '20px', border: `1px solid ${statusFilter === s ? theme.accent : theme.border}`,
                background: statusFilter === s ? theme.accentBg : 'transparent',
                color: statusFilter === s ? theme.accent : theme.textMuted,
                fontSize: '11px', cursor: 'pointer', fontWeight: statusFilter === s ? 600 : 400,
              }}
            >{s === '' ? 'All' : STATUS_LABELS[s] ?? s}</button>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: '20px' }}><div className="skeleton" style={{ height: 200 }} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No vendor invoices" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  {['Invoice #', 'Vendor', 'PO #', 'Invoice date', 'Due date', 'Net payable', 'Outstanding', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 14px', color: theme.textMuted, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const isOverdue = inv.days_overdue > 0 && !['paid', 'cancelled'].includes(inv.status)
                  return (
                    <tr key={inv.id}
                      style={{
                        borderBottom: `1px solid ${theme.tableBorder}`,
                        borderLeft: isOverdue ? `3px solid ${theme.warning}` : '3px solid transparent',
                      }}
                    >
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: theme.accent, cursor: 'pointer' }} onClick={() => navigate(`/finance/ap/${inv.id}`)}>
                        {inv.invoice_number}
                      </td>
                      <td style={{ padding: '9px 14px', color: theme.textSecondary }}>{inv.vendor_name}</td>
                      <td style={{ padding: '9px 14px', color: theme.textMuted, fontFamily: 'monospace' }}>{inv.po_number ?? '—'}</td>
                      <td style={{ padding: '9px 14px', color: theme.textMuted }}>{inv.invoice_date?.slice(0, 10)}</td>
                      <td style={{ padding: '9px 14px', color: isOverdue ? theme.danger : theme.textMuted }}>{inv.due_date?.slice(0, 10)}</td>
                      <td style={{ padding: '9px 14px' }}><AmountDisplay amount={parseFloat(inv.net_payable)} currency={inv.currency_code} size="sm" /></td>
                      <td style={{ padding: '9px 14px' }}><AmountDisplay amount={parseFloat(inv.outstanding ?? '0')} currency={inv.currency_code} size="sm" /></td>
                      <td style={{ padding: '9px 14px' }}><Badge variant={STATUS_VARIANTS[inv.status] ?? 'neutral'} size="sm">{STATUS_LABELS[inv.status] ?? inv.status}</Badge></td>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/finance/ap/${inv.id}`)}>View</Button>
                          {canApproveAP && inv.status === 'submitted' && (
                            <Button variant="primary" size="sm" onClick={() => setApprovingId(inv.id)}>Approve</Button>
                          )}
                          {['approved', 'partially_paid'].includes(inv.status) && (
                            <Button variant="secondary" size="sm" onClick={() => navigate(`/finance/ap/${inv.id}`)}>Pay</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!approvingId}
        onClose={() => setApprovingId(null)}
        onConfirm={handleApprove}
        title="Approve vendor invoice"
        message={approvingInv ? `Approve invoice ${approvingInv.invoice_number} from ${approvingInv.vendor_name} for IQD ${fmtAmt(approvingInv.net_payable)}?` : ''}
        confirmLabel="Approve"
        loading={approveLoading}
      />
    </div>
  )
}
