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
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface TypeMeta {
  bg: string
  color: string
  icon: React.ReactNode
}

const DocIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
)

const ApprovalIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)

const PayrollIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

const MfgIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
)

const AlertIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const BellIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)

function typeMeta(type: string): TypeMeta {
  switch (type) {
    case 'PO_APPROVAL_REQUIRED':
    case 'po_approval_required':
    case 'OT_APPROVAL_REQUIRED':
    case 'LEAVE_APPROVAL_REQUIRED':
      return { bg: 'rgba(245,158,11,0.12)', color: '#D97706', icon: <ApprovalIcon /> }
    case 'PAYSLIP_READY':
    case 'payslip_ready':
    case 'payroll_reminder':
    case 'PAYROLL_REMINDER':
      return { bg: 'rgba(16,185,129,0.12)', color: '#059669', icon: <PayrollIcon /> }
    case 'new_document':
    case 'document_uploaded':
    case 'client_document_uploaded':
    case 'engineering_doc_uploaded':
    case 'rfq_document_uploaded':
    case 'rfq_tender_uploaded':
      return { bg: 'rgba(59,130,246,0.12)', color: '#2563EB', icon: <DocIcon /> }
    case 'manufacturing_request':
    case 'manufacturing_request_approved':
    case 'manufacturing_request_rejected':
      return { bg: 'rgba(139,92,246,0.12)', color: '#7C3AED', icon: <MfgIcon /> }
    case 'SYSTEM_ALERT':
      return { bg: 'rgba(239,68,68,0.12)', color: '#DC2626', icon: <AlertIcon /> }
    default:
      return { bg: 'rgba(100,116,139,0.12)', color: '#64748B', icon: <BellIcon /> }
  }
}

export function NotificationItem({ notification, onRead, onNavigate }: NotificationItemProps) {
  const { theme } = useTheme()
  const meta = typeMeta(notification.type)

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
        padding: '13px 20px',
        cursor: 'pointer',
        background: notification.isRead ? 'transparent' : `${theme.accent}07`,
        borderBottom: `1px solid ${theme.border}`,
        transition: 'background 0.12s',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = theme.bgSurfaceHover
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = notification.isRead ? 'transparent' : `${theme.accent}07`
      }}
    >
      {/* Unread left rail */}
      {!notification.isRead && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '3px',
            background: theme.accent,
            borderRadius: '0 2px 2px 0',
          }}
        />
      )}

      {/* Category icon */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: meta.bg,
          color: meta.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: '1px',
        }}
      >
        {meta.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '13px',
            fontWeight: notification.isRead ? 400 : 600,
            color: theme.textPrimary,
            lineHeight: '1.35',
            marginBottom: '3px',
          }}
        >
          {notification.title}
        </div>
        {notification.body && (
          <div
            style={{
              fontSize: '12px',
              color: theme.textSecondary,
              lineHeight: '1.5',
              marginBottom: '5px',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as React.CSSProperties['WebkitBoxOrient'],
              overflow: 'hidden',
            }}
          >
            {notification.body}
          </div>
        )}
        <span
          style={{
            display: 'inline-block',
            fontSize: '11px',
            color: theme.textMuted,
            background: theme.bgCanvas,
            border: `1px solid ${theme.border}`,
            borderRadius: '4px',
            padding: '1px 6px',
            letterSpacing: '0.01em',
          }}
        >
          {relativeTime(notification.createdAt)}
        </span>
      </div>

      {/* Unread dot */}
      {!notification.isRead && (
        <div
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: theme.accent,
            flexShrink: 0,
            marginTop: '5px',
          }}
        />
      )}
    </div>
  )
}
