import { useState } from 'react'
import { useQuery, useMutation } from '@apollo/client'
import { useTheme } from '../../../theme/ThemeContext'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Input } from '../../../components/ui/Input'
import { EmptyState } from '../../../components/ui/EmptyState'
import { useToastStore } from '../../../store/toastStore'
import { OUTBOX_EVENT_CONFIGS_QUERY, UPDATE_EVENT_CONFIG } from '../../../graphql/admin'
import { SearchableSelect } from '../../../components/ui/SearchableSelect'

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

function priorityVariant(p: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'> = {
    critical: 'danger', high: 'warning', medium: 'info', low: 'neutral',
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
    onError: (e) => addToast({ type: 'error', message: e.message }),
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

  return (
    <div style={{ padding: '24px' }}>
      <PageHeader
        title="Event Configs"
        subtitle="Configure retry policies and DLQ settings per event type"
        actions={
          <Button variant="ghost" size="sm" onClick={() => { refetch() }}>Refresh</Button>
        }
      />

      <Card padding="none">
        {loading ? (
          <div style={{ padding: '24px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: '60px', borderRadius: '6px', marginBottom: '8px' }} />
            ))}
          </div>
        ) : configs.length ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: theme.bgSurface }}>
                  {['Event Type', 'Service', 'Max Attempts', 'Initial Delay', 'Backoff', 'Max Delay', 'DLQ Priority', 'Alert', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {configs.map(cfg => {
                  const isEditing = editingType === cfg.eventType
                  return (
                    <tr key={cfg.eventType} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
                      onMouseEnter={(e) => { if (!isEditing) e.currentTarget.style.background = theme.tableRowHover }}
                      onMouseLeave={(e) => { if (!isEditing) e.currentTarget.style.background = 'transparent' }}>
                      <td style={{ padding: '10px 14px', color: theme.textPrimary, fontFamily: 'ui-monospace, monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>{cfg.eventType}</td>
                      <td style={{ padding: '10px 14px' }}><Badge variant="neutral" size="sm">{cfg.service}</Badge></td>
                      {isEditing && editState ? (
                        <>
                          <td style={{ padding: '6px 10px' }}>
                            <Input value={editState.maxAttempts} onChange={(e) => setEditState(s => s ? { ...s, maxAttempts: e.target.value } : s)} type="number" style={{ width: '70px' }} />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <Input value={editState.initialRetryDelaySeconds} onChange={(e) => setEditState(s => s ? { ...s, initialRetryDelaySeconds: e.target.value } : s)} type="number" style={{ width: '80px' }} />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <Input value={editState.backoffMultiplier} onChange={(e) => setEditState(s => s ? { ...s, backoffMultiplier: e.target.value } : s)} type="number" step="0.1" style={{ width: '70px' }} />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <Input value={editState.maxRetryDelaySeconds} onChange={(e) => setEditState(s => s ? { ...s, maxRetryDelaySeconds: e.target.value } : s)} type="number" style={{ width: '80px' }} />
                          </td>
                          <td style={{ padding: '6px 10px', minWidth: '130px' }}>
                            <SearchableSelect
                              value={editState.dlqPriority}
                              onChange={(v) => setEditState(s => s ? { ...s, dlqPriority: v } : s)}
                              options={['critical', 'high', 'medium', 'low'].map(p => ({ value: p, label: p }))}
                            />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <input
                              type="checkbox"
                              checked={editState.alertOnDlq}
                              onChange={(e) => setEditState(s => s ? { ...s, alertOnDlq: e.target.checked } : s)}
                            />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <Button variant="primary" size="sm" onClick={() => handleSave(cfg.eventType)} loading={updating}>Save</Button>
                              <Button variant="ghost" size="sm" onClick={() => { setEditingType(null); setEditState(null) }} disabled={updating}>Cancel</Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{cfg.maxAttempts}</td>
                          <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{cfg.initialRetryDelaySeconds}s</td>
                          <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{cfg.backoffMultiplier}x</td>
                          <td style={{ padding: '10px 14px', color: theme.textSecondary }}>{cfg.maxRetryDelaySeconds}s</td>
                          <td style={{ padding: '10px 14px' }}><Badge variant={priorityVariant(cfg.dlqPriority)} size="sm">{cfg.dlqPriority}</Badge></td>
                          <td style={{ padding: '10px 14px' }}>
                            <Badge variant={cfg.alertOnDlq ? 'success' : 'neutral'} size="sm">{cfg.alertOnDlq ? 'Yes' : 'No'}</Badge>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <Button variant="ghost" size="sm" onClick={() => startEdit(cfg)}>Edit</Button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No event configs" message="No event configurations found." />
        )}
      </Card>
    </div>
  )
}
