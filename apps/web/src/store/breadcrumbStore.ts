import { create } from 'zustand'
import { useAuthStore } from './authStore'

// The human name of a record (a requisition number, a vendor's name, a project code), keyed by the record's id. The breadcrumb only knows
// the URL, so on a record page it would print "#3f2b8c1e"; a page that has loaded its record registers the name here and the top bar
// shows it instead. Keyed by id, not by path, so the edit, receive and items-bought sub-pages of a record share the name its main page
// loaded. Kept in memory only, and never longer than a user's own session in one company (cleared below).
const MAX_TITLES = 300

interface BreadcrumbState {
  titles: Record<string, string>
  setTitle: (id: string, title: string) => void
  clear: () => void
}

export const useBreadcrumbStore = create<BreadcrumbState>((set) => ({
  titles: {},
  setTitle: (id, title) => {
    set((s) => {
      if (s.titles[id] === title) return s
      const next = { ...s.titles, [id]: title }
      // a long session must not grow this without end: drop the oldest names first (object keys keep insertion order)
      const keys = Object.keys(next)
      for (let i = 0; i < keys.length - MAX_TITLES; i++) delete next[keys[i]]
      return { titles: next }
    })
  },
  clear: () => {
    set({ titles: {} })
  },
}))

// Another person signing in, or the same person switching company, must not see names that were loaded for the previous one.
useAuthStore.subscribe((state, prev) => {
  if (state.user?.id !== prev.user?.id || state.user?.companyId !== prev.user?.companyId) {
    useBreadcrumbStore.getState().clear()
  }
})
