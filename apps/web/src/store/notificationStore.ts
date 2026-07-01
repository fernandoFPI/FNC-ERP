import { create } from 'zustand'

export interface AppNotification {
  id: string
  type: string
  title: string
  body?: string
  isRead: boolean
  createdAt: string
  data?: Record<string, unknown>
}

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  isDrawerOpen: boolean
  addNotification: (n: AppNotification) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  setUnreadCount: (count: number) => void
  setDrawerOpen: (open: boolean) => void
  setNotifications: (notifications: AppNotification[]) => void
  appendNotifications: (notifications: AppNotification[]) => void
  // Legacy aliases used by Topbar
  markRead: (id: string) => void
  markAllRead: () => void
  clearAll: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isDrawerOpen: false,

  addNotification: (n) =>
    set((s) => ({
      notifications: [n, ...s.notifications],
      unreadCount: s.unreadCount + (n.isRead ? 0 : 1),
    })),

  markAsRead: (id) =>
    set((s) => {
      const notif = s.notifications.find((n) => n.id === id)
      const wasUnread = notif && !notif.isRead
      return {
        notifications: s.notifications.map((n) => n.id === id ? { ...n, isRead: true } : n),
        unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      }
    }),

  markAllAsRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),

  setUnreadCount: (count) => set({ unreadCount: count }),

  setDrawerOpen: (open) => set({ isDrawerOpen: open }),

  setNotifications: (notifications) =>
    set({ notifications, unreadCount: notifications.filter((n) => !n.isRead).length }),

  appendNotifications: (more) =>
    set((s) => ({ notifications: [...s.notifications, ...more] })),

  // Legacy aliases
  markRead: (id) =>
    set((s) => {
      const notif = s.notifications.find((n) => n.id === id)
      const wasUnread = notif && !notif.isRead
      return {
        notifications: s.notifications.map((n) => n.id === id ? { ...n, isRead: true } : n),
        unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      }
    }),
  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),
  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}))
