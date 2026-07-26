import { useTheme } from '../../theme/ThemeContext'
import { Badge } from './Badge'
import { Button } from './Button'
import { formatRelativeTime } from '../../lib/format'

interface OutboxEventRowProps {
  event: {
    id: string
    service: string
    eventType: string
    status: string
    attempts: number
    maxAttempts: number
    lastError?: string
    nextRetryAt?: string
    createdAt: string
  }
  onRetry?: () => void
  onViewPayload?: () => void
}

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'

function statusVariant(s: string): BadgeVariant {
  switch (s) {
    case 'pending':
      return 'info'
    case 'processing':
      return 'warning'
    case 'delivered':
      return 'success'
    case 'failed':
      return 'danger'
    default:
      return 'neutral'
  }
}

export function OutboxEventRow({ event, onRetry, onViewPayload }: OutboxEventRowProps) {
  const { theme } = useTheme()

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
        {event.id.slice(0, 8)}…
      </td>
      <td style={{ padding: '10px 12px', color: theme.textSecondary, fontSize: 13 }}>
        {event.service}
      </td>
      <td style={{ padding: '10px 12px', color: theme.textPrimary, fontSize: 13 }}>
        {event.eventType}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
      </td>
      <td
        style={{
          padding: '10px 12px',
          color: theme.textSecondary,
          fontSize: 13,
          textAlign: 'center' as const,
        }}
      >
        <span
          style={{
            color: event.attempts >= event.maxAttempts ? theme.danger : theme.textSecondary,
          }}
        >
          {event.attempts}
        </span>
        <span style={{ color: theme.textMuted }}> / {event.maxAttempts}</span>
      </td>
      <td style={{ padding: '10px 12px', color: theme.textMuted, fontSize: 12 }}>
        {event.lastError ? (
          <span title={event.lastError} style={{ color: theme.danger }}>
            {event.lastError.slice(0, 60)}
            {event.lastError.length > 60 ? '…' : ''}
          </span>
        ) : (
          <span>—</span>
        )}
      </td>
      <td style={{ padding: '10px 12px', color: theme.textMuted, fontSize: 12 }}>
        {event.nextRetryAt ? formatRelativeTime(event.nextRetryAt) : '—'}
      </td>
      <td style={{ padding: '10px 12px', color: theme.textMuted, fontSize: 12 }}>
        {formatRelativeTime(event.createdAt)}
      </td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {event.status === 'failed' && onRetry && (
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
          {onViewPayload && (
            <Button size="sm" onClick={onViewPayload}>
              Payload
            </Button>
          )}
        </div>
      </td>
    </tr>
  )
}
