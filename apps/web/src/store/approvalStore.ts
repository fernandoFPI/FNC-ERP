import { create } from 'zustand'

interface ApprovalState {
  pendingCount: number
  setPendingCount: (n: number) => void
  overdueMaintenanceCount: number
  setOverdueMaintenance: (n: number) => void
}

export const useApprovalStore = create<ApprovalState>((set) => ({
  pendingCount: 0,
  setPendingCount: (n) => set({ pendingCount: n }),
  overdueMaintenanceCount: 0,
  setOverdueMaintenance: (n) => set({ overdueMaintenanceCount: n }),
}))
