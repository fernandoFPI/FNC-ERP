import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../theme/ThemeContext'
import { usePagePadding } from '../../hooks/usePagePadding'
import { useNotificationStore, type AppNotification } from '../../store/notificationStore'
import { NotificationItem } from '../../components/ui/NotificationItem'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'

const PAGE_SIZE = 20

const MFG_TYPES = [
  'manufacturing_request',
  'manufacturing_request_approved',
  'manufacturing_request_rejected',
]

function notificationPath(n: AppNotification): string {
  const d = n.data
  switch (n.type) {
    case 'PO_APPROVAL_REQUIRED':
      return '/procurement/approvals'
    case 'OT_APPROVAL_REQUIRED':
      return '/hr/overtime'
    case 'LEAVE_APPROVAL_REQUIRED':
      return '/hr/leave'
    case 'PAYSLIP_READY':
      return '/payroll/payslips'
    case 'manufacturing_request':
    case 'manufacturing_request_approved':
    case 'manufacturing_request_rejected':
      return d?.link ? String(d.link) : '/manufacturing/requests'
    default:
      return '/dashboard'
  }
}

const FILTER_TYPES = ['All', 'PO', 'Leave', 'Overtime', 'Payslip', 'Manufacturing'] as const
type FilterType = (typeof FILTER_TYPES)[number]

function matchesFilter(n: AppNotification, filter: FilterType): boolean {
  if (filter === 'All') return true
  if (filter === 'PO') return n.type === 'PO_APPROVAL_REQUIRED'
  if (filter === 'Leave') return n.type === 'LEAVE_APPROVAL_REQUIRED'
  if (filter === 'Overtime') return n.type === 'OT_APPROVAL_REQUIRED'
  if (filter === 'Payslip') return n.type === 'PAYSLIP_READY'
  if (filter === 'Manufacturing') return MFG_TYPES.includes(n.type)
  return true
}

export default function NotificationsPage() {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const pagePadding = usePagePadding()
  const { notifications, unreadCount, markAsRead, markAllAsRead, appendNotifications } =
    useNotificationStore()
  const loadedRef = useRef(false)
  const pageRef = useRef(1)
  const [filter, setFilter] = useState<FilterType>('All')

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    fetch('/api/v1/notifications?page=1&limit=20')
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json.notifications)) {
          useNotificationStore.getState().setNotifications(json.notifications)
        }
      })
      .catch(() => {
        /* no-op */
      })
  }, [])

  async function handleMarkAllAsRead() {
    markAllAsRead()
    await fetch('/api/v1/notifications/read-all', { method: 'POST' }).catch(() => undefined)
  }

  async function handleRead(id: string) {
    markAsRead(id)
    await fetch(`/api/v1/notifications/${id}/read`, { method: 'POST' }).catch(() => undefined)
  }

  async function loadMore() {
    pageRef.current++
    try {
      const r = await fetch(`/api/v1/notifications?page=${pageRef.current}&limit=${PAGE_SIZE}`)
      const json = await r.json()
      if (Array.isArray(json.notifications)) appendNotifications(json.notifications)
    } catch {
      /* no-op */
    }
  }

  function handleNavigate(n: AppNotification) {
    navigate(notificationPath(n))
  }

  const filtered = notifications.filter((n) => matchesFilter(n, filter))
  const unread = filtered.filter((n) => !n.isRead)
  const read = filtered.filter((n) => n.isRead)

  return (
    <div
      style={{
        ...pagePadding,
        margin: '0 auto',
        maxWidth: '680px',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
      }}
    >
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        actions={
          unreadCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {/* Filter chips */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          marginBottom: '16px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {FILTER_TYPES.map((f) => (
          <button
            key={f}
            onClick={() => {
              setFilter(f)
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '999px',
              border: `1px solid ${filter === f ? theme.accentBorder : theme.border}`,
              background: filter === f ? theme.accentBg : theme.bgSurface,
              color: filter === f ? theme.accent : theme.textSecondary,
              fontSize: '12px',
              fontWeight: filter === f ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              fontFamily: 'inherit',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div
        style={{
          background: theme.bgSurface,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '48px 24px',
              gap: '12px',
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.textMuted}
              strokeWidth="1.5"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span style={{ fontSize: '13px', color: theme.textMuted }}>No notifications</span>
          </div>
        ) : (
          <>
            {unread.length > 0 && (
              <>
                <div
                  style={{
                    padding: '8px 16px 4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Unread
                </div>
                {unread.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={handleRead}
                    onNavigate={handleNavigate}
                  />
                ))}
              </>
            )}
            {read.length > 0 && (
              <>
                <div
                  style={{
                    padding: '8px 16px 4px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Earlier
                </div>
                {read.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onRead={handleRead}
                    onNavigate={handleNavigate}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {notifications.length >= PAGE_SIZE && (
        <div style={{ padding: '12px 0', textAlign: 'center' }}>
          <Button variant="ghost" size="sm" onClick={loadMore}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}
