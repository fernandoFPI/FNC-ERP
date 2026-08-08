import { usePermission } from '../../hooks/usePermission'
import CompanyDashboard from './CompanyDashboard'
import MyDashboard from './MyDashboard'

// The company-wide snapshot (revenue, spend by category, every PO, the
// full audit trail) is only appropriate for whoever can already see the
// executive dashboard — reusing that exact permission rather than
// inventing a new one. Everyone else lands on their own personal view
// instead of a locked-down, mostly-empty copy of the admin page.
export default function DashboardPage() {
  const { isSystemLevel, can } = usePermission()
  const seesCompanyDashboard = isSystemLevel || can('reporting.executive.view')

  return seesCompanyDashboard ? <CompanyDashboard /> : <MyDashboard />
}
