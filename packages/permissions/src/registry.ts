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

// ── CANONICAL PERMISSION REGISTRY ────────────────────────────────────────────
// Format: <module>.<submodule?>.<action>
// Levels: view < edit < approve < admin
// system_admin and company_admin bypass all checks.
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSION_REGISTRY: ModuleDef[] = [
  {
    key: 'finance',
    label: 'Finance',
    submodules: [
      {
        key: 'accounts',
        label: 'Chart of Accounts',
        permissions: [
          { key: 'finance.accounts.view', label: 'View Accounts', sortOrder: 10 },
          { key: 'finance.accounts.edit', label: 'Edit Accounts', sortOrder: 11 },
          { key: 'finance.accounts.admin', label: 'Administer Accounts', sortOrder: 12 },
        ],
      },
      {
        key: 'journals',
        label: 'Journal Entries',
        permissions: [
          { key: 'finance.journals.view', label: 'View Journals', sortOrder: 20 },
          { key: 'finance.journals.edit', label: 'Edit Journals', sortOrder: 21 },
          { key: 'finance.journals.approve', label: 'Post/Cancel Journals', sortOrder: 22 },
        ],
      },
      {
        key: 'fx_rates',
        label: 'FX Rates',
        permissions: [
          { key: 'finance.fx_rates.view', label: 'View FX Rates', sortOrder: 30 },
          { key: 'finance.fx_rates.edit', label: 'Manage FX Rates', sortOrder: 31 },
        ],
      },
      {
        key: 'periods',
        label: 'Accounting Periods',
        permissions: [
          { key: 'finance.periods.view', label: 'View Periods', sortOrder: 40 },
          { key: 'finance.periods.admin', label: 'Open/Close Periods', sortOrder: 41 },
        ],
      },
      {
        key: 'ar',
        label: 'Accounts Receivable',
        permissions: [
          { key: 'finance.ar.view', label: 'View AR', sortOrder: 50 },
          { key: 'finance.ar.edit', label: 'Manage AR', sortOrder: 51 },
        ],
      },
      {
        key: 'ap',
        label: 'Accounts Payable',
        permissions: [
          { key: 'finance.ap.view', label: 'View AP', sortOrder: 60 },
          { key: 'finance.ap.edit', label: 'Edit Vendor Invoices', sortOrder: 61 },
          { key: 'finance.ap.approve', label: 'Approve Vendor Invoices', sortOrder: 62 },
        ],
      },
      {
        key: 'cost_centers',
        label: 'Cost Centers',
        permissions: [
          { key: 'finance.cost_centers.view', label: 'View Cost Centers', sortOrder: 70 },
          { key: 'finance.cost_centers.edit', label: 'Manage Cost Centers', sortOrder: 71 },
        ],
      },
      {
        key: 'analytic_accounts',
        label: 'Analytic Accounts',
        permissions: [
          { key: 'finance.analytic_accounts.view', label: 'View Analytic Accounts', sortOrder: 80 },
          {
            key: 'finance.analytic_accounts.edit',
            label: 'Manage Analytic Accounts',
            sortOrder: 81,
          },
        ],
      },
      {
        key: 'reports',
        label: 'Financial Reports',
        permissions: [
          { key: 'finance.reports.view', label: 'View Financial Reports', sortOrder: 90 },
          {
            key: 'finance.reports.consolidated.view',
            label: 'View Consolidated Reports',
            sortOrder: 91,
          },
        ],
      },
    ],
  },
  {
    key: 'procurement',
    label: 'Procurement',
    submodules: [
      {
        key: 'po',
        label: 'Purchase Orders',
        permissions: [
          { key: 'procurement.po.view', label: 'View Purchase Orders', sortOrder: 200 },
          { key: 'procurement.po.edit', label: 'Edit Purchase Orders', sortOrder: 201 },
          { key: 'procurement.po.approve', label: 'Approve Purchase Orders', sortOrder: 202 },
        ],
      },
      {
        key: 'vendors',
        label: 'Vendors',
        permissions: [
          { key: 'procurement.vendors.view', label: 'View Vendors', sortOrder: 210 },
          { key: 'procurement.vendors.edit', label: 'Manage Vendors', sortOrder: 211 },
        ],
      },
      {
        key: 'positions',
        label: 'PO Positions',
        permissions: [
          { key: 'procurement.positions.view', label: 'View PO Positions', sortOrder: 220 },
          { key: 'procurement.positions.admin', label: 'Manage PO Positions', sortOrder: 221 },
        ],
      },
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    submodules: [
      {
        key: 'core',
        label: 'Projects',
        permissions: [
          { key: 'projects.view', label: 'View Projects', sortOrder: 300 },
          { key: 'projects.edit', label: 'Edit Projects', sortOrder: 301 },
          { key: 'projects.approve', label: 'Approve Projects', sortOrder: 302 },
          { key: 'projects.cancel', label: 'Cancel Projects', sortOrder: 303 },
        ],
      },
      {
        key: 'stages',
        label: 'Project Stages',
        permissions: [
          { key: 'projects.stages.view', label: 'View Project Stages', sortOrder: 310 },
          { key: 'projects.stages.edit', label: 'Manage Project Stages', sortOrder: 311 },
        ],
      },
      {
        key: 'invoices',
        label: 'Project Invoices',
        permissions: [
          { key: 'projects.invoices.view', label: 'View Project Invoices', sortOrder: 320 },
          { key: 'projects.invoices.edit', label: 'Manage Project Invoices', sortOrder: 321 },
        ],
      },
      {
        key: 'client_documents',
        label: 'Client Documents',
        permissions: [
          { key: 'projects.client_documents.view', label: 'View Client Documents', sortOrder: 330 },
          {
            key: 'projects.client_documents.edit',
            label: 'Manage Client Documents',
            sortOrder: 331,
          },
        ],
      },
      {
        key: 'engineering',
        label: 'Engineering Documents',
        permissions: [
          { key: 'projects.engineering.view', label: 'View Engineering Documents', sortOrder: 335 },
          { key: 'projects.engineering.edit', label: 'Edit Engineering Documents', sortOrder: 336 },
          {
            key: 'projects.engineering.approve',
            label: 'Approve/Issue Engineering Docs',
            sortOrder: 337,
          },
        ],
      },
      {
        key: 'planning',
        label: 'Planning & Schedule',
        permissions: [
          { key: 'projects.planning.view', label: 'View Planning & Schedule', sortOrder: 340 },
          { key: 'projects.planning.edit', label: 'Manage Planning & Schedule', sortOrder: 341 },
        ],
      },
      {
        key: 'bidding',
        label: 'Bidding',
        permissions: [
          { key: 'projects.bidding.view', label: 'View Bidding', sortOrder: 345 },
          { key: 'projects.bidding.edit', label: 'Edit Bidding', sortOrder: 346 },
          { key: 'projects.bidding.approve', label: 'Approve Bids', sortOrder: 347 },
        ],
      },
      {
        key: 'contracts',
        label: 'Contract Management',
        permissions: [
          { key: 'projects.contracts.view', label: 'View Contracts', sortOrder: 350 },
          { key: 'projects.contracts.edit', label: 'Manage Contracts', sortOrder: 351 },
          { key: 'projects.contracts.approve', label: 'Approve Contracts', sortOrder: 352 },
        ],
      },
      {
        key: 'execution',
        label: 'Execution',
        permissions: [
          { key: 'projects.execution.view', label: 'View Execution', sortOrder: 355 },
          { key: 'projects.execution.edit', label: 'Edit Execution', sortOrder: 356 },
          { key: 'projects.execution.approve', label: 'Approve Execution', sortOrder: 357 },
        ],
      },
      {
        key: 'procurement',
        label: 'Project Procurement',
        permissions: [
          { key: 'projects.procurement.view', label: 'View Project Procurement', sortOrder: 360 },
          { key: 'projects.procurement.edit', label: 'Manage Project Procurement', sortOrder: 361 },
        ],
      },
      {
        key: 'cost_control',
        label: 'Cost Control',
        permissions: [
          { key: 'projects.cost_control.view', label: 'View Cost Control', sortOrder: 365 },
          { key: 'projects.cost_control.edit', label: 'Edit Cost Control', sortOrder: 366 },
          { key: 'projects.cost_control.approve', label: 'Approve Cost Control', sortOrder: 367 },
        ],
      },
      {
        key: 'variations',
        label: 'Variation Orders',
        permissions: [
          { key: 'projects.variations.view', label: 'View Variation Orders', sortOrder: 370 },
          { key: 'projects.variations.edit', label: 'Edit Variation Orders', sortOrder: 371 },
          { key: 'projects.variations.approve', label: 'Approve Variation Orders', sortOrder: 372 },
        ],
      },
      {
        key: 'risk',
        label: 'Risk Register',
        permissions: [
          { key: 'projects.risk.view', label: 'View Risk Register', sortOrder: 375 },
          { key: 'projects.risk.edit', label: 'Manage Risk Register', sortOrder: 376 },
        ],
      },
      {
        key: 'handover',
        label: 'Handover',
        permissions: [
          { key: 'projects.handover.view', label: 'View Handover', sortOrder: 380 },
          { key: 'projects.handover.edit', label: 'Edit Handover', sortOrder: 381 },
          { key: 'projects.handover.approve', label: 'Accept Handover', sortOrder: 382 },
        ],
      },
      {
        key: 'meetings',
        label: 'Meetings (MOM)',
        permissions: [
          { key: 'projects.meetings.view', label: 'View Meetings', sortOrder: 385 },
          { key: 'projects.meetings.edit', label: 'Manage Meetings', sortOrder: 386 },
        ],
      },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    submodules: [
      {
        key: 'products',
        label: 'Products',
        permissions: [
          { key: 'inventory.products.view', label: 'View Products', sortOrder: 400 },
          { key: 'inventory.products.edit', label: 'Manage Products', sortOrder: 401 },
        ],
      },
      {
        key: 'stock_moves',
        label: 'Stock Moves',
        permissions: [
          { key: 'inventory.stock_moves.view', label: 'View Stock Moves', sortOrder: 410 },
          { key: 'inventory.stock_moves.edit', label: 'Record Stock Moves', sortOrder: 411 },
        ],
      },
      {
        key: 'locations',
        label: 'Locations',
        permissions: [
          { key: 'inventory.locations.view', label: 'View Locations', sortOrder: 420 },
          { key: 'inventory.locations.admin', label: 'Manage Locations', sortOrder: 421 },
        ],
      },
      {
        key: 'lots',
        label: 'Lots & Serials',
        permissions: [
          { key: 'inventory.lots.view', label: 'View Lots & Serials', sortOrder: 430 },
          { key: 'inventory.lots.edit', label: 'Manage Lots & Serials', sortOrder: 431 },
        ],
      },
    ],
  },
  {
    key: 'hr',
    label: 'Human Resources',
    submodules: [
      {
        key: 'employees',
        label: 'Employees',
        permissions: [
          { key: 'hr.employees.view', label: 'View Employees', sortOrder: 500 },
          { key: 'hr.employees.edit', label: 'Manage Employees', sortOrder: 501 },
        ],
      },
      {
        key: 'bank_details',
        label: 'Bank Details',
        permissions: [
          { key: 'hr.bank_details.view', label: 'View Employee Bank Details', sortOrder: 510 },
        ],
      },
      {
        key: 'salary',
        label: 'Salary',
        permissions: [
          { key: 'hr.salary.view', label: 'View Salary', sortOrder: 520 },
          { key: 'hr.salary.edit', label: 'Manage Salary', sortOrder: 521 },
        ],
      },
      {
        key: 'leave',
        label: 'Leave',
        permissions: [
          { key: 'hr.leave.view', label: 'View Leave Requests', sortOrder: 530 },
          { key: 'hr.leave.edit', label: 'Submit Leave Requests', sortOrder: 531 },
          { key: 'hr.leave.approve', label: 'Approve Leave Requests', sortOrder: 532 },
        ],
      },
      {
        key: 'overtime',
        label: 'Overtime',
        permissions: [
          { key: 'hr.overtime.view', label: 'View Overtime', sortOrder: 540 },
          { key: 'hr.overtime.edit', label: 'Record Overtime', sortOrder: 541 },
          { key: 'hr.overtime.approve', label: 'Approve Overtime', sortOrder: 542 },
        ],
      },
      {
        key: 'departments',
        label: 'Departments',
        permissions: [
          { key: 'hr.departments.view', label: 'View Departments', sortOrder: 550 },
          { key: 'hr.departments.edit', label: 'Manage Departments', sortOrder: 551 },
        ],
      },
    ],
  },
  {
    key: 'payroll',
    label: 'Payroll',
    submodules: [
      {
        key: 'runs',
        label: 'Payroll Runs',
        permissions: [
          { key: 'payroll.runs.view', label: 'View Payroll Runs', sortOrder: 600 },
          { key: 'payroll.runs.edit', label: 'Process Payroll Runs', sortOrder: 601 },
          { key: 'payroll.runs.approve', label: 'Approve Payroll Runs', sortOrder: 602 },
        ],
      },
      {
        key: 'payslips',
        label: 'Payslips',
        permissions: [{ key: 'payroll.payslips.view', label: 'View Payslips', sortOrder: 610 }],
      },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    submodules: [
      {
        key: 'records',
        label: 'Attendance Records',
        permissions: [
          { key: 'attendance.view', label: 'View Attendance', sortOrder: 700 },
          { key: 'attendance.edit', label: 'Manage Attendance', sortOrder: 701 },
        ],
      },
    ],
  },
  {
    key: 'manufacturing',
    label: 'Manufacturing',
    submodules: [
      {
        key: 'boms',
        label: 'Bills of Materials',
        permissions: [
          { key: 'manufacturing.boms.view', label: 'View BOMs', sortOrder: 800 },
          { key: 'manufacturing.boms.edit', label: 'Manage BOMs', sortOrder: 801 },
        ],
      },
      {
        key: 'orders',
        label: 'Manufacturing Orders',
        permissions: [
          { key: 'manufacturing.orders.view', label: 'View Manufacturing Orders', sortOrder: 810 },
          { key: 'manufacturing.orders.edit', label: 'Edit Manufacturing Orders', sortOrder: 811 },
          {
            key: 'manufacturing.orders.approve',
            label: 'Approve Manufacturing Orders',
            sortOrder: 812,
          },
        ],
      },
      {
        key: 'work_centers',
        label: 'Work Centers',
        permissions: [
          { key: 'manufacturing.work_centers.view', label: 'View Work Centers', sortOrder: 820 },
          { key: 'manufacturing.work_centers.edit', label: 'Manage Work Centers', sortOrder: 821 },
        ],
      },
    ],
  },
  {
    key: 'rental',
    label: 'Rental',
    submodules: [
      {
        key: 'assets',
        label: 'Equipment Assets',
        permissions: [
          { key: 'rental.assets.view', label: 'View Equipment', sortOrder: 900 },
          { key: 'rental.assets.edit', label: 'Manage Equipment', sortOrder: 901 },
        ],
      },
      {
        key: 'contracts',
        label: 'Rental Contracts',
        permissions: [
          { key: 'rental.contracts.view', label: 'View Contracts', sortOrder: 910 },
          { key: 'rental.contracts.edit', label: 'Edit Contracts', sortOrder: 911 },
          { key: 'rental.contracts.admin', label: 'Terminate Contracts', sortOrder: 912 },
        ],
      },
      {
        key: 'maintenance',
        label: 'Maintenance',
        permissions: [
          { key: 'rental.maintenance.view', label: 'View Maintenance', sortOrder: 920 },
          { key: 'rental.maintenance.edit', label: 'Manage Maintenance', sortOrder: 921 },
        ],
      },
    ],
  },
  {
    key: 'reporting',
    label: 'Reporting',
    submodules: [
      {
        key: 'executive',
        label: 'Executive',
        permissions: [
          { key: 'reporting.executive.view', label: 'View Executive Reports', sortOrder: 1000 },
        ],
      },
      {
        key: 'financial',
        label: 'Financial',
        permissions: [
          { key: 'reporting.financial.view', label: 'View Financial Reports', sortOrder: 1010 },
        ],
      },
      {
        key: 'operational',
        label: 'Operational',
        permissions: [
          { key: 'reporting.operational.view', label: 'View Operational Reports', sortOrder: 1020 },
        ],
      },
      {
        key: 'consolidated',
        label: 'Consolidated',
        permissions: [
          {
            key: 'reporting.consolidated.view',
            label: 'View Consolidated Reports',
            sortOrder: 1030,
          },
        ],
      },
      {
        key: 'compliance',
        label: 'Compliance',
        permissions: [
          { key: 'reporting.compliance.view', label: 'View Compliance Reports', sortOrder: 1040 },
        ],
      },
    ],
  },
  {
    key: 'interco',
    label: 'Intercompany',
    submodules: [
      {
        key: 'transactions',
        label: 'Transactions',
        permissions: [
          { key: 'interco.transactions.view', label: 'View Interco Transactions', sortOrder: 1100 },
          {
            key: 'interco.transactions.edit',
            label: 'Create Interco Transactions',
            sortOrder: 1101,
          },
          {
            key: 'interco.transactions.approve',
            label: 'Approve Interco Transactions',
            sortOrder: 1102,
          },
        ],
      },
      {
        key: 'stock_transfers',
        label: 'Stock Transfers',
        permissions: [
          {
            key: 'interco.stock_transfers.view',
            label: 'View Interco Stock Transfers',
            sortOrder: 1110,
          },
          {
            key: 'interco.stock_transfers.edit',
            label: 'Create Interco Stock Transfers',
            sortOrder: 1111,
          },
        ],
      },
    ],
  },
  {
    key: 'admin',
    label: 'Administration',
    submodules: [
      {
        key: 'users',
        label: 'User Management',
        permissions: [
          { key: 'admin.users.view', label: 'View Users', sortOrder: 1200 },
          { key: 'admin.users.edit', label: 'Manage Users', sortOrder: 1201 },
        ],
      },
      {
        key: 'roles',
        label: 'Roles & Permissions',
        permissions: [
          { key: 'admin.roles.view', label: 'View Roles & Templates', sortOrder: 1210 },
          { key: 'admin.roles.admin', label: 'Manage Roles & Templates', sortOrder: 1211 },
        ],
      },
      {
        key: 'companies',
        label: 'Companies',
        permissions: [
          { key: 'admin.companies.view', label: 'View Companies', sortOrder: 1220 },
          { key: 'admin.companies.admin', label: 'Manage Companies', sortOrder: 1221 },
        ],
      },
      {
        key: 'system',
        label: 'System',
        permissions: [
          { key: 'admin.system.view', label: 'View System Health', sortOrder: 1230 },
          { key: 'admin.system.admin', label: 'Manage System Config', sortOrder: 1231 },
        ],
      },
    ],
  },
]

// ── FLAT MAP FOR QUICK LOOKUPS ────────────────────────────────────────────────

export const ALL_PERMISSIONS: PermissionDef[] = PERMISSION_REGISTRY.flatMap((mod) =>
  mod.submodules.flatMap((sub) => sub.permissions),
)

// ── ACCESS LEVEL HIERARCHY ───────────────────────────────────────────────────

export const ACCESS_LEVEL_ORDER: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  approve: 3,
  admin: 4,
}
