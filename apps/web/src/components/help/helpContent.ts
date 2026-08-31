export interface HelpStep {
  title: string
  body: string
}

export interface HelpTopic {
  key: string
  title: string
  emoji: string
  summary: string
  steps: HelpStep[]
  tips: string[]
  tourKey?: string
}

export interface HelpGroup {
  label: string
  topics: HelpTopic[]
}

// ── Topic definitions ─────────────────────────────────────────────────────────

const DASHBOARD: HelpTopic = {
  key: 'dashboard',
  title: 'Dashboard',
  emoji: '📊',
  summary: 'Your command centre — key metrics and quick navigation to every module.',
  steps: [
    {
      title: 'KPI cards',
      body: 'The top row shows your most important numbers: revenue, outstanding invoices, POs pending approval, and active projects. These refresh in real-time.',
    },
    {
      title: 'Quick links',
      body: 'Use the module cards below the KPIs to jump directly to any section of the system.',
    },
    {
      title: 'Company switcher',
      body: 'Click your company name in the top-left of the sidebar to switch between legal entities without logging out.',
    },
  ],
  tips: [
    'Numbers update automatically as transactions are posted.',
    'Bookmark the dashboard as your start page.',
  ],
  tourKey: 'dashboard-overview',
}

// ── Finance ───────────────────────────────────────────────────────────────────

const JOURNALS: HelpTopic = {
  key: 'journals',
  title: 'Journal Entries',
  emoji: '📓',
  summary: 'Record double-entry accounting transactions directly in the general ledger.',
  steps: [
    {
      title: 'Create a journal',
      body: 'Click New Journal. Choose the journal type (General, Cash, etc.) and the accounting period.',
    },
    {
      title: 'Add debit and credit lines',
      body: 'Each line needs an account, a debit or credit amount, and optionally a cost centre or description. Total debits must equal total credits.',
    },
    {
      title: 'Post the journal',
      body: 'Click Post to make it permanent. Posted journals cannot be edited — to correct a mistake, use Reverse to create a counter-entry.',
    },
    {
      title: 'Reverse a journal',
      body: 'Open a posted journal and click Reverse. A counter-entry is automatically created for the next period.',
    },
  ],
  tips: [
    'Draft journals are saved but not yet visible in reports.',
    'Use the period filter to view journals for a specific month.',
    'Attach supporting documents using the paperclip icon on any journal.',
  ],
  tourKey: 'journal-entry',
}

const ACCOUNTS_PAYABLE: HelpTopic = {
  key: 'accounts-payable',
  title: 'Accounts Payable',
  emoji: '🧾',
  summary:
    'Track and pay vendor invoices. Link invoices to purchase orders and generate payment vouchers.',
  steps: [
    {
      title: 'Record a vendor invoice',
      body: 'Click New Invoice, select the vendor, and add invoice lines with account, amount, and tax. Reference the original PO if applicable.',
    },
    {
      title: 'Match to a PO',
      body: 'Use the PO Reference field to link the invoice. The system verifies amounts against received quantities.',
    },
    {
      title: 'Post and pay',
      body: 'Post the invoice, then generate a Payment Voucher from the AP dashboard. Attach the bank transfer confirmation.',
    },
    {
      title: 'WHT',
      body: "Withholding tax is calculated automatically based on the vendor's WHT category. View accumulated WHT under Finance → WHT Payable.",
    },
  ],
  tips: [
    'Invoices on hold will not appear in the payment queue.',
    'Use batch payment to pay multiple vendors in one step.',
  ],
  tourKey: 'accounts-payable',
}

const ACCOUNTS_RECEIVABLE: HelpTopic = {
  key: 'accounts-receivable',
  title: 'Accounts Receivable',
  emoji: '💰',
  summary: 'Issue customer invoices, track receipts, and monitor outstanding balances.',
  steps: [
    {
      title: 'Invoice from a contract',
      body: 'Go to Projects → Contracts and click Generate Invoice. This pre-fills the customer, items, and amounts from the contract.',
    },
    {
      title: 'Manual AR invoice',
      body: 'Go to Finance → Accounts Receivable → New Invoice. Select the customer and add line items manually.',
    },
    {
      title: 'Record a payment',
      body: 'Open the invoice and click Record Payment. Enter the amount received, date, and bank account.',
    },
    {
      title: 'Aging report',
      body: 'Use the Aging tab to see overdue invoices grouped by 30 / 60 / 90 / 120+ days.',
    },
  ],
  tips: [
    'Send the invoice PDF directly from the system using the Send button.',
    'Partial payments are supported — the remaining balance stays open.',
  ],
  tourKey: 'accounts-receivable',
}

