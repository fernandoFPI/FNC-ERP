import { create } from 'zustand'

interface ApprovalState {
  overdueMaintenanceCount: number
  setOverdueMaintenance: (n: number) => void
}

export const useApprovalStore = create<ApprovalState>((set) => ({
  overdueMaintenanceCount: 0,
  setOverdueMaintenance: (n) => {
    set({ overdueMaintenanceCount: n })
  },
}))
