import { useCompanyStore } from '../store/companyStore'

export function useCompany() {
  return useCompanyStore()
}
