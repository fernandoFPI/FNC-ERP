import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { useToastStore } from '../../../store/toastStore'
import { api } from '../../../lib/axios'

interface JobSummary {
  job_name: string
  last_run_at: string | null
  last_status: string | null
  last_duration_ms: number | null
  success_7d: number
  failed_7d: number
}

interface JobRun {
  id: string
  job_name: string
  status: 'running' | 'success' | 'partial' | 'failed'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  error_msg: string | null
  meta: Record<string, unknown> | null
}

const JOB_LABELS: Record<string, string> = {
  'fx-sync':                'FX Rate Sync',
  'fx-staleness-check':     'FX Staleness Check',
  'outbox-processor':       'Outbox Processor',
  'rental-billing':         'Rental Auto-billing',
  'payroll-reminder':       'Payroll Reminder',
  'low-stock-alert':        'Low Stock Alert',
  'contract-expiry-alerts': 'Contract Expiry Alerts',
  'asset-depreciation':     'Asset Depreciation',
  'file-cleanup-pending':   'File Cleanup (Pending)',
  'file-cleanup-unattached':'File Cleanup (Unattached)',
  'maintenance-due-check':  'Maintenance Due Check',
  'maintenance-overdue-mark':'Maintenance Overdue Mark',
}

const JOB_SCHEDULES: Record<string, string> = {
  'fx-sync':                'Daily 05:00 UTC',
  'fx-staleness-check':     'Every 6 hours',
  'outbox-processor':       'Every 5 seconds',
  'rental-billing':         'Daily 01:00',
  'payroll-reminder':       '25th of month 09:00',
  'low-stock-alert':        'Daily 06:00',
  'contract-expiry-alerts': 'Daily 08:00',
  'asset-depreciation':     '1st of month 02:00',
  'file-cleanup-pending':   'Every hour',
  'file-cleanup-unattached':'Daily 03:00',
  'maintenance-due-check':  'Daily 07:00',
  'maintenance-overdue-mark':'Daily 08:00',
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  const secs = ms / 1000
  if (secs < 60) return `${secs.toFixed(1)}s`
  const mins = Math.floor(secs / 60)
  const rem  = Math.round(secs % 60)
  return `${mins}m ${rem}s`
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'Just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'success' ? 'success' :
    status === 'partial' ? 'warning' :
    status === 'failed'  ? 'danger'  :
    status === 'running' ? 'info'    : 'neutral'
  return <Badge variant={variant} size="sm">{status}</Badge>
}

