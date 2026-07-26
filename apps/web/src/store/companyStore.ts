import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuthStore } from './authStore'

export interface Company {
  id: string
  name: string
  currencyCode?: string
}

interface CompanyState {
  activeCompany: Company | null
  companies: Company[]
  setActiveCompany: (company: Company) => void
  setCompanies: (companies: Company[]) => void
}

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set) => ({
      activeCompany: null,
      companies: [],
      setActiveCompany: (company) => {
        set({ activeCompany: company })
        void useAuthStore.getState().loadPermissionsForCompany(company.id)
      },
      setCompanies: (companies) => {
        set({ companies })
      },
    }),
    {
      name: 'fnc-company',
      partialize: (state) => ({ activeCompany: state.activeCompany, companies: state.companies }),
    },
  ),
)
