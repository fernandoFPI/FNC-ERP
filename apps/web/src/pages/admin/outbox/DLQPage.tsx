import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useApolloClient } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { FilterBar } from '../../../components/ui/FilterBar'
import { Modal } from '../../../components/ui/Modal'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Textarea } from '../../../components/ui/Textarea'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
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

function priorityVariant(
  p: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    critical: 'danger',
    high: 'warning',
    medium: 'info',
    normal: 'info',
    low: 'neutral',
  }
  return m[p.toLowerCase()] ?? 'neutral'
}

function statusVariant(
  s: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    pending_review: 'warning',
    retrying: 'info',
    dismissed: 'neutral',
    resolved: 'success',
  }
  return m[s.toLowerCase()] ?? 'neutral'
}

export default function DLQPage() {
  const { t } = useTranslation()
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
  const [detailItem, setDetailItem] = useState<DLQItem | null>(null)
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
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.dlq.entryQueuedForRetry') })
      setRetryTarget(null)
      setNotes('')
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setRetryTarget(null)
    },
  })

  const [dismissEntry, { loading: dismissing }] = useMutation(DISMISS_DLQ_ENTRY, {
    onCompleted: () => {
      addToast({ type: 'success', message: t('admin.dlq.entryDismissed') })
      setDismissTarget(null)
      setNotes('')
      void refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setDismissTarget(null)
    },
  })

  const items = data?.outboxDLQ.items ?? []

  // Sort: critical first, then by createdAt oldest first within same priority
  const sortedItems = [...items].sort((a, b) => {
    const priorityDiff = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
    if (priorityDiff !== 0) return priorityDiff
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  const allIds = sortedItems.map((e) => e.id)
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id))

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allIds))
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
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
        [...selectedIds].map((id) =>
          apolloClient.mutate({ mutation: RETRY_DLQ_ENTRY, variables: { dlqId: id } }),
        ),
      )
      addToast({ type: 'success', message: t('admin.dlq.queuedForRetry', { count: selectedIds.size }) })
      setSelectedIds(new Set())
      void refetch()
    } catch {
      addToast({ type: 'error', message: t('admin.dlq.bulkRetryFailed') })
    } finally {
      setBulkActionLoading(false)
    }
  }

  async function handleBulkDismiss() {
    if (bulkDismissNotes.trim().length < 10) return
    setBulkActionLoading(true)
    try {
      await Promise.all(
        [...selectedIds].map((id) =>
          apolloClient.mutate({
            mutation: DISMISS_DLQ_ENTRY,
            variables: { dlqId: id, notes: bulkDismissNotes },
          }),
        ),
      )
      addToast({ type: 'success', message: `${selectedIds.size} event(s) dismissed` })
      setSelectedIds(new Set())
      setBulkDismissOpen(false)
      setBulkDismissNotes('')
      void refetch()
    } catch {
      addToast({ type: 'error', message: t('admin.dlq.bulkDismissFailed') })
    } finally {
      setBulkActionLoading(false)
    }
  }

  const columns: Column<DLQItem>[] = [
    {
      key: 'select',
      header: '',
      width: '40px',
      mobileAction: true,
      renderHeader: () => (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          style={{ accentColor: theme.accent, cursor: 'pointer' }}
        />
      ),
      render: (item) => (
        <input
          type="checkbox"
          checked={selectedIds.has(item.id)}
          onClick={(ev) => {
            ev.stopPropagation()
          }}
          onChange={() => {
            toggleOne(item.id)
          }}
          style={{ accentColor: theme.accent, cursor: 'pointer' }}
        />
      ),
    },
    {
      key: 'eventType',
      header: t('admin.dlq.eventType'),
      mobilePrimary: true,
      render: (item) => (
        <span
          style={{
            color: theme.textPrimary,
            fontFamily: 'ui-monospace, monospace',
            fontSize: '12px',
          }}
        >
          {item.eventType}
        </span>
      ),
    },
    {
      key: 'service',
      header: t('admin.dlq.service'),
      mobileSecondary: true,
      render: (item) => (
        <Badge variant="neutral" size="sm">
          {item.service}
        </Badge>
      ),
    },
    {
      key: 'priority',
      header: t('admin.dlq.priority'),
      mobilePriority: 1,
      render: (item) =>
        item.priority === 'critical' ? (
          <span
            style={{ animation: 'fnc-pulse 1.8s ease-in-out infinite', display: 'inline-flex' }}
          >
            <Badge variant="danger" size="sm">
              {t('admin.dlq.critical')}
            </Badge>
          </span>
        ) : (
          <Badge variant={priorityVariant(item.priority)} size="sm">
            {item.priority}
          </Badge>
        ),
    },
    {
      key: 'status',
      header: t('admin.dlq.status'),
      mobilePriority: 2,
      render: (item) => (
        <Badge variant={statusVariant(item.status)} size="sm">
          {item.status}
        </Badge>
      ),
    },
    {
      key: 'totalAttempts',
      header: t('admin.dlq.attempts'),
      mobilePriority: 3,
      render: (item) => (
        <span style={{ color: theme.danger, fontWeight: 500 }}>{item.totalAttempts}</span>
      ),
    },
    {
      key: 'createdAt',
      header: t('admin.dlq.created'),
      mobilePriority: 4,
      render: (item) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobileLabel: t('admin.dlq.actions'),
      mobilePriority: 5,
      render: (item) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          {item.status !== 'dismissed' && item.status !== 'resolved' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setRetryTarget(item)
                  setNotes('')
                }}
              >
                {t('admin.dlq.retry')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setDismissTarget(item)
                  setNotes('')
                }}
              >
                {t('admin.dlq.dismiss')}
              </Button>
            </>
          )}
          <button
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: theme.accent,
              fontSize: '12px',
              fontFamily: 'inherit',
            }}
            onClick={() => {
              setDetailItem(item)
            }}
          >
            {t('admin.dlq.details')}
          </button>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title={t('admin.dlq.deadLetterQueue')}
        subtitle={t('admin.dlq.eventsThatExhaustedAllRetryAttempts')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
            }}
          >
            {t('admin.dlq.refresh')}
          </Button>
        }
      />

      <Card padding="sm" style={{ marginBottom: '12px' }}>
        <FilterBar
          filters={[
            {
              key: 'status',
              label: t('admin.dlq.status'),
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'pending_review', label: t('admin.dlq.pendingReview') },
                { value: 'retrying', label: t('admin.dlq.retrying') },
                { value: 'dismissed', label: t('admin.dlq.dismissed') },
                { value: 'resolved', label: t('admin.dlq.resolved') },
              ],
            },
            {
              key: 'priority',
              label: t('admin.dlq.priority'),
              value: priorityFilter,
              onChange: setPriorityFilter,
              options: [
                { value: 'critical', label: t('admin.dlq.critical2') },
                { value: 'high', label: t('admin.dlq.high') },
                { value: 'medium', label: t('admin.dlq.medium') },
                { value: 'low', label: t('admin.dlq.low') },
              ],
            },
          ]}
          resultCount={sortedItems.length}
          onRefresh={() => {
            void refetch()
          }}
        />
      </Card>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            background: theme.accentBg,
            border: `0.5px solid ${theme.accentBorder}`,
            borderRadius: '10px',
            marginBottom: '10px',
          }}
        >
          <span style={{ fontSize: '12px', color: theme.accent, fontWeight: 500 }}>
            {t('admin.dlq.selectedCount', { count: selectedIds.size })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            loading={bulkActionLoading}
            onClick={() => {
              setConfirmRetryOpen(true)
            }}
          >
            {t('admin.dlq.retrySelected')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setBulkDismissOpen(true)
            }}
          >
            {t('admin.dlq.dismissSelected')}
          </Button>
          <button
            style={{
              marginInlineStart: 'auto',
              background: 'none',
              border: 'none',
              color: theme.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
            }}
            onClick={() => {
              setSelectedIds(new Set())
            }}
          >
            {t('admin.dlq.clearSelection')}
          </button>
        </div>
      )}

      <Card padding="none">
        <Table
          columns={columns}
          data={sortedItems}
          rowKey="id"
          loading={loading && sortedItems.length === 0}
          emptyMessage={t('admin.dlq.noEventsInTheDeadLetter')}
          getRowStyle={(item) =>
            selectedIds.has(item.id) ? { background: `${theme.accent}22` } : {}
          }
        />
      </Card>

      {/* Details Modal */}
      <Modal
        open={!!detailItem}
        onClose={() => {
          setDetailItem(null)
        }}
        title={`Details: ${detailItem?.eventType ?? ''}`}
        size="lg"
      >
        {detailItem && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: theme.danger,
                    marginBottom: '6px',
                  }}
                >
                  {t('admin.dlq.lastError')}
                </p>
                <pre
                  style={{
                    fontSize: '11px',
                    color: theme.textSecondary,
                    background: theme.bgSurface,
                    padding: '8px',
                    borderRadius: '6px',
                    overflow: 'auto',
                    margin: 0,
                    maxHeight: '120px',
                  }}
                >
                  {detailItem.lastError}
                </pre>
              </div>
              <div>
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: theme.textMuted,
                    marginBottom: '6px',
                  }}
                >
                  {t('admin.dlq.errorHistory', { count: detailItem.errorHistory.length })}
                </p>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    maxHeight: '120px',
                    overflow: 'auto',
                  }}
                >
                  {detailItem.errorHistory.map((eh) => (
                    <div key={eh.attempt} style={{ fontSize: '11px', color: theme.textMuted }}>
                      <span style={{ color: theme.danger, marginInlineEnd: '6px' }}>#{eh.attempt}</span>
                      {new Date(eh.at).toLocaleString()} — {eh.error}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {detailItem.reviewNotes && (
              <div style={{ marginTop: '12px' }}>
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: theme.textMuted,
                    marginBottom: '4px',
                  }}
                >
                  {t('admin.dlq.reviewNotes')}
                </p>
                <p style={{ fontSize: '12px', color: theme.textSecondary }}>
                  {detailItem.reviewNotes} — {detailItem.reviewedBy}
                </p>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Retry Modal */}
      <Modal
        open={!!retryTarget}
        onClose={() => {
          setRetryTarget(null)
        }}
        title={`Retry: ${retryTarget?.eventType ?? ''}`}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setRetryTarget(null)
              }}
              disabled={retrying}
            >
              {t('admin.dlq.cancel')}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                if (retryTarget)
                  void retryEntry({ variables: { dlqId: retryTarget.id, notes: notes || undefined } })
              }}
              loading={retrying}
            >
              {t('admin.dlq.retry')}
            </Button>
          </>
        }
      >
        <Textarea
          label={t('admin.dlq.notesOptional')}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
          }}
          placeholder={t('admin.dlq.whyAreYouRetryingThisEvent')}
          rows={3}
        />
      </Modal>

      {/* Dismiss Modal */}
      <Modal
        open={!!dismissTarget}
        onClose={() => {
          setDismissTarget(null)
        }}
        title={`Dismiss: ${dismissTarget?.eventType ?? ''}`}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setDismissTarget(null)
              }}
              disabled={dismissing}
            >
              {t('admin.dlq.cancel')}
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                if (dismissTarget) void dismissEntry({ variables: { dlqId: dismissTarget.id, notes } })
              }}
              loading={dismissing}
              disabled={notes.trim().length < 10}
            >
              {t('admin.dlq.dismiss')}
            </Button>
          </>
        }
      >
        <Textarea
          label={t('admin.dlq.reasonRequired')}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
          }}
          placeholder={t('admin.dlq.explainWhyThisEventIsBeing')}
          rows={3}
        />
        <div style={{ marginTop: '4px' }}>
          <span
            style={{
              fontSize: '10px',
              color: notes.trim().length < 10 ? theme.danger : theme.textMuted,
            }}
          >
            {notes.trim().length < 10
              ? t('admin.dlq.moreCharsRequired', { count: 10 - notes.trim().length })
              : t('admin.dlq.charsCount', { count: notes.trim().length })}
          </span>
        </div>
      </Modal>

      {/* Bulk Dismiss Modal */}
      <Modal
        open={bulkDismissOpen}
        onClose={() => {
          setBulkDismissOpen(false)
        }}
        title={`Dismiss ${selectedIds.size} event(s)`}
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setBulkDismissOpen(false)
              }}
            >
              {t('admin.dlq.cancel')}
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={bulkActionLoading}
              disabled={bulkDismissNotes.trim().length < 10}
              onClick={() => {
                void handleBulkDismiss()
              }}
            >
              {t('admin.dlq.dismissAll', { count: selectedIds.size })}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '12px', color: theme.textSecondary }}>
            {t('admin.dlq.notesApplied', { count: selectedIds.size })}
          </div>
          <Textarea
            label={t('admin.dlq.dismissReason')}
            value={bulkDismissNotes}
            onChange={(e) => {
              setBulkDismissNotes(e.target.value)
            }}
            placeholder={t('admin.dlq.explainWhyTheseEventsAreBeing')}
            rows={3}
          />
          <div
            style={{
              fontSize: '10px',
              color: bulkDismissNotes.trim().length < 10 ? theme.danger : theme.textMuted,
            }}
          >
            {bulkDismissNotes.trim().length < 10
              ? t('admin.dlq.moreCharsRequired', { count: 10 - bulkDismissNotes.trim().length })
              : t('admin.dlq.charsCount', { count: bulkDismissNotes.trim().length })}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmRetryOpen}
        onClose={() => {
          setConfirmRetryOpen(false)
        }}
        onConfirm={() => {
          setConfirmRetryOpen(false)
          void handleBulkRetry()
        }}
        title={t('admin.dlq.retryEvents')}
        message={t('admin.dlq.requeueConfirm', { count: selectedIds.size })}
        confirmLabel={t('admin.dlq.retry')}
        confirmVariant="primary"
        loading={bulkActionLoading}
      />
    </div>
  )
}
