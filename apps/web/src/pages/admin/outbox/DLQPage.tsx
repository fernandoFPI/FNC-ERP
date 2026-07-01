import { useState, useEffect } from 'react'
import { useQuery, useMutation, useApolloClient } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { EmptyState } from '../../../components/ui/EmptyState'
import { FilterBar } from '../../../components/ui/FilterBar'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Textarea } from '../../../components/ui/Textarea'
import { useToastStore } from '../../../store/toastStore'
import { OUTBOX_DLQ_QUERY, RETRY_DLQ_ENTRY, DISMISS_DLQ_ENTRY } from '../../../graphql/admin'

interface ErrorHistoryItem {
  attempt: number
  error: string
  at: string
}

interface DLQItem {
  id: string
  eventType: string
  service: string
  priority: string
  status: string
  totalAttempts: number
  lastError: string
  errorHistory: ErrorHistoryItem[]
  createdAt: string
  reviewedBy: string | null
  reviewNotes: string | null
  payload: string
}

interface DLQData {
  outboxDLQ: {
    items: DLQItem[]
    total: number
    page: number
    limit: number
  }
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  medium: 2,
  low: 3,
}

function priorityVariant(p: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    critical: 'danger', high: 'warning', medium: 'info', normal: 'info', low: 'neutral',
  }
  return m[p?.toLowerCase()] ?? 'neutral'
}

function statusVariant(s: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    pending_review: 'warning', retrying: 'info', dismissed: 'neutral', resolved: 'success',
  }
  return m[s?.toLowerCase()] ?? 'neutral'
}

