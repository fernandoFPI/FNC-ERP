import React, { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/shell/AppShell'
import { PrivateRoute } from './PrivateRoute'
import { PermissionRoute } from './PermissionRoute'
import { Spinner } from '../components/ui/Spinner'
import { EmptyState } from '../components/ui/EmptyState'
import { Card } from '../components/ui/Card'
import { ErrorBoundary } from '../components/ui/ErrorBoundary'
const NotFoundPage = lazy(() => import('../pages/errors/NotFoundPage'))

const LoginPage = lazy(() => import('../pages/auth/LoginPage'))
const MFAPage = lazy(() => import('../pages/auth/MFAPage'))
const AcceptInvitationPage = lazy(() => import('../pages/auth/AcceptInvitationPage'))
const CompleteProfilePage = lazy(() => import('../pages/auth/CompleteProfilePage'))
const InvoiceVerifyPage = lazy(() => import('../pages/verify/InvoiceVerifyPage'))
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage'))

// Finance
const FinanceLayout = lazy(() => import('../pages/finance/FinanceLayout'))
const AccountsPage = lazy(() => import('../pages/finance/accounts/AccountsPage'))
const AccountForm = lazy(() => import('../pages/finance/accounts/AccountForm'))
const AccountLedger = lazy(() => import('../pages/finance/accounts/AccountLedger'))
const JournalsPage = lazy(() => import('../pages/finance/journals/JournalsPage'))
const JournalForm = lazy(() => import('../pages/finance/journals/JournalForm'))
const JournalDetail = lazy(() => import('../pages/finance/journals/JournalDetail'))
const FXRatesPage = lazy(() => import('../pages/finance/fx-rates/FXRatesPage'))
const PeriodsPage = lazy(() => import('../pages/finance/periods/PeriodsPage'))
const TrialBalance = lazy(() => import('../pages/finance/reports/TrialBalance'))
const ProfitLoss = lazy(() => import('../pages/finance/reports/ProfitLoss'))
const BalanceSheet = lazy(() => import('../pages/finance/reports/BalanceSheet'))
const ARDashboard = lazy(() => import('../pages/finance/ar/ARDashboard'))
const APDashboard = lazy(() => import('../pages/finance/ap/APDashboard'))
const VendorInvoiceDetail = lazy(() => import('../pages/finance/ap/VendorInvoiceDetail'))
const VendorInvoiceForm = lazy(() => import('../pages/finance/ap/VendorInvoiceForm'))
const CostCentersPage = lazy(() => import('../pages/finance/cost-centers/CostCentersPage'))
const AdvanceConfigPage = lazy(() => import('../pages/finance/advance-config/AdvanceConfigPage'))
const AnalyticAccountsPage = lazy(
  () => import('../pages/finance/analytic-accounts/AnalyticAccountsPage'),
)
const AnalyticAccountDetail = lazy(
  () => import('../pages/finance/analytic-accounts/AnalyticAccountDetail'),
)
const WHTPayablePage = lazy(() => import('../pages/finance/wht-payable/WHTPayablePage'))
const PaymentVouchersPage = lazy(
  () => import('../pages/finance/payment-vouchers/PaymentVouchersPage'),
)
const PaymentVoucherDetail = lazy(
  () => import('../pages/finance/payment-vouchers/PaymentVoucherDetail'),
)
const FixedAssetsPage = lazy(() => import('../pages/finance/assets/AssetsPage'))
const FixedAssetForm = lazy(() => import('../pages/finance/assets/AssetForm'))
const FixedAssetDetail = lazy(() => import('../pages/finance/assets/AssetDetail'))
const BankReconPage = lazy(() => import('../pages/finance/bank/BankReconPage'))
const ReconcileWorkspace = lazy(() => import('../pages/finance/bank/ReconcileWorkspace'))
const PaymentTermsPage = lazy(() => import('../pages/finance/terms/PaymentTermsPage'))
const RetentionPage = lazy(() => import('../pages/finance/retention/RetentionPage'))
const RetentionDetail = lazy(() => import('../pages/finance/retention/RetentionDetail'))
const BudgetPage = lazy(() => import('../pages/finance/budget/BudgetPage'))
const BudgetDetail = lazy(() => import('../pages/finance/budget/BudgetDetail'))
const RevaluationPage = lazy(() => import('../pages/finance/revaluation/RevaluationPage'))
const ExpenseClaimsPage = lazy(() => import('../pages/finance/expenses/ExpenseClaimsPage'))
const ExpenseClaimDetail = lazy(() => import('../pages/finance/expenses/ExpenseClaimDetail'))
const EmployeeAdvancesPage = lazy(() => import('../pages/finance/advances/EmployeeAdvancesPage'))
const EmployeeAdvanceDetail = lazy(() => import('../pages/finance/advances/EmployeeAdvanceDetail'))
const EmployeeAdvanceDashboard = lazy(
  () => import('../pages/finance/advances/EmployeeAdvanceDashboard'),
)
const MyAdvancesPage = lazy(() => import('../pages/finance/advances/MyAdvancesPage'))
const PettyCashPage = lazy(() => import('../pages/finance/petty-cash/PettyCashPage'))
const ExpenseCategoriesPage = lazy(
  () => import('../pages/finance/categories/ExpenseCategoriesPage'),
)

// Procurement
const ProcurementLayout = lazy(() => import('../pages/procurement/ProcurementLayout'))
const VendorsPage = lazy(() => import('../pages/procurement/vendors/VendorsPage'))
const VendorForm = lazy(() => import('../pages/procurement/vendors/VendorForm'))
const VendorDetail = lazy(() => import('../pages/procurement/vendors/VendorDetail'))
const PurchaseOrdersPage = lazy(
  () => import('../pages/procurement/purchase-orders/PurchaseOrdersPage'),
)
const PurchaseOrderForm = lazy(
  () => import('../pages/procurement/purchase-orders/PurchaseOrderForm'),
)
const PurchaseOrderDetail = lazy(
  () => import('../pages/procurement/purchase-orders/PurchaseOrderDetail'),
)
const ApprovalQueue = lazy(() => import('../pages/procurement/purchase-orders/ApprovalQueue'))
const MyPOQueue = lazy(() => import('../pages/procurement/purchase-orders/MyPOQueue'))
const ReceiptForm = lazy(() => import('../pages/procurement/receipts/ReceiptForm'))
const POReturnForm = lazy(() => import('../pages/procurement/purchase-orders/POReturnForm'))
const POReturnDetail = lazy(() => import('../pages/procurement/purchase-orders/POReturnDetail'))

// Projects
const ProjectsLayout = lazy(() => import('../pages/projects/ProjectsLayout'))
const ProjectsPage = lazy(() => import('../pages/projects/list/ProjectsPage'))
const ProjectForm = lazy(() => import('../pages/projects/form/ProjectForm'))
const ProjectDetail = lazy(() => import('../pages/projects/detail/ProjectDetail'))
const ContractsPage = lazy(() => import('../pages/projects/contracts/ContractsPage'))
const ContractDetail = lazy(() => import('../pages/projects/contracts/ContractDetail'))
const ContractForm = lazy(() => import('../pages/projects/contracts/ContractForm'))
const InvoicesPage = lazy(() => import('../pages/projects/invoices/InvoicesPage'))
const InvoiceDetail = lazy(() => import('../pages/projects/invoices/InvoiceDetail'))

// Manufacturing
const ManufacturingLayout = lazy(() => import('../pages/manufacturing/ManufacturingLayout'))
const WorkCentersPage = lazy(() => import('../pages/manufacturing/work-centers/WorkCentersPage'))
const BOMsPage = lazy(() => import('../pages/manufacturing/boms/BOMsPage'))
const BOMForm = lazy(() => import('../pages/manufacturing/boms/BOMForm'))
const BOMDetail = lazy(() => import('../pages/manufacturing/boms/BOMDetail'))
const ManufacturingOrdersPage = lazy(
  () => import('../pages/manufacturing/orders/ManufacturingOrdersPage'),
)
const ManufacturingOrderForm = lazy(
  () => import('../pages/manufacturing/orders/ManufacturingOrderForm'),
)
const ManufacturingOrderDetail = lazy(
  () => import('../pages/manufacturing/orders/ManufacturingOrderDetail'),
)
const ManufacturingRequestsPage = lazy(
  () => import('../pages/manufacturing/requests/ManufacturingRequestsPage'),
)
const ManufacturingRequestDetail = lazy(
  () => import('../pages/manufacturing/requests/ManufacturingRequestDetail'),
)

// Rental
const RentalLayout = lazy(() => import('../pages/rental/RentalLayout'))
const FleetOverviewPage = lazy(() => import('../pages/rental/fleet/FleetOverviewPage'))
const AssetsPage = lazy(() => import('../pages/rental/assets/AssetsPage'))
const AssetForm = lazy(() => import('../pages/rental/assets/AssetForm'))
const AssetDetail = lazy(() => import('../pages/rental/assets/AssetDetail'))
const RentalContractsPage = lazy(() => import('../pages/rental/contracts/ContractsPage'))
const RentalContractForm = lazy(() => import('../pages/rental/contracts/ContractForm'))
const RentalContractDetail = lazy(() => import('../pages/rental/contracts/ContractDetail'))
const RentalInvoicesPage = lazy(() => import('../pages/rental/invoices/RentalInvoicesPage'))
const MaintenancePage = lazy(() => import('../pages/rental/maintenance/MaintenancePage'))

// Reporting
const ReportingLayout = lazy(() => import('../pages/reporting/ReportingLayout'))
const ExecutiveDashboard = lazy(() => import('../pages/reporting/executive/ExecutiveDashboard'))
const CashFlowStatement = lazy(() => import('../pages/reporting/financial/CashFlowStatement'))
const ConsolidatedPL = lazy(() => import('../pages/reporting/consolidated/ConsolidatedPL'))
const ConsolidatedBS = lazy(() => import('../pages/reporting/consolidated/ConsolidatedBS'))
const ConsolidatedTrialBalance = lazy(
  () => import('../pages/reporting/consolidated/ConsolidatedTrialBalance'),
)
const ProjectProfitabilityReport = lazy(
  () => import('../pages/reporting/projects/ProjectProfitabilityReport'),
)
const PayrollCostReport = lazy(() => import('../pages/reporting/payroll/PayrollCostReport'))
const AttendanceSummaryReport = lazy(
  () => import('../pages/reporting/payroll/AttendanceSummaryReport'),
)
const InventoryValuationReport = lazy(
  () => import('../pages/reporting/inventory/InventoryValuationReport'),
)
const WHTReport = lazy(() => import('../pages/reporting/compliance/WHTReport'))
const FXExposureReport = lazy(() => import('../pages/reporting/compliance/FXExposureReport'))
const PayrollTaxReport = lazy(() => import('../pages/reporting/compliance/PayrollTaxReport'))

// Inter-company
const IntercoLayout = lazy(() => import('../pages/interco/IntercoLayout'))
const IntercoTransactionsPage = lazy(
  () => import('../pages/interco/transactions/IntercoTransactionsPage'),
)
const IntercoTransactionDetail = lazy(
  () => import('../pages/interco/transactions/IntercoTransactionDetail'),
)
const IntercoStockTransfersPage = lazy(
  () => import('../pages/interco/stock-transfers/IntercoStockTransfersPage'),
)
const IntercoStockTransferDetail = lazy(
  () => import('../pages/interco/stock-transfers/IntercoStockTransferDetail'),
)
const IntercoStockTransferForm = lazy(
  () => import('../pages/interco/stock-transfers/IntercoStockTransferForm'),
)
const TransferPricingPage = lazy(() => import('../pages/interco/pricing/TransferPricingPage'))

// Admin pages (now mounted under /settings/*)
const UsersPage = lazy(() => import('../pages/admin/users/UsersPage'))
const UserDetail = lazy(() => import('../pages/admin/users/UserDetail'))
const CompaniesPage = lazy(() => import('../pages/admin/companies/CompaniesPage'))
const CompanyDetail = lazy(() => import('../pages/admin/companies/CompanyDetail'))
const OutboxMonitorPage = lazy(() => import('../pages/admin/outbox/OutboxMonitorPage'))
const DLQPage = lazy(() => import('../pages/admin/outbox/DLQPage'))
const SystemHealthPage = lazy(() => import('../pages/admin/health/SystemHealthPage'))
const AuditLogPage = lazy(() => import('../pages/admin/audit/AuditLogPage'))
const EventConfigsPage = lazy(() => import('../pages/admin/event-configs/EventConfigsPage'))
const NotificationRoutingPage = lazy(
  () => import('../pages/admin/notification-routing/NotificationRoutingPage'),
)
const JobHistoryPage = lazy(() => import('../pages/settings/system/JobHistoryPage'))
const BankAccountsPage = lazy(() => import('../pages/admin/bank-accounts/BankAccountsPage'))
const RoleTemplatesPage = lazy(() => import('../pages/admin/roles/RoleTemplatesPage'))

// Settings
const SettingsLayout = lazy(() => import('../pages/settings/SettingsLayout'))
const InventoryImportPage = lazy(() => import('../pages/settings/inventory/InventoryImportPage'))
const WorkflowImportPage = lazy(() => import('../pages/settings/workflow/WorkflowImportPage'))
const ProfilePage = lazy(() => import('../pages/settings/profile/ProfilePage'))
const AppearancePage = lazy(() => import('../pages/settings/appearance/AppearancePage'))
const NotificationPreferencesPage = lazy(
  () => import('../pages/settings/notifications/NotificationPreferencesPage'),
)
const CompanySettingsPage = lazy(() => import('../pages/settings/company/CompanySettingsPage'))
const AccountingSettingsPage = lazy(
  () => import('../pages/settings/company/accounting/AccountingSettingsPage'),
)
const IntegrationsPage = lazy(
  () => import('../pages/settings/company/integrations/IntegrationsPage'),
)
const DocumentNumberingPage = lazy(
  () => import('../pages/settings/company/numbering/DocumentNumberingPage'),
)
const PoFxRatesPage = lazy(() => import('../pages/settings/company/po-fx-rates/PoFxRatesPage'))
const LifecycleSettingsPage = lazy(
  () => import('../pages/settings/company/lifecycle/LifecycleSettingsPage'),
)
const InviteHistoryPage = lazy(() => import('../pages/settings/users/InviteHistoryPage'))
const POPositionsPage = lazy(() => import('../pages/procurement/positions/POPositionsPage'))

// HR
const HRLayout = lazy(() => import('../pages/hr/HRLayout'))
const EmployeesPage = lazy(() => import('../pages/hr/employees/EmployeesPage'))
const EmployeeForm = lazy(() => import('../pages/hr/employees/EmployeeForm'))
const EmployeeDetail = lazy(() => import('../pages/hr/employees/EmployeeDetail'))
const DepartmentsPage = lazy(() => import('../pages/hr/departments/DepartmentsPage'))
const WorkLocationsPage = lazy(() => import('../pages/hr/locations/WorkLocationsPage'))
const ShiftConfigsPage = lazy(() => import('../pages/hr/shifts/ShiftConfigsPage'))
const LeaveTypesPage = lazy(() => import('../pages/hr/leave/LeaveTypesPage'))
const LeaveRequestsPage = lazy(() => import('../pages/hr/leave/LeaveRequestsPage'))
const LeaveRequestDetail = lazy(() => import('../pages/hr/leave/LeaveRequestDetail'))
const OvertimePage = lazy(() => import('../pages/hr/overtime/OvertimePage'))
const RechargeRequestsPage = lazy(() => import('../pages/hr/recharge/RechargeRequestsPage'))
const RechargeBundlesPage = lazy(() => import('../pages/hr/recharge/RechargeBundlesPage'))
const SalaryConfigForm = lazy(() => import('../pages/payroll/salary/SalaryConfigForm'))

// Payroll
const PayrollLayout = lazy(() => import('../pages/payroll/PayrollLayout'))
const PayrollRunsPage = lazy(() => import('../pages/payroll/runs/PayrollRunsPage'))
const PayrollRunForm = lazy(() => import('../pages/payroll/runs/PayrollRunForm'))
const PayrollRunDetail = lazy(() => import('../pages/payroll/runs/PayrollRunDetail'))
const PayslipsPage = lazy(() => import('../pages/payroll/payslips/PayslipsPage'))

// Attendance
const AttendancePage = lazy(() => import('../pages/attendance/AttendancePage'))
const PunchHistory = lazy(() => import('../pages/attendance/PunchHistory'))

// Notifications
const NotificationsPage = lazy(() => import('../pages/notifications/NotificationsPage'))

// Inventory
const InventoryLayout = lazy(() => import('../pages/inventory/InventoryLayout'))
const StoreOutPage = lazy(() => import('../pages/inventory/store-out/StoreOutPage'))
const StoreOutDetail = lazy(() => import('../pages/inventory/store-out/StoreOutDetail'))
const StoreInPage = lazy(() => import('../pages/inventory/store-in/StoreInPage'))
const StoreInDetail = lazy(() => import('../pages/inventory/store-in/StoreInDetail'))
const StockBalancesPage = lazy(() => import('../pages/inventory/balances/StockBalancesPage'))
const ProductsPage = lazy(() => import('../pages/inventory/products/ProductsPage'))
const ProductDetail = lazy(() => import('../pages/inventory/products/ProductDetail'))
const ProductForm = lazy(() => import('../pages/inventory/products/ProductForm'))
const LocationsPage = lazy(() => import('../pages/inventory/locations/LocationsPage'))
const StockMovesPage = lazy(() => import('../pages/inventory/moves/StockMovesPage'))
const TransferForm = lazy(() => import('../pages/inventory/moves/TransferForm'))
const LotsPage = lazy(() => import('../pages/inventory/lots/LotsPage'))
const LotTraceability = lazy(() => import('../pages/inventory/lots/LotTraceability'))
const StockAdjustmentForm = lazy(() => import('../pages/inventory/adjustments/StockAdjustmentForm'))

// Redirect helpers for old /admin/:id routes
function AdminUserRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/settings/users/${id}`} replace />
}

function AdminCompanyRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/settings/system/companies/${id}`} replace />
}

