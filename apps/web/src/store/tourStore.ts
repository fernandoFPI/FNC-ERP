import { create } from 'zustand'

interface TourState {
  isActive: boolean
  tourKey: string | null
  tourTitle: string
  currentStep: number
  totalSteps: number
  activate: (key: string, title: string, total: number) => void
  setStep: (step: number) => void
  deactivate: () => void
}

export const useTourStore = create<TourState>((set) => ({
  isActive: false,
  tourKey: null,
  tourTitle: '',
  currentStep: 0,
  totalSteps: 0,
  activate: (key, title, total) => {
    set({ isActive: true, tourKey: key, tourTitle: title, currentStep: 0, totalSteps: total })
  },
  setStep: (step) => {
    set({ currentStep: step })
  },
  deactivate: () => {
    set({ isActive: false, tourKey: null, tourTitle: '', currentStep: 0, totalSteps: 0 })
  },
}))
