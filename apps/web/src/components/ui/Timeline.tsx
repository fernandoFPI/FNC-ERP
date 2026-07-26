import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

export interface TimelineEvent {
  id: string
  title: string
  description?: string
  user?: string
  actor?: string
  timestamp?: string
  date?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

interface TimelineProps {
  events: TimelineEvent[]
  loading?: boolean
}

export function Timeline({ events, loading = false }: TimelineProps) {
  const { theme } = useTheme()

  const dotColors: Record<string, string> = {
    default: theme.accent,
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
  }

  if (loading) {
    return (
      <div style={{ padding: '8px 0' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{ display: 'flex', gap: '16px', marginBottom: '20px', alignItems: 'flex-start' }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <div
                className="skeleton"
                style={{ width: '10px', height: '10px', borderRadius: '50%' }}
              />
              {i < 3 && (
                <div
                  className="skeleton"
                  style={{ width: '1px', height: '40px', marginTop: '4px' }}
                />
              )}
            </div>
            <div style={{ flex: 1, paddingBottom: '8px' }}>
              <div
                className="skeleton"
                style={{ height: '13px', width: '60%', borderRadius: '4px', marginBottom: '6px' }}
              />
              <div
                className="skeleton"
                style={{ height: '11px', width: '40%', borderRadius: '4px' }}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <p
        style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}
      >
        No activity yet
      </p>
    )
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {events.map((event, i) => {
        const dotColor = dotColors[event.variant ?? 'default']
        const timeStr = event.timestamp ?? event.date
        const userStr = event.user ?? event.actor
        return (
          <div key={event.id} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
                width: '10px',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: dotColor,
                  flexShrink: 0,
                  marginTop: '3px',
                  boxShadow: `0 0 6px ${dotColor}44`,
                }}
              />
              {i < events.length - 1 && (
                <div
                  style={{
                    width: '1px',
                    flex: 1,
                    background: theme.border,
                    marginTop: '4px',
                    minHeight: '24px',
                  }}
                />
              )}
            </div>
            <div style={{ flex: 1, paddingBottom: i < events.length - 1 ? '20px' : '0' }}>
              <p
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: theme.textPrimary,
                  margin: '0 0 2px',
                }}
              >
                {event.title}
              </p>
              {event.description && (
                <p style={{ fontSize: '12px', color: theme.textSecondary, margin: '0 0 2px' }}>
                  {event.description}
                </p>
              )}
              <p style={{ fontSize: '11px', color: theme.textMuted, margin: 0 }}>
                {userStr && <span style={{ color: theme.textSecondary }}>{userStr} · </span>}
                {timeStr && new Date(timeStr).toLocaleString()}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