const BANK_RECON: HelpTopic = {
  key: 'bank-reconciliation',
  title: 'Bank Reconciliation',
  emoji: '🏦',
  summary: 'Match your bank statement to ledger entries and clear outstanding items.',
  steps: [
    {
      title: 'Import or enter statement',
      body: 'Select the bank account and period. Upload a CSV statement or enter lines manually.',
    },
    {
      title: 'Match transactions',
      body: 'The system auto-suggests matches. Review each pair and click Confirm to match, or Skip to leave it unmatched.',
    },
    {
      title: 'Create missing entries',
      body: 'For bank charges or interest not yet in the ledger, click Post Journal directly from the reconciliation screen.',
    },
    {
      title: 'Complete reconciliation',
      body: 'Once the difference is zero, click Complete. The reconciliation is locked and dated.',
    },
  ],
  tips: [
    'Run reconciliation monthly before closing the period.',
    'Unmatched items from prior months carry forward automatically.',
  ],
  tourKey: 'bank-recon',
}

const FIXED_ASSETS: HelpTopic = {
  key: 'fixed-assets',
  title: 'Fixed Assets',
  emoji: '🏗️',
  summary: 'Track company assets and automate depreciation journal entries.',
  steps: [
    {
      title: 'Register an asset',
      body: 'Click New Asset. Enter the asset name, category, acquisition cost, and start date. The system calculates the depreciation schedule automatically.',
    },
    {
      title: 'Depreciation methods',
      body: 'Choose Straight-Line (equal monthly amounts) or Declining Balance (percentage of book value). The method is set per asset category.',
    },
    {
      title: 'Run depreciation',
      body: 'The background worker runs depreciation automatically each month. You can also trigger it manually from the asset detail page.',
    },
    {
      title: 'Dispose an asset',
      body: 'Open the asset and click Dispose. Enter the sale price (0 if scrapped). The gain or loss is posted to the GL automatically.',
    },
  ],
  tips: [
    'Asset categories define the default useful life and GL accounts.',
    'Depreciation journals are created in draft — review before posting.',
  ],
  tourKey: 'fixed-assets',
}

const BUDGET: HelpTopic = {
  key: 'budget',
  title: 'Budget Management',
  emoji: '📈',
  summary: 'Set annual budgets by account and compare actuals vs plan.',
  steps: [
    {
      title: 'Create a budget',
      body: 'Click New Budget, name it (e.g. "FY2026 Operating"), and choose the fiscal year. Budgets are per-company.',
    },
    {
      title: 'Enter budget lines',
      body: 'Add lines for each GL account or cost centre. Enter monthly amounts for more granular variance reporting.',
    },
    {
      title: 'Budget vs Actual',
      body: 'The Budget Detail page shows a live comparison: budget, actual (from posted journals), and variance percentage.',
    },
    {
      title: 'Revise a budget',
      body: 'Open the budget and click Edit. Create a revision to track changes to the original plan.',
    },
  ],
  tips: [
    'Use cost centres to budget by department, not just account.',
    'You can have multiple budgets per year (original, revised, forecast).',
  ],
  tourKey: 'budget-management',
}

const EXPENSE_CLAIMS: HelpTopic = {
  key: 'expense-claims',
  title: 'Expense Claims',
  emoji: '🧳',
  summary: 'Employees submit expense claims for reimbursement. Finance approves and posts to GL.',
  steps: [
    {
      title: 'Submit a claim',
      body: 'Click New Claim. Add expense lines with date, category, amount, and attach receipts. Click Submit to send for approval.',
    },
    {
      title: 'Approval workflow',
      body: "Claims route to the employee's manager for approval, then to Finance for final sign-off.",
    },
    {
      title: 'Post and reimburse',
      body: "Once approved, Finance posts the claim to the GL. Reimbursement is via payment voucher to the employee's bank account.",
    },
  ],
  tips: [
    'Attach receipts as images or PDFs — required for amounts above the policy threshold.',
    'Claims older than 60 days may be flagged for review per company policy.',
  ],
  tourKey: 'expense-claims',
}

