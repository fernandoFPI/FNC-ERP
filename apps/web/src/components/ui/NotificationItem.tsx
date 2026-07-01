import React from 'react'
import { useTheme } from '../../theme/ThemeContext'

interface NotificationData {
  id: string
  type: string
  title: string
  body?: string
  isRead: boolean
  createdAt: string
  data?: Record<string, unknown>
}

interface NotificationItemProps {
  notification: NotificationData
  onRead: (id: string) => void
  onNavigate: (notification: NotificationData) => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  return `${d} days ago`
}

function typeIcon(type: string): string {
  const map: Record<string, string> = {
    PO_APPROVAL_REQUIRED: '📋',
    OT_APPROVAL_REQUIRED: '⏱',
    LEAVE_APPROVAL_REQUIRED: '📅',
    PAYSLIP_READY: '💰',
    SYSTEM_ALERT: '⚠️',
    MESSAGE: '💬',
    manufacturing_request: '🏭',
    manufacturing_request_approved: '✅',
    manufacturing_request_rejected: '❌',
  }
  return map[type] ?? '🔔'
}

export function NotificationItem({ notification, onRead, onNavigate }: NotificationItemProps) {
  const { theme } = useTheme()

  function handleClick() {
    if (!notification.isRead) onRead(notification.id)
    onNavigate(notification)
  }

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        gap: '12px',
        padding: '12px 16px',
        cursor: 'pointer',
        borderLeft: `3px solid ${notification.isRead ? 'transparent' : theme.accent}`,
        background: notification.isRead ? 'transparent' : `${theme.accent}08`,
        borderBottom: `1px solid ${theme.border}`,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = theme.tableRowHover }}
      onMouseLeave={(e) => { e.currentTarget.style.background = notification.isRead ? 'transparent' : `${theme.accent}08` }}
    >
      <div style={{ fontSize: '20px', flexShrink: 0, lineHeight: 1 }}>{typeIcon(notification.type)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: notification.isRead ? 400 : 600, color: theme.textPrimary, marginBottom: '2px' }}>
          {notification.title}
        </div>
        {notification.body && (
          <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '4px', lineHeight: '1.45', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {notification.body}
          </div>
        )}
        <div style={{ fontSize: '11px', color: theme.textMuted }}>{relativeTime(notification.createdAt)}</div>
      </div>
      {!notification.isRead && (
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: theme.accent, flexShrink: 0, marginTop: '4px' }} />
      )}
    </div>
  )
}
