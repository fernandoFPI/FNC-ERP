import type { DriveStep } from 'driver.js'
import { useTourStore } from '../../store/tourStore'
import type { ThemeTokens } from '../../theme/tokens'
import { injectTourStyles, removeTourStyles } from './tourStyles'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InteractiveTourStep {
  element?: string
  title: string
  description: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  nextRoute?: string
  nextElement?: string
}

interface InteractiveTour {
  title: string
  startRoute: string
  startElement?: string
  steps: InteractiveTourStep[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function waitForElement(selector: string | undefined, cb: () => void, timeout = 4000) {
  if (!selector) { setTimeout(cb, 150); return }
  if (document.querySelector(selector)) { setTimeout(cb, 150); return }
  const start = Date.now()
  function poll() {
    if (document.querySelector(selector!) || Date.now() - start > timeout) {
      setTimeout(cb, 150)
    } else {
      requestAnimationFrame(poll)
    }
  }
  requestAnimationFrame(poll)
}

// ── Interactive tour definitions ──────────────────────────────────────────────

const interactiveTours: Record<string, InteractiveTour> = {

  // ── Journal Entry — full debit/credit workflow ──────────────────────────────
  'journal-entry': {
    title: 'Create a Journal Entry',
    startRoute: '/finance/journals',
    startElement: '[data-tour="new-journal-btn"]',
    steps: [
      {
        title: '📓 Journal Entry — Interactive Tour',
        description:
          'This tour walks you through creating a <strong>manual journal entry</strong> from scratch — including double-entry balancing and posting.<br/><br/>' +
          '<strong style="color:#f59e0b">Tour mode is active</strong> — you interact with the real UI, but <strong>nothing is saved</strong>. All mutations are blocked.<br/><br/>' +
          'Press <strong>Next →</strong> to begin.',
      },
      {
        element: '[data-tour="new-journal-btn"]',
        title: 'Step 1 — Start a new journal entry',
        description:
          'The Journals list shows all entries grouped by status: <strong>Draft</strong> (created but not posted) and <strong>Posted</strong> (permanent, locked).<br/><br/>' +
          'Click <strong>New Journal Entry</strong> to open the entry form. Press <strong>Next →</strong> and we will navigate there for you.',
        side: 'bottom',
        nextRoute: '/finance/journals/new',
        nextElement: '[data-tour="journal-entry-date"]',
      },
      {
        element: '[data-tour="journal-entry-date"]',
        title: 'Step 2 — Entry date',
        description:
          'Set the <strong>Entry Date</strong> — the accounting date that determines which <strong>fiscal period</strong> this entry falls into.<br/><br/>' +
          '⚠️ If the period is <strong>closed</strong>, posting will be blocked. Always verify the period is open before entering historical transactions.<br/><br/>' +
          'You can edit the date field now — this is real interaction.',
        side: 'right',
      },
      {
        element: '[data-tour="journal-description"]',
        title: 'Step 3 — Description',
        description:
          'Enter a clear description for the <strong>entire entry</strong>. This appears in ledger reports and audit trails.<br/><br/>' +
          '<strong>Good:</strong> "Rent expense June 2026 — Karrada office"<br/>' +
          '<strong>Avoid:</strong> "Misc" or "Entry 1"<br/><br/>' +
          'A specific description makes it easy to find this entry months later during an audit.',
        side: 'right',
      },
      {
        element: '[data-tour="journal-lines-table"]',
        title: 'Step 4 — Journal lines (double-entry)',
        description:
          'This is the core of the entry. Every journal entry must follow <strong>double-entry accounting</strong>:<br/><br/>' +
          '• Each row has an <strong>Account</strong> (GL account), an optional line description, a <strong>Debit</strong> amount, and a <strong>Credit</strong> amount.<br/>' +
          '• A typical entry has one debit line and one credit line.<br/>' +
          '• <strong>Total debits must equal total credits</strong> before you can post.<br/><br/>' +
          'You can fill in the account dropdowns and amounts now.',
        side: 'top',
      },
      {
        element: '[data-tour="add-line-btn"]',
        title: 'Step 5 — Add more lines',
        description:
          'Click <strong>+ Add Line</strong> to add extra rows. Multi-line entries are common for:<br/><br/>' +
          '• Splitting a cost across multiple GL accounts<br/>' +
          '• Payroll entries (salary, NSSF, income tax — each as a separate line)<br/>' +
          '• Accruals that affect more than two accounts<br/><br/>' +
          'The <strong>Totals row</strong> at the bottom updates live — watch for the balance indicator.',
        side: 'top',
      },
      {
        element: '[data-tour="create-entry-btn"]',
        title: 'Step 6 — Post the entry',
        description:
          'Once all lines are filled and <strong>debits = credits</strong>, click <strong>Create Entry</strong> to post.<br/><br/>' +
          'Posting is <strong>permanent</strong>. The entry is locked and affects all reports immediately — Trial Balance, P&L, Balance Sheet.<br/><br/>' +
          '<strong style="color:#f59e0b">Tour mode:</strong> clicking this button will show a confirmation toast but nothing will be written to the database.',
        side: 'top',
      },
      {
        title: '✅ Journal Entry — Tour Complete',
        description:
          'After posting, the journal is <strong>permanent and auditable</strong>.<br/><br/>' +
          '<strong>What to do next:</strong><br/>' +
          '• Need to fix it? Open the posted entry and click <strong>Reverse</strong> — this creates an equal and opposite correction entry dated today.<br/>' +
          '• Check Finance → Reports → <strong>Trial Balance</strong> to confirm the GL balances updated correctly.<br/>' +
          '• For recurring entries (rent, depreciation), use a template to speed up monthly posting.<br/><br/>' +
          'Click <strong>Done ✓</strong> to exit the tour.',
      },
    ],
  },

  // ── New Employee — full 3-section onboarding walkthrough ───────────────────
  'new-employee': {
    title: 'Add a New Employee',
    startRoute: '/hr/employees',
    startElement: '[data-tour="new-employee-btn"]',
    steps: [
      {
        title: '👥 New Employee — Interactive Tour',
        description:
          'This tour walks you through onboarding a new employee — from personal details to employment type, department, and contact information.<br/><br/>' +
          '<strong style="color:#f59e0b">Tour mode is active</strong> — you interact with the real form, but <strong>nothing is saved</strong>.<br/><br/>' +
          'Press <strong>Next →</strong> to begin.',
      },
      {
        element: '[data-tour="new-employee-btn"]',
        title: 'Step 1 — Open the employee form',
        description:
          'The Employees list shows all staff. You can filter by department, employment type, or active status.<br/><br/>' +
          'Active employees are available in:<br/>' +
          '• Attendance tracking (punch-in / out via mobile)<br/>' +
          '• Payroll runs<br/>' +
          '• Leave request workflows<br/><br/>' +
          'Press <strong>Next →</strong> to open the New Employee form.',
        side: 'bottom',
        nextRoute: '/hr/employees/new',
        nextElement: '[data-tour="personal-info-card"]',
      },
      {
        element: '[data-tour="personal-info-card"]',
        title: 'Step 2 — Personal information',
        description:
          '<strong>First name</strong> and <strong>Last name</strong> are required — they appear in payslips, approvals, and the employee directory.<br/><br/>' +
          '<strong>National ID</strong> is <em>required</em> for Full-time and Expat employees — it is used for government payroll reporting and NSSF calculations.<br/><br/>' +
          '<strong>Date of birth</strong> determines age-based payroll rules and anniversary reminders.<br/><br/>' +
          'Fill in First name and Last name to try it out.',
        side: 'right',
      },
      {
        element: '[data-tour="employment-card"]',
        title: 'Step 3 — Employment details',
        description:
          'This section sets the <strong>financial and organisational relationship</strong>:<br/><br/>' +
          '• <strong>Hire date</strong> — determines leave accrual start, probation period end, and service anniversary<br/>' +
          '• <strong>Employment type</strong> — controls which payroll rules apply (full-time, daily, expat, contractor)<br/>' +
          '• <strong>Department</strong> — used for cost-centre reporting and approval routing<br/>' +
          '• <strong>Work location</strong> — used for site-based headcount reports<br/><br/>' +
          'Set a hire date and select a department.',
        side: 'right',
      },
      {
        element: '[data-tour="contact-card"]',
        title: 'Step 4 — Contact details',
        description:
          '<strong>Email</strong> is used for:<br/>' +
          '• System login (if the employee gets an ERP account)<br/>' +
          '• Payslip email delivery<br/>' +
          '• Approval notifications<br/><br/>' +
          '<strong>Phone</strong> is shown in the employee directory and used by HR for emergency contact and WhatsApp notifications.<br/><br/>' +
          'Both fields are optional at creation — they can be added later from the employee profile.',
        side: 'right',
      },
      {
        element: '[data-tour="save-employee-btn"]',
        title: 'Step 5 — Create the employee',
        description:
          'Click <strong>Create employee</strong> to save the record and open the employee profile.<br/><br/>' +
          'The system validates required fields before saving — you will see inline error messages if anything is missing.<br/><br/>' +
          '<strong style="color:#f59e0b">Tour mode:</strong> clicking this button shows a toast but nothing is saved to the database.',
        side: 'top',
      },
      {
        title: '✅ New Employee — Tour Complete',
        description:
          'After creating the employee, open their <strong>profile page</strong> to complete the setup:<br/><br/>' +
          '• <strong>Shift tab</strong> → assign a working shift (required before attendance tracking works)<br/>' +
          '• <strong>Salary tab</strong> → set base salary, allowances, and deductions<br/>' +
          '• <strong>Documents tab</strong> → upload signed contract, ID copy, passport<br/>' +
          '• <strong>Leave tab</strong> → check that leave entitlements were created correctly<br/><br/>' +
          'The employee can punch in via the <strong>mobile app</strong> the moment their shift is assigned.<br/><br/>' +
          'Click <strong>Done ✓</strong> to exit the tour.',
      },
    ],
  },

  // ── Purchase Order — full procure-to-pay workflow ──────────────────────────
  'purchase-order': {
    title: 'Create a Purchase Order',
    startRoute: '/procurement/purchase-orders',
    startElement: '[data-tour="new-po-btn"]',
    steps: [
      {
        title: '🛒 Purchase Order — Interactive Tour',
        description:
          'This tour covers the <strong>full procure-to-pay lifecycle</strong>: creating a PO, adding line items, submitting for approval, receiving goods, and generating the AP invoice.<br/><br/>' +
          '<strong style="color:#f59e0b">Tour mode is active</strong> — you interact with the real form, but <strong>nothing is saved</strong>.<br/><br/>' +
          'Press <strong>Next →</strong> to begin.',
      },
      {
        element: '[data-tour="new-po-btn"]',
        title: 'Step 1 — The PO pipeline',
        description:
          'The Purchase Orders list shows every PO with its current status. The full lifecycle is:<br/><br/>' +
          '<strong>Draft → Pending Approval → Approved → Ready to Issue → Goods Received → Completed</strong><br/><br/>' +
          'Each status is timestamped and shows who actioned it, creating a full audit trail. Press <strong>Next →</strong> to create a new PO.',
        side: 'bottom',
        nextRoute: '/procurement/purchase-orders/new',
        nextElement: '[data-tour="po-purpose-row"]',
      },
      {
        element: '[data-tour="po-purpose-row"]',
        title: 'Step 2 — Purchase purpose',
        description:
          'Select what the purchase is for — this controls <strong>cost routing</strong>:<br/><br/>' +
          '• <strong>General Stock</strong> — items go into your warehouse inventory. Cost posts to the stock account.<br/>' +
          '• <strong>Project Supply</strong> — items are for a specific project. Cost posts to that project\'s budget (shows in Project P&L).<br/>' +
          '• <strong>Manufacturing / BOM</strong> — materials for a production order. Cost posts to WIP.<br/><br/>' +
          'Choosing the right purpose is critical — it cannot be changed after submission.',
        side: 'bottom',
      },
      {
        element: '[data-tour="po-vendor-row"]',
        title: 'Step 3 — Vendor and currency',
        description:
          '<strong>Vendor</strong>: Type to search your approved vendor master. Only active vendors appear.<br/>' +
          'The vendor\'s <em>payment terms</em> and <em>default bank account</em> pre-fill on the AP invoice automatically.<br/><br/>' +
          '<strong>Currency</strong>: Set the PO currency (IQD, USD, EUR, etc.). Multi-currency POs convert to your base currency using the FX rate set in the next section.<br/><br/>' +
          'If the vendor is not in the master list, go to Procurement → Vendors and create them first.',
        side: 'bottom',
      },
      {
        element: '[data-tour="po-delivery-row"]',
        title: 'Step 4 — Delivery date, analytic account & FX rate',
        description:
          '<strong>Analytic Account</strong>: Links cost to a cost centre. Auto-fills when you select a project above.<br/><br/>' +
          '<strong>Expected Delivery</strong>: Used to trigger overdue alerts. When this date passes without a goods-receipt, the system flags the PO as overdue.<br/><br/>' +
          '<strong>FX Rate</strong>: Auto-fills from the latest rate in Finance → FX Rates. Used to convert the PO total to IQD for reporting. Override it if you have a contract rate.',
        side: 'bottom',
      },
      {
        element: '[data-tour="po-lines-card"]',
        title: 'Step 5 — Order lines',
        description:
          'Add every item you are ordering. Each line has:<br/><br/>' +
          '• <strong>Product</strong> — search from your product catalogue (pre-fills description and UOM) or type "Custom item" for ad-hoc purchases<br/>' +
          '• <strong>Description</strong> — editable even when a product is selected<br/>' +
          '• <strong>UOM</strong> — unit of measure (pc, kg, m, box…)<br/>' +
          '• <strong>Qty</strong> and <strong>Unit Price</strong> — the line total calculates automatically<br/><br/>' +
          'The <strong>running total</strong> at the bottom updates as you add or edit lines.',
        side: 'top',
      },
      {
        element: '[data-tour="po-add-line"]',
        title: 'Step 6 — Add more lines',
        description:
          'Click <strong>+ Add Line</strong> to order multiple items on the same PO. Grouping related items on one PO simplifies the vendor relationship and approval process.<br/><br/>' +
          '<strong>Tip:</strong> For large orders, you can pre-fill lines from a Bill of Materials by opening the PO from a Manufacturing Order — lines import automatically.<br/><br/>' +
          'Try clicking + Add Line to see a new row appear.',
        side: 'top',
      },
      {
        element: '[data-tour="submit-po-btn"]',
        title: 'Step 7 — Submit for approval',
        description:
          'Click <strong>Create Purchase Order</strong> to submit the PO into the <strong>approval workflow</strong>.<br/><br/>' +
          'The PO routes to the assigned approver based on your company\'s approval thresholds (configured in Settings → Procurement). The approver receives an email and sees the PO in their Approval Queue.<br/><br/>' +
          '<strong style="color:#f59e0b">Tour mode:</strong> clicking Submit shows a toast but nothing is saved.',
        side: 'top',
      },
      {
        title: '📋 After submission — Approval queue',
        description:
          'After submission, the PO status changes to <strong>Pending Approval</strong>.<br/><br/>' +
          'The approver goes to <strong>Procurement → Approval Queue</strong> where they can:<br/>' +
          '• Review all PO details, line items, and pricing<br/>' +
          '• <strong>Approve</strong> — PO moves to Approved → Ready to Issue<br/>' +
          '• <strong>Reject</strong> — PO returns to Draft with a rejection reason; the requester gets notified<br/><br/>' +
          'Once approved, the PO is issued to the vendor (printed or emailed from the PO detail page).',
      },
      {
        title: '📦 Receiving goods',
        description:
          'When goods arrive, open the approved PO and click <strong>Receive</strong>.<br/><br/>' +
          'Enter the <strong>actual quantity received</strong> per line. <strong>Partial receipts are supported</strong> — remaining quantities stay open and can be received later.<br/><br/>' +
          'The system records:<br/>' +
          '• Received qty vs ordered qty per line<br/>' +
          '• Date and user who recorded the receipt<br/>' +
          '• Any variance (over/under-receipt)<br/><br/>' +
          'Goods received automatically updates inventory stock levels.',
      },
      {
        title: '🧾 AP Invoice & payment',
        description:
          'After receiving goods, go to <strong>Finance → Accounts Payable → New Invoice</strong>.<br/><br/>' +
          'Reference this PO number and the system pre-fills:<br/>' +
          '• Vendor, currency, and payment terms<br/>' +
          '• Line items and amounts from the goods receipt<br/><br/>' +
          'The system enforces <strong>3-way matching</strong> (PO qty = received qty = invoiced qty) to prevent overpayment.<br/><br/>' +
          'Once the AP invoice is posted, create a <strong>Payment Voucher</strong> to record the bank transfer to the vendor.',
      },
      {
        title: '✅ Purchase Order — Tour Complete',
        description:
          'You have seen the <strong>full procure-to-pay cycle</strong>:<br/><br/>' +
          '<strong>Draft → Pending Approval → Approved → Issued → Goods Received → AP Invoice → Payment Voucher → Paid → Completed</strong><br/><br/>' +
          'Each stage is fully auditable — who created it, who approved it, when goods were received, and when payment was made are all recorded with timestamps.<br/><br/>' +
          'Click <strong>Done ✓</strong> to exit the tour.',
      },
    ],
  },
}

// ── Informational tours (no element targeting, no tour-mode mutation blocking) ─

const informationalTours: Record<string, { title: string; steps: DriveStep[] }> = {

  'bank-recon': {
    title: 'Bank Reconciliation',
    steps: [
      {
        popover: {
          title: '🏦 Bank Reconciliation — Walkthrough',
          description:
            'Bank reconciliation matches your <strong>GL bank account</strong> to the <strong>actual bank statement</strong>, catching missing entries and errors.<br/><br/>' +
            'This tour explains the full process. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Select account and period',
          description:
            'Go to <strong>Finance → Bank Reconciliation</strong>.<br/><br/>' +
            'Choose the <strong>bank account</strong> (each GL bank account is reconciled separately) and the <strong>month</strong> to reconcile.<br/><br/>' +
            'The system shows the <strong>GL closing balance</strong> for that account at the end of the selected period. This is the balance you need to reconcile to.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Import the bank statement',
          description:
            'Upload a <strong>CSV bank statement</strong> from your bank portal, or enter statement lines manually.<br/><br/>' +
            'Each line represents one transaction from the bank:<br/>' +
            '• Date<br/>• Reference number<br/>• Description<br/>• Debit / Credit amount<br/><br/>' +
            'The statement\'s <strong>closing balance</strong> is what you are reconciling to.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Match transactions',
          description:
            'The system <strong>auto-suggests matches</strong> between statement lines and GL journal entries based on date, amount, and reference.<br/><br/>' +
            '• <strong>Confirm</strong> a correct match — it is locked and removed from the unmatched list<br/>' +
            '• <strong>Skip</strong> — leave it for manual review<br/>' +
            '• <strong>Manual match</strong> — drag a statement line to a GL entry manually if auto-match missed it<br/><br/>' +
            'Work through all lines until the outstanding difference approaches zero.',
        },
      },
      {
        popover: {
          title: 'Step 4 — Post missing entries',
          description:
            'For transactions in the bank statement that have <strong>no corresponding GL entry</strong> — such as bank charges, interest earned, or returned cheques — you can post directly from the reconciliation screen.<br/><br/>' +
            'Click <strong>Post Journal</strong> next to the unmatched statement line. This opens a pre-filled journal entry form. Save it and the new entry is matched automatically.',
        },
      },
      {
        popover: {
          title: 'Step 5 — Complete the reconciliation',
          description:
            'When the <strong>outstanding difference shows zero</strong>, click <strong>Complete</strong>.<br/><br/>' +
            'The reconciliation is <strong>locked and dated</strong> for this period. A completed reconciliation cannot be reopened — if you find an error later, post a correction journal and re-reconcile the following month.<br/><br/>' +
            '✅ <strong>Best practice:</strong> complete the reconciliation before closing each accounting period. Never close a period with an unreconciled bank account.',
        },
      },
    ],
  },

  'project': {
    title: 'Create a Project',
    steps: [
      {
        popover: {
          title: '🏗️ Project Setup — Walkthrough',
          description:
            'Projects track costs, revenue, and profitability for a specific job, contract, or initiative.<br/><br/>' +
            'This tour walks through creating a project and setting up budget, contracts, and billing. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Create the project',
          description:
            'Go to <strong>Projects → New Project</strong>.<br/><br/>' +
            'Set:<br/>' +
            '• <strong>Project code</strong> — used on POs, timesheets, and reports (e.g., PRJ-2026-042)<br/>' +
            '• <strong>Project name</strong> — displayed in menus and reports<br/>' +
            '• <strong>Project type</strong> — Construction, Service, or Internal<br/>' +
            '• <strong>Project manager</strong> — receives budget alerts and is responsible for approvals<br/><br/>' +
            'The system automatically creates a <strong>linked analytic account</strong> — this is how costs from POs and invoices are tracked against this project.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Set budget lines',
          description:
            'Open the <strong>Budget tab</strong>. Add cost categories with their planned amounts:<br/><br/>' +
            '• Materials, Labour, Subcontractors, Equipment, Overhead…<br/><br/>' +
            'Once budget lines are set, every AP invoice and PO referencing this project shows as <strong>Actual spend vs Budget</strong> in real time.<br/><br/>' +
            'You will see a warning when a category reaches 80% of budget, and a block when it exceeds 100% (configurable in Settings → Projects).',
        },
      },
      {
        popover: {
          title: 'Step 3 — Add the customer contract',
          description:
            'Open the <strong>Contracts tab</strong>. Link the customer contract:<br/><br/>' +
            '• <strong>Contract value</strong> — total billable amount<br/>' +
            '• <strong>Billing method</strong> — Milestone-based or Percentage-complete<br/>' +
            '• For milestone billing: add each milestone with its name, % weight, and expected date<br/><br/>' +
            'The contract value is used to calculate the project\'s gross margin: Contract value − Actual costs = Gross profit.',
        },
      },
      {
        popover: {
          title: 'Step 4 — Track costs in real time',
          description:
            'As work progresses, costs post to this project automatically when someone references the <strong>project code</strong> on:<br/><br/>' +
            '• Purchase Orders<br/>' +
            '• AP Invoices (line-level cost allocation)<br/>' +
            '• Payroll (if employees are assigned to this project via timesheets)<br/><br/>' +
            'Open the project\'s <strong>Budget tab</strong> at any time to see the live Actual vs Budget comparison.',
        },
      },
      {
        popover: {
          title: 'Step 5 — Generate a customer invoice',
          description:
            'When a milestone is reached or a billing period closes:<br/><br/>' +
            '1. Open the <strong>Contracts tab</strong><br/>' +
            '2. Mark the relevant milestone as <strong>Reached</strong><br/>' +
            '3. Click <strong>Generate Invoice</strong><br/><br/>' +
            'The invoice pre-fills from the contract: customer, amount, and line description. Review and post it to Accounts Receivable.<br/><br/>' +
            '✅ The project\'s revenue recognition updates automatically each time an invoice is posted.',
        },
      },
    ],
  },
}

// ── Public API ────────────────────────────────────────────────────────────────

export const tours: Record<string, { title: string }> = Object.fromEntries([
  ...Object.entries(interactiveTours).map(([k, v]) => [k, { title: v.title }]),
  ...Object.entries(informationalTours).map(([k, v]) => [k, { title: v.title }]),
])

export function startTour(
  tourKey: string,
  navigate: (path: string) => void,
  theme: ThemeTokens,
  onDestroyed?: () => void,
): void {
  import('driver.js').then(({ driver }) => {
    injectTourStyles(theme)
    const iTour = interactiveTours[tourKey]
    const iInfo = informationalTours[tourKey]

    if (iTour) {
      useTourStore.getState().activate(tourKey, iTour.title, iTour.steps.length)
      navigate(iTour.startRoute)

      const isLast = (i: number) => i === iTour.steps.length - 1

      const driveSteps: DriveStep[] = iTour.steps.map((step, i): DriveStep => ({
        element: step.element,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          ...(step.nextRoute && !isLast(i)
            ? {
                onNextClick: (_el, _s, { driver: d }) => {
                  const nextEl = step.nextElement ?? iTour.steps[i + 1]?.element
                  navigate(step.nextRoute!)
                  useTourStore.getState().setStep(i + 1)
                  waitForElement(nextEl, () => d.moveNext())
                },
              }
            : !isLast(i)
            ? {
                onNextClick: (_el, _s, { driver: d }) => {
                  useTourStore.getState().setStep(i + 1)
                  d.moveNext()
                },
              }
            : {}),
        },
      }))

      const startDriver = () => {
        const driverObj = driver({
          showProgress: true,
          progressText: '{{current}} of {{total}}',
          animate: true,
          overlayOpacity: 0.45,
          stagePadding: 6,
          popoverClass: 'fnc-help-tour',
          allowClose: true,
          doneBtnText: 'Done ✓',
          steps: driveSteps,
          onDestroyStarted: () => {
            driverObj.destroy()
            useTourStore.getState().deactivate()
            removeTourStyles()
            onDestroyed?.()
          },
        })
        driverObj.drive()
      }

      waitForElement(iTour.startElement, startDriver, 4000)

    } else if (iInfo) {
      const driverObj = driver({
        showProgress: true,
        progressText: '{{current}} of {{total}}',
        animate: true,
        overlayOpacity: 0.45,
        stagePadding: 6,
        popoverClass: 'fnc-help-tour',
        allowClose: true,
        doneBtnText: 'Done ✓',
        steps: iInfo.steps,
        onDestroyStarted: () => {
          driverObj.destroy()
          removeTourStyles()
          onDestroyed?.()
        },
      })
      driverObj.drive()
    }
  })
}
