import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Input } from '../../../components/ui/Input'
import { useToastStore } from '../../../store/toastStore'
import { OUTBOX_EVENT_CONFIGS_QUERY, UPDATE_EVENT_CONFIG } from '../../../graphql/admin'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'
import type { Column } from '../../../components/ui/Table'
import { Table } from '../../../components/ui/Table'

interface EventConfig {
  eventType: string
  service: string
  maxAttempts: number
  initialRetryDelaySeconds: number
  backoffMultiplier: number
  maxRetryDelaySeconds: number
  dlqPriority: string
  alertOnDlq: boolean
}

interface EventConfigsData {
  outboxEventConfigs: EventConfig[]
}

interface EditState {
  maxAttempts: string
  initialRetryDelaySeconds: string
  backoffMultiplier: string
  maxRetryDelaySeconds: string
  dlqPriority: string
  alertOnDlq: boolean
}

function priorityVariant(
  p: string,
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    critical: 'danger',
    high: 'warning',
    medium: 'info',
    low: 'neutral',
  }
  return m[p?.toLowerCase()] ?? 'neutral'
}

export default function EventConfigsPage() {
  const { theme } = useTheme()
  const addToast = useToastStore((s) => s.addToast)

  const [editingType, setEditingType] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)

  const { data, loading, refetch } = useQuery<EventConfigsData>(OUTBOX_EVENT_CONFIGS_QUERY)

  const [updateConfig, { loading: updating }] = useMutation(UPDATE_EVENT_CONFIG, {
    onCompleted: () => {
      addToast({ type: 'success', message: 'Event config updated' })
      setEditingType(null)
      setEditState(null)
      refetch()
    },
    onError: (e) => {
      addToast({ type: 'error', message: e.message })
    },
  })

  const configs = data?.outboxEventConfigs ?? []

  function startEdit(cfg: EventConfig) {
    setEditingType(cfg.eventType)
    setEditState({
      maxAttempts: String(cfg.maxAttempts),
      initialRetryDelaySeconds: String(cfg.initialRetryDelaySeconds),
      backoffMultiplier: String(cfg.backoffMultiplier),
      maxRetryDelaySeconds: String(cfg.maxRetryDelaySeconds),
      dlqPriority: cfg.dlqPriority,
      alertOnDlq: cfg.alertOnDlq,
    })
  }

  function handleSave(eventType: string) {
    if (!editState) return
    updateConfig({
      variables: {
        eventType,
        input: {
          maxAttempts: parseInt(editState.maxAttempts),
          initialRetryDelaySeconds: parseInt(editState.initialRetryDelaySeconds),
          backoffMultiplier: parseFloat(editState.backoffMultiplier),
          maxRetryDelaySeconds: parseInt(editState.maxRetryDelaySeconds),
          dlqPriority: editState.dlqPriority,
          alertOnDlq: editState.alertOnDlq,
        },
      },
    })
  }

  const columns: Column<EventConfig>[] = [
    {
      key: 'eventType',
      header: 'Event Type',
      mobilePrimary: true,
      render: (cfg) => (
        <span
          style={{
            color: theme.textPrimary,
            fontFamily: 'ui-monospace, monospace',
            fontSize: '11px',
            whiteSpace: 'nowrap',
          }}
        >
          {cfg.eventType}
        </span>
      ),
    },
    {
      key: 'service',
      header: 'Service',
      mobileSecondary: true,
      render: (cfg) => (
        <Badge variant="neutral" size="sm">
          {cfg.service}
        </Badge>
      ),
    },
    {
      key: 'dlqPriority',
      header: 'DLQ Priority',
      mobilePriority: 1,
      render: (cfg) =>
        editingType === cfg.eventType && editState ? (
          <div style={{ minWidth: '130px' }}>
            <SearchableSelect
              value={editState.dlqPriority}
              onChange={(v) => {
                setEditState((s) => (s ? { ...s, dlqPriority: v } : s))
              }}
              options={['critical', 'high', 'medium', 'low'].map((p) => ({
                value: p,
                label: p,
              }))}
            />
          </div>
        ) : (
          <Badge variant={priorityVariant(cfg.dlqPriority)} size="sm">
            {cfg.dlqPriority}
          </Badge>
        ),
    },
    {
      key: 'alertOnDlq',
      header: 'Alert',
      mobilePriority: 2,
      render: (cfg) =>
        editingType === cfg.eventType && editState ? (
          <input
            type="checkbox"
            checked={editState.alertOnDlq}
            onChange={(e) => {
              setEditState((s) => (s ? { ...s, alertOnDlq: e.target.checked } : s))
            }}
          />
        ) : (
          <Badge variant={cfg.alertOnDlq ? 'success' : 'neutral'} size="sm">
            {cfg.alertOnDlq ? 'Yes' : 'No'}
          </Badge>
        ),
    },
    {
      key: 'maxAttempts',
      header: 'Max Attempts',
      mobilePriority: 3,
      render: (cfg) =>
        editingType === cfg.eventType && editState ? (
          <Input
            value={editState.maxAttempts}
            onChange={(e) => {
              setEditState((s) => (s ? { ...s, maxAttempts: e.target.value } : s))
            }}
            type="number"
            style={{ width: '70px' }}
          />
        ) : (
          <span style={{ color: theme.textSecondary }}>{cfg.maxAttempts}</span>
        ),
    },
    {
      key: 'initialRetryDelaySeconds',
      header: 'Initial Delay',
      mobilePriority: 4,
      render: (cfg) =>
        editingType === cfg.eventType && editState ? (
          <Input
            value={editState.initialRetryDelaySeconds}
            onChange={(e) => {
              setEditState((s) => (s ? { ...s, initialRetryDelaySeconds: e.target.value } : s))
            }}
            type="number"
            style={{ width: '80px' }}
          />
        ) : (
          <span style={{ color: theme.textSecondary }}>{cfg.initialRetryDelaySeconds}s</span>
        ),
    },
    {
      key: 'backoffMultiplier',
      header: 'Backoff',
      mobilePriority: 5,
      render: (cfg) =>
        editingType === cfg.eventType && editState ? (
          <Input
            value={editState.backoffMultiplier}
            onChange={(e) => {
              setEditState((s) => (s ? { ...s, backoffMultiplier: e.target.value } : s))
            }}
            type="number"
            step="0.1"
            style={{ width: '70px' }}
          />
        ) : (
          <span style={{ color: theme.textSecondary }}>{cfg.backoffMultiplier}x</span>
        ),
    },
    {
      key: 'maxRetryDelaySeconds',
      header: 'Max Delay',
      mobilePriority: 6,
      render: (cfg) =>
        editingType === cfg.eventType && editState ? (
          <Input
            value={editState.maxRetryDelaySeconds}
            onChange={(e) => {
              setEditState((s) => (s ? { ...s, maxRetryDelaySeconds: e.target.value } : s))
            }}
            type="number"
            style={{ width: '80px' }}
          />
        ) : (
          <span style={{ color: theme.textSecondary }}>{cfg.maxRetryDelaySeconds}s</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      mobileLabel: 'Actions',
      mobilePriority: 7,
      render: (cfg) => {
        const isEditing = editingType === cfg.eventType
        return isEditing ? (
          <div style={{ display: 'flex', gap: '6px' }}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                handleSave(cfg.eventType)
              }}
              loading={updating}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingType(null)
                setEditState(null)
              }}
              disabled={updating}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              startEdit(cfg)
            }}
          >
            Edit
          </Button>
        )
      },
    },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Event Configs"
        subtitle="Configure retry policies and DLQ settings per event type"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              refetch()
            }}
          >
            Refresh
          </Button>
        }
      />

      <Card padding="none">
        <Table
          columns={columns}
          data={configs}
          rowKey="eventType"
          loading={loading && configs.length === 0}
          emptyMessage="No event configurations found."
          getRowStyle={(cfg) =>
            editingType === cfg.eventType ? { background: theme.accentBg } : {}
          }
        />
      </Card>
    </div>
  )
}
