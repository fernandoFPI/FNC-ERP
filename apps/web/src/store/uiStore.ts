import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  accountTypeFilter: string
  setAccountTypeFilter: (type: string) => void
  notificationsOpen: boolean
  setNotificationsOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: localStorage.getItem('fnc-sidebar-collapsed') === 'true',
  toggleSidebar: () => {
    set((s) => {
      const next = !s.sidebarCollapsed
      localStorage.setItem('fnc-sidebar-collapsed', String(next))
      return { sidebarCollapsed: next }
    })
  },
  accountTypeFilter: '',
  setAccountTypeFilter: (type) => {
    set({ accountTypeFilter: type })
  },
  notificationsOpen: false,
  setNotificationsOpen: (open) => {
    set({ notificationsOpen: open })
  },
}))