const PETTY_CASH: HelpTopic = {
  key: 'petty-cash',
  title: 'Petty Cash',
  emoji: '💵',
  summary: 'Manage physical cash funds for small day-to-day expenses.',
  steps: [
    {
      title: 'Record a disbursement',
      body: 'Click New Transaction → Disbursement. Enter amount, category, and purpose. Attach the receipt.',
    },
    {
      title: 'Replenish the fund',
      body: 'When the fund runs low, click Replenish. The system calculates the total disbursed and creates a payment voucher to top up.',
    },
    {
      title: 'Reconcile',
      body: 'Count physical cash and compare to the system balance. Log any discrepancy as an adjustment with a reason.',
    },
  ],
  tips: [
    'Each petty cash fund is tied to a specific GL account and custodian.',
    'Replenishment automatically posts a journal entry.',
  ],
  tourKey: 'petty-cash',
}

const PAYMENT_VOUCHERS: HelpTopic = {
  key: 'payment-vouchers',
  title: 'Payment Vouchers',
  emoji: '📋',
  summary: 'Formal payment authorisation documents generated from AP invoices.',
  steps: [
    {
      title: 'Generate a voucher',
      body: 'From the AP invoice detail page, click Generate PV. The voucher is pre-filled with vendor, amount, and bank details.',
    },
    {
      title: 'Attach confirmation',
      body: 'After the bank transfer is made, upload the transfer receipt to the voucher and mark it as Paid.',
    },
    {
      title: 'Print',
      body: 'Click PDF to generate a formatted payment voucher with the company stamp template applied.',
    },
  ],
  tips: [
    'Vouchers can only be generated for posted (not draft) AP invoices.',
    'The PV stamp template is configured in Admin → Company → Configuration.',
  ],
  tourKey: 'payment-vouchers',
}

const PAYMENT_TERMS: HelpTopic = {
  key: 'payment-terms',
  title: 'Payment Terms',
  emoji: '📅',
  summary: 'Define payment schedules — net days, instalment plans, and retention.',
  steps: [
    {
      title: 'Create payment terms',
      body: 'Click New Terms. Set the name (e.g. "Net 30"), and define lines: percentage due and when (e.g. 50% on invoice, 50% after 30 days).',
    },
    {
      title: 'Apply to a vendor',
      body: 'Payment terms set on a vendor default to all new AP invoices for that vendor.',
    },
    {
      title: 'Retention',
      body: 'For contracts with retention, use Finance → Retention to track withheld amounts and schedule their release.',
    },
  ],
  tips: [
    'Payment terms affect AP aging and due date calculations.',
    'Multiple instalment lines are supported for complex schedules.',
  ],
  tourKey: 'payment-terms',
}

// ── Procurement ───────────────────────────────────────────────────────────────

const PURCHASE_ORDERS: HelpTopic = {
  key: 'purchase-orders',
  title: 'Purchase Orders',
  emoji: '🛒',
  summary:
    'The full procurement pipeline — from a rough estimate at creation to a vendor-priced, approved, bought, received, and audited purchase.',
  steps: [
    {
      title: 'Create the PO',
      body: 'Click New PO. Pick a purpose — General Stock, Project Supply, or Manufacturing/BOM — it decides how the cost gets routed once the PO is priced. Vendor is optional here — leave it blank and set it later once you actually have a quote. For each line, pick a catalog product, or leave it as a free-text "Custom item" if it is not in the catalog yet.',
    },
    {
      title: 'Inventory check',
      body: 'The PO owner records how much of each line is already sitting in stock. A line fully covered from stock skips straight to Ready to Issue — it never goes through pricing or approval. Whatever is still needed continues on to pricing.',
    },
    {
      title: 'Pricing',
      body: 'Store Pricing — valuing whatever portion is coming from existing stock — is automatic: the system fills it in from the last real vendor price recorded for that product, no one has to type it in. Market Pricing is where a real vendor and a real price and currency get attached to the portion actually being purchased, entered by whoever holds the Procurement Officer position.',
    },
    {
      title: 'Verification & approval',
      body: "A second reviewer (Procurement 2nd) checks the market price before it goes to approval, and can send it back if something looks off. Approval then routes to the right person based on your company's thresholds and PO positions. An Emergency-priority PO skips straight from Draft to approval, bypassing inventory check and pricing entirely.",
    },
    {
      title: 'Buying — the actual price',
      body: 'Once approved, the PO moves straight into Items Bought. The buyer ticks each line as bought and enters the actual price paid there — that real number, not the original estimate, is what flows through to Finance.',
    },
    {
      title: 'Receiving',
      body: 'For a normal purchase, open the PO and click Record Receipt — enter quantities received (partial receipts are fine) and attach a vendor-receipt photo plus a materials photo; it only counts once both are attached and confirmed. For a project PO marked "delivered to jobsite," the same screen becomes a simpler Mark Delivered step — it never touches warehouse stock, the cost posts straight to the project instead.',
    },
    {
      title: 'New items get cataloged',
      body: 'A line left as a free-text "Custom item" lands in Inventory → New Items to Catalog once it actually arrives. The store keeper either catalogs it as a real product — so it is searchable and reorderable next time — or links it to an existing product if it turns out to already be in the catalog under a different name.',
    },
    {
      title: 'Finance audit & invoicing',
      body: 'Finance reviews the actual price against the original estimate (flagged if it varies) before the PO can move to Invoiced. The funding source — vendor accounts payable or an employee advance — is decided at that point, and the vendor invoice is created against the PO.',
    },
  ],
  tips: [
    'Vendor and currency can both be left unset at creation — they only need to be locked in once Market Pricing happens.',
    'Use My Queue to see POs waiting on you specifically, and Approval Queue for everything awaiting sign-off.',
    'A rejected PO goes back to Draft with a reason attached — fix it and resubmit.',
    'Add internal notes and file attachments to any PO line at any stage.',
  ],
  tourKey: 'purchase-order',
}

