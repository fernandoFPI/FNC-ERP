import { useState, useEffect } from 'react'
import { useQuery, useMutation, useSubscription } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { FilterBar } from '../../../components/ui/FilterBar'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { Modal } from '../../../components/ui/Modal'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'
import { useToastStore } from '../../../store/toastStore'
import { formatRelativeTime } from '../../../lib/format'
import {
  OUTBOX_MONITOR_QUERY,
  OUTBOX_EVENTS_QUERY,
  RETRY_OUTBOX_EVENT,
  RESET_STUCK_EVENTS,
  OUTBOX_UPDATED_SUBSCRIPTION,
} from '../../../graphql/admin'

interface OutboxCounts {
  pending: number
  failed: number
  dlq: number
  stuck: number
}

interface OutboxMonitor {
  health: string
  counts: OutboxCounts
  generatedAt: string
}

interface OutboxEvent {
  id: string
  service: string
  eventType: string
  status: string
  attempts: number
  maxAttempts: number
  lastError: string | null
  nextRetryAt: string | null
  createdAt: string
  payload: unknown
}

interface MonitorData {
  outboxMonitor: OutboxMonitor
}

interface EventsData {
  outboxEvents: {
    items: OutboxEvent[]
    total: number
    page: number
    limit: number
  }
}

function statusVariant(
  status: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    delivered: 'success',
    failed: 'danger',
    pending: 'warning',
    processing: 'info',
    stuck: 'danger',
  }
  return m[status?.toLowerCase()] ?? 'neutral'
}

