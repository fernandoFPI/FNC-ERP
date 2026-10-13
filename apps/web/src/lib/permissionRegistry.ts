import i18n from '../i18n'
// Browser-safe copy of packages/permissions/src/registry.ts
// No Node.js dependencies — safe to bundle in Vite.

export type AccessLevel = 'none' | 'view' | 'edit' | 'approve' | 'admin'

export interface PermissionDef {
  key: string
  label: string
  description?: string
  sortOrder: number
}

export interface SubmoduleDef {
  key: string
  label: string
  permissions: PermissionDef[]
}

export interface ModuleDef {
  key: string
  label: string
  submodules: SubmoduleDef[]
}

export const ACCESS_LEVEL_ORDER: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  approve: 3,
  admin: 4,
}

export const PERMISSION_REGISTRY: ModuleDef[] = [
  {
    key: 'finance',
    get label() { return i18n.t('perm.reg.finance', { defaultValue: "Finance" }) },
    submodules: [
      {
        key: 'accounts',
        get label() { return i18n.t('perm.reg.chartOfAccounts', { defaultValue: "Chart of Accounts" }) },
        permissions: [
          { key: 'finance.accounts.view', get label() { return i18n.t('perm.reg.viewAccounts', { defaultValue: "View Accounts" }) }, sortOrder: 10 },
          { key: 'finance.accounts.edit', get label() { return i18n.t('perm.reg.editAccounts', { defaultValue: "Edit Accounts" }) }, sortOrder: 11 },
          { key: 'finance.accounts.admin', get label() { return i18n.t('perm.reg.administerAccounts', { defaultValue: "Administer Accounts" }) }, sortOrder: 12 },
        ],
      },
      {
        key: 'journals',
        get label() { return i18n.t('perm.reg.journalEntries', { defaultValue: "Journal Entries" }) },
        permissions: [
          { key: 'finance.journals.view', get label() { return i18n.t('perm.reg.viewJournals', { defaultValue: "View Journals" }) }, sortOrder: 20 },
          { key: 'finance.journals.edit', get label() { return i18n.t('perm.reg.editJournals', { defaultValue: "Edit Journals" }) }, sortOrder: 21 },
          { key: 'finance.journals.approve', get label() { return i18n.t('perm.reg.postCancelJournals', { defaultValue: "Post/Cancel Journals" }) }, sortOrder: 22 },
        ],
      },
      {
        key: 'fx_rates',
        get label() { return i18n.t('perm.reg.fxRates', { defaultValue: "FX Rates" }) },
        permissions: [
          { key: 'finance.fx_rates.view', get label() { return i18n.t('perm.reg.viewFxRates', { defaultValue: "View FX Rates" }) }, sortOrder: 30 },
          { key: 'finance.fx_rates.edit', get label() { return i18n.t('perm.reg.manageFxRates', { defaultValue: "Manage FX Rates" }) }, sortOrder: 31 },
        ],
      },
      {
        key: 'periods',
        get label() { return i18n.t('perm.reg.accountingPeriods', { defaultValue: "Accounting Periods" }) },
        permissions: [
          { key: 'finance.periods.view', get label() { return i18n.t('perm.reg.viewPeriods', { defaultValue: "View Periods" }) }, sortOrder: 40 },
          { key: 'finance.periods.admin', get label() { return i18n.t('perm.reg.openClosePeriods', { defaultValue: "Open/Close Periods" }) }, sortOrder: 41 },
        ],
      },
      {
        key: 'ar',
        get label() { return i18n.t('perm.reg.accountsReceivable', { defaultValue: "Accounts Receivable" }) },
        permissions: [
          { key: 'finance.ar.view', get label() { return i18n.t('perm.reg.viewAr', { defaultValue: "View AR" }) }, sortOrder: 50 },
          { key: 'finance.ar.edit', get label() { return i18n.t('perm.reg.manageAr', { defaultValue: "Manage AR" }) }, sortOrder: 51 },
        ],
      },
      {
        key: 'ap',
        get label() { return i18n.t('perm.reg.accountsPayable', { defaultValue: "Accounts Payable" }) },
        permissions: [
          { key: 'finance.ap.view', get label() { return i18n.t('perm.reg.viewAp', { defaultValue: "View AP" }) }, sortOrder: 60 },
          { key: 'finance.ap.edit', get label() { return i18n.t('perm.reg.editVendorInvoices', { defaultValue: "Edit Vendor Invoices" }) }, sortOrder: 61 },
          { key: 'finance.ap.approve', get label() { return i18n.t('perm.reg.approveVendorInvoices', { defaultValue: "Approve Vendor Invoices" }) }, sortOrder: 62 },
        ],
      },
      {
        key: 'cost_centers',
        get label() { return i18n.t('perm.reg.costCenters', { defaultValue: "Cost Centers" }) },
        permissions: [
          { key: 'finance.cost_centers.view', get label() { return i18n.t('perm.reg.viewCostCenters', { defaultValue: "View Cost Centers" }) }, sortOrder: 70 },
          { key: 'finance.cost_centers.edit', get label() { return i18n.t('perm.reg.manageCostCenters', { defaultValue: "Manage Cost Centers" }) }, sortOrder: 71 },
        ],
      },
      {
        key: 'analytic_accounts',
        get label() { return i18n.t('perm.reg.analyticAccounts', { defaultValue: "Analytic Accounts" }) },
        permissions: [
          { key: 'finance.analytic_accounts.view', get label() { return i18n.t('perm.reg.viewAnalyticAccounts', { defaultValue: "View Analytic Accounts" }) }, sortOrder: 80 },
          {
            key: 'finance.analytic_accounts.edit',
            get label() { return i18n.t('perm.reg.manageAnalyticAccounts', { defaultValue: "Manage Analytic Accounts" }) },
            sortOrder: 81,
          },
        ],
      },
      {
        key: 'reports',
        get label() { return i18n.t('perm.reg.financialReports', { defaultValue: "Financial Reports" }) },
        permissions: [
          { key: 'finance.reports.view', get label() { return i18n.t('perm.reg.viewFinancialReports', { defaultValue: "View Financial Reports" }) }, sortOrder: 90 },
          {
            key: 'finance.reports.consolidated.view',
            get label() { return i18n.t('perm.reg.viewConsolidatedReports', { defaultValue: "View Consolidated Reports" }) },
            sortOrder: 91,
          },
        ],
      },
      {
        key: 'expenses',
        get label() { return i18n.t('perm.reg.expenseClaims', { defaultValue: "Expense Claims" }) },
        permissions: [
          { key: 'finance.expenses.view', get label() { return i18n.t('perm.reg.viewExpenseClaims', { defaultValue: "View Expense Claims" }) }, sortOrder: 92 },
          { key: 'finance.expenses.edit', get label() { return i18n.t('perm.reg.editExpenseClaims', { defaultValue: "Edit Expense Claims" }) }, sortOrder: 93 },
          { key: 'finance.expenses.approve', get label() { return i18n.t('perm.reg.approveExpenseClaims', { defaultValue: "Approve Expense Claims" }) }, sortOrder: 94 },
          { key: 'finance.expenses.audit', get label() { return i18n.t('perm.reg.passFailExpenseAudit', { defaultValue: "Pass/Fail Expense Audit" }) }, sortOrder: 1232 },
        ],
      },
      {
        key: 'petty_cash',
        get label() { return i18n.t('perm.reg.pettyCash', { defaultValue: "Petty Cash" }) },
        permissions: [
          { key: 'finance.petty_cash.view', get label() { return i18n.t('perm.reg.viewPettyCash', { defaultValue: "View Petty Cash" }) }, sortOrder: 95 },
          { key: 'finance.petty_cash.edit', get label() { return i18n.t('perm.reg.managePettyCash', { defaultValue: "Manage Petty Cash" }) }, sortOrder: 96 },
          {
            key: 'finance.petty_cash.approve',
            get label() { return i18n.t('perm.reg.approvePettyCashReplenishments', { defaultValue: "Approve Petty Cash Replenishments" }) },
            sortOrder: 97,
          },
        ],
      },
      {
        key: 'bank',
        get label() { return i18n.t('perm.reg.bank', { defaultValue: "Bank" }) },
        permissions: [
          {
            key: 'finance.bank.view',
            get label() { return i18n.t('perm.reg.viewBankAccountsReconciliation', { defaultValue: "View Bank Accounts & Reconciliation" }) },
            sortOrder: 98,
          },
          {
            key: 'finance.bank.edit',
            get label() { return i18n.t('perm.reg.manageBankAccountsReconciliation', { defaultValue: "Manage Bank Accounts & Reconciliation" }) },
            sortOrder: 99,
          },
        ],
      },
      {
        key: 'advances',
        get label() { return i18n.t('perm.reg.employeeAdvances', { defaultValue: "Employee Advances" }) },
        permissions: [
          { key: 'finance.advances.view', get label() { return i18n.t('perm.reg.viewEmployeeAdvances', { defaultValue: "View Employee Advances" }) }, sortOrder: 100 },
          { key: 'finance.advances.edit', get label() { return i18n.t('perm.reg.editEmployeeAdvances', { defaultValue: "Edit Employee Advances" }) }, sortOrder: 101 },
          {
            key: 'finance.advances.approve',
            get label() { return i18n.t('perm.reg.approveEmployeeAdvances', { defaultValue: "Approve Employee Advances" }) },
            sortOrder: 102,
          },
        ],
      },
      {
        key: 'assets',
        get label() { return i18n.t('perm.reg.fixedAssets', { defaultValue: "Fixed Assets" }) },
        permissions: [
          { key: 'finance.assets.view', get label() { return i18n.t('perm.reg.viewFixedAssets', { defaultValue: "View Fixed Assets" }) }, sortOrder: 103 },
          { key: 'finance.assets.edit', get label() { return i18n.t('perm.reg.manageFixedAssets', { defaultValue: "Manage Fixed Assets" }) }, sortOrder: 104 },
        ],
      },
      {
        key: 'budget',
        get label() { return i18n.t('perm.reg.budgets', { defaultValue: "Budgets" }) },
        permissions: [
          { key: 'finance.budget.view', get label() { return i18n.t('perm.reg.viewBudgets', { defaultValue: "View Budgets" }) }, sortOrder: 105 },
          { key: 'finance.budget.edit', get label() { return i18n.t('perm.reg.manageBudgets', { defaultValue: "Manage Budgets" }) }, sortOrder: 106 },
        ],
      },
      {
        key: 'retention',
        get label() { return i18n.t('perm.reg.retention', { defaultValue: "Retention" }) },
        permissions: [
          { key: 'finance.retention.view', get label() { return i18n.t('perm.reg.viewRetention', { defaultValue: "View Retention" }) }, sortOrder: 107 },
          { key: 'finance.retention.edit', get label() { return i18n.t('perm.reg.manageRetention', { defaultValue: "Manage Retention" }) }, sortOrder: 108 },
        ],
      },
      {
        key: 'revaluation',
        get label() { return i18n.t('perm.reg.fxRevaluation', { defaultValue: "FX Revaluation" }) },
        permissions: [
          { key: 'finance.revaluation.view', get label() { return i18n.t('perm.reg.viewFxRevaluation', { defaultValue: "View FX Revaluation" }) }, sortOrder: 109 },
          { key: 'finance.revaluation.edit', get label() { return i18n.t('perm.reg.runFxRevaluation', { defaultValue: "Run FX Revaluation" }) }, sortOrder: 110 },
        ],
      },
      {
        key: 'terms',
        get label() { return i18n.t('perm.reg.paymentTerms', { defaultValue: "Payment Terms" }) },
        permissions: [
          { key: 'finance.terms.view', get label() { return i18n.t('perm.reg.viewPaymentTerms', { defaultValue: "View Payment Terms" }) }, sortOrder: 111 },
          { key: 'finance.terms.edit', get label() { return i18n.t('perm.reg.managePaymentTerms', { defaultValue: "Manage Payment Terms" }) }, sortOrder: 112 },
        ],
      },
    ],
  },
  {
    key: 'procurement',
    get label() { return i18n.t('perm.reg.procurement', { defaultValue: "Procurement" }) },
    submodules: [
      {
        key: 'po',
        get label() { return i18n.t('perm.reg.purchaseOrders', { defaultValue: "Purchase Orders" }) },
        permissions: [
          { key: 'procurement.po.view', get label() { return i18n.t('perm.reg.viewPurchaseOrders', { defaultValue: "View Purchase Orders" }) }, sortOrder: 200 },
          { key: 'procurement.po.edit', get label() { return i18n.t('perm.reg.editPurchaseOrders', { defaultValue: "Edit Purchase Orders" }) }, sortOrder: 201 },
          { key: 'procurement.po.approve', get label() { return i18n.t('perm.reg.approvePurchaseOrders', { defaultValue: "Approve Purchase Orders" }) }, sortOrder: 202 },
          {
            key: 'procurement.po.reverse_receipt',
            get label() { return i18n.t('perm.reg.reverseConfirmedReceipts', { defaultValue: "Reverse Confirmed Receipts" }) },
            sortOrder: 203,
          },
        ],
      },
      {
        key: 'vendors',
        get label() { return i18n.t('perm.reg.vendors', { defaultValue: "Vendors" }) },
        permissions: [
          { key: 'procurement.vendors.view', get label() { return i18n.t('perm.reg.viewVendors', { defaultValue: "View Vendors" }) }, sortOrder: 210 },
          { key: 'procurement.vendors.edit', get label() { return i18n.t('perm.reg.manageVendors', { defaultValue: "Manage Vendors" }) }, sortOrder: 211 },
        ],
      },
      {
        key: 'positions',
        get label() { return i18n.t('perm.reg.poPositions', { defaultValue: "PO Positions" }) },
        permissions: [
          { key: 'procurement.positions.view', get label() { return i18n.t('perm.reg.viewPoPositions', { defaultValue: "View PO Positions" }) }, sortOrder: 220 },
          { key: 'procurement.positions.admin', get label() { return i18n.t('perm.reg.managePoPositions', { defaultValue: "Manage PO Positions" }) }, sortOrder: 221 },
        ],
      },
    ],
  },
  {
    key: 'projects',
    get label() { return i18n.t('perm.reg.projects', { defaultValue: "Projects" }) },
    submodules: [
      {
        key: 'core',
        get label() { return i18n.t('perm.reg.projects', { defaultValue: "Projects" }) },
        permissions: [
          { key: 'projects.view', get label() { return i18n.t('perm.reg.viewProjects', { defaultValue: "View Projects" }) }, sortOrder: 300 },
          { key: 'projects.edit', get label() { return i18n.t('perm.reg.editProjects', { defaultValue: "Edit Projects" }) }, sortOrder: 301 },
          { key: 'projects.approve', get label() { return i18n.t('perm.reg.approveProjects', { defaultValue: "Approve Projects" }) }, sortOrder: 302 },
          { key: 'projects.cancel', get label() { return i18n.t('perm.reg.cancelProjects', { defaultValue: "Cancel Projects" }) }, sortOrder: 303 },
        ],
      },
      {
        key: 'overview',
        get label() { return i18n.t('perm.reg.projectOverview', { defaultValue: "Project Overview" }) },
        permissions: [
          { key: 'projects.overview.view', get label() { return i18n.t('perm.reg.viewProjectOverview', { defaultValue: "View Project Overview" }) }, sortOrder: 305 },
          { key: 'projects.overview.edit', get label() { return i18n.t('perm.reg.editProjectOverview', { defaultValue: "Edit Project Overview" }) }, sortOrder: 306 },
        ],
      },
      {
        key: 'stages',
        get label() { return i18n.t('perm.reg.projectStages', { defaultValue: "Project Stages" }) },
        permissions: [
          { key: 'projects.stages.view', get label() { return i18n.t('perm.reg.viewProjectStages', { defaultValue: "View Project Stages" }) }, sortOrder: 310 },
          { key: 'projects.stages.edit', get label() { return i18n.t('perm.reg.manageProjectStages', { defaultValue: "Manage Project Stages" }) }, sortOrder: 311 },
        ],
      },
      {
        key: 'invoices',
        get label() { return i18n.t('perm.reg.projectInvoices', { defaultValue: "Project Invoices" }) },
        permissions: [
          { key: 'projects.invoices.view', get label() { return i18n.t('perm.reg.viewProjectInvoices', { defaultValue: "View Project Invoices" }) }, sortOrder: 320 },
          { key: 'projects.invoices.edit', get label() { return i18n.t('perm.reg.manageProjectInvoices', { defaultValue: "Manage Project Invoices" }) }, sortOrder: 321 },
        ],
      },
      {
        key: 'client_documents',
        get label() { return i18n.t('perm.reg.clientDocuments', { defaultValue: "Client Documents" }) },
        permissions: [
          { key: 'projects.client_documents.view', get label() { return i18n.t('perm.reg.viewClientDocuments', { defaultValue: "View Client Documents" }) }, sortOrder: 330 },
          {
            key: 'projects.client_documents.edit',
            get label() { return i18n.t('perm.reg.manageClientDocuments', { defaultValue: "Manage Client Documents" }) },
            sortOrder: 331,
          },
        ],
      },
      {
        key: 'engineering',
        get label() { return i18n.t('perm.reg.engineeringDocuments', { defaultValue: "Engineering Documents" }) },
        permissions: [
          { key: 'projects.engineering.view', get label() { return i18n.t('perm.reg.viewEngineeringDocuments', { defaultValue: "View Engineering Documents" }) }, sortOrder: 335 },
          { key: 'projects.engineering.edit', get label() { return i18n.t('perm.reg.editEngineeringDocuments', { defaultValue: "Edit Engineering Documents" }) }, sortOrder: 336 },
          {
            key: 'projects.engineering.approve',
            get label() { return i18n.t('perm.reg.approveIssueEngineeringDocs', { defaultValue: "Approve/Issue Engineering Docs" }) },
            sortOrder: 337,
          },
        ],
      },
      {
        key: 'planning',
        get label() { return i18n.t('perm.reg.planningSchedule', { defaultValue: "Planning & Schedule" }) },
        permissions: [
          { key: 'projects.planning.view', get label() { return i18n.t('perm.reg.viewPlanningSchedule', { defaultValue: "View Planning & Schedule" }) }, sortOrder: 340 },
          { key: 'projects.planning.edit', get label() { return i18n.t('perm.reg.managePlanningSchedule', { defaultValue: "Manage Planning & Schedule" }) }, sortOrder: 341 },
        ],
      },
      {
        key: 'bidding',
        get label() { return i18n.t('perm.reg.bidding', { defaultValue: "Bidding" }) },
        permissions: [
          { key: 'projects.bidding.view', get label() { return i18n.t('perm.reg.viewBidding', { defaultValue: "View Bidding" }) }, sortOrder: 345 },
          { key: 'projects.bidding.edit', get label() { return i18n.t('perm.reg.editBidding', { defaultValue: "Edit Bidding" }) }, sortOrder: 346 },
          { key: 'projects.bidding.approve', get label() { return i18n.t('perm.reg.approveBids', { defaultValue: "Approve Bids" }) }, sortOrder: 347 },
        ],
      },
      {
        key: 'contracts',
        get label() { return i18n.t('perm.reg.contractManagement', { defaultValue: "Contract Management" }) },
        permissions: [
          { key: 'projects.contracts.view', get label() { return i18n.t('perm.reg.viewContracts', { defaultValue: "View Contracts" }) }, sortOrder: 350 },
          { key: 'projects.contracts.edit', get label() { return i18n.t('perm.reg.manageContracts', { defaultValue: "Manage Contracts" }) }, sortOrder: 351 },
          { key: 'projects.contracts.approve', get label() { return i18n.t('perm.reg.approveContracts', { defaultValue: "Approve Contracts" }) }, sortOrder: 352 },
        ],
      },
      {
        key: 'execution',
        get label() { return i18n.t('perm.reg.execution', { defaultValue: "Execution" }) },
        permissions: [
          { key: 'projects.execution.view', get label() { return i18n.t('perm.reg.viewExecution', { defaultValue: "View Execution" }) }, sortOrder: 355 },
          { key: 'projects.execution.edit', get label() { return i18n.t('perm.reg.editExecution', { defaultValue: "Edit Execution" }) }, sortOrder: 356 },
          { key: 'projects.execution.approve', get label() { return i18n.t('perm.reg.approveExecution', { defaultValue: "Approve Execution" }) }, sortOrder: 357 },
        ],
      },
      {
        key: 'procurement',
        get label() { return i18n.t('perm.reg.projectProcurement', { defaultValue: "Project Procurement" }) },
        permissions: [
          { key: 'projects.procurement.view', get label() { return i18n.t('perm.reg.viewProjectProcurement', { defaultValue: "View Project Procurement" }) }, sortOrder: 360 },
          { key: 'projects.procurement.edit', get label() { return i18n.t('perm.reg.manageProjectProcurement', { defaultValue: "Manage Project Procurement" }) }, sortOrder: 361 },
        ],
      },
      {
        key: 'cost_control',
        get label() { return i18n.t('perm.reg.costControl', { defaultValue: "Cost Control" }) },
        permissions: [
          { key: 'projects.cost_control.view', get label() { return i18n.t('perm.reg.viewCostControl', { defaultValue: "View Cost Control" }) }, sortOrder: 365 },
          { key: 'projects.cost_control.edit', get label() { return i18n.t('perm.reg.editCostControl', { defaultValue: "Edit Cost Control" }) }, sortOrder: 366 },
          { key: 'projects.cost_control.approve', get label() { return i18n.t('perm.reg.approveCostControl', { defaultValue: "Approve Cost Control" }) }, sortOrder: 367 },
        ],
      },
      {
        key: 'variations',
        get label() { return i18n.t('perm.reg.variationOrders', { defaultValue: "Variation Orders" }) },
        permissions: [
          { key: 'projects.variations.view', get label() { return i18n.t('perm.reg.viewVariationOrders', { defaultValue: "View Variation Orders" }) }, sortOrder: 370 },
          { key: 'projects.variations.edit', get label() { return i18n.t('perm.reg.editVariationOrders', { defaultValue: "Edit Variation Orders" }) }, sortOrder: 371 },
          { key: 'projects.variations.approve', get label() { return i18n.t('perm.reg.approveVariationOrders', { defaultValue: "Approve Variation Orders" }) }, sortOrder: 372 },
        ],
      },
      {
        key: 'risk',
        get label() { return i18n.t('perm.reg.riskRegister', { defaultValue: "Risk Register" }) },
        permissions: [
          { key: 'projects.risk.view', get label() { return i18n.t('perm.reg.viewRiskRegister', { defaultValue: "View Risk Register" }) }, sortOrder: 375 },
          { key: 'projects.risk.edit', get label() { return i18n.t('perm.reg.manageRiskRegister', { defaultValue: "Manage Risk Register" }) }, sortOrder: 376 },
        ],
      },
      {
        key: 'handover',
        get label() { return i18n.t('perm.reg.handover', { defaultValue: "Handover" }) },
        permissions: [
          { key: 'projects.handover.view', get label() { return i18n.t('perm.reg.viewHandover', { defaultValue: "View Handover" }) }, sortOrder: 380 },
          { key: 'projects.handover.edit', get label() { return i18n.t('perm.reg.editHandover', { defaultValue: "Edit Handover" }) }, sortOrder: 381 },
          { key: 'projects.handover.approve', get label() { return i18n.t('perm.reg.acceptHandover', { defaultValue: "Accept Handover" }) }, sortOrder: 382 },
        ],
      },
      {
        key: 'meetings',
        get label() { return i18n.t('perm.reg.meetingsMom', { defaultValue: "Meetings (MOM)" }) },
        permissions: [
          { key: 'projects.meetings.view', get label() { return i18n.t('perm.reg.viewMeetings', { defaultValue: "View Meetings" }) }, sortOrder: 385 },
          { key: 'projects.meetings.edit', get label() { return i18n.t('perm.reg.manageMeetings', { defaultValue: "Manage Meetings" }) }, sortOrder: 386 },
        ],
      },
      {
        key: 'qaqc',
        get label() { return i18n.t('perm.reg.siteQaQc', { defaultValue: "Site QA/QC" }) },
        permissions: [
          { key: 'projects.qaqc.view', get label() { return i18n.t('perm.reg.viewSiteQaQcRecords', { defaultValue: "View Site QA/QC Records" }) }, sortOrder: 390 },
          { key: 'projects.qaqc.edit', get label() { return i18n.t('perm.reg.manageSiteQaQcRecords', { defaultValue: "Manage Site QA/QC Records" }) }, sortOrder: 391 },
          { key: 'projects.qaqc.approve', get label() { return i18n.t('perm.reg.approveSiteQaQcRecords', { defaultValue: "Approve Site QA/QC Records" }) }, sortOrder: 392 },
        ],
      },
      {
        key: 'team',
        get label() { return i18n.t('perm.reg.projectTeam', { defaultValue: "Project Team" }) },
        permissions: [
          { key: 'projects.team.view', get label() { return i18n.t('perm.reg.viewProjectTeam', { defaultValue: "View Project Team" }) }, sortOrder: 395 },
          { key: 'projects.team.edit', get label() { return i18n.t('perm.reg.manageProjectTeam', { defaultValue: "Manage Project Team" }) }, sortOrder: 396 },
        ],
      },
      {
        key: 'attachments',
        get label() { return i18n.t('perm.reg.attachments', { defaultValue: "Attachments" }) },
        permissions: [
          { key: 'projects.attachments.view', get label() { return i18n.t('perm.reg.viewAttachments', { defaultValue: "View Attachments" }) }, sortOrder: 397 },
          { key: 'projects.attachments.edit', get label() { return i18n.t('perm.reg.manageAttachments', { defaultValue: "Manage Attachments" }) }, sortOrder: 398 },
        ],
      },
    ],
  },
  {
    key: 'inventory',
    get label() { return i18n.t('perm.reg.inventory', { defaultValue: "Inventory" }) },
    submodules: [
      {
        key: 'products',
        get label() { return i18n.t('perm.reg.products', { defaultValue: "Products" }) },
        permissions: [
          { key: 'inventory.products.view', get label() { return i18n.t('perm.reg.viewProducts', { defaultValue: "View Products" }) }, sortOrder: 400 },
          { key: 'inventory.products.edit', get label() { return i18n.t('perm.reg.manageProducts', { defaultValue: "Manage Products" }) }, sortOrder: 401 },
          { key: 'inventory.products.approve_cost_change', get label() { return i18n.t('perm.reg.approveCostChanges', { defaultValue: "Approve Cost Changes" }) }, sortOrder: 402 },
        ],
      },
      {
        key: 'stock_moves',
        get label() { return i18n.t('perm.reg.stockMoves', { defaultValue: "Stock Moves" }) },
        permissions: [
          { key: 'inventory.stock_moves.view', get label() { return i18n.t('perm.reg.viewStockMoves', { defaultValue: "View Stock Moves" }) }, sortOrder: 410 },
          { key: 'inventory.stock_moves.edit', get label() { return i18n.t('perm.reg.recordStockMoves', { defaultValue: "Record Stock Moves" }) }, sortOrder: 411 },
        ],
      },
      {
        key: 'locations',
        get label() { return i18n.t('perm.reg.locations', { defaultValue: "Locations" }) },
        permissions: [
          { key: 'inventory.locations.view', get label() { return i18n.t('perm.reg.viewLocations', { defaultValue: "View Locations" }) }, sortOrder: 420 },
          { key: 'inventory.locations.admin', get label() { return i18n.t('perm.reg.manageLocations', { defaultValue: "Manage Locations" }) }, sortOrder: 421 },
        ],
      },
      {
        key: 'lots',
        get label() { return i18n.t('perm.reg.lotsSerials', { defaultValue: "Lots & Serials" }) },
        permissions: [
          { key: 'inventory.lots.view', get label() { return i18n.t('perm.reg.viewLotsSerials', { defaultValue: "View Lots & Serials" }) }, sortOrder: 430 },
          { key: 'inventory.lots.edit', get label() { return i18n.t('perm.reg.manageLotsSerials', { defaultValue: "Manage Lots & Serials" }) }, sortOrder: 431 },
        ],
      },
    ],
  },
  {
    key: 'hr',
    get label() { return i18n.t('perm.reg.humanResources', { defaultValue: "Human Resources" }) },
    submodules: [
      {
        key: 'employees',
        get label() { return i18n.t('perm.reg.employees', { defaultValue: "Employees" }) },
        permissions: [
          { key: 'hr.employees.view', get label() { return i18n.t('perm.reg.viewEmployees', { defaultValue: "View Employees" }) }, sortOrder: 500 },
          { key: 'hr.employees.edit', get label() { return i18n.t('perm.reg.manageEmployees', { defaultValue: "Manage Employees" }) }, sortOrder: 501 },
        ],
      },
      {
        key: 'bank_details',
        get label() { return i18n.t('perm.reg.bankDetails', { defaultValue: "Bank Details" }) },
        permissions: [
          { key: 'hr.bank_details.view', get label() { return i18n.t('perm.reg.viewEmployeeBankDetails', { defaultValue: "View Employee Bank Details" }) }, sortOrder: 510 },
        ],
      },
      {
        key: 'salary',
        get label() { return i18n.t('perm.reg.salary', { defaultValue: "Salary" }) },
        permissions: [
          { key: 'hr.salary.view', get label() { return i18n.t('perm.reg.viewSalary', { defaultValue: "View Salary" }) }, sortOrder: 520 },
          { key: 'hr.salary.edit', get label() { return i18n.t('perm.reg.manageSalary', { defaultValue: "Manage Salary" }) }, sortOrder: 521 },
        ],
      },
      {
        key: 'leave',
        get label() { return i18n.t('perm.reg.leave', { defaultValue: "Leave" }) },
        permissions: [
          { key: 'hr.leave.view', get label() { return i18n.t('perm.reg.viewLeaveRequests', { defaultValue: "View Leave Requests" }) }, sortOrder: 530 },
          { key: 'hr.leave.edit', get label() { return i18n.t('perm.reg.submitLeaveRequests', { defaultValue: "Submit Leave Requests" }) }, sortOrder: 531 },
          { key: 'hr.leave.approve', get label() { return i18n.t('perm.reg.approveLeaveRequests', { defaultValue: "Approve Leave Requests" }) }, sortOrder: 532 },
        ],
      },
      {
        key: 'overtime',
        get label() { return i18n.t('perm.reg.overtime', { defaultValue: "Overtime" }) },
        permissions: [
          { key: 'hr.overtime.view', get label() { return i18n.t('perm.reg.viewOvertime', { defaultValue: "View Overtime" }) }, sortOrder: 540 },
          { key: 'hr.overtime.edit', get label() { return i18n.t('perm.reg.recordOvertime', { defaultValue: "Record Overtime" }) }, sortOrder: 541 },
          { key: 'hr.overtime.approve', get label() { return i18n.t('perm.reg.approveOvertime', { defaultValue: "Approve Overtime" }) }, sortOrder: 542 },
        ],
      },
      {
        key: 'recharge',
        get label() { return i18n.t('perm.reg.phoneRecharge', { defaultValue: "Phone Recharge" }) },
        permissions: [
          { key: 'hr.recharge.view', get label() { return i18n.t('perm.reg.viewRechargeRequests', { defaultValue: "View Recharge Requests" }) }, sortOrder: 545 },
          {
            key: 'hr.recharge.admin',
            get label() { return i18n.t('perm.reg.manageRechargeBundlesCostCenterFulfiller', { defaultValue: "Manage Recharge Bundles, Cost Center & Fulfiller" }) },
            sortOrder: 547,
          },
        ],
      },
      {
        key: 'departments',
        get label() { return i18n.t('perm.reg.departments', { defaultValue: "Departments" }) },
        permissions: [
          { key: 'hr.departments.view', get label() { return i18n.t('perm.reg.viewDepartments', { defaultValue: "View Departments" }) }, sortOrder: 550 },
          { key: 'hr.departments.edit', get label() { return i18n.t('perm.reg.manageDepartments', { defaultValue: "Manage Departments" }) }, sortOrder: 551 },
        ],
      },
    ],
  },
  {
    key: 'payroll',
    get label() { return i18n.t('perm.reg.payroll', { defaultValue: "Payroll" }) },
    submodules: [
      {
        key: 'runs',
        get label() { return i18n.t('perm.reg.payrollRuns', { defaultValue: "Payroll Runs" }) },
        permissions: [
          { key: 'payroll.runs.view', get label() { return i18n.t('perm.reg.viewPayrollRuns', { defaultValue: "View Payroll Runs" }) }, sortOrder: 600 },
          { key: 'payroll.runs.edit', get label() { return i18n.t('perm.reg.processPayrollRuns', { defaultValue: "Process Payroll Runs" }) }, sortOrder: 601 },
          { key: 'payroll.runs.approve', get label() { return i18n.t('perm.reg.approvePayrollRuns', { defaultValue: "Approve Payroll Runs" }) }, sortOrder: 602 },
        ],
      },
      {
        key: 'payslips',
        get label() { return i18n.t('perm.reg.payslips', { defaultValue: "Payslips" }) },
        permissions: [{ key: 'payroll.payslips.view', get label() { return i18n.t('perm.reg.viewPayslips', { defaultValue: "View Payslips" }) }, sortOrder: 610 }],
      },
    ],
  },
  {
    key: 'attendance',
    get label() { return i18n.t('perm.reg.attendance', { defaultValue: "Attendance" }) },
    submodules: [
      {
        key: 'records',
        get label() { return i18n.t('perm.reg.attendanceRecords', { defaultValue: "Attendance Records" }) },
        permissions: [
          { key: 'attendance.view', get label() { return i18n.t('perm.reg.viewAttendance', { defaultValue: "View Attendance" }) }, sortOrder: 700 },
          { key: 'attendance.edit', get label() { return i18n.t('perm.reg.manageAttendance', { defaultValue: "Manage Attendance" }) }, sortOrder: 701 },
        ],
      },
    ],
  },
  {
    key: 'manufacturing',
    get label() { return i18n.t('perm.reg.manufacturing', { defaultValue: "Manufacturing" }) },
    submodules: [
      {
        key: 'boms',
        get label() { return i18n.t('perm.reg.billsOfMaterials', { defaultValue: "Bills of Materials" }) },
        permissions: [
          { key: 'manufacturing.boms.view', get label() { return i18n.t('perm.reg.viewBoms', { defaultValue: "View BOMs" }) }, sortOrder: 800 },
          { key: 'manufacturing.boms.edit', get label() { return i18n.t('perm.reg.manageBoms', { defaultValue: "Manage BOMs" }) }, sortOrder: 801 },
        ],
      },
      {
        key: 'orders',
        get label() { return i18n.t('perm.reg.manufacturingOrders', { defaultValue: "Manufacturing Orders" }) },
        permissions: [
          { key: 'manufacturing.orders.view', get label() { return i18n.t('perm.reg.viewManufacturingOrders', { defaultValue: "View Manufacturing Orders" }) }, sortOrder: 810 },
          { key: 'manufacturing.orders.edit', get label() { return i18n.t('perm.reg.editManufacturingOrders', { defaultValue: "Edit Manufacturing Orders" }) }, sortOrder: 811 },
          {
            key: 'manufacturing.orders.approve',
            get label() { return i18n.t('perm.reg.approveManufacturingOrders', { defaultValue: "Approve Manufacturing Orders" }) },
            sortOrder: 812,
          },
        ],
      },
      {
        key: 'work_centers',
        get label() { return i18n.t('perm.reg.workCenters', { defaultValue: "Work Centers" }) },
        permissions: [
          { key: 'manufacturing.work_centers.view', get label() { return i18n.t('perm.reg.viewWorkCenters', { defaultValue: "View Work Centers" }) }, sortOrder: 820 },
          { key: 'manufacturing.work_centers.edit', get label() { return i18n.t('perm.reg.manageWorkCenters', { defaultValue: "Manage Work Centers" }) }, sortOrder: 821 },
        ],
      },
    ],
  },
  {
    key: 'rental',
    get label() { return i18n.t('perm.reg.rental', { defaultValue: "Rental" }) },
    submodules: [
      {
        key: 'assets',
        get label() { return i18n.t('perm.reg.equipmentAssets', { defaultValue: "Equipment Assets" }) },
        permissions: [
          { key: 'rental.assets.view', get label() { return i18n.t('perm.reg.viewEquipment', { defaultValue: "View Equipment" }) }, sortOrder: 900 },
          { key: 'rental.assets.edit', get label() { return i18n.t('perm.reg.manageEquipment', { defaultValue: "Manage Equipment" }) }, sortOrder: 901 },
        ],
      },
      {
        key: 'contracts',
        get label() { return i18n.t('perm.reg.rentalContracts', { defaultValue: "Rental Contracts" }) },
        permissions: [
          { key: 'rental.contracts.view', get label() { return i18n.t('perm.reg.viewContracts', { defaultValue: "View Contracts" }) }, sortOrder: 910 },
          { key: 'rental.contracts.edit', get label() { return i18n.t('perm.reg.editContracts', { defaultValue: "Edit Contracts" }) }, sortOrder: 911 },
          { key: 'rental.contracts.admin', get label() { return i18n.t('perm.reg.terminateContracts', { defaultValue: "Terminate Contracts" }) }, sortOrder: 912 },
        ],
      },
      {
        key: 'maintenance',
        get label() { return i18n.t('perm.reg.maintenance', { defaultValue: "Maintenance" }) },
        permissions: [
          { key: 'rental.maintenance.view', get label() { return i18n.t('perm.reg.viewMaintenance', { defaultValue: "View Maintenance" }) }, sortOrder: 920 },
          { key: 'rental.maintenance.edit', get label() { return i18n.t('perm.reg.manageMaintenance', { defaultValue: "Manage Maintenance" }) }, sortOrder: 921 },
        ],
      },
    ],
  },
  {
    key: 'reporting',
    get label() { return i18n.t('perm.reg.reporting', { defaultValue: "Reporting" }) },
    submodules: [
      {
        key: 'executive',
        get label() { return i18n.t('perm.reg.executive', { defaultValue: "Executive" }) },
        permissions: [
          { key: 'reporting.executive.view', get label() { return i18n.t('perm.reg.viewExecutiveReports', { defaultValue: "View Executive Reports" }) }, sortOrder: 1000 },
        ],
      },
      {
        key: 'financial',
        get label() { return i18n.t('perm.reg.financial', { defaultValue: "Financial" }) },
        permissions: [
          { key: 'reporting.financial.view', get label() { return i18n.t('perm.reg.viewFinancialReports', { defaultValue: "View Financial Reports" }) }, sortOrder: 1010 },
        ],
      },
      {
        key: 'operational',
        get label() { return i18n.t('perm.reg.operational', { defaultValue: "Operational" }) },
        permissions: [
          { key: 'reporting.operational.view', get label() { return i18n.t('perm.reg.viewOperationalReports', { defaultValue: "View Operational Reports" }) }, sortOrder: 1020 },
        ],
      },
      {
        key: 'consolidated',
        get label() { return i18n.t('perm.reg.consolidated', { defaultValue: "Consolidated" }) },
        permissions: [
          {
            key: 'reporting.consolidated.view',
            get label() { return i18n.t('perm.reg.viewConsolidatedReports', { defaultValue: "View Consolidated Reports" }) },
            sortOrder: 1030,
          },
        ],
      },
      {
        key: 'compliance',
        get label() { return i18n.t('perm.reg.compliance', { defaultValue: "Compliance" }) },
        permissions: [
          { key: 'reporting.compliance.view', get label() { return i18n.t('perm.reg.viewComplianceReports', { defaultValue: "View Compliance Reports" }) }, sortOrder: 1040 },
        ],
      },
    ],
  },
  {
    key: 'interco',
    get label() { return i18n.t('perm.reg.intercompany', { defaultValue: "Intercompany" }) },
    submodules: [
      {
        key: 'transactions',
        get label() { return i18n.t('perm.reg.transactions', { defaultValue: "Transactions" }) },
        permissions: [
          { key: 'interco.transactions.view', get label() { return i18n.t('perm.reg.viewIntercoTransactions', { defaultValue: "View Interco Transactions" }) }, sortOrder: 1100 },
          {
            key: 'interco.transactions.edit',
            get label() { return i18n.t('perm.reg.createIntercoTransactions', { defaultValue: "Create Interco Transactions" }) },
            sortOrder: 1101,
          },
          {
            key: 'interco.transactions.approve',
            get label() { return i18n.t('perm.reg.approveIntercoTransactions', { defaultValue: "Approve Interco Transactions" }) },
            sortOrder: 1102,
          },
        ],
      },
      {
        key: 'stock_transfers',
        get label() { return i18n.t('perm.reg.stockTransfers', { defaultValue: "Stock Transfers" }) },
        permissions: [
          {
            key: 'interco.stock_transfers.view',
            get label() { return i18n.t('perm.reg.viewIntercoStockTransfers', { defaultValue: "View Interco Stock Transfers" }) },
            sortOrder: 1110,
          },
          {
            key: 'interco.stock_transfers.edit',
            get label() { return i18n.t('perm.reg.createIntercoStockTransfers', { defaultValue: "Create Interco Stock Transfers" }) },
            sortOrder: 1111,
          },
        ],
      },
    ],
  },
  {
    key: 'admin',
    get label() { return i18n.t('perm.reg.administration', { defaultValue: "Administration" }) },
    submodules: [
      {
        key: 'users',
        get label() { return i18n.t('perm.reg.userManagement', { defaultValue: "User Management" }) },
        permissions: [
          { key: 'admin.users.view', get label() { return i18n.t('perm.reg.viewUsers', { defaultValue: "View Users" }) }, sortOrder: 1200 },
          { key: 'admin.users.edit', get label() { return i18n.t('perm.reg.manageUsers', { defaultValue: "Manage Users" }) }, sortOrder: 1201 },
        ],
      },
      {
        key: 'roles',
        get label() { return i18n.t('perm.reg.rolesPermissions', { defaultValue: "Roles & Permissions" }) },
        permissions: [
          { key: 'admin.roles.view', get label() { return i18n.t('perm.reg.viewRolesTemplates', { defaultValue: "View Roles & Templates" }) }, sortOrder: 1210 },
          { key: 'admin.roles.admin', get label() { return i18n.t('perm.reg.manageRolesTemplates', { defaultValue: "Manage Roles & Templates" }) }, sortOrder: 1211 },
        ],
      },
      {
        key: 'companies',
        get label() { return i18n.t('perm.reg.companies', { defaultValue: "Companies" }) },
        permissions: [
          { key: 'admin.companies.view', get label() { return i18n.t('perm.reg.viewCompanies', { defaultValue: "View Companies" }) }, sortOrder: 1220 },
          { key: 'admin.companies.admin', get label() { return i18n.t('perm.reg.manageCompanies', { defaultValue: "Manage Companies" }) }, sortOrder: 1221 },
        ],
      },
      {
        key: 'system',
        get label() { return i18n.t('perm.reg.system', { defaultValue: "System" }) },
        permissions: [
          { key: 'admin.system.view', get label() { return i18n.t('perm.reg.viewSystemHealth', { defaultValue: "View System Health" }) }, sortOrder: 1230 },
          { key: 'admin.system.admin', get label() { return i18n.t('perm.reg.manageSystemConfig', { defaultValue: "Manage System Config" }) }, sortOrder: 1231 },
        ],
      },
    ],
  },
]

export const ALL_PERMISSIONS: PermissionDef[] = PERMISSION_REGISTRY.flatMap((mod) =>
  mod.submodules.flatMap((sub) => sub.permissions),
)