const VENDORS: HelpTopic = {
  key: 'vendors',
  title: 'Vendors',
  emoji: '🏭',
  summary: 'Manage your supplier master data — contacts, payment terms, and bank details.',
  steps: [
    {
      title: 'Add a vendor',
      body: 'Click New Vendor. Fill in the company name, contact person, tax ID, and payment terms.',
    },
    {
      title: 'Bank details',
      body: "Add the vendor's bank account under the Banking tab. This auto-fills payment vouchers and wire transfer instructions.",
    },
    {
      title: 'WHT category',
      body: 'Set the withholding tax category if applicable. This determines the WHT rate deducted on all AP invoices for this vendor.',
    },
  ],
  tips: [
    'Deactivated vendors cannot receive new POs.',
    'Payment terms set here default to all new invoices for that vendor.',
  ],
  tourKey: 'vendors',
}

const APPROVAL_QUEUE: HelpTopic = {
  key: 'approval-queue',
  title: 'Approval Queue',
  emoji: '✅',
  summary: 'Review and approve or reject purchase orders awaiting your sign-off.',
  steps: [
    {
      title: 'Review a PO',
      body: 'Click any PO in the queue to open the full detail — check the line items, vendor, pricing, and any attached documents.',
    },
    {
      title: 'Approve',
      body: 'Click Approve. The PO moves to the next approval level or is marked Approved if you are the final approver.',
    },
    {
      title: 'Reject',
      body: 'Click Reject and enter a reason. The requester is notified and can revise and resubmit.',
    },
  ],
  tips: [
    'You receive a notification for each new PO added to your queue.',
    'Use the count badge in the sidebar to see how many POs await action.',
  ],
  tourKey: 'approval-queue',
}

// ── Other modules ─────────────────────────────────────────────────────────────

const INVENTORY: HelpTopic = {
  key: 'inventory',
  title: 'Inventory',
  emoji: '📦',
  summary: 'Manage stock across multiple locations — track movements, transfers, and valuations.',
  steps: [
    {
      title: 'Stock list',
      body: 'The stock list shows current on-hand quantities by location. Use the search and filters to find a specific item.',
    },
    {
      title: 'Stock transfer',
      body: 'Click New Transfer to move items between locations. Enter source, destination, items, and quantities. Transfers are logged for audit.',
    },
    {
      title: 'Adjustments',
      body: 'For write-offs or count corrections, use New Adjustment. Enter the reason — an audit trail entry is created automatically.',
    },
    {
      title: 'Valuation',
      body: 'Each item has a unit cost. Total inventory value = quantity × unit cost, visible in the Valuation report.',
    },
  ],
  tips: [
    'Inter-company stock transfers go through the Inter-company module, not here.',
    'Set minimum stock levels to trigger reorder alerts.',
  ],
  tourKey: 'inventory',
}

