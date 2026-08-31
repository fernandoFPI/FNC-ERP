import type { DriveStep } from 'driver.js'
import { useTourStore } from '../../store/tourStore'
import type { ThemeTokens } from '../../theme/tokens'
import { injectTourStyles, removeTourStyles } from './tourStyles'
import { TOUR_DEMO_PO_ID } from './tourDemoPO'

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
  if (!selector) {
    setTimeout(cb, 150)
    return
  }
  if (document.querySelector(selector)) {
    setTimeout(cb, 150)
    return
  }
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
          'This tour covers the <strong>full procurement pipeline</strong> — not just filling in the form: creating a PO, the internal pricing and verification stages, approval, buying, receiving, and the finance audit that closes it out.<br/><br/>' +
          '<strong style="color:#f59e0b">Tour mode is active</strong> — you interact with the real form, but <strong>nothing is saved</strong>.<br/><br/>' +
          'Press <strong>Next →</strong> to begin.',
      },
      {
        element: '[data-tour="new-po-btn"]',
        title: 'Step 1 — The PO pipeline',
        description:
          'The Purchase Orders list shows every PO with its current status. The full lifecycle is:<br/><br/>' +
          '<strong>Draft → Inventory Check → Store Pricing → Market Pricing → Price Verification → Pending Approval → Approved → Items Bought → Goods Received → Finance Audit → Invoiced → Completed</strong><br/><br/>' +
          "That looks long, but most of it happens without anyone doing anything — you'll see which steps are automatic as we go. Every status change is timestamped and shows who actioned it. Press <strong>Next →</strong> to create a new PO.",
        side: 'bottom',
        nextRoute: '/procurement/purchase-orders/new',
        nextElement: '[data-tour="po-purpose-row"]',
      },
      {
        element: '[data-tour="po-purpose-row"]',
        title: 'Step 2 — Purchase purpose',
        description:
          'Select what the purchase is for — this controls <strong>cost routing</strong>:<br/><br/>' +
          '• <strong>General Stock</strong> — items go into your warehouse inventory.<br/>' +
          "• <strong>Project Supply</strong> — items are for a specific project. Cost posts to that project's budget, and you can mark it for direct-to-jobsite delivery so it skips warehouse stock entirely.<br/>" +
          '• <strong>Manufacturing / BOM</strong> — materials for a production order.<br/><br/>' +
          'Priority also matters here: an <strong>Emergency</strong> PO skips Inventory Check and both pricing stages entirely, going straight from Draft to approval.<br/><br/>' +
          '<strong>For this walkthrough, click Project Supply</strong> — the rest of the tour is built around it, since it is also the purpose that unlocks direct-to-jobsite delivery, which you will see later. The <strong>Project</strong> field that appears is disabled during the tour on purpose — picking a real one isn\'t needed here, so just leave it and move on.',
        side: 'bottom',
      },
      {
        element: '[data-tour="po-vendor-row"]',
        title: 'Step 3 — Vendor and currency (both optional right now)',
        description:
          "<strong>Vendor</strong>: often unknown this early — leave it blank. It genuinely doesn't need to be set until Market Pricing, once you actually have a quote in hand.<br/><br/>" +
          '<strong>Currency</strong>: set a header currency and estimated FX rate if you already know it will be a foreign-currency purchase — but the number that actually matters is set for real at Market Pricing, per line, from a vendor quote.<br/><br/>' +
          "Don't worry about getting either exactly right at this stage — that's the whole point of deferring them.",
        side: 'bottom',
      },
      {
        element: '[data-tour="po-delivery-row"]',
        title: 'Step 4 — Delivery date, analytic account & FX rate',
        description:
          '<strong>Analytic Account</strong>: links cost to a cost centre. Auto-fills when you select a project above.<br/><br/>' +
          '<strong>Expected Delivery</strong>: used to flag the PO as overdue if it passes with nothing received yet.<br/><br/>' +
          '<strong>FX Rate</strong>: only relevant if you picked a non-base header currency above — it is a starting estimate, not the number that gets posted.',
        side: 'bottom',
      },
      {
        element: '[data-tour="po-lines-card"]',
        title: 'Step 5 — Order lines',
        description:
          'Add every item you are ordering. Each line has:<br/><br/>' +
          '• <strong>Product</strong> — search your product catalogue, or leave it as <strong>Custom item</strong> and just type a description if it is not catalogued yet<br/>' +
          '• <strong>UOM</strong>, <strong>Qty</strong>, and a <strong>unit price</strong> — treat this price as a rough estimate; the real one gets set later at Market Pricing and again at Buying<br/><br/>' +
          'A Custom item line is not lost once it arrives — see the New Items step later in this tour.',
        side: 'top',
      },
      {
        element: '[data-tour="po-add-line"]',
        title: 'Step 6 — Add more lines',
        description:
          'Click <strong>+ Add Line</strong> to order multiple items on the same PO. Grouping related items on one PO simplifies the vendor relationship and approval process.<br/><br/>' +
          'Try clicking + Add Line to see a new row appear.',
        side: 'top',
      },
      {
        element: '[data-tour="submit-po-btn"]',
        title: 'Step 7 — Create the PO',
        description:
          'Click <strong>Create Purchase Order</strong> to submit it into <strong>Inventory Check</strong> — the first stage of the pipeline, not approval yet.<br/><br/>' +
          '<strong style="color:#f59e0b">Tour mode:</strong> clicking this shows a toast but nothing is saved. Press <strong>Next →</strong> and we\'ll continue on a walkthrough PO — no data is real from here on either, but every screen is.',
        side: 'top',
        nextRoute: `/procurement/purchase-orders/${TOUR_DEMO_PO_ID}?tourStatus=inventory_check`,
        nextElement: '[data-tour="po-inventory-check"]',
      },
      {
        element: '[data-tour="po-inventory-check"]',
        title: '📦 Inventory check',
        description:
          "The PO owner records how much of each line is already sitting in stock — try changing a value below.<br/><br/>" +
          '• A line <strong>fully</strong> covered from stock skips straight to <strong>Ready to Issue</strong> — no pricing, no approval, nothing more to buy.<br/>' +
          '• Whatever is still needed continues on to pricing.<br/><br/>' +
          'This is also where the value of the from-stock portion gets set — automatically, no one has to type it in (see the next step). Press <strong>Next →</strong> to continue.',
        side: 'top',
        nextRoute: `/procurement/purchase-orders/${TOUR_DEMO_PO_ID}?tourStatus=market_pricing`,
        nextElement: '[data-tour="po-market-pricing"]',
      },
      {
        element: '[data-tour="po-market-pricing"]',
        title: '💲 Store Pricing (skipped) & Market Pricing',
        description:
          '<strong>Store Pricing</strong> — valuing the from-stock portion — is fully automatic: the system fills it in from the last real vendor price recorded for that product, and moves straight on. No one sees a manual step for this anymore, which is why this tour skipped straight past it.<br/><br/>' +
          '<strong>Market Pricing</strong>, below, is where a real vendor and a real price and currency get attached to the portion actually being purchased — done by whoever holds the <strong>Procurement Officer</strong> position, based on an actual quote. Try entering a price on a line.',
        side: 'top',
        nextRoute: `/procurement/purchase-orders/${TOUR_DEMO_PO_ID}?tourStatus=price_verification`,
        nextElement: '[data-tour="po-price-verification"]',
      },
      {
        element: '[data-tour="po-price-verification"]',
        title: '🔍 Price verification',
        description:
          'A second reviewer (<strong>Procurement 2nd</strong>) checks the market price before it goes any further, and can bounce it back to Market Pricing if something looks wrong.<br/><br/>' +
          'This is a deliberate second set of eyes on the number that is about to become the PO total — press <strong>Next →</strong> once you have had a look.',
        side: 'top',
        nextRoute: `/procurement/purchase-orders/${TOUR_DEMO_PO_ID}?tourStatus=pending_approval`,
        nextElement: '[data-tour="po-approve-btn"]',
      },
      {
        element: '[data-tour="po-approve-btn"]',
        title: '✅ Approval',
        description:
          "Approval routes to the right approver based on your company's thresholds and PO positions, from the <strong>Approval Queue</strong>. A rejection sends the PO back to Draft with a reason — fix it and resubmit.<br/><br/>" +
          "Once approved, the PO doesn't sit and wait — it chains straight into <strong>Items Bought</strong> automatically, which is where we're headed next.<br/><br/>" +
          '<strong style="color:#f59e0b">Tour mode:</strong> clicking Approve PO shows a toast but nothing is saved.',
        side: 'top',
        nextRoute: `/procurement/purchase-orders/${TOUR_DEMO_PO_ID}?tourStatus=items_bought`,
        nextElement: '[data-tour="po-actual-price-input"]',
      },
      {
        element: '[data-tour="po-actual-price-input"]',
        title: '🛍️ Buying — the actual price',
        description:
          'The buyer works through the Items Bought checklist, ticking each line as bought with the checkbox on the left.<br/><br/>' +
          'For each line, they enter the <strong>actual price paid</strong> here — the real number from the receipt or vendor invoice, not the original estimate. This is the figure that flows through to Finance, so it matters more than anything entered earlier in the PO. Try it on a line, then press <strong>Next →</strong>.',
        side: 'top',
        nextRoute: `/procurement/purchase-orders/${TOUR_DEMO_PO_ID}/receive`,
        nextElement: '[data-tour="po-jobsite-photos"]',
      },
      {
        element: '[data-tour="po-jobsite-photos"]',
        title: '📥 Receiving — direct to jobsite',
        description:
          "Because this PO is Project Supply and delivered straight to the jobsite (not the warehouse), the normal Record Receipt screen simplifies down to this: attach a vendor-receipt photo and a materials photo, then click <strong>Mark Delivered</strong> in the top right.<br/><br/>" +
          "It never touches warehouse stock — the cost posts straight to the project instead.<br/><br/>" +
          '<em>A regular (warehouse) PO would show the full Record Receipt form here instead — enter quantities received per line, with partial receipts supported, and the same two required photos before it counts.</em><br/><br/>' +
          'Press <strong>Next →</strong> to continue — nothing here is saved either.',
        side: 'right',
        nextRoute: '/inventory/pending-catalog',
        nextElement: '[data-tour="pending-catalog-page"]',
      },
      {
        element: '[data-tour="pending-catalog-page"]',
        title: '🆕 New items get cataloged',
        description:
          'Remember the free-text <strong>Custom item</strong> line from Step 5? It is not lost once it arrives — it lands right here, in <strong>Inventory → New Items to Catalog</strong>, a real worklist the store keeper works through at their own pace (this is the actual page — whatever is listed below is real, not part of the demo).<br/><br/>' +
          'From there it either becomes a real, reorderable catalog product, or gets linked to an existing one if it turns out to already exist under a different name or in a different language.',
        side: 'top',
        nextRoute: `/procurement/purchase-orders/${TOUR_DEMO_PO_ID}?tourStatus=finance_audit`,
        nextElement: '[data-tour="po-finance-audit"]',
      },
      {
        element: '[data-tour="po-finance-audit"]',
        title: '✅ Finance audit & invoicing',
        description:
          'Before the PO can be marked <strong>Invoiced</strong>, Finance reviews the actual price entered during Buying against the original estimate — mark each line OK or Flagged.<br/><br/>' +
          'The funding source (vendor accounts payable, or an employee advance) is decided at Invoiced, and the vendor invoice gets created and matched against this PO. Press <strong>Next →</strong> to finish.',
        side: 'top',
      },
      {
        title: '✅ Purchase Order — Tour Complete',
        description:
          'The full pipeline you just walked through:<br/><br/>' +
          '<strong>Draft → Inventory Check → Store Pricing (auto) → Market Pricing → Price Verification → Pending Approval → Approved → Items Bought → Goods Received → Finance Audit → Invoiced → Completed</strong><br/><br/>' +
          'Every stage is fully auditable — who created it, who priced it, who approved it, when it was received, and what it actually cost are all recorded with timestamps.<br/><br/>' +
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
            "The statement's <strong>closing balance</strong> is what you are reconciling to.",
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

  project: {
    title: 'Project Management',
    steps: [
      {
        popover: {
          title: '🏗️ Projects — Walkthrough',
          description:
            'The Projects module tracks the <strong>cost side</strong> of your work — budgets, actual spend, team, and project status.<br/><br/>' +
            'For the <strong>billing side</strong> (contracts, milestones, and customer invoices), use the <strong>Contracts</strong> section. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Create a project',
          description:
            'Go to <strong>Projects → All Projects → New Project</strong>.<br/><br/>' +
            '• <strong>Project code</strong> — referenced on POs and AP invoices to route costs (e.g., PRJ-2026-042)<br/>' +
            '• <strong>Project type</strong> — Construction, Service, or Internal<br/>' +
            '• <strong>Project manager</strong> — receives budget alerts and approves project-linked POs<br/><br/>' +
            'The system automatically creates a linked <strong>analytic account</strong> — this is the cost centre that collects all spending for this project.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Set up the budget',
          description:
            'Open the project → <strong>Budget tab</strong>. Add a cost category line for each type of spend:<br/><br/>' +
            '• Materials<br/>• Labour<br/>• Subcontractors<br/>• Equipment hire<br/>• Overhead<br/><br/>' +
            'Enter the <strong>planned amount</strong> per category. Once set, every PO and AP invoice referencing this project shows as <strong>Actual vs Planned</strong> in real time.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Costs flow in automatically',
          description:
            'You do not manually enter costs into a project. They arrive automatically when someone references the <strong>project code</strong> on:<br/><br/>' +
            '• <strong>Purchase Orders</strong> — purpose set to "Project Supply"<br/>' +
            "• <strong>AP invoices</strong> — cost allocation line referencing this project's analytic account<br/>" +
            '• <strong>Manufacturing orders</strong> — when materials are issued for this project<br/><br/>' +
            'The Budget tab updates in real time as transactions are posted.',
        },
      },
      {
        popover: {
          title: 'Step 4 — Budget alerts',
          description:
            'Budget warnings trigger automatically:<br/><br/>' +
            '• <strong>⚠️ 80% warning</strong> — the category is highlighted in amber; the project manager is notified<br/>' +
            '• <strong>🔴 100% exceeded</strong> — the category turns red; further PO submission for this category may be blocked (configurable in Settings → Projects)<br/><br/>' +
            'This prevents cost overruns before they happen rather than discovering them at month-end.',
        },
      },
      {
        popover: {
          title: 'Step 5 — Project status and lifecycle',
          description:
            'Projects move through status stages:<br/><br/>' +
            '<strong>Draft → Active → On Hold → Completed → Closed</strong><br/><br/>' +
            'Each change is timestamped and logged in the <strong>History tab</strong>. When a project is Closed, it is locked and no further costs can be posted against it.<br/><br/>' +
            '📄 To invoice the customer, go to <strong>Projects → Contracts</strong> — the billing workflow is managed there separately.',
        },
      },
      {
        popover: {
          title: '✅ Projects Tour Complete',
          description:
            'Summary of the workflow:<br/><br/>' +
            '1. <strong>Create project</strong> → analytic account auto-created<br/>' +
            '2. <strong>Set budget lines</strong> → planned amounts per category<br/>' +
            '3. <strong>Reference project code</strong> on POs and AP invoices<br/>' +
            '4. <strong>Watch budget vs actual</strong> — alerts fire at 80% and 100%<br/>' +
            '5. <strong>Go to Contracts</strong> to manage billing and customer invoicing<br/><br/>' +
            'Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Contracts ────────────────────────────────────────────────────────────────
  contracts: {
    title: 'Project Contracts',
    steps: [
      {
        popover: {
          title: '📄 Contracts — Walkthrough',
          description:
            'Contracts manage the <strong>billing relationship</strong> with your customer — how much they owe, when, and in what instalments.<br/><br/>' +
            'This is separate from project cost tracking. A project tracks what you <em>spend</em>; a contract tracks what you <em>invoice</em>. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — The Contracts list',
          description:
            'Go to <strong>Projects → Contracts</strong>.<br/><br/>' +
            'The table shows every contract with:<br/>' +
            '• <strong>Contract value</strong> — the total agreed amount<br/>' +
            '• <strong>Invoiced</strong> — total AR invoices generated from this contract<br/>' +
            '• <strong>Outstanding</strong> = Value − Invoiced — how much is still to be billed<br/>' +
            '• <strong>Status</strong> — Draft, Active, or Completed<br/><br/>' +
            'This gives finance a real-time view of unbilled revenue across all projects.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Create a new contract',
          description:
            'Click <strong>New Contract</strong>. Fill in:<br/><br/>' +
            '• <strong>Project</strong> — the project this contract belongs to<br/>' +
            '• <strong>Contract name</strong> and <strong>client name</strong><br/>' +
            '• <strong>Contract value</strong> and <strong>currency</strong><br/>' +
            '• <strong>Billing method</strong> — see the next step<br/>' +
            '• <strong>Retention %</strong> — portion withheld until project completion (e.g., 10%)',
        },
      },
      {
        popover: {
          title: 'Step 3 — Billing methods',
          description:
            'Choose the method that matches your agreement:<br/><br/>' +
            '• <strong>Fixed Lump Sum</strong> — one invoice for the full contract value at a set point<br/>' +
            '• <strong>Milestone</strong> — invoice per completed milestone (most common for construction)<br/>' +
            '• <strong>Cost Plus / T&M</strong> — reimburse actual costs + agreed margin; invoice monthly<br/>' +
            '• <strong>Progress %</strong> — invoice based on % of work completed; update the percentage each period<br/><br/>' +
            'The billing method affects how invoices are generated but not the contract value.',
        },
      },
      {
        popover: {
          title: 'Step 4 — Add milestones',
          description:
            'For <strong>Milestone</strong> billing, open the contract after creating it and scroll to the <strong>Milestones section</strong>.<br/><br/>' +
            'Add each payment milestone:<br/>' +
            '• <strong>Sequence</strong> — display order (1, 2, 3…)<br/>' +
            '• <strong>Name</strong> — e.g., "Foundation Complete", "Structural Frame", "Handover"<br/>' +
            '• <strong>Billable Amount</strong> — the invoice amount when this milestone is reached<br/><br/>' +
            'All milestones start in <strong>Pending</strong> status.',
        },
      },
      {
        popover: {
          title: 'Step 5 — Mark reached and generate invoice',
          description:
            'When a milestone is completed on site:<br/><br/>' +
            '1. Open the contract → find the milestone row<br/>' +
            '2. Set its status to <strong>Reached</strong><br/>' +
            '3. Click <strong>Generate Invoice</strong> on the contract detail page<br/><br/>' +
            'The system creates an AR invoice pre-filled with:<br/>' +
            '• Client name and billing address<br/>' +
            '• Milestone name as the line description<br/>' +
            '• Milestone billable amount<br/><br/>' +
            'The milestone status changes to <strong>Invoiced</strong> and it no longer appears in the outstanding balance.',
        },
      },
      {
        popover: {
          title: '✅ Contracts Tour Complete',
          description:
            'The contracts workflow:<br/><br/>' +
            '<strong>Create contract → Set billing method → Add milestones → Mark reached → Generate invoice → Post to AR → Collect payment</strong><br/><br/>' +
            'Retention amounts are tracked automatically and released as a separate invoice when the project is completed.<br/><br/>' +
            "For billing questions, check the contract's <strong>Invoiced vs Outstanding</strong> columns — these are always up to date.<br/><br/>" +
            'Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Dashboard ────────────────────────────────────────────────────────────────
  'dashboard-overview': {
    title: 'Dashboard Overview',
    steps: [
      {
        popover: {
          title: '📊 Dashboard — Walkthrough',
          description:
            'The dashboard is your <strong>command centre</strong> — it shows live summaries from every module in one place. Press <strong>Next →</strong> to explore each section.',
        },
      },
      {
        popover: {
          title: 'Step 1 — KPI cards',
          description:
            'The top row shows your most critical numbers at a glance:<br/><br/>• <strong>Revenue (MTD)</strong> — invoiced revenue this month<br/>• <strong>Outstanding Payables</strong> — AP invoices awaiting payment<br/>• <strong>POs Pending Approval</strong> — purchase orders in your queue<br/>• <strong>Active Projects</strong> — projects currently in progress<br/><br/>These numbers update automatically as transactions are posted — no need to refresh.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Quick action tiles',
          description:
            'Below the KPIs are <strong>module tiles</strong> for every section of the system. Click any tile to navigate directly.<br/><br/>Tiles with badges (e.g., "3 pending") indicate items requiring your attention. The Approval Queue badge turns red when POs are overdue.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Company switcher',
          description:
            'Click your <strong>company name</strong> in the top-left of the sidebar at any time to switch between legal entities.<br/><br/>Your role, permissions, and data all change to reflect the selected company. The active company name is always visible in the sidebar header.',
        },
      },
      {
        popover: {
          title: '✅ Dashboard Tour Complete',
          description:
            'Use the dashboard as your starting point each day — it surfaces what needs attention without having to open individual modules.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Accounts Payable ─────────────────────────────────────────────────────────
  'accounts-payable': {
    title: 'Accounts Payable',
    steps: [
      {
        popover: {
          title: '🧾 Accounts Payable — Walkthrough',
          description:
            'Accounts Payable tracks money you owe to vendors. Every vendor invoice goes through AP before generating a payment. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Record a vendor invoice',
          description:
            'Go to <strong>Finance → Accounts Payable → New Invoice</strong>.<br/><br/>Fill in:<br/>• <strong>Vendor</strong> — must be in your vendor master<br/>• <strong>Invoice date &amp; due date</strong> — due date is calculated from payment terms<br/>• <strong>Lines</strong> — each line needs a GL account, description, and amount<br/>• <strong>PO Reference</strong> (optional) — links to an existing purchase order for 3-way matching',
        },
      },
      {
        popover: {
          title: 'Step 2 — 3-way matching',
          description:
            'When a PO Reference is set, the system verifies the invoice against:<br/><br/>1. <strong>PO quantity</strong> — what was ordered<br/>2. <strong>Goods receipt quantity</strong> — what was actually received<br/>3. <strong>Invoice quantity</strong> — what the vendor is charging for<br/><br/>Mismatches are flagged before posting. This prevents overpayment and vendor fraud.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Post the invoice',
          description:
            'Review all lines and click <strong>Post</strong>. Posting:<br/>• Moves the invoice from Draft to Posted<br/>• Creates the journal entry in the GL (Dr: Expense account, Cr: Accounts Payable)<br/>• Makes it available for payment voucher generation<br/><br/>Posted invoices cannot be edited. To correct an error, create a credit note.',
        },
      },
      {
        popover: {
          title: 'Step 4 — Generate a payment voucher',
          description:
            "From the posted invoice, click <strong>Generate PV</strong>.<br/><br/>The payment voucher is pre-filled with the vendor's bank account and the invoice amount. After the bank transfer is made:<br/>1. Upload the transfer confirmation document<br/>2. Click <strong>Mark as Paid</strong><br/><br/>The invoice status changes to Paid and the PV is locked.",
        },
      },
      {
        popover: {
          title: '✅ AP Tour Complete',
          description:
            'AP workflow: <strong>New Invoice → Post → Generate PV → Bank Transfer → Mark Paid</strong>.<br/><br/>View all pending invoices and their due dates in the AP Dashboard. Use the <strong>Overdue</strong> filter to prioritise urgent payments.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Accounts Receivable ──────────────────────────────────────────────────────
  'accounts-receivable': {
    title: 'Accounts Receivable',
    steps: [
      {
        popover: {
          title: '💰 Accounts Receivable — Walkthrough',
          description:
            'Accounts Receivable tracks money owed to you by customers. Invoices are generated from project contracts or created manually, then posted and collected. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Generate invoice from contract',
          description:
            'The fastest way to invoice is from a project contract:<br/><br/>1. Open <strong>Projects → [Your Project] → Contracts tab</strong><br/>2. Select the contract and mark milestones as reached<br/>3. Click <strong>Generate Invoice</strong><br/><br/>The AR invoice is pre-filled with the customer, line items, and amounts. Edit if needed, then post.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Manual AR invoice',
          description:
            'For ad-hoc invoices not tied to a contract:<br/><br/>Go to <strong>Finance → Accounts Receivable → New Invoice</strong>.<br/><br/>Select the customer, set the invoice date and due date, and add line items. Each line needs a revenue GL account and amount. Post when complete.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Send to customer',
          description:
            "After posting, click <strong>Send</strong> to email the invoice PDF directly to the customer's email address (taken from the customer record).<br/><br/>The PDF uses your company letterhead configured in Settings → Company.",
        },
      },
      {
        popover: {
          title: 'Step 4 — Record a payment',
          description:
            'When the customer pays, open the invoice and click <strong>Record Payment</strong>.<br/><br/>Enter:<br/>• <strong>Date received</strong><br/>• <strong>Amount</strong> — partial payments are supported<br/>• <strong>Bank account</strong> — where the money was deposited<br/><br/>The invoice shows a running <em>Amount Paid</em> and <em>Balance Due</em>.',
        },
      },
      {
        popover: {
          title: 'Step 5 — Aging report',
          description:
            'Monitor overdue invoices under <strong>Finance → AR → Aging</strong>.<br/><br/>Invoices are grouped by:<br/>• <strong>Current</strong> — not yet due<br/>• <strong>1–30 days</strong> overdue<br/>• <strong>31–60 days</strong> overdue<br/>• <strong>60+ days</strong> overdue<br/><br/>Use this view to prioritise collection calls and flag credit-risk customers.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Fixed Assets ─────────────────────────────────────────────────────────────
  'fixed-assets': {
    title: 'Fixed Assets',
    steps: [
      {
        popover: {
          title: '🏗️ Fixed Assets — Walkthrough',
          description:
            'Fixed Assets tracks long-term company property — vehicles, machinery, computers, furniture — and automates the monthly depreciation journal entries. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Register a new asset',
          description:
            'Go to <strong>Finance → Fixed Assets → New Asset</strong>.<br/><br/>Fill in:<br/>• <strong>Asset name</strong> and <strong>category</strong> (determines GL accounts and default useful life)<br/>• <strong>Acquisition cost</strong> — what the asset cost to purchase<br/>• <strong>Start date</strong> — when depreciation begins (usually purchase date)<br/>• <strong>Residual value</strong> — estimated value at end of useful life (often 0)',
        },
      },
      {
        popover: {
          title: 'Step 2 — Depreciation schedule',
          description:
            'The system automatically calculates a depreciation schedule based on the asset category settings:<br/><br/>• <strong>Straight-Line (SL)</strong> — equal monthly charge over the useful life<br/>• <strong>Declining Balance (DB)</strong> — fixed percentage of remaining book value each month<br/><br/>Open the asset and go to the <strong>Schedule tab</strong> to see each monthly entry before it is posted.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Run depreciation',
          description:
            'A background job runs at month-end and posts all pending depreciation journal entries automatically.<br/><br/>You can also trigger it manually from the asset detail page → <strong>Run Depreciation</strong>.<br/><br/>Each journal entry:<br/>• Dr: Depreciation Expense<br/>• Cr: Accumulated Depreciation<br/><br/>Depreciation entries are posted in <em>Draft</em> status — review before approving.',
        },
      },
      {
        popover: {
          title: 'Step 4 — Dispose or write off an asset',
          description:
            'When an asset is sold or scrapped:<br/><br/>1. Open the asset<br/>2. Click <strong>Dispose</strong><br/>3. Enter the sale price (or 0 for scrapping)<br/>4. Choose the disposal date<br/><br/>The system automatically calculates and posts:<br/>• Remove asset cost from the Fixed Assets account<br/>• Remove accumulated depreciation<br/>• Post gain (if sold above book value) or loss (if below) to the GL',
        },
      },
      {
        popover: {
          title: '✅ Fixed Assets Tour Complete',
          description:
            'Assets are visible in the <strong>Balance Sheet</strong> under Non-Current Assets. Book value = Cost − Accumulated Depreciation.<br/><br/>Asset categories are configured in <strong>Admin → Asset Categories</strong> — changes affect all future assets of that type.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Budget ───────────────────────────────────────────────────────────────────
  'budget-management': {
    title: 'GL Budget Management',
    steps: [
      {
        popover: {
          title: '📈 Budget Management — Walkthrough',
          description:
            'The Budget module lets you set planned spending amounts per GL account and compare them live against actual posted transactions. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Create a budget',
          description:
            'Go to <strong>Finance → GL Budgets → New Budget</strong>.<br/><br/>• <strong>Name</strong> — e.g., "FY2026 Operating Budget" or "Q3 Revised"<br/>• <strong>Fiscal year</strong> — the year this budget covers<br/>• <strong>Status</strong> — Draft while building, Active when approved<br/><br/>You can have multiple budgets per year (Original, Revised, Forecast) — only one is marked Active for variance reporting.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Add budget lines',
          description:
            'In the budget detail, add lines for each GL account you want to budget:<br/><br/>• Select the <strong>Account</strong> (revenue, expense, or cost-centre level)<br/>• Enter <strong>monthly amounts</strong> or a <strong>total annual amount</strong> (the system distributes it evenly)<br/><br/>For department-level control, use <strong>Analytic Accounts</strong> (cost centres) as the budget dimension instead of GL accounts.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Budget vs Actual report',
          description:
            'Open the budget and click <strong>View Report</strong> (or go to Finance → Reports → Budget Variance).<br/><br/>For each account you see:<br/>• <strong>Budget</strong> — the planned amount<br/>• <strong>Actual</strong> — total from posted journal entries in the same period<br/>• <strong>Variance</strong> (amount and %) — how far over or under budget<br/><br/>Drill down into any line to see the underlying transactions.',
        },
      },
      {
        popover: {
          title: '✅ Budget Tour Complete',
          description:
            'Budget alerts trigger when actual spend reaches <strong>80%</strong> of the budget line (warning) and <strong>100%</strong> (block, if configured).<br/><br/>Revise a budget by creating a new version — prior versions are preserved for audit. Never edit the original approved budget directly.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Expense Claims ───────────────────────────────────────────────────────────
  'expense-claims': {
    title: 'Expense Claims',
    steps: [
      {
        popover: {
          title: '🧳 Expense Claims — Walkthrough',
          description:
            'Expense Claims lets employees request reimbursement for business expenses they paid out of pocket. Finance reviews, approves, and reimburses via payment voucher. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Submit a claim',
          description:
            'Go to <strong>Finance → Expense Claims → New Claim</strong>.<br/><br/>Add each expense as a line:<br/>• <strong>Date</strong> of the expense<br/>• <strong>Category</strong> (Travel, Meals, Office Supplies, etc.) — determines the GL account<br/>• <strong>Amount</strong> and <strong>currency</strong><br/>• <strong>Receipt attachment</strong> — required above the policy threshold<br/><br/>Click <strong>Submit</strong> when complete.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Approval workflow',
          description:
            "After submission, the claim routes through two approval stages:<br/><br/>1. <strong>Line Manager approval</strong> — the employee's direct manager reviews and approves<br/>2. <strong>Finance approval</strong> — Finance verifies receipt amounts and GL account coding<br/><br/>The employee receives a notification at each stage. If rejected, a reason is required and the claim returns to Draft for revision.",
        },
      },
      {
        popover: {
          title: 'Step 3 — Post and reimburse',
          description:
            'Once Finance approves, click <strong>Post</strong>.<br/><br/>Posting creates a journal entry:<br/>• Dr: Expense account (per line category)<br/>• Cr: Employee Payable account<br/><br/>Then generate a <strong>Payment Voucher</strong> from the claim to pay the employee via bank transfer. Upload the transfer confirmation and mark it Paid.',
        },
      },
      {
        popover: {
          title: '✅ Expense Claims Tour Complete',
          description:
            'Expense categories and GL account mappings are configured in <strong>Finance → Settings → Expense Categories</strong>.<br/><br/>The policy threshold (above which receipts are required) is set in <strong>Settings → HR → Expense Policy</strong>.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Petty Cash ───────────────────────────────────────────────────────────────
  'petty-cash': {
    title: 'Petty Cash',
    steps: [
      {
        popover: {
          title: '💵 Petty Cash — Walkthrough',
          description:
            'Petty Cash manages a physical cash fund used for small day-to-day purchases. Each fund has its own GL account and a designated custodian. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Record a disbursement',
          description:
            'Go to <strong>Finance → Petty Cash → [Your Fund] → New Transaction → Disbursement</strong>.<br/><br/>Enter:<br/>• <strong>Date</strong> and <strong>amount</strong><br/>• <strong>Category</strong> (Office supplies, Travel, Maintenance…)<br/>• <strong>Purpose</strong> — a brief description<br/>• <strong>Receipt</strong> — attach the paper receipt<br/><br/>The fund balance decreases immediately.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Replenish the fund',
          description:
            'When the fund balance drops below the minimum level, click <strong>Replenish</strong>.<br/><br/>The system:<br/>1. Calculates the total disbursed since last replenishment<br/>2. Creates a <strong>Payment Voucher</strong> for that amount<br/>3. Posts a journal entry: Dr: Petty Cash account, Cr: Bank account<br/><br/>After the physical cash is handed over, mark the voucher as Paid.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Reconcile the fund',
          description:
            'Periodically (typically monthly) the custodian <strong>counts the physical cash</strong> and compares it to the system balance.<br/><br/>If there is a discrepancy:<br/>• Click <strong>Adjustment</strong><br/>• Enter the difference amount and a reason (e.g., "Lost receipt — stationery purchase")<br/><br/>The adjustment posts a journal entry to the Petty Cash Variance account.',
        },
      },
      {
        popover: {
          title: '✅ Petty Cash Tour Complete',
          description:
            'Each petty cash fund is tied to a specific GL account, custodian, and fund limit.<br/><br/>Multiple funds can exist — one per office, department, or project site. Configure them in <strong>Finance → Settings → Petty Cash Funds</strong>.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Payment Vouchers ─────────────────────────────────────────────────────────
  'payment-vouchers': {
    title: 'Payment Vouchers',
    steps: [
      {
        popover: {
          title: '📋 Payment Vouchers — Walkthrough',
          description:
            'A Payment Voucher (PV) is a formal authorisation document created for every bank payment. It links the AP invoice to the bank transfer record. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Generate from an AP invoice',
          description:
            'PVs are generated from <strong>posted</strong> AP invoices only. Open the invoice and click <strong>Generate PV</strong>.<br/><br/>The voucher pre-fills:<br/>• Vendor name and bank account details<br/>• Invoice number and amount<br/>• Currency and payment date<br/><br/>Review and save. The PV is now in <strong>Pending</strong> status.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Execute the payment',
          description:
            'Make the bank transfer using your banking system outside the ERP.<br/><br/>Then return to the PV and:<br/>1. Enter the actual <strong>transfer date</strong> and <strong>reference number</strong><br/>2. Upload the <strong>bank transfer confirmation</strong> (PDF or image)<br/>3. Click <strong>Mark as Paid</strong><br/><br/>The linked AP invoice status changes to Paid automatically.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Print the PV',
          description:
            'Click <strong>PDF</strong> to download a formatted payment voucher with:<br/>• Company letterhead and stamp<br/>• Vendor details and payment amount<br/>• Invoice reference number<br/>• Authorisation signatures area<br/><br/>The PDF is ready to file or send to the vendor as payment notification.',
        },
      },
      {
        popover: {
          title: '✅ Payment Vouchers Tour Complete',
          description:
            'PVs can only be generated for <strong>posted</strong> invoices (not Draft).<br/><br/>The voucher stamp template is configured in <strong>Settings → Company → PV Template</strong>.<br/><br/>View all PVs in <strong>Finance → Payment Vouchers</strong>, filterable by vendor, date range, or payment status.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Payment Terms ────────────────────────────────────────────────────────────
  'payment-terms': {
    title: 'Payment Terms',
    steps: [
      {
        popover: {
          title: '📅 Payment Terms — Walkthrough',
          description:
            'Payment Terms define when invoices are due and how multi-instalment payments are structured. They are set on vendors and customers and auto-apply to all new invoices. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Create payment terms',
          description:
            'Go to <strong>Finance → Payment Terms → New Terms</strong>.<br/><br/>Name it descriptively (e.g., "Net 30", "50/50 Split", "Immediate").<br/><br/>Add instalment lines:<br/>• <strong>% of balance</strong> due<br/>• <strong>When</strong> it is due (e.g., 0 days after invoice = immediate, 30 days after = Net 30)<br/><br/>Example for 50/50: Line 1 = 50% on invoice; Line 2 = 50% after 30 days.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Apply to vendors and customers',
          description:
            'Set the default payment terms on a vendor or customer record. When a new invoice is created for that party, the due date is calculated automatically.<br/><br/>You can always <strong>override</strong> the terms on a specific invoice if the vendor agreed to different terms for that transaction.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Retention tracking',
          description:
            'For construction contracts with a <strong>retention clause</strong> (a % held back until project completion):<br/><br/>Go to <strong>Finance → Retention</strong>.<br/><br/>Retention amounts are tracked separately from the invoice balance. When the retention release milestone is reached, generate a retention invoice to collect the withheld amount.',
        },
      },
      {
        popover: {
          title: '✅ Payment Terms Tour Complete',
          description:
            'Payment terms directly affect:<br/>• AP aging (overdue date calculations)<br/>• AR collections (when to send reminders)<br/>• Cash flow forecasting (when money is expected in or out)<br/><br/>Review your terms setup before going live. Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Vendors ──────────────────────────────────────────────────────────────────
  vendors: {
    title: 'Vendor Management',
    steps: [
      {
        popover: {
          title: '🏭 Vendors — Walkthrough',
          description:
            'The Vendor master holds all supplier data used across Procurement, AP, and Payment Vouchers. Every PO and AP invoice must reference a vendor from this list. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Create a vendor',
          description:
            'Go to <strong>Procurement → Vendors → New Vendor</strong>.<br/><br/>Fill in:<br/>• <strong>Company name</strong> and <strong>contact person</strong><br/>• <strong>Tax ID / Trade licence number</strong><br/>• <strong>Country and address</strong><br/>• <strong>Payment terms</strong> — defaults to all AP invoices for this vendor<br/>• <strong>WHT category</strong> — withholding tax rate applied on invoices (if applicable)',
        },
      },
      {
        popover: {
          title: 'Step 2 — Add bank details',
          description:
            'Open the vendor record → <strong>Banking tab</strong>.<br/><br/>Add one or more bank accounts:<br/>• <strong>Bank name</strong> and <strong>branch</strong><br/>• <strong>Account number</strong> and <strong>IBAN</strong><br/>• <strong>Currency</strong><br/><br/>When generating a payment voucher for this vendor, the bank account auto-fills. You can select a different account per voucher if the vendor has multiple accounts.',
        },
      },
      {
        popover: {
          title: 'Step 3 — WHT and compliance',
          description:
            'If the vendor is subject to <strong>Withholding Tax (WHT)</strong>:<br/><br/>Set the WHT category on the vendor record. This automatically deducts the correct percentage from each AP invoice and accumulates the liability in the WHT Payable account.<br/><br/>At the end of each month, view the <strong>WHT Payable</strong> report in Finance to see the total WHT owed to the tax authority.',
        },
      },
      {
        popover: {
          title: '✅ Vendors Tour Complete',
          description:
            'Best practices:<br/>• <strong>Deactivate</strong> vendors you no longer use — they disappear from PO dropdowns but historical data is preserved<br/>• Add an internal <strong>Vendor Code</strong> for cross-referencing with your old system<br/>• Keep bank details <strong>up to date</strong> — stale account numbers are a common payment failure cause<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Approval Queue ───────────────────────────────────────────────────────────
  'approval-queue': {
    title: 'Approval Queue',
    steps: [
      {
        popover: {
          title: '✅ Approval Queue — Walkthrough',
          description:
            "The Approval Queue shows all Purchase Orders awaiting your sign-off. POs route here automatically after submission based on your company's approval thresholds. Press <strong>Next →</strong> to continue.",
        },
      },
      {
        popover: {
          title: 'Step 1 — Review a PO',
          description:
            'Each row in the queue shows:<br/>• PO number, vendor, and total amount<br/>• Requester and submission date<br/>• Days waiting<br/><br/>Click a PO to open the full detail view. Review:<br/>• <strong>Line items</strong> — what is being purchased and at what price<br/>• <strong>Vendor</strong> — is this an approved supplier?<br/>• <strong>Delivery date</strong> — is the timeline realistic?<br/>• <strong>Attached quotes or justification</strong>',
        },
      },
      {
        popover: {
          title: 'Step 2 — Approve',
          description:
            'Click <strong>Approve</strong> on the PO detail page.<br/><br/>If your approval level is the <em>final</em> level, the PO moves to <strong>Approved → Ready to Issue</strong>.<br/><br/>If there is a higher approval tier configured, it moves to <strong>Pending Next Level</strong> and routes to the next approver automatically.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Reject',
          description:
            'Click <strong>Reject</strong> and type a reason. The rejection reason is <strong>mandatory</strong> — it is shown to the requester in their notification.<br/><br/>The PO returns to <strong>Draft</strong> status. The requester can revise the PO and resubmit. Rejection history is preserved in the audit log.',
        },
      },
      {
        popover: {
          title: '✅ Approval Queue Tour Complete',
          description:
            'The sidebar badge shows your pending count — keep it at zero.<br/><br/>Approval thresholds and routing rules are configured in <strong>Settings → Procurement → Approval Workflow</strong>.<br/><br/>For bulk approvals (e.g., many small POs), use the <strong>Select All → Approve Selected</strong> action if available.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Inventory ────────────────────────────────────────────────────────────────
  inventory: {
    title: 'Inventory',
    steps: [
      {
        popover: {
          title: '📦 Inventory — Walkthrough',
          description:
            'Inventory tracks on-hand stock quantities across multiple storage locations. Every movement — receipt, transfer, issue, or adjustment — is logged with a timestamp and reference. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — View stock levels',
          description:
            'Go to <strong>Inventory → Stock</strong>.<br/><br/>The list shows every product with:<br/>• <strong>On-hand quantity</strong> per location<br/>• <strong>Reserved quantity</strong> (committed to a production order or PO)<br/>• <strong>Available quantity</strong> = On-hand − Reserved<br/>• <strong>Reorder point</strong> — when to place a new PO<br/><br/>Use the <strong>search and location filter</strong> to find items at a specific warehouse or site.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Stock transfer',
          description:
            'To move items between locations (e.g., main warehouse to project site):<br/><br/>Go to <strong>Inventory → Transfers → New Transfer</strong>.<br/>• Select <strong>source</strong> and <strong>destination</strong> locations<br/>• Add the products and quantities to move<br/>• Click <strong>Validate</strong><br/><br/>The system updates both locations immediately and logs the transfer for audit. Transfers cannot be reversed — create a reverse transfer if needed.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Stock adjustment',
          description:
            'For inventory count corrections or write-offs:<br/><br/>Go to <strong>Inventory → Adjustments → New Adjustment</strong>.<br/>• Select the location and product<br/>• Enter the <strong>actual counted quantity</strong> (the system calculates the difference)<br/>• Provide a <strong>reason</strong> (physical count, damage, theft, etc.)<br/><br/>The adjustment posts a journal entry to the Inventory Variance account.',
        },
      },
      {
        popover: {
          title: 'Step 4 — Inventory valuation',
          description:
            'Go to <strong>Inventory → Valuation</strong> to see total stock value.<br/><br/>Value = Quantity × Unit Cost (FIFO or weighted average, per product setting).<br/><br/>The valuation report is the source of truth for the <strong>Inventory asset</strong> on the Balance Sheet. Run it monthly and reconcile to the GL before closing the period.',
        },
      },
      {
        popover: {
          title: '✅ Inventory Tour Complete',
          description:
            'Stock movements are created automatically by:<br/>• Goods receipts on purchase orders<br/>• Manufacturing material issues and completions<br/>• Inter-company stock transfers<br/><br/>Manual movements (transfers, adjustments) require Inventory permission. Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Attendance ───────────────────────────────────────────────────────────────
  'hr-attendance': {
    title: 'Attendance',
    steps: [
      {
        popover: {
          title: '🕐 Attendance — Walkthrough',
          description:
            'The Attendance module shows when employees punch in and out, validates geofence compliance, and calculates monthly KPIs. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Monthly calendar view',
          description:
            'Open <strong>HR → Attendance → [Select Employee]</strong>.<br/><br/>The monthly calendar colour-codes each day:<br/>• 🟢 <strong>Green</strong> — present (punch-in recorded)<br/>• 🔴 <strong>Red</strong> — absent (no punch on a working day)<br/>• 🟡 <strong>Yellow</strong> — on approved leave<br/>• ⬜ <strong>Grey</strong> — weekend or holiday<br/><br/>Use the month/year selector at the top to navigate between periods.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Day detail',
          description:
            'Click any day on the calendar to open the punch detail:<br/><br/>• <strong>Punch-in time</strong> and <strong>Punch-out time</strong><br/>• <strong>Geofence status</strong> — Valid / Outside geofence<br/>• <strong>Distance from work location</strong> in metres<br/>• <strong>Total hours</strong> worked<br/>• <strong>Overtime hours</strong> (above the shift end time)<br/><br/>Punches outside the geofence are recorded but flagged in orange — they are included in totals but marked for review.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Monthly KPI summary',
          description:
            "The KPI row above the calendar shows the month's totals for the selected employee:<br/><br/>• <strong>Days Present</strong><br/>• <strong>Days Absent</strong><br/>• <strong>Total Hours</strong> worked<br/>• <strong>Overtime Hours</strong><br/>• <strong>Leave Days</strong> taken<br/><br/>These numbers flow directly into the <strong>Payroll</strong> calculation for the same period.",
        },
      },
      {
        popover: {
          title: 'Step 4 — Punch history table',
          description:
            'Go to <strong>HR → Attendance → Punch History</strong> for a tabular view of all punch records with:<br/>• Employee name<br/>• Date and exact punch time<br/>• Punch type (In / Out)<br/>• Geofence result<br/><br/>Filter by date range, department, or employee. Export to CSV for manual review or audits.',
        },
      },
      {
        popover: {
          title: '✅ Attendance Tour Complete',
          description:
            'Employees punch in and out exclusively via the <strong>mobile app</strong>. The app captures location automatically — no manual entry is allowed.<br/><br/>Geofence zones are configured per Work Location in <strong>HR → Settings → Work Locations</strong>.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Overtime ─────────────────────────────────────────────────────────────────
  'hr-overtime': {
    title: 'Overtime Approvals',
    steps: [
      {
        popover: {
          title: '⏰ Overtime — Walkthrough',
          description:
            'The Overtime module shows overtime hours logged via the mobile app and lets managers approve or reject them before they flow into payroll. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Pending requests',
          description:
            'Go to <strong>HR → Overtime</strong>.<br/><br/>Each card in the list shows:<br/>• <strong>Employee name</strong> and department<br/>• <strong>Date</strong> of the overtime<br/>• <strong>Regular hours</strong> worked that day<br/>• <strong>Overtime hours</strong> — the additional time above the shift end<br/><br/>Cards are sorted with the oldest first to prevent requests from expiring unreviewed.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Approve or reject',
          description:
            'Click a request to view full detail.<br/><br/>• <strong>Approve</strong> — the overtime hours are locked and included in the next payroll run. The employee is notified.<br/>• <strong>Reject</strong> — a mandatory reason field appears. The employee is notified with the reason. The hours are not included in payroll.<br/><br/>Rejected overtime can be resubmitted by the employee if the reason was an error.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Bulk approve',
          description:
            'When many requests are pending (e.g., after a busy project week), use <strong>Approve All</strong> to process every request in the list at once.<br/><br/>⚠️ Review the list carefully before bulk approving — once approved, overtime cannot be recalled without creating a payroll adjustment.',
        },
      },
      {
        popover: {
          title: '✅ Overtime Tour Complete',
          description:
            'Overtime multipliers (1.5×, 2×) are set per-employee in the <strong>shift configuration</strong>.<br/><br/>Approved overtime automatically feeds into the <strong>Payroll</strong> calculation for the corresponding month — no manual data entry needed.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Leave ────────────────────────────────────────────────────────────────────
  'hr-leave': {
    title: 'Leave Management',
    steps: [
      {
        popover: {
          title: '🌴 Leave Management — Walkthrough',
          description:
            'Leave Management handles employee leave requests, manager approvals, and balance tracking. All leave types — Annual, Sick, Unpaid, Maternity — are managed here. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Submit a leave request',
          description:
            'Go to <strong>HR → Leave → New Request</strong>.<br/><br/>The employee selects:<br/>• <strong>Leave type</strong> (Annual, Sick, Unpaid, etc.)<br/>• <strong>Start and end dates</strong><br/>• <strong>Reason</strong> (optional for Annual, required for Sick)<br/><br/>The system shows the <strong>remaining balance</strong> for that leave type before submission. Click <strong>Submit</strong> to send for approval.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Manager approval',
          description:
            "The request appears in the manager's leave queue. The manager can see:<br/>• The employee's leave history for context<br/>• Remaining balance before and after this request<br/>• Any overlapping leave from team members<br/><br/>• <strong>Approve</strong> — the leave is confirmed. The attendance calendar updates with yellow blocks.<br/>• <strong>Reject</strong> — enter a reason. The employee is notified and the balance is not deducted.",
        },
      },
      {
        popover: {
          title: 'Step 3 — Leave balances',
          description:
            "Each employee's leave balance per type is tracked in <strong>HR → Leave → Balances</strong>.<br/><br/>• Balances accrue automatically based on hire date and leave policy<br/>• Annual leave typically accrues monthly (e.g., 2.5 days/month for 30-day entitlement)<br/>• Sick leave is either a fixed annual allocation or accrues based on attendance<br/><br/>HR can manually adjust a balance (for carry-over, corrections, or special grants) with a reason note.",
        },
      },
      {
        popover: {
          title: 'Step 4 — Leave types and policies',
          description:
            'Configure leave types in <strong>HR → Settings → Leave Types</strong>.<br/><br/>For each type set:<br/>• <strong>Maximum days</strong> per year<br/>• <strong>Carryover limit</strong> (days that roll into the next year)<br/>• <strong>Whether it requires manager approval</strong> or auto-approves<br/>• <strong>Whether it is paid</strong> (affects payroll deductions for Unpaid leave)',
        },
      },
      {
        popover: {
          title: '✅ Leave Tour Complete',
          description:
            'Approved leave days appear as <strong>yellow blocks</strong> on the attendance calendar and are included in the monthly KPI summary.<br/><br/>Unpaid leave deducts from the payroll calculation automatically — no manual payroll adjustment needed.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Manufacturing ────────────────────────────────────────────────────────────
  manufacturing: {
    title: 'Manufacturing',
    steps: [
      {
        popover: {
          title: '🏭 Manufacturing — Walkthrough',
          description:
            'The Manufacturing module manages production orders — converting raw materials from inventory into finished goods. It uses Bills of Materials (BOMs) to define what goes into each product. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Define a Bill of Materials',
          description:
            'Go to <strong>Manufacturing → Bills of Materials → New BOM</strong>.<br/><br/>Set:<br/>• <strong>Finished product</strong> — the item being produced<br/>• <strong>Quantity produced</strong> — e.g., this BOM makes 1 unit<br/>• <strong>Raw material lines</strong> — each raw material with quantity per finished unit<br/>• <strong>Yield %</strong> — accounts for expected waste (e.g., 95% yield = 5% of materials expected as scrap)<br/><br/>BOMs can be versioned — create a new version when the recipe changes.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Create a production order',
          description:
            'Go to <strong>Manufacturing → Orders → New Order</strong>.<br/><br/>Select:<br/>• <strong>Finished product</strong> and <strong>quantity to produce</strong><br/>• <strong>BOM version</strong> to use<br/>• <strong>Planned start date</strong><br/><br/>The system calculates the <strong>required raw materials</strong> and checks current stock levels. If stock is insufficient, it shows how much is available vs needed per material.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Issue raw materials',
          description:
            'When production starts, click <strong>Issue Materials</strong>.<br/><br/>This deducts the raw material quantities from the source warehouse location and moves them to the production Work-In-Progress (WIP) location.<br/><br/>The inventory movements are logged automatically. If less material is available than required, the system warns you and allows partial issuance.',
        },
      },
      {
        popover: {
          title: 'Step 4 — Complete production',
          description:
            "When manufacturing finishes, click <strong>Complete</strong>.<br/><br/>The system:<br/>• Adds the finished goods quantity to the finished goods warehouse<br/>• Posts the production cost: materials issued + any direct labour costs<br/>• Updates the finished product's <strong>unit cost</strong> based on this production run<br/><br/>The production order is now Completed and locked.",
        },
      },
      {
        popover: {
          title: '✅ Manufacturing Tour Complete',
          description:
            'Production costs feed directly into inventory valuation — the finished goods appear on the Balance Sheet at their production cost.<br/><br/>Link a production order to a <strong>Purchase Order</strong> using the PO\'s "Manufacturing / BOM" purpose to automatically track purchased materials against this order.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Rental ───────────────────────────────────────────────────────────────────
  rental: {
    title: 'Equipment Rental',
    steps: [
      {
        popover: {
          title: '🚜 Equipment Rental — Walkthrough',
          description:
            'The Rental module tracks equipment you rent out to customers or projects — availability, contracts, maintenance schedules, and invoicing. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Equipment register',
          description:
            'Go to <strong>Rental → Equipment</strong>.<br/><br/>Every piece of equipment is listed with:<br/>• <strong>Current status</strong>: Available, On Rent, In Maintenance, Retired<br/>• <strong>Last service date</strong> and <strong>next service due</strong><br/>• <strong>Utilisation rate</strong> (% of time on rent in the last 30 days)<br/><br/>Click an equipment item to view its full rental history and maintenance log.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Create a rental contract',
          description:
            'Go to <strong>Rental → Contracts → New Contract</strong>.<br/><br/>Set:<br/>• <strong>Customer</strong> and <strong>project site</strong> (delivery address)<br/>• <strong>Equipment item</strong> — the system checks availability for the selected dates<br/>• <strong>Rental period</strong>: start and end date<br/>• <strong>Rate type</strong>: Daily, Weekly, or Monthly<br/>• <strong>Rate amount</strong> and <strong>currency</strong><br/><br/>The equipment status changes to <strong>On Rent</strong> when the contract starts.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Maintenance alerts',
          description:
            'A background job monitors equipment and sends alerts when:<br/>• <strong>Service is due</strong> (based on hours or calendar interval configured per equipment)<br/>• <strong>A contract is expiring</strong> within the next 7 days<br/>• <strong>Equipment is overdue for return</strong><br/><br/>View upcoming maintenance in <strong>Rental → Maintenance Schedule</strong>. Log a maintenance event to reset the counter and update the next service date.',
        },
      },
      {
        popover: {
          title: 'Step 4 — Return and invoice',
          description:
            'When the rental period ends, open the contract and click <strong>Return Equipment</strong>.<br/><br/>The system:<br/>• Records the actual return date (may differ from contracted end date)<br/>• Calculates the <strong>final invoice amount</strong> based on actual days<br/>• Generates a <strong>customer invoice</strong> in Accounts Receivable<br/><br/>Equipment status returns to <strong>Available</strong> and the equipment appears back in the availability pool.',
        },
      },
      {
        popover: {
          title: '✅ Equipment Rental Tour Complete',
          description:
            'Rental rates and availability are tracked in real time. The equipment utilisation report (Rental → Reports → Utilisation) shows which equipment generates the most revenue.<br/><br/>Maintenance schedules are configured per equipment record in <strong>Rental → Equipment → [Item] → Maintenance tab</strong>.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Reporting ────────────────────────────────────────────────────────────────
  reporting: {
    title: 'Financial Reports',
    steps: [
      {
        popover: {
          title: '📊 Financial Reports — Walkthrough',
          description:
            'The Reports module generates the four core financial statements directly from your posted journal data — no manual exports or Excel work required. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Trial Balance',
          description:
            'Go to <strong>Finance → Reports → Trial Balance</strong>.<br/><br/>The Trial Balance shows <strong>every GL account</strong> with:<br/>• Opening balance<br/>• Debit movements in the period<br/>• Credit movements in the period<br/>• Closing balance<br/><br/>The total debit column must equal the total credit column. Use this to verify data integrity before generating other statements. Filter by date range and company.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Profit & Loss',
          description:
            'Go to <strong>Finance → Reports → Profit &amp; Loss</strong>.<br/><br/>Shows <strong>Revenue − Expenses</strong> for the selected period:<br/>• Revenue lines (credit-balance accounts)<br/>• Direct costs and gross profit<br/>• Operating expenses and operating profit<br/>• Other income/expense<br/>• Net profit / loss<br/><br/>Click any line amount to <strong>drill down</strong> to the underlying journal entries.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Balance Sheet',
          description:
            'Go to <strong>Finance → Reports → Balance Sheet</strong>.<br/><br/>Shows your financial position as of a specific date:<br/>• <strong>Assets</strong>: Current assets (cash, receivables, inventory) + Non-current (fixed assets)<br/>• <strong>Liabilities</strong>: Current (AP, accruals) + Non-current (long-term debt)<br/>• <strong>Equity</strong>: Share capital + Retained earnings<br/><br/>Assets must always equal Liabilities + Equity. Any imbalance indicates unposted or miscoded journals.',
        },
      },
      {
        popover: {
          title: 'Step 4 — Export and period comparison',
          description:
            'Every report has an <strong>Export</strong> button (top-right) for PDF and CSV formats.<br/><br/>For period comparison (this month vs last month, or YTD vs prior year):<br/>• Use the <strong>Comparison Period</strong> toggle in the report header<br/>• Select the comparison period from the dropdown<br/><br/>The report adds a variance column showing the absolute and percentage change.',
        },
      },
      {
        popover: {
          title: '✅ Reports Tour Complete',
          description:
            '⚠️ Reports only include <strong>posted</strong> journals. Draft journals are always excluded — post all journals before generating period-end reports.<br/><br/>Lock the accounting period in <strong>Finance → Periods</strong> after closing it to prevent backdated changes.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Settings ─────────────────────────────────────────────────────────────────
  settings: {
    title: 'System Settings',
    steps: [
      {
        popover: {
          title: '⚙️ Settings — Walkthrough',
          description:
            'Settings controls the system-wide configuration: company profile, appearance, notifications, and user preferences. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Company profile',
          description:
            'Go to <strong>Settings → Company</strong>.<br/><br/>Update:<br/>• <strong>Company name</strong> and <strong>legal address</strong><br/>• <strong>Logo</strong> — appears on all PDF documents<br/>• <strong>Letterhead</strong> — background image used on invoices and payment vouchers<br/>• <strong>Stamp image</strong> — used on payment voucher PDFs<br/>• <strong>Currency</strong> and <strong>fiscal year start month</strong><br/><br/>Changes to letterhead and logo take effect immediately on new documents.',
        },
      },
      {
        popover: {
          title: 'Step 2 — Appearance',
          description:
            'Go to <strong>Settings → Appearance</strong>.<br/><br/>Choose the UI theme:<br/>• <strong>Light Flat</strong> — clean white background with blue accents<br/>• <strong>Black</strong> — dark background for low-light environments<br/><br/>The theme is stored per-user — each team member can have their own preference. Switch at any time without affecting other users.',
        },
      },
      {
        popover: {
          title: 'Step 3 — Permissions and roles',
          description:
            "Go to <strong>Settings → Permissions</strong>.<br/><br/>The permission system controls who can see and do what across every module:<br/>• Assign <strong>roles</strong> to users (Finance, Procurement, HR, Admin, Viewer…)<br/>• Roles can be customised per-company<br/>• Use <strong>Role Templates</strong> to quickly apply a standard permission set to a new user<br/><br/>Role changes take effect on the user's next login.",
        },
      },
      {
        popover: {
          title: '✅ Settings Tour Complete',
          description:
            'Additional configuration areas:<br/>• <strong>Notifications</strong> — choose which events trigger email or in-app alerts<br/>• <strong>Procurement</strong> — set approval thresholds and routing rules<br/>• <strong>HR</strong> — configure payroll rules, leave policies, and geofence zones<br/><br/>Changes to system configuration are logged in the admin audit trail.<br/><br/>Click <strong>Done ✓</strong> to exit.',
        },
      },
    ],
  },

  // ── Integrations / System Config ──────────────────────────────────────────────
  integrations: {
    title: 'Integrations & System Configuration',
    steps: [
      {
        popover: {
          title: '⚙️ System Configuration — Walkthrough',
          description:
            'This page lets you configure external service settings — SMTP email, FX rate API keys, file storage, and the public app URL — directly from the UI without editing server files.<br/><br/>Changes are stored encrypted in the database and take effect within 5 minutes for background workers. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Email Server (SMTP)',
          description:
            'Configure the outgoing mail server.<br/><br/><strong>Required fields:</strong><br/>• <strong>SMTP Host</strong> — your mail server (e.g. <code>mail.company.com</code>)<br/>• <strong>Port</strong> — typically 465 (TLS) or 587 (STARTTLS)<br/>• <strong>Secure</strong> — set <code>true</code> for port 465, <code>false</code> for 587<br/>• <strong>Username / Password</strong> — your mail account credentials<br/>• <strong>From Name / Address</strong> — what recipients see as the sender<br/><br/>Click <strong>Send Test Email</strong> to verify your settings send a real email to your account.',
        },
      },
      {
        popover: {
          title: 'Application Base URL',
          description:
            'Set the <strong>public URL</strong> that this ERP system is reachable at — for example <code>https://erp.yourcompany.com</code>.<br/><br/>This value is used to:<br/>• Generate <strong>QR codes</strong> on invoice PDFs (links to the public invoice verify page)<br/>• Create <strong>deep-links</strong> in outgoing emails (password reset, notifications)<br/><br/>Use the externally accessible URL, not localhost.',
        },
      },
      {
        popover: {
          title: 'FX Rate API Keys',
          description:
            'The system automatically syncs exchange rates every morning from external APIs.<br/><br/>• <strong>ExchangeRate-API</strong> (primary) — get a free key at <code>exchangerate-api.com</code><br/>• <strong>Open Exchange Rates</strong> (fallback) — used if the primary fails<br/><br/>If neither key is configured, FX rates must be entered manually in <strong>Finance → FX Rates</strong>.<br/><br/>API keys are stored encrypted in the database.',
        },
      },
      {
        popover: {
          title: 'File Storage (Backblaze B2)',
          description:
            'PDF invoices, payslips, and uploaded attachments are stored in Backblaze B2 (S3-compatible).<br/><br/>You need:<br/>• An endpoint URL and region from your B2 bucket<br/>• A Key ID and Application Key from the B2 account keys page<br/>• The bucket name<br/><br/>Leave <strong>Public CDN URL</strong> blank unless you have a CDN in front of the bucket — in that case, set it to your CDN domain so file links use the faster URL.',
        },
      },
      {
        popover: {
          title: 'How to save changes',
          description:
            'After editing any field, click <strong>Save configuration</strong> at the bottom of the page.<br/><br/>• Fields with a <strong>DB</strong> badge are stored in the database and override the server environment file.<br/>• Fields with an <strong>env</strong> badge are read from the environment file — save them to the DB to be able to edit them from this page.<br/><br/>Sensitive values (passwords, API keys) are shown as <strong>•••••</strong> — click <strong>Change</strong> next to a field to update it. Leaving it blank skips updating that field.<br/><br/>Click <strong>Done ✓</strong> to close this guide.',
        },
      },
    ],
  },

  // ── Admin ────────────────────────────────────────────────────────────────────
  admin: {
    title: 'Administration',
    steps: [
      {
        popover: {
          title: '🔧 Administration — Walkthrough',
          description:
            'The Admin section manages the multi-company structure, user accounts, and system-level configuration that affects all companies. Only Super Admin users can access this area. Press <strong>Next →</strong> to continue.',
        },
      },
      {
        popover: {
          title: 'Step 1 — Company management',
          description:
            'Go to <strong>Admin → Companies</strong>.<br/><br/>Each legal entity is a separate company with its own:<br/>• Chart of accounts<br/>• Users and permission assignments<br/>• Bank accounts<br/>• Configuration (currency, fiscal year, letterhead)<br/><br/>Create a new company by clicking <strong>New Company</strong>. Set the base currency carefully — it cannot be changed after transactions are posted.',
        },
      },
      {
        popover: {
          title: 'Step 2 — User management',
          description:
            'Go to <strong>Admin → Users</strong>.<br/><br/>Invite new users by email:<br/>1. Click <strong>New User</strong><br/>2. Enter the email address — the user receives an invitation link<br/>3. Assign them to one or more companies<br/>4. Set their role per company<br/><br/>A user can belong to multiple companies with different roles in each (e.g., Finance in Company A, Viewer in Company B).',
        },
      },
      {
        popover: {
          title: 'Step 3 — Bank accounts',
          description:
            "Go to <strong>Admin → Bank Accounts</strong> (or <strong>Settings → Company → Banking tab</strong>).<br/><br/>Register your company's bank accounts here. These are used:<br/>• On <strong>Payment Vouchers</strong> — as the source of payment<br/>• In <strong>Bank Reconciliation</strong> — one GL account per bank account<br/><br/>Each bank account must be linked to a <strong>GL account</strong> in the Chart of Accounts.",
        },
      },
      {
        popover: {
          title: '✅ Admin Tour Complete',
          description:
            'Audit trails for admin actions are available in <strong>Admin → Audit Log</strong> — shows every company creation, user change, and permission modification with timestamp and actor.<br/><br/>Deactivated users cannot log in, but their historical data (journal entries, approvals, etc.) is fully preserved.<br/><br/>Click <strong>Done ✓</strong> to exit.',
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

      const driveSteps: DriveStep[] = iTour.steps.map(
        (step, i): DriveStep => ({
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
                    waitForElement(nextEl, () => {
                      d.moveNext()
                    })
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
        }),
      )

      const startDriver = () => {
        const driverObj = driver({
          showProgress: true,
          progressText: '{{current}} of {{total}}',
          animate: true,
          overlayOpacity: 0.45,
          stagePadding: 6,
          popoverClass: 'fnc-help-tour',
          // Not true: a real interactive step can highlight a field whose
          // dropdown/portal renders outside driver.js's "stage" bounding box
          // (e.g. SearchableSelect's options list) — with allowClose on,
          // clicking an option there reads as an overlay click and silently
          // destroys the whole tour. The popover's own × and the "Exit Tour"
          // banner (TourModeBanner.tsx) remain as the intentional exit paths.
          allowClose: false,
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
        // See the interactive tour's driver() call above for why this is off.
        allowClose: false,
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
