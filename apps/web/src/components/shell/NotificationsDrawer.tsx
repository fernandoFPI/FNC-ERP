import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Drawer } from '../ui/Drawer'
import { NotificationItem } from '../ui/NotificationItem'
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
  const link      = d?.link       ? String(d.link)       : null
  const projectId = d?.project_id ? String(d.project_id) : null
  const poId      = d?.po_id      ? String(d.po_id)      : null

  // Explicit deep-link from backend always wins
  if (link) return link

  switch (n.type) {
    case 'PO_APPROVAL_REQUIRED':
    case 'po_approval_required':
      return poId ? `/procurement/purchase-orders/${poId}` : '/procurement/purchase-orders/approval-queue'
    case 'OT_APPROVAL_REQUIRED':
      return '/hr/overtime'
    case 'LEAVE_APPROVAL_REQUIRED':
      return '/hr/leave'
    case 'PAYSLIP_READY':
    case 'payslip_ready':
      return '/payroll/payslips'
    case 'payroll_reminder':
    case 'PAYROLL_REMINDER':
      return '/payroll/runs'
    case 'new_document':
    case 'document_uploaded':
    case 'client_document_uploaded':
    case 'engineering_doc_uploaded':
    case 'rfq_document_uploaded':
    case 'rfq_tender_uploaded':
      return projectId ? `/projects/${projectId}` : '/projects'
    case 'manufacturing_request':
    case 'manufacturing_request_approved':
    case 'manufacturing_request_rejected':
      return '/manufacturing/requests'
    default:
      return projectId ? `/projects/${projectId}` : '/dashboard'
  }
}

function SectionDivider({ label, count }: { label: string; count?: number }) {
  const { theme } = useTheme()
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '14px 20px 6px',
    }}>
      <span style={{
        fontSize: '10px',
        fontWeight: 700,
        color: theme.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '0.09em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}>
        {label}
      </span>
      {count !== undefined && (
        <span style={{
          fontSize: '10px',
          fontWeight: 600,
          color: theme.textMuted,
          background: theme.bgCanvas,
          border: `1px solid ${theme.border}`,
          borderRadius: '10px',
          padding: '0 5px',
          lineHeight: '16px',
          flexShrink: 0,
        }}>
          {count}
        </span>
      )}
      <div style={{ flex: 1, height: '1px', background: theme.border }} />
    </div>
  )
}

export function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const { notifications, unreadCount, markAsRead, markAllAsRead, appendNotifications } = useNotificationStore()
  const loadedRef = useRef(false)
  const pageRef = useRef(1)

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
  const read   = notifications.filter((n) => n.isRead)

  return (
    <Drawer open={open} onClose={onClose} title="Notifications" width="380px" noPadding>

      {/* Sub-header: unread count + mark all */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: `1px solid ${theme.border}`,
        flexShrink: 0,
        minHeight: '44px',
      }}>
        {unreadCount > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: theme.accent, flexShrink: 0,
              }} />
              <span style={{ fontSize: '12px', color: theme.textSecondary, fontWeight: 500 }}>
                {unreadCount} unread
              </span>
            </div>
            <button
              onClick={handleMarkAllAsRead}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                color: theme.accent,
                fontWeight: 500,
                padding: '4px 0',
              }}
            >
              Mark all as read
            </button>
          </>
        ) : (
          <span style={{ fontSize: '12px', color: theme.textMuted }}>
            You're all caught up
          </span>
        )}
      </div>

      {/* Notification list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {notifications.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px 24px',
            gap: '14px',
          }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              background: theme.bgCanvas,
              border: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.textMuted,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: theme.textPrimary, marginBottom: '4px' }}>
                No notifications
              </div>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>
                You're all caught up — check back later.
              </div>
            </div>
          </div>
        ) : (
          <>
            {unread.length > 0 && (
              <>
                <SectionDivider label="Unread" count={unread.length} />
                {unread.map((n) => (
                  <NotificationItem key={n.id} notification={n} onRead={handleRead} onNavigate={handleNavigate} />
                ))}
              </>
            )}
            {read.length > 0 && (
              <>
                <SectionDivider label="Earlier" />
                {read.map((n) => (
                  <NotificationItem key={n.id} notification={n} onRead={handleRead} onNavigate={handleNavigate} />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Load more */}
      {notifications.length >= PAGE_SIZE && (
        <div style={{
          padding: '10px 20px',
          borderTop: `1px solid ${theme.border}`,
          flexShrink: 0,
        }}>
          <button
            onClick={loadMore}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '7px',
              border: `1px solid ${theme.border}`,
              background: 'transparent',
              color: theme.textSecondary,
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Load more
          </button>
        </div>
      )}
    </Drawer>
  )
}