const PROJECTS: HelpTopic = {
  key: 'projects',
  title: 'Projects',
  emoji: '🏗️',
  summary:
    'Create and manage construction or service projects — budget setup, cost tracking, and team oversight.',
  steps: [
    {
      title: 'Create a project',
      body: 'Click New Project. Set the project code (e.g. PRJ-2026-042), type (construction/service/internal), and assign a project manager.',
    },
    {
      title: 'Set the budget',
      body: 'Go to the Budget tab. Add cost categories (Materials, Labour, Subcontractors, Equipment) with planned amounts for each.',
    },
    {
      title: 'Track actual costs',
      body: 'Costs post to the project automatically when an AP invoice or PO references this project code. The Budget tab shows live Actual vs Planned.',
    },
    {
      title: 'Monitor project status',
      body: 'Status flows from Active → On Hold → Completed. Each change is timestamped. Use the History tab to see the full audit trail.',
    },
  ],
  tips: [
    'Use the project code on AP invoice lines to automatically track costs against the project budget.',
    'Budget alerts fire when a cost category reaches 80% or 100% of its planned amount.',
  ],
  tourKey: 'project',
}

const CONTRACTS: HelpTopic = {
  key: 'contracts',
  title: 'Project Contracts',
  emoji: '📄',
  summary:
    'Manage customer billing agreements — billing methods, milestones, and invoice generation.',
  steps: [
    {
      title: 'Create a contract',
      body: 'Click New Contract. Link it to a project, enter the client name, contract value, and choose a billing method.',
    },
    {
      title: 'Billing methods',
      body: 'Four methods are supported: Fixed Lump Sum (one payment), Milestone (payment per completed milestone), Cost Plus / T&M (reimburse actual costs + margin), and Progress % (bill based on completion percentage).',
    },
    {
      title: 'Add milestones',
      body: 'For milestone-based contracts, open the contract and add each milestone with a name, sequence number, and billable amount.',
    },
    {
      title: 'Mark a milestone reached',
      body: 'When a milestone is completed on site, open the contract and set its status to Reached. This unlocks invoice generation for that milestone.',
    },
    {
      title: 'Generate an invoice',
      body: 'From the contract detail, click Generate Invoice. The AR invoice pre-fills with the client and milestone amount. Review and post it.',
    },
  ],
  tips: [
    'The Contracts list shows total Value, Invoiced so far, and Outstanding balance per contract.',
    'Retention % withholds a portion of each invoice until project completion — configure it on the contract.',
  ],
  tourKey: 'contracts',
}

const HR_EMPLOYEES: HelpTopic = {
  key: 'hr-employees',
  title: 'Employees',
  emoji: '👥',
  summary: 'Manage employee records — personal info, employment, shifts, and payroll config.',
  steps: [
    {
      title: 'Add an employee',
      body: 'Click New Employee. Fill in personal information (name, nationality, ID), employment details (hire date, department, job title), and contact info.',
    },
    {
      title: 'Assign a shift',
      body: 'Go to the employee detail page → Shift tab. Select the shift config and the effective from date.',
    },
    {
      title: 'Payroll configuration',
      body: 'Under the Salary tab, click Update Salary. Set base salary, allowances (housing, transport), and deduction percentages.',
    },
    {
      title: 'Link a system user',
      body: 'If the employee should log into the ERP, go to the Access tab and link their user account by email.',
    },
  ],
  tips: [
    'Employee number is auto-generated but can be overridden.',
    'Terminated employees are preserved for audit — they just become inactive.',
  ],
  tourKey: 'new-employee',
}

const HR_ATTENDANCE: HelpTopic = {
  key: 'hr-attendance',
  title: 'Attendance',
  emoji: '🕐',
  summary: 'View punch records, monthly calendar, and attendance KPIs per employee.',
  steps: [
    {
      title: 'Monthly calendar',
      body: 'The calendar shows each day colour-coded: green (present), red (absent), yellow (on leave), grey (weekend).',
    },
    {
      title: 'Day detail',
      body: 'Click any day to see the exact punch-in and punch-out times, geofence validation result, and distance from the work location.',
    },
    {
      title: 'KPI summary',
      body: 'The top row shows days present, absent, total hours, overtime hours, and leave days for the selected month.',
    },
    {
      title: 'Punch history',
      body: 'Go to Attendance → Punch History for a tabular view of all punches with filters by employee and date range.',
    },
  ],
  tips: [
    'Punches outside the geofence are flagged in red — they are recorded but marked invalid.',
    'Employees punch in and out via the mobile app.',
  ],
  tourKey: 'hr-attendance',
}