export default function JobHistoryPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [summaries, setSummaries] = useState<JobSummary[]>([])
  const [runs, setRuns]           = useState<JobRun[]>([])
  const [total, setTotal]         = useState(0)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingRuns, setLoadingRuns]       = useState(true)
  const [filterJob, setFilterJob]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(0)
  const LIMIT = 50

  const loadSummary = useCallback(() => {
    setLoadingSummary(true)
    api.get<{ summaries: JobSummary[] }>('/admin/job-runs/summary')
      .then((r) => setSummaries((r.data as unknown as { summaries: JobSummary[] }).summaries ?? []))
      .catch(() => addToast({ type: 'error', message: 'Failed to load job summary' }))
      .finally(() => setLoadingSummary(false))
  }, [addToast])

  const loadRuns = useCallback(() => {
    setLoadingRuns(true)
    const params = new URLSearchParams()
    if (filterJob)    params.set('job_name', filterJob)
    if (filterStatus) params.set('status', filterStatus)
    params.set('limit',  String(LIMIT))
    params.set('offset', String(page * LIMIT))
    api.get<{ runs: JobRun[]; total: number }>(`/admin/job-runs?${params.toString()}`)
      .then((r) => {
        const d = r.data as unknown as { runs: JobRun[]; total: number }
        setRuns(d.runs ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => addToast({ type: 'error', message: 'Failed to load job runs' }))
      .finally(() => setLoadingRuns(false))
  }, [addToast, filterJob, filterStatus, page])

  useEffect(() => { void loadSummary() }, [loadSummary])
  useEffect(() => { void loadRuns() },    [loadRuns])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => { void loadSummary(); void loadRuns() }, 30_000)
    return () => clearInterval(id)
  }, [loadSummary, loadRuns])

  const uniqueJobs = Array.from(new Set([
    ...summaries.map((s) => s.job_name),
    ...Object.keys(JOB_LABELS),
  ])).sort()

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div style={{ padding: '24px', maxWidth: '1000px' }}>
      <PageHeader
        title="Job History"
        subtitle="Background job execution history — auto-refreshes every 30 seconds"
      />

      {/* ── Summary Cards ── */}
      {loadingSummary ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', marginTop: '20px' }}>
          {[1,2,3,4].map((i) => (
            <div key={i} className="skeleton" style={{ height: '88px', borderRadius: '10px' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', marginTop: '20px' }}>
          {summaries.map((s) => {
            const hasFails = s.failed_7d > 0
            return (
              <Card
                key={s.job_name}
                style={{
                  padding: '12px 14px',
                  borderLeft: `3px solid ${
                    s.last_status === 'success' ? theme.success  :
                    s.last_status === 'partial' ? theme.warning  :
                    s.last_status === 'failed'  ? theme.danger   :
                    s.last_status === 'running' ? theme.accent   :
                    theme.border
                  }`,
                  cursor: 'pointer',
                }}
                onClick={() => { setFilterJob(s.job_name); setPage(0) }}
              >
                <div style={{ fontSize: '12px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {JOB_LABELS[s.job_name] ?? s.job_name}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '6px' }}>
                  {JOB_SCHEDULES[s.job_name] ?? ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  {s.last_status
                    ? <StatusBadge status={s.last_status} />
                    : <span style={{ fontSize: '11px', color: theme.textMuted }}>Never ran</span>
                  }
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>{fmtRelative(s.last_run_at)}</span>
                </div>
                {(s.success_7d > 0 || hasFails) && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px', fontSize: '10px' }}>
                    {s.success_7d > 0 && (
                      <span style={{ color: theme.success }}>✓ {s.success_7d} this week</span>
                    )}
                    {hasFails && (
                      <span style={{ color: theme.danger }}>✗ {s.failed_7d} failed</span>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Run Table ── */}
      <div style={{ marginTop: '28px' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <select
            value={filterJob}
            onChange={(e) => { setFilterJob(e.target.value); setPage(0) }}
            style={{
              height: '34px', padding: '0 10px', fontSize: '13px',
              background: theme.bgSurface, border: `1px solid ${theme.border}`,
              borderRadius: '8px', color: theme.textPrimary,
              outline: 'none', cursor: 'pointer', minWidth: '200px',
            }}
          >
            <option value="">All jobs</option>
            {uniqueJobs.map((j) => (
              <option key={j} value={j}>{JOB_LABELS[j] ?? j}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(0) }}
            style={{
              height: '34px', padding: '0 10px', fontSize: '13px',
              background: theme.bgSurface, border: `1px solid ${theme.border}`,
              borderRadius: '8px', color: theme.textPrimary,
              outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">All statuses</option>
            <option value="running">Running</option>
            <option value="success">Success</option>
            <option value="partial">Partial</option>
            <option value="failed">Failed</option>
          </select>

          {(filterJob || filterStatus) && (
            <button
              onClick={() => { setFilterJob(''); setFilterStatus(''); setPage(0) }}
              style={{
                height: '34px', padding: '0 12px', fontSize: '12px',
                background: 'none', border: `1px solid ${theme.border}`,
                borderRadius: '8px', color: theme.textMuted,
                cursor: 'pointer',
              }}
            >
              Clear filters
            </button>
          )}

          <span style={{ marginLeft: 'auto', fontSize: '12px', color: theme.textMuted, lineHeight: '34px' }}>
            {total.toLocaleString()} run{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', borderRadius: '10px', border: `1px solid ${theme.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: theme.bgSurface, borderBottom: `1px solid ${theme.border}` }}>
                {['Job', 'Status', 'Started', 'Duration', 'Details'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: theme.textMuted, fontSize: '11px', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingRuns ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} style={{ padding: '10px 14px' }}>
                      <div className="skeleton" style={{ height: '18px', borderRadius: '4px' }} />
                    </td>
                  </tr>
                ))
              ) : runs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
                    No job runs found
                  </td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr
                    key={run.id}
                    style={{ borderBottom: `1px solid ${theme.border}` }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = theme.bgSurfaceHover }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ padding: '10px 14px', color: theme.textPrimary, fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {JOB_LABELS[run.job_name] ?? run.job_name}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <StatusBadge status={run.status} />
                    </td>
                    <td style={{ padding: '10px 14px', color: theme.textMuted, whiteSpace: 'nowrap' }}>
                      <span title={fmtTime(run.started_at)}>{fmtRelative(run.started_at)}</span>
                    </td>
                    <td style={{ padding: '10px 14px', color: theme.textMuted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmtDuration(run.duration_ms)}
                    </td>
                    <td style={{ padding: '10px 14px', color: theme.textMuted, maxWidth: '320px' }}>
                      {run.error_msg ? (
                        <span style={{ color: theme.danger, fontSize: '12px' }} title={run.error_msg}>
                          {run.error_msg.length > 80 ? run.error_msg.slice(0, 80) + '…' : run.error_msg}
                        </span>
                      ) : run.meta ? (
                        <span style={{ fontSize: '12px' }}>
                          {Object.entries(run.meta)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(' · ')}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              style={{
                padding: '6px 14px', fontSize: '13px', borderRadius: '8px',
                background: theme.bgSurface, border: `1px solid ${theme.border}`,
                color: page === 0 ? theme.textMuted : theme.textPrimary,
                cursor: page === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Previous
            </button>
            <span style={{ lineHeight: '32px', fontSize: '13px', color: theme.textMuted }}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              style={{
                padding: '6px 14px', fontSize: '13px', borderRadius: '8px',
                background: theme.bgSurface, border: `1px solid ${theme.border}`,
                color: page >= totalPages - 1 ? theme.textMuted : theme.textPrimary,
                cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
