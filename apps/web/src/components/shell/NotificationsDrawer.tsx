import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Drawer } from '../ui/Drawer'
import { NotificationItem } from '../ui/NotificationItem'
import { Button } from '../ui/Button'
import { useTheme } from '../../theme/ThemeContext'
import { useNotificationStore, type AppNotification } from '../../store/notificationStore'
import { api } from '../../lib/axios'

function mapRow(row: Record<string, unknown>): AppNotification {
  return {
    id: String(row['id']),
    type: String(row['type'] ?? ''),
    title: String(row['title'] ?? ''),
    body: row['body'] ? String(row['body']) : undefined,
    isRead: Boolean(row['is_read']),
    createdAt: String(row['created_at'] ?? ''),
    data: row['data'] as Record<string, unknown> | undefined,
  }
}

interface NotificationsDrawerProps {
  open: boolean
  onClose: () => void
}

const PAGE_SIZE = 20

function notificationPath(n: AppNotification): string {
  const d = n.data as Record<string, unknown> | undefined
  switch (n.type) {
    case 'PO_APPROVAL_REQUIRED': return '/procurement/approvals'
    case 'OT_APPROVAL_REQUIRED': return '/hr/overtime'
    case 'LEAVE_APPROVAL_REQUIRED': return '/hr/leave'
    case 'PAYSLIP_READY': return '/payroll/payslips'
    case 'manufacturing_request':
    case 'manufacturing_request_approved':
    case 'manufacturing_request_rejected':
      return d?.link ? String(d.link) : '/manufacturing/requests'
    default: return '/dashboard'
  }
}

export function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { notifications, unreadCount, markAsRead, markAllAsRead, appendNotifications } = useNotificationStore()
  const loadedRef = useRef(false)
  const pageRef = useRef(1)

  // Fetch notifications on drawer open
  useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    api.get<Record<string, unknown>[]>('/notifications?page=1&limit=20')
      .then((r) => { if (Array.isArray(r.data)) useNotificationStore.getState().setNotifications(r.data.map(mapRow)) })
      .catch(() => { /* no-op if backend not available */ })
  }, [open])

  async function handleMarkAllAsRead() {
    markAllAsRead()
    await api.post('/notifications/read-all').catch(() => undefined)
  }

  async function handleRead(id: string) {
    markAsRead(id)
    await api.patch(`/notifications/${id}/read`).catch(() => undefined)
  }

  async function loadMore() {
    pageRef.current++
    api.get<Record<string, unknown>[]>(`/notifications?page=${pageRef.current}&limit=${PAGE_SIZE}`)
      .then((r) => { if (Array.isArray(r.data)) appendNotifications(r.data.map(mapRow)) })
      .catch(() => { /* no-op */ })
  }

  function handleNavigate(n: AppNotification) {
    onClose()
    navigate(notificationPath(n))
  }

  const unread = notifications.filter((n) => !n.isRead)
  const read = notifications.filter((n) => n.isRead)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Notifications"
      width="380px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 12px', borderBottom: `1px solid ${theme.border}` }}>
          {unreadCount > 0 && (
            <span style={{ fontSize: '12px', color: theme.textMuted }}>
              {unreadCount} unread
            </span>
          )}
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleMarkAllAsRead}>Mark all as read</Button>
          )}
        </div>

        {/* Notification list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', gap: '12px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={theme.textMuted} strokeWidth="1.5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              <span style={{ fontSize: '13px', color: theme.textMuted }}>No notifications</span>
            </div>
          ) : (
            <>
              {unread.length > 0 && (
                <>
                  <div style={{ padding: '8px 16px 4px', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Unread</div>
                  {unread.map((n) => (
                    <NotificationItem key={n.id} notification={n} onRead={handleRead} onNavigate={handleNavigate} />
                  ))}
                </>
              )}
              {read.length > 0 && (
                <>
                  <div style={{ padding: '8px 16px 4px', fontSize: '10px', fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Earlier</div>
                  {read.map((n) => (
                    <NotificationItem key={n.id} notification={n} onRead={handleRead} onNavigate={handleNavigate} />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {notifications.length >= PAGE_SIZE && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${theme.border}` }}>
            <Button variant="ghost" size="sm" onClick={loadMore} style={{ width: '100%' }}>Load more</Button>
          </div>
        )}
      </div>
    </Drawer>
  )
}