const HR_OVERTIME: HelpTopic = {
  key: 'hr-overtime',
  title: 'Overtime',
  emoji: '⏰',
  summary: 'Approve or reject overtime requests submitted by employees.',
  steps: [
    {
      title: 'Pending requests',
      body: 'The left panel lists all overtime requests awaiting approval. Each card shows employee, date, regular hours, and overtime hours.',
    },
    {
      title: 'Approve or reject',
      body: 'Click Approve to confirm, or Reject and enter a reason. The employee is notified either way via the notification system.',
    },
    {
      title: 'Bulk approve',
      body: 'When multiple requests are pending, use Approve All to process them in a single click.',
    },
  ],
  tips: [
    'Approved overtime is included in the next payroll run automatically.',
    "Overtime multipliers (1.5×, 2×) are set in the employee's shift configuration.",
  ],
  tourKey: 'hr-overtime',
}

const HR_LEAVE: HelpTopic = {
  key: 'hr-leave',
  title: 'Leave Management',
  emoji: '🌴',
  summary: 'Manage leave requests, balances, and leave type policies.',
  steps: [
    {
      title: 'Submit a request',
      body: 'Click New Leave Request. Select the leave type, start and end dates, and reason. Submit for manager approval.',
    },
    {
      title: 'Approve or reject',
      body: 'Managers see pending requests in their queue and can approve or reject with notes.',
    },
    {
      title: 'Leave balances',
      body: "Each employee's remaining balance per leave type is tracked automatically. Days taken are deducted on approval.",
    },
    {
      title: 'Leave types',
      body: 'Configure leave types (Annual, Sick, Unpaid, etc.) under HR → Settings → Leave Types. Set max days per year and approval rules.',
    },
  ],
  tips: [
    'Approved leave days appear as yellow blocks on the attendance calendar.',
    'Leave taken is reflected in the monthly attendance summary KPIs.',
  ],
  tourKey: 'hr-leave',
}

const MANUFACTURING: HelpTopic = {
  key: 'manufacturing',
  title: 'Manufacturing',
  emoji: '🏭',
  summary: 'Manage production orders and bills of materials for manufactured items.',
  steps: [
    {
      title: 'Bill of Materials',
      body: 'Define what goes into a finished product: raw materials, quantities, and yield percentage. BOMs are linked to inventory items.',
    },
    {
      title: 'Production order',
      body: 'Create a production order specifying the finished product and quantity. The system lists required raw materials based on the BOM.',
    },
    {
      title: 'Issue materials',
      body: 'Click Issue Materials to deduct raw materials from stock. Stock movements are created automatically.',
    },
    {
      title: 'Complete production',
      body: 'Click Finish to add the finished goods to inventory. Production cost is calculated from materials used.',
    },
  ],
  tips: [
    'Check raw material availability before creating a production order.',
    'Production costs flow into the finished goods cost for inventory valuation.',
  ],
  tourKey: 'manufacturing',
}

const RENTAL: HelpTopic = {
  key: 'rental',
  title: 'Equipment Rental',
  emoji: '🚜',
  summary: 'Track equipment rental contracts, utilisation, and maintenance schedules.',
  steps: [
    {
      title: 'Equipment register',
      body: 'All equipment is listed with current status (Available, On Rent, In Maintenance). Click an item to see full history.',
    },
    {
      title: 'Rental contract',
      body: 'Create a contract specifying the customer, equipment item, rental period, and daily/monthly rate.',
    },
    {
      title: 'Maintenance alerts',
      body: 'The background worker monitors equipment due for service and sends alerts. View upcoming maintenance in the Maintenance tab.',
    },
    {
      title: 'Return equipment',
      body: 'When a rental ends, click Return on the contract. The system logs the return date and calculates the final invoice.',
    },
  ],
  tips: [
    'Equipment availability updates automatically when contracts start or end.',
    'Maintenance schedules are configured per equipment record.',
  ],
  tourKey: 'rental',
}

const REPORTING: HelpTopic = {
  key: 'reporting',
  title: 'Reports',
  emoji: '📊',
  summary: 'Financial statements and management reports generated from live posted data.',
  steps: [
    {
      title: 'Trial Balance',
      body: 'Shows all accounts with opening balance, period movements, and closing balance. Filter by date range and company.',
    },
    {
      title: 'Profit & Loss',
      body: 'Revenue minus expenses for the selected period. Drill down into any line to see the underlying journal entries.',
    },
    {
      title: 'Balance Sheet',
      body: 'Assets, liabilities, and equity as of a given date. Must balance — Assets = Liabilities + Equity.',
    },
    {
      title: 'Cash Flow',
      body: 'Operating, investing, and financing cash flows derived from journal movements classified by account type.',
    },
    {
      title: 'Export',
      body: 'All reports export to PDF or CSV using the button in the top-right of each report page.',
    },
  ],
  tips: [
    'Reports only include posted journals — drafts are always excluded.',
    'Compare periods by changing the date range filter.',
  ],
  tourKey: 'reporting',
}