export default function OutboxMonitorPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [statusFilter, setStatusFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [detailEvent, setDetailEvent] = useState<OutboxEvent | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const {
    data: monitorData,
    loading: monitorLoading,
    refetch: refetchMonitor,
  } = useQuery<MonitorData>(OUTBOX_MONITOR_QUERY, {
    pollInterval: autoRefresh ? 30000 : 0,
  })

  const {
    data: eventsData,
    loading: eventsLoading,
    refetch: refetchEvents,
  } = useQuery<EventsData>(OUTBOX_EVENTS_QUERY, {
    variables: {
      status: statusFilter || undefined,
      service: serviceFilter || undefined,
      page: 1,
      limit: 50,
    },
    pollInterval: autoRefresh ? 30000 : 0,
  })

  // Live-refetch on top of the 30s poll above — near-instant instead of up
  // to 30s stale when the worker processes a batch or an admin retries/
  // dismisses/resets an event.
  useSubscription(OUTBOX_UPDATED_SUBSCRIPTION, {
    onData: () => {
      void refetchMonitor()
      void refetchEvents()
    },
  })

  useEffect(() => {
    if (monitorData || eventsData) {
      setLastRefreshed(new Date())
    }
  }, [monitorData, eventsData])

  const [retryEvent, { loading: retrying }] = useMutation(RETRY_OUTBOX_EVENT, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Event queued for retry' })
      void refetchEvents()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const [resetStuck, { loading: resetting }] = useMutation(RESET_STUCK_EVENTS, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Stuck events reset' })
      setConfirmReset(false)
      void refetchMonitor()
      void refetchEvents()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
      setConfirmReset(false)
    },
  })

  const monitor = monitorData?.outboxMonitor
  const events = eventsData?.outboxEvents.items ?? []

  const columns: Column<OutboxEvent>[] = [
    {
      key: 'service',
      header: 'Service',
      mobileSecondary: true,
      render: (ev) => (
        <Badge variant="neutral" size="sm">
          {ev.service}
        </Badge>
      ),
    },
    {
      key: 'eventType',
      header: 'Event Type',
      mobilePrimary: true,
      render: (ev) => (
        <span
          style={{
            color: theme.textPrimary,
            fontFamily: 'ui-monospace, monospace',
            fontSize: '12px',
          }}
        >
          {ev.eventType}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobilePriority: 1,
      render: (ev) => (
        <Badge variant={statusVariant(ev.status)} size="sm">
          {ev.status}
        </Badge>
      ),
    },
    {
      key: 'attempts',
      header: 'Attempts',
      mobilePriority: 2,
      render: (ev) => (
        <span style={{ color: ev.attempts >= ev.maxAttempts ? theme.danger : theme.textSecondary }}>
          {ev.attempts}/{ev.maxAttempts}
        </span>
      ),
    },
    {
      key: 'nextRetryAt',
      header: 'Next Retry',
      mobilePriority: 3,
      render: (ev) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {ev.nextRetryAt ? new Date(ev.nextRetryAt).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      mobilePriority: 4,
      render: (ev) => (
        <span style={{ color: theme.textMuted, fontSize: '12px' }}>
          {new Date(ev.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      mobileLabel: 'Actions',
      mobilePriority: 5,
      render: (ev) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          {(ev.status === 'failed' || ev.status === 'stuck') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => retryEvent({ variables: { eventId: ev.id } })}
              loading={retrying}
            >
              Retry
            </Button>
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
              setDetailEvent(ev)
            }}
          >
            Details
          </button>
        </div>
      ),
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Outbox Monitor"
        subtitle="Event processing health and queue status"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {lastRefreshed && (
              <span style={{ fontSize: '11px', color: theme.textMuted }}>
                Updated {formatRelativeTime(lastRefreshed.toISOString())}
              </span>
            )}
            <div
              onClick={() => {
                setAutoRefresh((a) => !a)
              }}
              title={autoRefresh ? 'Auto-refresh ON (30s)' : 'Auto-refresh OFF'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '20px',
                background: autoRefresh ? theme.accentBg : theme.bgSurface,
                border: `1px solid ${autoRefresh ? theme.accentBorder : theme.border}`,
                cursor: 'pointer',
                fontSize: '11px',
                color: autoRefresh ? theme.accent : theme.textMuted,
                userSelect: 'none',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: autoRefresh ? theme.accent : theme.textMuted,
                  display: 'inline-block',
                }}
              />
              {autoRefresh ? 'Live' : 'Paused'}
            </div>
            {monitor && monitor.counts.stuck > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setConfirmReset(true)
                }}
              >
                Reset {monitor.counts.stuck} Stuck
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void refetchMonitor()
                void refetchEvents()
              }}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Monitor KPIs */}
      {monitorLoading ? (
        <div
          className="skeleton"
          style={{ height: '80px', borderRadius: '12px', marginBottom: '20px' }}
        />
      ) : monitor ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {[
            {
              label: 'Health',
              value: monitor.health,
              color: monitor.health === 'healthy' ? theme.success : theme.danger,
            },
            {
              label: 'Pending',
              value: monitor.counts.pending,
              color: monitor.counts.pending > 100 ? theme.warning : theme.textPrimary,
            },
            {
              label: 'Failed',
              value: monitor.counts.failed,
              color: monitor.counts.failed > 0 ? theme.danger : theme.textPrimary,
            },
            {
              label: 'DLQ',
              value: monitor.counts.dlq,
              color: monitor.counts.dlq > 0 ? theme.danger : theme.textPrimary,
            },
            {
              label: 'Stuck',
              value: monitor.counts.stuck,
              color: monitor.counts.stuck > 0 ? theme.danger : theme.textPrimary,
            },
          ].map((kpi) => (
            <Card key={kpi.label} padding="sm">
              <p style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
                {kpi.label}
              </p>
              <p style={{ fontSize: '18px', fontWeight: 600, color: kpi.color }}>{kpi.value}</p>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Events Table */}
      <Card padding="sm" style={{ marginBottom: '12px' }}>
        <FilterBar
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'pending', label: 'Pending' },
                { value: 'processing', label: 'Processing' },
                { value: 'failed', label: 'Failed' },
                { value: 'stuck', label: 'Stuck' },
                { value: 'delivered', label: 'Delivered' },
              ],
            },
            {
              key: 'service',
              label: 'Service',
              value: serviceFilter,
              onChange: setServiceFilter,
              options: [
                { value: 'auth', label: 'Auth' },
                { value: 'finance', label: 'Finance' },
                { value: 'hr', label: 'HR' },
                { value: 'projects', label: 'Projects' },
                { value: 'inventory', label: 'Inventory' },
              ],
            },
          ]}
          resultCount={events.length}
          onRefresh={() => {
            void refetchEvents()
          }}
        />
      </Card>

      <Card padding="none">
        <Table
          columns={columns}
          data={events}
          rowKey="id"
          loading={eventsLoading && events.length === 0}
          emptyMessage="No outbox events match the current filters."
        />
      </Card>

      <Modal
        open={!!detailEvent}
        onClose={() => {
          setDetailEvent(null)
        }}
        title={detailEvent?.eventType ?? 'Event Details'}
        size="md"
      >
        {detailEvent && (
          <>
            {detailEvent.lastError && (
              <div style={{ marginBottom: '12px' }}>
                <p
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: theme.danger,
                    marginBottom: '4px',
                  }}
                >
                  Last Error
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
                  }}
                >
                  {detailEvent.lastError}
                </pre>
              </div>
            )}
            <div>
              <p
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: theme.textMuted,
                  marginBottom: '4px',
                }}
              >
                Payload
              </p>
              <pre
                style={{
                  fontSize: '11px',
                  color: theme.textSecondary,
                  background: theme.bgSurface,
                  padding: '8px',
                  borderRadius: '6px',
                  overflow: 'auto',
                  maxHeight: '300px',
                  margin: 0,
                }}
              >
                {(() => {
                  if (detailEvent.payload == null) return 'null'
                  if (typeof detailEvent.payload === 'string') {
                    try {
                      return JSON.stringify(JSON.parse(detailEvent.payload), null, 2)
                    } catch {
                      return detailEvent.payload
                    }
                  }
                  return JSON.stringify(detailEvent.payload, null, 2)
                })()}
              </pre>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => {
          setConfirmReset(false)
        }}
        onConfirm={() => {
          resetStuck()
        }}
        title="Reset Stuck Events"
        message={`Reset ${monitor?.counts.stuck ?? 0} stuck events back to pending? They will be retried.`}
        confirmLabel="Reset"
        confirmVariant="primary"
        loading={resetting}
      />
    </div>
  )
}