export default function DLQPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)
  const apolloClient = useApolloClient()

  useEffect(() => {
    if (document.getElementById('fnc-pulse-style')) return
    const style = document.createElement('style')
    style.id = 'fnc-pulse-style'
    style.textContent = `@keyframes fnc-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.06); } }`
    document.head.appendChild(style)
  }, [])

  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dismissTarget, setDismissTarget] = useState<DLQItem | null>(null)
  const [retryTarget, setRetryTarget] = useState<DLQItem | null>(null)
  const [notes, setNotes] = useState('')

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDismissNotes, setBulkDismissNotes] = useState('')
  const [bulkDismissOpen, setBulkDismissOpen] = useState(false)
  const [confirmRetryOpen, setConfirmRetryOpen] = useState(false)
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  const { data, loading, refetch } = useQuery<DLQData>(OUTBOX_DLQ_QUERY, {
    variables: {
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      page: 1,
      limit: 50,
    },
  })

  const [retryEntry, { loading: retrying }] = useMutation(RETRY_DLQ_ENTRY, {
    onCompleted: () => { addToast({ type: 'success', message: 'Entry queued for retry' }); setRetryTarget(null); setNotes(''); refetch() },
    onError: (e) => { addToast({ type: 'error', message: e.message }); setRetryTarget(null) },
  })

  const [dismissEntry, { loading: dismissing }] = useMutation(DISMISS_DLQ_ENTRY, {
    onCompleted: () => { addToast({ type: 'success', message: 'Entry dismissed' }); setDismissTarget(null); setNotes(''); refetch() },
    onError: (e) => { addToast({ type: 'error', message: e.message }); setDismissTarget(null) },
  })

  const items = data?.outboxDLQ.items ?? []

  // Sort: critical first, then by createdAt oldest first within same priority
  const sortedItems = [...items].sort((a, b) => {
    const priorityDiff = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
    if (priorityDiff !== 0) return priorityDiff
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  const allIds = sortedItems.map(e => e.id)
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id))

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allIds))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkRetry() {
    setBulkActionLoading(true)
    try {
      await Promise.all(
        [...selectedIds].map(id =>
          apolloClient.mutate({ mutation: RETRY_DLQ_ENTRY, variables: { dlqId: id } })
        )
      )
      addToast({ type: 'success', message: `${selectedIds.size} event(s) queued for retry` })
      setSelectedIds(new Set())
      refetch()
    } catch {
      addToast({ type: 'error', message: 'Bulk retry failed' })
    } finally {
      setBulkActionLoading(false)
    }
  }

  async function handleBulkDismiss() {
    if (bulkDismissNotes.trim().length < 10) return
    setBulkActionLoading(true)
    try {
      await Promise.all(
        [...selectedIds].map(id =>
          apolloClient.mutate({ mutation: DISMISS_DLQ_ENTRY, variables: { dlqId: id, notes: bulkDismissNotes } })
        )
      )
      addToast({ type: 'success', message: `${selectedIds.size} event(s) dismissed` })
      setSelectedIds(new Set())
      setBulkDismissOpen(false)
      setBulkDismissNotes('')
      refetch()
    } catch {
      addToast({ type: 'error', message: 'Bulk dismiss failed' })
    } finally {
      setBulkActionLoading(false)
    }
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: '10px',
    fontWeight: 600,
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Dead Letter Queue"
        subtitle="Events that exhausted all retry attempts"
        actions={
          <Button variant="ghost" size="sm" onClick={() => { refetch() }}>Refresh</Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '12px' }}>
        <FilterBar
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'pending_review', label: 'Pending Review' },
                { value: 'retrying', label: 'Retrying' },
                { value: 'dismissed', label: 'Dismissed' },
                { value: 'resolved', label: 'Resolved' },
              ],
            },
            {
              key: 'priority',
              label: 'Priority',
              value: priorityFilter,
              onChange: setPriorityFilter,
              options: [
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ],
            },
          ]}
          resultCount={sortedItems.length}
          onRefresh={() => { refetch() }}
        />
      </Card>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          background: theme.accentBg,
          border: `0.5px solid ${theme.accentBorder}`,
          borderRadius: '10px',
          marginBottom: '10px',
        }}>
          <span style={{ fontSize: '12px', color: theme.accent, fontWeight: 500 }}>
            {selectedIds.size} selected
          </span>
          <Button
            variant="secondary"
            size="sm"
            loading={bulkActionLoading}
            onClick={() => setConfirmRetryOpen(true)}
          >
            Retry selected
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setBulkDismissOpen(true)}
          >
            Dismiss selected
          </Button>
          <button
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '12px' }}
            onClick={() => setSelectedIds(new Set())}
          >
            Clear selection
          </button>
        </div>
      )}

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: '48px', borderRadius: '6px', marginBottom: '8px' }} />
            ))}
          </div>
        ) : sortedItems.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  <th style={{ ...thStyle, width: '36px', padding: '6px 8px 6px 14px' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      style={{ accentColor: theme.accent, cursor: 'pointer' }}
                    />
                  </th>
                  {['Event Type', 'Service', 'Priority', 'Status', 'Attempts', 'Created', ''].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedItems.map(item => (
                  <>
                    <tr key={item.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = theme.bgSurfaceHover }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                      <td style={{ padding: '8px 8px 8px 14px', verticalAlign: 'middle' }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleOne(item.id)}
                          style={{ accentColor: theme.accent, cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ padding: '12px 14px', color: theme.textPrimary, fontFamily: 'ui-monospace, monospace', fontSize: '12px' }}>{item.eventType}</td>
                      <td style={{ padding: '12px 14px' }}><Badge variant="neutral" size="sm">{item.service}</Badge></td>
                      <td style={{ padding: '12px 14px' }}>
                        {item.priority === 'critical' ? (
                          <span style={{ animation: 'fnc-pulse 1.8s ease-in-out infinite', display: 'inline-flex' }}>
                            <Badge variant="danger" size="sm">critical</Badge>
                          </span>
                        ) : (
                          <Badge variant={priorityVariant(item.priority)} size="sm">{item.priority}</Badge>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}><Badge variant={statusVariant(item.status)} size="sm">{item.status}</Badge></td>
                      <td style={{ padding: '12px 14px', color: theme.danger, fontWeight: 500 }}>{item.totalAttempts}</td>
                      <td style={{ padding: '12px 14px', color: theme.textMuted, fontSize: '12px' }}>{new Date(item.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {item.status !== 'dismissed' && item.status !== 'resolved' && (
                            <>
                              <Button variant="secondary" size="sm" onClick={() => { setRetryTarget(item); setNotes('') }}>Retry</Button>
                              <Button variant="danger" size="sm" onClick={() => { setDismissTarget(item); setNotes('') }}>Dismiss</Button>
                            </>
                          )}
                          <button
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.accent, fontSize: '12px', fontFamily: 'inherit' }}
                            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                          >
                            {expandedId === item.id ? 'Hide' : 'Details'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === item.id && (
                      <tr key={`${item.id}-exp`} style={{ background: theme.bgSurfaceHover }}>
                        <td colSpan={8} style={{ padding: '16px 24px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                            <div>
                              <p style={{ fontSize: '11px', fontWeight: 600, color: theme.danger, marginBottom: '6px' }}>Last Error</p>
                              <pre style={{ fontSize: '11px', color: theme.textSecondary, background: theme.bgSurface, padding: '8px', borderRadius: '6px', overflow: 'auto', margin: 0, maxHeight: '120px' }}>{item.lastError}</pre>
                            </div>
                            <div>
                              <p style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, marginBottom: '6px' }}>Error History ({item.errorHistory.length} attempts)</p>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflow: 'auto' }}>
                                {item.errorHistory.map(eh => (
                                  <div key={eh.attempt} style={{ fontSize: '11px', color: theme.textMuted }}>
                                    <span style={{ color: theme.danger, marginRight: '6px' }}>#{eh.attempt}</span>
                                    {new Date(eh.at).toLocaleString()} — {eh.error}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          {item.reviewNotes && (
                            <div style={{ marginTop: '12px' }}>
                              <p style={{ fontSize: '11px', fontWeight: 600, color: theme.textMuted, marginBottom: '4px' }}>Review Notes</p>
                              <p style={{ fontSize: '12px', color: theme.textSecondary }}>{item.reviewNotes} — {item.reviewedBy}</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="DLQ is clear" message="No events in the dead letter queue." />
        )}
      </Card>

      {/* Retry Modal */}
      <Modal
        open={!!retryTarget}
        onClose={() => setRetryTarget(null)}
        title={`Retry: ${retryTarget?.eventType ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setRetryTarget(null)} disabled={retrying}>Cancel</Button>
            <Button variant="primary" size="md" onClick={() => { if (retryTarget) retryEntry({ variables: { dlqId: retryTarget.id, notes: notes || undefined } }) }} loading={retrying}>Retry</Button>
          </>
        }
      >
        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Why are you retrying this event?"
          rows={3}
        />
      </Modal>

      {/* Dismiss Modal */}
      <Modal
        open={!!dismissTarget}
        onClose={() => setDismissTarget(null)}
        title={`Dismiss: ${dismissTarget?.eventType ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setDismissTarget(null)} disabled={dismissing}>Cancel</Button>
            <Button variant="danger" size="md" onClick={() => { if (dismissTarget) dismissEntry({ variables: { dlqId: dismissTarget.id, notes } }) }} loading={dismissing} disabled={notes.trim().length < 10}>Dismiss</Button>
          </>
        }
      >
        <Textarea
          label="Reason (required)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Explain why this event is being dismissed…"
          rows={3}
        />
        <div style={{ marginTop: '4px' }}>
          <span style={{ fontSize: '10px', color: notes.trim().length < 10 ? theme.danger : theme.textMuted }}>
            {notes.trim().length < 10
              ? `${10 - notes.trim().length} more characters required`
              : `${notes.trim().length} characters`}
          </span>
        </div>
      </Modal>

      {/* Bulk Dismiss Modal */}
      <Modal
        open={bulkDismissOpen}
        onClose={() => setBulkDismissOpen(false)}
        title={`Dismiss ${selectedIds.size} event(s)`}
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="ghost" size="md" onClick={() => setBulkDismissOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              size="md"
              loading={bulkActionLoading}
              disabled={bulkDismissNotes.trim().length < 10}
              onClick={() => { void handleBulkDismiss() }}
            >
              Dismiss all {selectedIds.size}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>
            These notes will be applied to all {selectedIds.size} selected events.
          </div>
          <Textarea
            label="Dismiss reason"
            value={bulkDismissNotes}
            onChange={(e) => setBulkDismissNotes(e.target.value)}
            placeholder="Explain why these events are being dismissed..."
            rows={3}
          />
          <div style={{ fontSize: '10px', color: bulkDismissNotes.trim().length < 10 ? theme.danger : theme.textMuted }}>
            {bulkDismissNotes.trim().length < 10
              ? `${10 - bulkDismissNotes.trim().length} more characters required`
              : `${bulkDismissNotes.trim().length} characters`}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmRetryOpen}
        onClose={() => setConfirmRetryOpen(false)}
        onConfirm={() => { setConfirmRetryOpen(false); void handleBulkRetry() }}
        title="Retry Events"
        message={`Re-queue ${selectedIds.size} event(s) for immediate retry?`}
        confirmLabel="Retry"
        confirmVariant="primary"
        loading={bulkActionLoading}
      />
    </div>
  )
}