const INTEGRATIONS: HelpTopic = {
  key: 'integrations',
  title: 'Integrations & System Configuration',
  emoji: '🔌',
  summary:
    'Configure SMTP email, FX rate API keys, file storage, and the public app URL — without editing server files.',
  steps: [
    {
      title: 'SMTP email server',
      body: 'Enter the hostname, port, username, and password for your outgoing mail server. Click "Send Test Email" to confirm the settings work before saving.',
    },
    {
      title: 'Application base URL',
      body: 'Set the public URL of this ERP (e.g. https://erp.company.com). Used in QR codes on invoice PDFs and in email deep-links.',
    },
    {
      title: 'FX rate API keys',
      body: 'Add your ExchangeRate-API key (primary) and/or Open Exchange Rates App ID (fallback). The daily FX sync job uses these automatically.',
    },
    {
      title: 'File storage (B2)',
      body: 'Connect a Backblaze B2 bucket for PDF and attachment storage. You need the endpoint, region, key ID, and application key from your B2 account.',
    },
  ],
  tips: [
    'Fields with a DB badge override the .env file. Fields with an env badge are read from the server environment file and can be overridden by saving here.',
    'Sensitive values (passwords, API keys) are stored AES-256-GCM encrypted in the database.',
    'Changes to SMTP or FX API keys take effect within 5 minutes for background workers.',
  ],
  tourKey: 'integrations',
}

const SETTINGS: HelpTopic = {
  key: 'settings',
  title: 'Settings',
  emoji: '⚙️',
  summary: 'Configure system behaviour, company profile, appearance, and user preferences.',
  steps: [
    {
      title: 'Company settings',
      body: 'Update your company name, logo, letterhead, stamp image, and legal address under Settings → Company.',
    },
    {
      title: 'Appearance',
      body: 'Choose between Light Flat and Black themes under Settings → Appearance.',
    },
    {
      title: 'User roles',
      body: 'Manage who can access what under Settings → Permissions. Assign roles per user per module.',
    },
    {
      title: 'Notifications',
      body: 'Configure which events trigger in-app or email notifications under Settings → Notifications.',
    },
  ],
  tips: [
    'Letterhead changes take effect immediately on new PDF documents.',
    "Role changes take effect on the user's next login.",
  ],
  tourKey: 'settings',
}

const ADMIN: HelpTopic = {
  key: 'admin',
  title: 'Administration',
  emoji: '🔧',
  summary: 'System-level management: companies, users, bank accounts, and role permissions.',
  steps: [
    {
      title: 'Companies',
      body: 'Create and manage all legal entities. Each company has its own chart of accounts, users, and configuration.',
    },
    {
      title: 'Users',
      body: 'Invite users and assign them to companies with specific roles. Users can belong to multiple companies simultaneously.',
    },
    {
      title: 'Bank accounts',
      body: 'Register company bank accounts used for payment vouchers and bank reconciliation.',
    },
    {
      title: 'Branches',
      body: 'Add physical office or branch locations under the company detail page → Branches tab.',
    },
  ],
  tips: [
    'Only Super Admin users can create new companies.',
    'Deactivated users cannot log in, but their data is fully preserved.',
  ],
  tourKey: 'admin',
}

// ── Registry ──────────────────────────────────────────────────────────────────

