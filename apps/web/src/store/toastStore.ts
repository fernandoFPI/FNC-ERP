import { create } from 'zustand'

export interface ToastAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'danger'
}

export interface Toast {
  id: string
  message: string
  variant: 'success' | 'warning' | 'danger' | 'info'
  actions?: ToastAction[]
}

type ToastVariant = Toast['variant']

interface ToastInput {
  message: string
  type?: ToastVariant | 'error'
  variant?: ToastVariant | 'error'
  actions?: ToastAction[]
}

interface ToastState {
  toasts: Toast[]
  addToast: (input: ToastInput) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: ({ message, type, variant, actions }) => {
    const raw = variant ?? type ?? 'info'
    const resolvedVariant: ToastVariant = raw === 'error' ? 'danger' : raw
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    set((s) => ({ toasts: [...s.toasts, { id, message, variant: resolvedVariant, actions }] }))
    // Action toasts stay until the user clicks an action or dismisses manually
    if (!actions?.length) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, 4000)
    }
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))
