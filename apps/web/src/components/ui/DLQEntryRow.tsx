import { useState, useEffect } from 'react'
import { useTheme } from '../../theme/ThemeContext'
import { Badge } from './Badge'
import { Button } from './Button'
import { formatRelativeTime } from '../../lib/format'

interface DLQEntryRowProps {
  entry: {
    id: string
    eventType: string
    service: string
    priority: 'critical' | 'high' | 'normal' | 'low'
    status: string
    totalAttempts: number
    lastError: string
    errorHistory: { attempt: number; error: string; at: string }[]
    createdAt: string
    reviewedBy?: string
    reviewNotes?: string
  }
  onRetry: () => void
  onDismiss: () => void
  onViewDetail: () => void
}

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'

function priorityVariant(p: 'critical' | 'high' | 'normal' | 'low'): BadgeVariant {
  switch (p) {
    case 'critical':
      return 'danger'
    case 'high':
      return 'danger'
    case 'normal':
      return 'warning'
    case 'low':
      return 'neutral'
  }
}

function injectPulseKeyframes() {
  if (document.getElementById('fnc-pulse-style')) return
  const style = document.createElement('style')
  style.id = 'fnc-pulse-style'
  style.textContent = `@keyframes fnc-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.7; transform: scale(1.06); } }`
  document.head.appendChild(style)
}

export function DLQEntryRow({ entry, onRetry, onDismiss, onViewDetail }: DLQEntryRowProps) {
  const { theme } = useTheme()
  const [errorExpanded, setErrorExpanded] = useState(false)

  useEffect(() => {
    if (entry.priority === 'critical') injectPulseKeyframes()
  }, [entry.priority])

  const errorPreview = entry.lastError.slice(0, 100)
  const hasMore = entry.lastError.length > 100

  return (
    <tr style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
      <td
        style={{
          padding: '10px 12px',
          color: theme.textMuted,
          fontSize: 12,
          fontFamily: 'monospace',
        }}
      >
        {entry.id.slice(0, 8)}…
      </td>
      <td style={{ padding: '10px 12px', color: theme.textPrimary, fontSize: 13 }}>
        {entry.eventType}
      </td>
      <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: 13 }}>
        {entry.service}
      </td>
      <td style={{ padding: '10px 12px' }}>
        {entry.priority === 'critical' ? (
          <span
            style={{ animation: 'fnc-pulse 1.8s ease-in-out infinite', display: 'inline-flex' }}
          >
            <Badge variant="danger">{entry.priority}</Badge>
          </span>
        ) : (
          <Badge variant={priorityVariant(entry.priority)}>{entry.priority}</Badge>
        )}
      </td>
      <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: 13 }}>
        {entry.status}
      </td>
      <td
        style={{
          padding: '10px 12px',
          color: theme.textSecondary,
          fontSize: 13,
          textAlign: 'center' as const,
        }}
      >
        {entry.totalAttempts}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, maxWidth: 280 }}>
        <span style={{ color: theme.danger }}>
          {errorExpanded ? entry.lastError : errorPreview}
          {hasMore && !errorExpanded && '…'}
        </span>
        {hasMore && (
          <button
            onClick={() => {
              setErrorExpanded((e) => !e)
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: theme.accent,
              fontSize: 11,
              marginLeft: 4,
              padding: 0,
            }}
          >
            {errorExpanded ? 'less' : 'more'}
          </button>
        )}
      </td>
      <td style={{ padding: '10px 12px', color: theme.textMuted, fontSize: 12 }}>
        {formatRelativeTime(entry.createdAt)}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
          <Button size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button size="sm" onClick={onViewDetail}>
            Detail
          </Button>
        </div>
      </td>
    </tr>
  )
}