// Longest patterns first for specificity
const routeMap: { pattern: string; topic: HelpTopic }[] = [
  { pattern: '/dashboard', topic: DASHBOARD },
  { pattern: '/finance/journals', topic: JOURNALS },
  { pattern: '/finance/accounts-payable', topic: ACCOUNTS_PAYABLE },
  { pattern: '/finance/ap', topic: ACCOUNTS_PAYABLE },
  { pattern: '/finance/accounts-receivable', topic: ACCOUNTS_RECEIVABLE },
  { pattern: '/finance/ar', topic: ACCOUNTS_RECEIVABLE },
  { pattern: '/finance/bank-reconciliation', topic: BANK_RECON },
  { pattern: '/finance/bank', topic: BANK_RECON },
  { pattern: '/finance/fixed-assets', topic: FIXED_ASSETS },
  { pattern: '/finance/assets', topic: FIXED_ASSETS },
  { pattern: '/finance/budget', topic: BUDGET },
  { pattern: '/finance/expense-claims', topic: EXPENSE_CLAIMS },
  { pattern: '/finance/petty-cash', topic: PETTY_CASH },
  { pattern: '/finance/payment-vouchers', topic: PAYMENT_VOUCHERS },
  { pattern: '/finance/payment-terms', topic: PAYMENT_TERMS },
  { pattern: '/finance/retention', topic: PAYMENT_TERMS },
  { pattern: '/finance', topic: JOURNALS },
  { pattern: '/procurement/purchase-orders', topic: PURCHASE_ORDERS },
  { pattern: '/procurement/vendors', topic: VENDORS },
  { pattern: '/procurement/approval-queue', topic: APPROVAL_QUEUE },
  { pattern: '/procurement', topic: PURCHASE_ORDERS },
  { pattern: '/inventory', topic: INVENTORY },
  { pattern: '/projects/contracts', topic: CONTRACTS },
  { pattern: '/projects', topic: PROJECTS },
  { pattern: '/hr/employees', topic: HR_EMPLOYEES },
  { pattern: '/hr/attendance', topic: HR_ATTENDANCE },
  { pattern: '/hr/overtime', topic: HR_OVERTIME },
  { pattern: '/hr/leave', topic: HR_LEAVE },
  { pattern: '/hr', topic: HR_EMPLOYEES },
  { pattern: '/manufacturing', topic: MANUFACTURING },
  { pattern: '/rental', topic: RENTAL },
  { pattern: '/finance/reports', topic: REPORTING },
  { pattern: '/reporting', topic: REPORTING },
  { pattern: '/settings/company/integrations', topic: INTEGRATIONS },
  { pattern: '/settings', topic: SETTINGS },
  { pattern: '/admin', topic: ADMIN },
]

export function findTopic(pathname: string): HelpTopic | null {
  for (const { pattern, topic } of routeMap) {
    if (pathname === pattern || pathname.startsWith(pattern + '/')) return topic
  }
  return null
}

export function findTopicByKey(key: string): HelpTopic | null {
  return allTopics.find((t) => t.key === key) ?? null
}

export const allTopics: HelpTopic[] = [
  DASHBOARD,
  JOURNALS,
  ACCOUNTS_PAYABLE,
  ACCOUNTS_RECEIVABLE,
  BANK_RECON,
  FIXED_ASSETS,
  BUDGET,
  EXPENSE_CLAIMS,
  PETTY_CASH,
  PAYMENT_VOUCHERS,
  PAYMENT_TERMS,
  PURCHASE_ORDERS,
  VENDORS,
  APPROVAL_QUEUE,
  INVENTORY,
  PROJECTS,
  CONTRACTS,
  HR_EMPLOYEES,
  HR_ATTENDANCE,
  HR_OVERTIME,
  HR_LEAVE,
  MANUFACTURING,
  RENTAL,
  REPORTING,
  INTEGRATIONS,
  SETTINGS,
  ADMIN,
]

export const helpGroups: HelpGroup[] = [
  { label: 'General', topics: [DASHBOARD] },
  {
    label: 'Finance',
    topics: [
      JOURNALS,
      ACCOUNTS_PAYABLE,
      ACCOUNTS_RECEIVABLE,
      BANK_RECON,
      FIXED_ASSETS,
      BUDGET,
      EXPENSE_CLAIMS,
      PETTY_CASH,
      PAYMENT_VOUCHERS,
      PAYMENT_TERMS,
    ],
  },
  { label: 'Procurement', topics: [PURCHASE_ORDERS, VENDORS, APPROVAL_QUEUE] },
  { label: 'Inventory', topics: [INVENTORY] },
  { label: 'Projects', topics: [PROJECTS, CONTRACTS] },
  { label: 'HR', topics: [HR_EMPLOYEES, HR_ATTENDANCE, HR_OVERTIME, HR_LEAVE] },
  { label: 'Manufacturing', topics: [MANUFACTURING] },
  { label: 'Rental', topics: [RENTAL] },
  { label: 'Reporting', topics: [REPORTING] },
  { label: 'Admin', topics: [INTEGRATIONS, SETTINGS, ADMIN] },
]