function PageSpinner() {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
    >
      <Spinner size="lg" />
    </div>
  )
}

function ComingSoon({ module }: { module: string }) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
    >
      <Card padding="lg" style={{ maxWidth: '400px', width: '100%' }}>
        <EmptyState title={module} message="Coming in the next phase. Check back soon!" />
      </Card>
    </div>
  )
}

function withSuspense(element: React.ReactNode) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageSpinner />}>{element}</Suspense>
    </ErrorBoundary>
  )
}

function withPerm(
  permKey: string,
  element: React.ReactNode,
  minLevel: 'view' | 'edit' | 'approve' | 'admin' = 'view',
) {
  return withSuspense(
    <PermissionRoute permKey={permKey} minLevel={minLevel}>
      {element}
    </PermissionRoute>,
  )
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: withSuspense(<LoginPage />),
  },
  {
    path: '/mfa',
    element: withSuspense(<MFAPage />),
  },
  {
    path: '/accept-invitation',
    element: withSuspense(<AcceptInvitationPage />),
  },
  {
    path: '/verify/:token',
    element: withSuspense(<InvoiceVerifyPage />),
  },
  {
    path: '/complete-profile',
    element: <PrivateRoute>{withSuspense(<CompleteProfilePage />)}</PrivateRoute>,
  },
  {
    element: (
      <PrivateRoute>
        <AppShell />
      </PrivateRoute>
    ),
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: withSuspense(<DashboardPage />) },
      { path: '/notifications', element: withSuspense(<NotificationsPage />) },
      // My Advances — deliberately NOT nested under /finance, since that
      // parent route is gated by finance.accounts.view and would block any
      // regular employee submitting their own advance request (this is
      // meant to be reachable by any employee with a linked employee
      // record, same reasoning as /recharge below).
      { path: '/my-advances', element: withSuspense(<MyAdvancesPage />) },

      // Finance
      {
        path: '/finance',
        element: withPerm('finance.accounts.view', <FinanceLayout />),
        children: [
          { index: true, element: <Navigate to="/finance/accounts" replace /> },
          { path: 'accounts', element: withPerm('finance.accounts.view', <AccountsPage />) },
          {
            path: 'accounts/new',
            element: withPerm('finance.accounts.edit', <AccountForm />, 'edit'),
          },
          {
            path: 'accounts/:id/edit',
            element: withPerm('finance.accounts.edit', <AccountForm />, 'edit'),
          },
          {
            path: 'accounts/:id/ledger',
            element: withPerm('finance.accounts.view', <AccountLedger />),
          },
          { path: 'journals', element: withPerm('finance.journals.view', <JournalsPage />) },
          {
            path: 'journals/new',
            element: withPerm('finance.journals.edit', <JournalForm />, 'edit'),
          },
          { path: 'journals/:id', element: withPerm('finance.journals.view', <JournalDetail />) },
          { path: 'fx-rates', element: withPerm('finance.fx_rates.view', <FXRatesPage />) },
          { path: 'periods', element: withPerm('finance.periods.view', <PeriodsPage />) },
          {
            path: 'reports/trial-balance',
            element: withPerm('finance.reports.view', <TrialBalance />),
          },
          {
            path: 'reports/profit-loss',
            element: withPerm('finance.reports.view', <ProfitLoss />),
          },
          {
            path: 'reports/balance-sheet',
            element: withPerm('finance.reports.view', <BalanceSheet />),
          },
          { path: 'ar', element: withPerm('finance.ar.view', <ARDashboard />) },
          { path: 'ap', element: withPerm('finance.ap.view', <APDashboard />) },
          { path: 'ap/new', element: withPerm('finance.ap.edit', <VendorInvoiceForm />, 'edit') },
          { path: 'ap/:id', element: withPerm('finance.ap.view', <VendorInvoiceDetail />) },
          {
            path: 'ap/:id/edit',
            element: withPerm('finance.ap.edit', <VendorInvoiceForm />, 'edit'),
          },
          {
            path: 'payment-vouchers',
            element: withPerm('finance.ap.view', <PaymentVouchersPage />),
          },
          {
            path: 'payment-vouchers/:id',
            element: withPerm('finance.ap.view', <PaymentVoucherDetail />),
          },
          {
            path: 'cost-centers',
            element: withPerm('finance.cost_centers.view', <CostCentersPage />),
          },
          {
            path: 'advance-config',
            element: withPerm('finance.accounts.edit', <AdvanceConfigPage />, 'edit'),
          },
          {
            path: 'analytic-accounts',
            element: withPerm('finance.analytic_accounts.view', <AnalyticAccountsPage />),
          },
          {
            path: 'analytic-accounts/:id',
            element: withPerm('finance.analytic_accounts.view', <AnalyticAccountDetail />),
          },
          {
            path: 'categories',
            element: withPerm('finance.expenses.view', <ExpenseCategoriesPage />),
          },
          { path: 'wht-payable', element: withPerm('finance.ap.view', <WHTPayablePage />) },
          { path: 'assets', element: withPerm('finance.assets.view', <FixedAssetsPage />) },
          {
            path: 'assets/new',
            element: withPerm('finance.assets.edit', <FixedAssetForm />, 'edit'),
          },
          { path: 'assets/:id', element: withPerm('finance.assets.view', <FixedAssetDetail />) },
          {
            path: 'assets/:id/edit',
            element: withPerm('finance.assets.edit', <FixedAssetForm />, 'edit'),
          },
          { path: 'bank', element: withPerm('finance.bank.view', <BankReconPage />) },
          {
            path: 'bank/:accountId',
            element: withPerm('finance.bank.view', <ReconcileWorkspace />),
          },
          {
            path: 'bank/:accountId/reconcile/:statementId',
            element: withPerm('finance.bank.edit', <ReconcileWorkspace />, 'edit'),
          },
          { path: 'payment-terms', element: withPerm('finance.terms.view', <PaymentTermsPage />) },
          { path: 'retention', element: withPerm('finance.retention.view', <RetentionPage />) },
          {
            path: 'retention/:id',
            element: withPerm('finance.retention.view', <RetentionDetail />),
          },
          { path: 'budget', element: withPerm('finance.budget.view', <BudgetPage />) },
          { path: 'budget/:id', element: withPerm('finance.budget.view', <BudgetDetail />) },
          {
            path: 'revaluation',
            element: withPerm('finance.revaluation.view', <RevaluationPage />),
          },
          {
            path: 'expense-claims',
            element: withPerm('finance.expenses.view', <ExpenseClaimsPage />),
          },
          {
            path: 'expense-claims/:id',
            element: withPerm('finance.expenses.view', <ExpenseClaimDetail />),
          },
          { path: 'petty-cash', element: withPerm('finance.petty_cash.view', <PettyCashPage />) },
          {
            path: 'advances',
            element: withPerm('finance.advances.view', <EmployeeAdvancesPage />),
          },
          {
            path: 'advances/dashboard',
            element: withPerm('finance.advances.view', <EmployeeAdvanceDashboard />),
          },
          {
            path: 'advances/:id',
            element: withPerm('finance.advances.view', <EmployeeAdvanceDetail />),
          },
        ],
      },

      // Procurement
      {
        path: '/procurement',
        element: withPerm('procurement.po.view', <ProcurementLayout />),
        children: [
          { index: true, element: <Navigate to="/procurement/purchase-orders" replace /> },
          {
            path: 'purchase-orders',
            element: withPerm('procurement.po.view', <PurchaseOrdersPage />),
          },
          {
            path: 'purchase-orders/new',
            element: withPerm('procurement.po.edit', <PurchaseOrderForm />, 'edit'),
          },
          {
            path: 'purchase-orders/:id',
            element: withPerm('procurement.po.view', <PurchaseOrderDetail />),
          },
          {
            path: 'purchase-orders/:id/receive',
            element: withPerm('procurement.po.edit', <ReceiptForm />, 'edit'),
          },
          {
            path: 'purchase-orders/:id/returns/new',
            element: withPerm('procurement.po.edit', <POReturnForm />, 'edit'),
          },
          {
            path: 'purchase-orders/:id/returns/:returnId',
            element: withPerm('procurement.po.view', <POReturnDetail />),
          },
          { path: 'vendors', element: withPerm('procurement.vendors.view', <VendorsPage />) },
          {
            path: 'vendors/new',
            element: withPerm('procurement.vendors.edit', <VendorForm />, 'edit'),
          },
          { path: 'vendors/:id', element: withPerm('procurement.vendors.view', <VendorDetail />) },
          {
            path: 'vendors/:id/edit',
            element: withPerm('procurement.vendors.edit', <VendorForm />, 'edit'),
          },
          {
            path: 'purchase-orders/approval-queue',
            element: withPerm('procurement.po.approve', <ApprovalQueue />, 'approve'),
          },
          { path: 'queue', element: withPerm('procurement.po.view', <MyPOQueue />) },
          // Legacy redirect — PO Positions moved to Settings
          { path: 'positions', element: <Navigate to="/settings/users/po-positions" replace /> },
        ],
      },

      // Inventory
      {
        path: '/inventory',
        element: withPerm('inventory.products.view', <InventoryLayout />),
        children: [
          { index: true, element: <Navigate to="/inventory/balances" replace /> },
          {
            path: 'balances',
            element: withPerm('inventory.stock_moves.view', <StockBalancesPage />),
          },
          { path: 'products', element: withPerm('inventory.products.view', <ProductsPage />) },
          {
            path: 'products/new',
            element: withPerm('inventory.products.edit', <ProductForm />, 'edit'),
          },
          { path: 'products/:id', element: withPerm('inventory.products.view', <ProductDetail />) },
          {
            path: 'products/:id/edit',
            element: withPerm('inventory.products.edit', <ProductForm />, 'edit'),
          },
          { path: 'locations', element: withPerm('inventory.locations.view', <LocationsPage />) },
          { path: 'moves', element: withPerm('inventory.stock_moves.view', <StockMovesPage />) },
          {
            path: 'moves/transfer',
            element: withPerm('inventory.stock_moves.edit', <TransferForm />, 'edit'),
          },
          { path: 'lots', element: withPerm('inventory.lots.view', <LotsPage />) },
          { path: 'lots/:id', element: withPerm('inventory.lots.view', <LotTraceability />) },
          {
            path: 'adjust',
            element: withPerm('inventory.stock_moves.edit', <StockAdjustmentForm />, 'edit'),
          },
          { path: 'store-out', element: withPerm('inventory.stock_moves.view', <StoreOutPage />) },
          {
            path: 'store-out/:id',
            element: withPerm('inventory.stock_moves.view', <StoreOutDetail />),
          },
          { path: 'store-in', element: withPerm('inventory.stock_moves.view', <StoreInPage />) },
          {
            path: 'store-in/:id',
            element: withPerm('inventory.stock_moves.view', <StoreInDetail />),
          },
        ],
      },

      // Projects
      {
        path: '/projects',
        // No blanket permission gate on the layout shell itself — every child
        // route below already declares its own. A single project's detail page
        // additionally allows its creator/PM/team even without the company-wide
        // projects.view grant (see requireProjectViewGW on the gateway), which a
        // parent-level gate here would block before that check ever ran.
        element: withSuspense(<ProjectsLayout />),
        children: [
          { index: true, element: withPerm('projects.view', <ProjectsPage />) },
          { path: 'list', element: <Navigate to="/projects" replace /> },
          { path: 'new', element: withPerm('projects.edit', <ProjectForm />, 'edit') },
          { path: ':id', element: withSuspense(<ProjectDetail />) },
          { path: ':id/edit', element: withPerm('projects.edit', <ProjectForm />, 'edit') },
          { path: 'contracts', element: withPerm('projects.view', <ContractsPage />) },
          { path: 'contracts/new', element: withPerm('projects.edit', <ContractForm />, 'edit') },
          { path: 'contracts/:id', element: withPerm('projects.view', <ContractDetail />) },
          {
            path: 'contracts/:id/edit',
            element: withPerm('projects.edit', <ContractForm />, 'edit'),
          },
          { path: 'invoices', element: withPerm('projects.invoices.view', <InvoicesPage />) },
          { path: 'invoices/:id', element: withPerm('projects.invoices.view', <InvoiceDetail />) },
        ],
      },

      // Manufacturing
      {
        path: '/manufacturing',
        element: withPerm('manufacturing.orders.view', <ManufacturingLayout />),
        children: [
          { index: true, element: <Navigate to="/manufacturing/orders" replace /> },
          {
            path: 'work-centers',
            element: withPerm('manufacturing.work_centers.view', <WorkCentersPage />),
          },
          { path: 'boms', element: withPerm('manufacturing.boms.view', <BOMsPage />) },
          { path: 'boms/new', element: withPerm('manufacturing.boms.edit', <BOMForm />, 'edit') },
          { path: 'boms/:id', element: withPerm('manufacturing.boms.view', <BOMDetail />) },
          {
            path: 'boms/:id/edit',
            element: withPerm('manufacturing.boms.edit', <BOMForm />, 'edit'),
          },
          {
            path: 'orders',
            element: withPerm('manufacturing.orders.view', <ManufacturingOrdersPage />),
          },
          {
            path: 'orders/new',
            element: withPerm('manufacturing.orders.edit', <ManufacturingOrderForm />, 'edit'),
          },
          {
            path: 'orders/:id',
            element: withPerm('manufacturing.orders.view', <ManufacturingOrderDetail />),
          },
          {
            path: 'requests',
            element: withPerm('manufacturing.orders.view', <ManufacturingRequestsPage />),
          },
          {
            path: 'requests/:id',
            element: withPerm('manufacturing.orders.view', <ManufacturingRequestDetail />),
          },
        ],
      },

      // Rental
      {
        path: '/rental',
        element: withPerm('rental.assets.view', <RentalLayout />),
        children: [
          { index: true, element: <Navigate to="/rental/fleet" replace /> },
          { path: 'fleet', element: withPerm('rental.assets.view', <FleetOverviewPage />) },
          { path: 'assets', element: withPerm('rental.assets.view', <AssetsPage />) },
          { path: 'assets/new', element: withPerm('rental.assets.edit', <AssetForm />, 'edit') },
          { path: 'assets/:id', element: withPerm('rental.assets.view', <AssetDetail />) },
          {
            path: 'assets/:id/edit',
            element: withPerm('rental.assets.edit', <AssetForm />, 'edit'),
          },
          {
            path: 'contracts',
            element: withPerm('rental.contracts.view', <RentalContractsPage />),
          },
          {
            path: 'contracts/new',
            element: withPerm('rental.contracts.edit', <RentalContractForm />, 'edit'),
          },
          {
            path: 'contracts/:id',
            element: withPerm('rental.contracts.view', <RentalContractDetail />),
          },
          {
            path: 'contracts/:id/edit',
            element: withPerm('rental.contracts.edit', <RentalContractForm />, 'edit'),
          },
          { path: 'invoices', element: withPerm('projects.invoices.view', <RentalInvoicesPage />) },
          {
            path: 'maintenance',
            element: withPerm('rental.maintenance.view', <MaintenancePage />),
          },
        ],
      },

      // HR
      {
        path: '/hr',
        element: withPerm('hr.employees.view', <HRLayout />),
        children: [
          { index: true, element: <Navigate to="/hr/employees" replace /> },
          { path: 'employees', element: withPerm('hr.employees.view', <EmployeesPage />) },
          {
            path: 'employees/new',
            element: withPerm('hr.employees.edit', <EmployeeForm />, 'edit'),
          },
          { path: 'employees/:id', element: withPerm('hr.employees.view', <EmployeeDetail />) },
          {
            path: 'employees/:id/edit',
            element: withPerm('hr.employees.edit', <EmployeeForm />, 'edit'),
          },
          {
            path: 'employees/:id/salary',
            element: withPerm('hr.salary.view', <SalaryConfigForm />),
          },
          { path: 'departments', element: withPerm('hr.departments.view', <DepartmentsPage />) },
          { path: 'locations', element: withPerm('hr.departments.view', <WorkLocationsPage />) },
          { path: 'shifts', element: withPerm('hr.departments.view', <ShiftConfigsPage />) },
          { path: 'leave/types', element: withPerm('hr.leave.view', <LeaveTypesPage />) },
          { path: 'leave', element: withPerm('hr.leave.view', <LeaveRequestsPage />) },
          { path: 'leave/:id', element: withPerm('hr.leave.view', <LeaveRequestDetail />) },
          { path: 'overtime', element: withPerm('hr.overtime.view', <OvertimePage />) },
        ],
      },

      // Phone Recharge Requests — deliberately NOT nested under /hr/*, since
      // that parent route is gated by hr.employees.view and would block any
      // regular employee who only holds hr.recharge.view (this is meant to
      // be reachable by any employee, not just HR staff).
      { path: '/recharge', element: withPerm('hr.recharge.view', <RechargeRequestsPage />) },
      {
        path: '/recharge/bundles',
        element: withPerm('hr.recharge.admin', <RechargeBundlesPage />, 'admin'),
      },

      // Payroll
      {
        path: '/payroll',
        element: withPerm('payroll.runs.view', <PayrollLayout />),
        children: [
          { index: true, element: <Navigate to="/payroll/runs" replace /> },
          { path: 'runs', element: withPerm('payroll.runs.view', <PayrollRunsPage />) },
          { path: 'runs/new', element: withPerm('payroll.runs.edit', <PayrollRunForm />, 'edit') },
          { path: 'runs/:id', element: withPerm('payroll.runs.view', <PayrollRunDetail />) },
          { path: 'payslips', element: withPerm('payroll.payslips.view', <PayslipsPage />) },
        ],
      },

      // Attendance
      { path: '/attendance', element: withPerm('attendance.view', <AttendancePage />) },
      { path: '/attendance/all', element: withPerm('attendance.view', <PunchHistory />) },

      // Reporting
      {
        path: '/reporting',
        element: withPerm('reporting.executive.view', <ReportingLayout />),
        children: [
          { index: true, element: <Navigate to="/reporting/executive" replace /> },
          {
            path: 'executive',
            element: withPerm('reporting.executive.view', <ExecutiveDashboard />),
          },
          {
            path: 'financial/cash-flow',
            element: withPerm('reporting.financial.view', <CashFlowStatement />),
          },
          {
            path: 'consolidated/pl',
            element: withPerm('reporting.consolidated.view', <ConsolidatedPL />),
          },
          {
            path: 'consolidated/bs',
            element: withPerm('reporting.consolidated.view', <ConsolidatedBS />),
          },
          {
            path: 'consolidated/trial-balance',
            element: withPerm('reporting.consolidated.view', <ConsolidatedTrialBalance />),
          },
          {
            path: 'projects/profitability',
            element: withPerm('reporting.operational.view', <ProjectProfitabilityReport />),
          },
          {
            path: 'payroll/costs',
            element: withPerm('reporting.operational.view', <PayrollCostReport />),
          },
          {
            path: 'payroll/attendance',
            element: withPerm('reporting.operational.view', <AttendanceSummaryReport />),
          },
          {
            path: 'inventory/valuation',
            element: withPerm('reporting.operational.view', <InventoryValuationReport />),
          },
          { path: 'compliance/wht', element: withPerm('reporting.compliance.view', <WHTReport />) },
          {
            path: 'compliance/fx-exposure',
            element: withPerm('reporting.compliance.view', <FXExposureReport />),
          },
          {
            path: 'compliance/payroll-tax',
            element: withPerm('reporting.compliance.view', <PayrollTaxReport />),
          },
        ],
      },

      // Inter-company
      {
        path: '/interco',
        element: withPerm('interco.transactions.view', <IntercoLayout />),
        children: [
          { index: true, element: <Navigate to="/interco/transactions" replace /> },
          {
            path: 'transactions',
            element: withPerm('interco.transactions.view', <IntercoTransactionsPage />),
          },
          {
            path: 'transactions/:id',
            element: withPerm('interco.transactions.view', <IntercoTransactionDetail />),
          },
          {
            path: 'stock-transfers',
            element: withPerm('interco.stock_transfers.view', <IntercoStockTransfersPage />),
          },
          {
            path: 'stock-transfers/new',
            element: withPerm('interco.stock_transfers.view', <IntercoStockTransferForm />),
          },
          {
            path: 'stock-transfers/:id',
            element: withPerm('interco.stock_transfers.view', <IntercoStockTransferDetail />),
          },
          {
            path: 'pricing',
            element: withPerm('interco.transactions.view', <TransferPricingPage />),
          },
        ],
      },

      // Settings — unified two-column layout for all settings
      {
        path: '/settings',
        element: withSuspense(<SettingsLayout />),
        children: [
          { index: true, element: <Navigate to="/settings/profile" replace /> },

          // Personal
          { path: 'profile', element: withSuspense(<ProfilePage />) },
          { path: 'password', element: withSuspense(<ProfilePage />) },
          { path: 'two-factor', element: withSuspense(<ProfilePage />) },
          { path: 'sessions', element: withSuspense(<ProfilePage />) },
          { path: 'appearance', element: withSuspense(<AppearancePage />) },
          { path: 'notifications', element: withSuspense(<NotificationPreferencesPage />) },

          // Company (company_admin + system_admin)
          { path: 'company', element: <Navigate to="/settings/company/general" replace /> },
          {
            path: 'company/general',
            element: withPerm('admin.companies.view', <CompanySettingsPage />),
          },
          {
            path: 'company/bank-accounts',
            element: withPerm('admin.companies.admin', <BankAccountsPage />, 'admin'),
          },
          {
            path: 'company/tax',
            element: withPerm('admin.companies.view', <CompanySettingsPage />),
          },
          {
            path: 'company/accounting',
            element: withPerm('admin.companies.view', <AccountingSettingsPage />),
          },
          {
            path: 'company/integrations',
            element: withPerm('admin.companies.admin', <IntegrationsPage />, 'admin'),
          },
          {
            path: 'company/numbering',
            element: withPerm('admin.companies.admin', <DocumentNumberingPage />, 'admin'),
          },
          {
            path: 'company/po-fx-rates',
            element: withPerm('admin.companies.admin', <PoFxRatesPage />, 'admin'),
          },
          {
            path: 'company/lifecycle',
            element: withPerm('admin.companies.admin', <LifecycleSettingsPage />, 'admin'),
          },

          // Users & Roles (system_admin)
          { path: 'users', element: withPerm('admin.users.view', <UsersPage />) },
          {
            path: 'users/po-positions',
            element: withPerm('procurement.positions.view', <POPositionsPage />),
          },
          {
            path: 'users/role-templates',
            element: withPerm('admin.roles.admin', <RoleTemplatesPage />, 'admin'),
          },
          { path: 'users/invites', element: withPerm('admin.users.view', <InviteHistoryPage />) },
          { path: 'users/:id', element: withPerm('admin.users.view', <UserDetail />) },

          // System (system_admin)
          {
            path: 'system/companies',
            element: withPerm('admin.companies.view', <CompaniesPage />),
          },
          {
            path: 'system/companies/:id',
            element: withPerm('admin.companies.view', <CompanyDetail />),
          },
          { path: 'system/health', element: withPerm('admin.system.view', <SystemHealthPage />) },
          { path: 'system/outbox', element: withPerm('admin.system.view', <OutboxMonitorPage />) },
          { path: 'system/dlq', element: withPerm('admin.system.view', <DLQPage />) },
          {
            path: 'system/events',
            element: withPerm('admin.system.admin', <EventConfigsPage />, 'admin'),
          },
          {
            path: 'system/notification-routing',
            element: withPerm('admin.system.admin', <NotificationRoutingPage />, 'admin'),
          },
          {
            path: 'system/job-history',
            element: withPerm('admin.system.view', <JobHistoryPage />),
          },
          { path: 'system/audit', element: withPerm('admin.system.view', <AuditLogPage />) },
          {
            path: 'system/inventory-import',
            element: withPerm('admin.system.admin', <InventoryImportPage />, 'admin'),
          },
          {
            path: 'system/workflow-import',
            element: withPerm('admin.system.admin', <WorkflowImportPage />, 'admin'),
          },
        ],
      },

      // Legacy /admin/* redirects — preserve existing bookmarks
      {
        path: '/admin',
        children: [
          { index: true, element: <Navigate to="/settings/users" replace /> },
          { path: 'users', element: <Navigate to="/settings/users" replace /> },
          { path: 'users/:id', element: withSuspense(<AdminUserRedirect />) },
          { path: 'companies', element: <Navigate to="/settings/system/companies" replace /> },
          { path: 'companies/:id', element: withSuspense(<AdminCompanyRedirect />) },
          { path: 'health', element: <Navigate to="/settings/system/health" replace /> },
          { path: 'outbox', element: <Navigate to="/settings/system/outbox" replace /> },
          { path: 'dlq', element: <Navigate to="/settings/system/dlq" replace /> },
          { path: 'event-configs', element: <Navigate to="/settings/system/events" replace /> },
          { path: 'audit', element: <Navigate to="/settings/system/audit" replace /> },
          {
            path: 'bank-accounts',
            element: <Navigate to="/settings/company/bank-accounts" replace />,
          },
          {
            path: 'role-templates',
            element: <Navigate to="/settings/users/role-templates" replace />,
          },
        ],
      },

      // Catch-all — must be last
      { path: '*', element: withSuspense(<NotFoundPage />) },
    ],
  },
])
