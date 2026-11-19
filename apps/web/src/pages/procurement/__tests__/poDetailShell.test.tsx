// The PO page's shell: the progress bar, the header, the summary and the Next Step panel, on a desktop and on a phone.
// The status names are unchanged; the bar only groups them into phases. A forked child PO has five statuses, a
// whole-flow PO has the full list. On a phone the actions that sat in a bar fixed to the bottom of the screen (and
// Delete) live behind one "⋯" menu, under the same gates as the desktop buttons.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { themes } from '../../../theme/tokens'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})
vi.mock('../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

let perms: Record<string, boolean> = {}
let systemLevel = false
vi.mock('../../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: (k: string) => !!perms[k],
    canAny: () => false,
    isSystemLevel: systemLevel,
  }),
}))

let vendorInvoices: { id: string; invoice_number: string; status: string }[] = []
vi.mock('../../../lib/axios', () => ({
  api: {
    get: vi.fn((url: string) =>
      Promise.resolve({
        data: url === '/finance/vendor-invoices' ? { items: vendorInvoices } : [],
      }),
    ),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

const TOTALS = [{ currency_code: 'IQD', subtotal: '10000', line_count: 1 }]

function mockPO(status: string, over: Record<string, unknown> = {}) {
  const po = {
    id: 'po-1',
    po_number: 'PO-2026-0054',
    vendor_name: 'Cash Purchase',
    currency_code: 'IQD',
    status,
    priority: 'low',
    requisition_id: 'req-1',
    requisitionNumber: 'REQ-2026-0045',
    subtotal: null,
    tax_amount: '0',
    total_amount: null,
    currencyTotals: TOTALS,
    notes: '',
    expected_delivery_date: '',
    created_at: '2026-10-24T10:00:00.000Z',
    created_by_email: 'buyer@example.com',
    callerIsFinanceTeam: true,
    funding_source: 'vendor_ap',
    funding_decided: false,
    funding_advance_id: null,
    receipts: [],
    approval_log: [],
    edit_requests: [],
    lines: [
      {
        id: 'l1',
        description: 'AC cover',
        product_id: null,
        product_name: null,
        uom: 'pc',
        qty: 1,
        qty_received: 1,
        qty_from_stock: 0,
        unit_price: 10000,
        initial_unit_price: 10000,
        total: 10000,
        actual_unit_price: 10000,
        currency_code: 'IQD',
        market_price_currency: 'IQD',
        requested_currency_code: null,
        account_id: null,
        cost_center_id: null,
      },
    ],
    ...over,
  }
  mockUseQuery.mockReturnValue({
    data: {
      purchaseOrder: po,
      poFxRates: { base_currency: 'IQD', rates: [{ currency_code: 'IQD' }] },
    },
    loading: false,
    refetch: vi.fn(),
  })
}

// The PO page is one of the largest modules in the app: importing it inside the first test can take longer than the test
// limit on a busy machine, so it is imported once, up front, with its own generous limit.
let PurchaseOrderDetail: ComponentType
beforeAll(async () => {
  PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
}, 120_000)

async function openPO() {
  const view = render(
    <MemoryRouter initialEntries={['/procurement/purchase-orders/po-1']}>
      <ThemeProvider>
        {/* a real route, so the page gets its :id (without it the vendor-invoice lookup is skipped) */}
        <Routes>
          <Route path="/procurement/purchase-orders/:id" element={<PurchaseOrderDetail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  // the invoice lookup is a fetch that settles after the first render
  await act(async () => {
    await Promise.resolve()
  })
  await waitFor(() => {
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  perms = {}
  systemLevel = false
  vendorInvoices = []
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({}), { loading: false }])
})
afterEach(async () => {
  setWidth(1024)
  await i18n.changeLanguage('en')
})

const progress = () => screen.getByRole('group', { name: 'Progress' })
const phases = () => within(progress()).getAllByRole('listitem')
const current = () => phases().find((li) => li.getAttribute('aria-current') === 'step')

describe('PO page: the progress bar', () => {
  it('shows a forked child PO its own five statuses, as phases', async () => {
    mockPO('payment_pending')
    await openPO()
    expect(phases().map((p) => p.textContent.replace(/\s*✓$/, ''))).toEqual([
      'Bought',
      'Goods received',
      'Finance review',
      'Payment pending',
      'Closed',
    ])
    expect(current()).toHaveTextContent('Payment pending')
    expect(within(progress()).getByText('Step 4 of 5')).toBeInTheDocument()
  })

  it('ticks the phases before the current one on a child PO', async () => {
    mockPO('finance_review')
    await openPO()
    const ticked = phases().filter((li) => li.textContent.includes('✓'))
    expect(ticked.map((li) => li.textContent)).toEqual(['Bought ✓', 'Goods received ✓'])
  })

  it('shows a whole-flow PO six phases and names the status inside the phase', async () => {
    mockPO('goods_received', { requisition_id: null, requisitionNumber: null })
    await openPO()
    expect(phases().map((p) => p.textContent.replace(/\s*✓$/, '').split(' · ')[0])).toEqual([
      'Prepare',
      'Price',
      'Approve',
      'Buy and receive',
      'Finance',
      'Done',
    ])
    // the phase and the status it holds, e.g. "Buy and receive · Goods received"
    expect(current()).toHaveTextContent('Buy and receive · Goods received')
  })

  it('a stopped PO has no current phase and says why in the status', async () => {
    mockPO('cancelled')
    await openPO()
    expect(current()).toBeUndefined()
    expect(within(progress()).getByText('Cancelled')).toBeInTheDocument()
  })

  it('is the same on a phone, with the status named under the bar', async () => {
    setWidth(390)
    mockPO('bought')
    await openPO()
    // each segment's name is read by a screen reader only; the status is drawn once, under the bar
    expect(progress().querySelector('strong')).toHaveTextContent('Bought')
    expect(within(progress()).getByText('Step 1 of 5')).toBeInTheDocument()
  })
})

describe('PO page: the header on a desktop', () => {
  it('keeps the status, the forked-from link, the priority and the action buttons in the header, with no menu', async () => {
    perms = { 'procurement.po.edit': true }
    mockPO('payment_pending')
    await openPO()
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print PO' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create return/i })).toBeInTheDocument()
    expect(screen.getByText(/forked from REQ-2026-0045/i)).toBeInTheDocument()
    expect(screen.getByText('Low')).toBeInTheDocument()
  })
})

describe('PO page: the header on a phone', () => {
  const items = () => screen.getAllByRole('menuitem').map((i) => i.textContent)
  const openMenu = () => {
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
  }

  it('has no action buttons in a bar at the bottom: they are behind the menu', async () => {
    setWidth(390)
    perms = { 'procurement.po.edit': true }
    mockPO('payment_pending')
    await openPO()
    expect(screen.queryByRole('button', { name: 'Print PO' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create return/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
  })

  it('offers Print and Actions to everyone', async () => {
    setWidth(390)
    mockPO('payment_pending')
    await openPO()
    openMenu()
    expect(items()).toEqual(['Print PO', 'Actions'])
  })

  it('offers Create return only to someone who may edit POs, and only once goods can be returned', async () => {
    setWidth(390)
    perms = { 'procurement.po.edit': true }
    mockPO('payment_pending')
    await openPO()
    openMenu()
    expect(items()).toEqual([i18n.t('po.detail.createReturn'), 'Print PO', 'Actions'])
  })

  it('does not offer Create return before goods are received, even to an editor', async () => {
    setWidth(390)
    perms = { 'procurement.po.edit': true }
    mockPO('bought')
    await openPO()
    openMenu()
    expect(items()).toEqual(['Print PO', 'Actions'])
  })

  it('offers View invoice first to someone who may see AP and a PO that has one', async () => {
    setWidth(390)
    perms = { 'finance.ap.view': true }
    vendorInvoices = [{ id: 'inv-1', invoice_number: 'INV-1', status: 'draft' }]
    mockPO('closed')
    await openPO()
    openMenu()
    expect(items()[0]).toBe('View Invoice')
    fireEvent.click(screen.getAllByRole('menuitem')[0])
    expect(mockNavigate).toHaveBeenCalledWith('/finance/ap/inv-1')
  })

  it('does not offer View invoice for a PO paid from an employee advance, even if an invoice exists', async () => {
    setWidth(390)
    perms = { 'finance.ap.view': true }
    vendorInvoices = [{ id: 'inv-1', invoice_number: 'INV-1', status: 'draft' }]
    mockPO('closed', { funding_source: 'employee_advance', funding_decided: true })
    await openPO()
    openMenu()
    expect(items()).toEqual(['Print PO', 'Actions'])
  })

  it('offers Create invoice to someone who may edit AP, on a finished PO that has none', async () => {
    setWidth(390)
    perms = { 'finance.ap.view': true, 'finance.ap.edit': true }
    mockPO('closed')
    await openPO()
    openMenu()
    expect(items()[0]).toBe('Create Invoice')
    fireEvent.click(screen.getAllByRole('menuitem')[0])
    expect(mockNavigate).toHaveBeenCalledWith('/finance/ap/new?po_id=po-1')
  })

  it('does not offer Create invoice to someone who may only look at AP', async () => {
    setWidth(390)
    perms = { 'finance.ap.view': true }
    mockPO('closed')
    await openPO()
    openMenu()
    expect(items()).toEqual(['Print PO', 'Actions'])
  })

  it('does not offer Create invoice before the PO is finished', async () => {
    setWidth(390)
    perms = { 'finance.ap.view': true, 'finance.ap.edit': true }
    mockPO('payment_pending')
    await openPO()
    openMenu()
    expect(items()).toEqual(['Print PO', 'Actions'])
  })

  it('offers Delete only on a draft, in red', async () => {
    setWidth(390)
    mockPO('draft', { requisition_id: null, requisitionNumber: null })
    await openPO()
    // not as a button in the header as well: it is only in the menu
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    openMenu()
    expect(items()).toEqual(['Print PO', 'Actions', 'Delete'])
    // the destructive item is drawn in a colour of its own
    expect(screen.getByRole('menuitem', { name: 'Delete' }).style.color).not.toBe(
      screen.getByRole('menuitem', { name: 'Print PO' }).style.color,
    )
  })

  it('Print opens the print dialog', async () => {
    setWidth(390)
    mockPO('payment_pending')
    await openPO()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print PO' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows the status beside the title and puts the forked-from link and the priority in a row of their own', async () => {
    setWidth(390)
    mockPO('payment_pending')
    await openPO()
    const heading = screen.getByRole('heading', { level: 1 })
    const header = heading.parentElement?.parentElement
    if (!header) throw new Error('the header was not found')
    expect(within(header).getByText('Payment pending')).toBeInTheDocument()
    // the link and the priority are not inside the header's actions
    const chip = screen.getByText(/forked from REQ-2026-0045/i)
    expect(header).not.toContainElement(chip)
    expect(chip.parentElement).toContainElement(screen.getByText('Low'))
  })
})

const summaryTile = (label: string): HTMLElement => {
  const card = screen.getByText('PO Summary').parentElement
  if (!card) throw new Error('the summary card was not found')
  const tile = within(card).getByText(label).parentElement
  if (!tile) throw new Error(`no ${label} tile`)
  return tile
}

describe('PO page: the summary', () => {
  it('lets the total take the whole first row on a phone, two tiles to a row after it', async () => {
    setWidth(390)
    mockPO('payment_pending')
    await openPO()
    const tile = summaryTile('Total')
    expect(tile).toHaveStyle({ gridColumn: '1 / -1' })
    expect(tile.parentElement?.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
  })

  it('does not stretch the total on a desktop', async () => {
    mockPO('payment_pending')
    await openPO()
    expect(summaryTile('Total').style.gridColumn).toBe('')
  })
})

describe('PO page: the Next Step panel on a phone', () => {
  const stepText = () => screen.getByText(/How was this PO paid\?/)
  const folded = () => stepText().closest('div[style*="display: none"]') !== null
  // Finance sets how a payment-pending PO was paid, so the panel shows its funding question to them
  beforeEach(() => {
    perms = { 'finance.ap.view': true, 'finance.ap.approve': true, 'finance.ap.edit': true }
  })

  it('has a button to fold it away, open to begin with', async () => {
    setWidth(390)
    mockPO('payment_pending')
    await openPO()
    const toggle = screen.getByRole('button', { name: 'Hide the next step' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(folded()).toBe(false)
  })

  it('folds the panel away and brings it back', async () => {
    setWidth(390)
    mockPO('payment_pending')
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Hide the next step' }))
    expect(folded()).toBe(true)
    const toggle = screen.getByRole('button', { name: 'Show the next step' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(folded()).toBe(false)
  })

  it('keeps the folded panel mounted, so nothing typed in it is lost', async () => {
    setWidth(390)
    mockPO('payment_pending')
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Hide the next step' }))
    expect(stepText()).toBeInTheDocument()
  })

  it('has no such button on a desktop, where the panel is always open', async () => {
    mockPO('payment_pending')
    await openPO()
    expect(screen.queryByRole('button', { name: /the next step/i })).not.toBeInTheDocument()
    expect(folded()).toBe(false)
  })
})

describe('PO page: the lines on a phone', () => {
  it('are labelled cards two to a row, not a wide table', async () => {
    setWidth(390)
    mockPO('payment_pending')
    const { container } = await openPO()
    expect(container.querySelector('dl[data-phone-grid]')).not.toBeNull()
  })

  it('have no row of their own for the line number', async () => {
    setWidth(390)
    mockPO('payment_pending')
    const { container } = await openPO()
    const labels = [...container.querySelectorAll('dl[data-phone-grid] dt')].map(
      (dt) => dt.textContent,
    )
    expect(labels.length).toBeGreaterThan(0)
    expect(labels).not.toContain('#')
  })

  it('stay a table on a desktop', async () => {
    mockPO('payment_pending')
    const { container } = await openPO()
    expect(container.querySelector('dl[data-phone-grid]')).toBeNull()
    expect(container.querySelector('table')).not.toBeNull()
  })
})

// The stages whose one step is "record what was delivered" (a message and one button) have no card: the explanation and
// the button are the bar at the bottom, like the requisition's steps. Every other stage keeps its Next Step card.
describe('PO page: the record-the-delivery stages use the bar', () => {
  const barTitle = () => screen.queryByText('Next Step: Record Receipt')
  const auditBarTitle = () => screen.queryByText('Next Step: Send to Finance Audit')
  const nextStepCard = () => screen.queryByText('Next Step')

  it('a bought child PO: the message and the button are in the bar, and there is no card', async () => {
    mockPO('bought')
    await openPO()
    expect(barTitle()).toBeInTheDocument()
    expect(screen.getByText(i18n.t('po.detail.itemsForThisPurchaseOrderWere'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record Receipt' })).toBeInTheDocument()
    expect(nextStepCard()).not.toBeInTheDocument()
  })

  it('the button goes to the receiving page', async () => {
    mockPO('bought')
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Record Receipt' }))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/purchase-orders/po-1/receive')
  })

  it('carries the walkthrough anchor the button always had', async () => {
    mockPO('bought')
    await openPO()
    expect(screen.getByRole('button', { name: 'Record Receipt' })).toHaveAttribute(
      'data-tour',
      'po-record-receipt-btn',
    )
  })

  it('an approved whole-flow PO says its own thing', async () => {
    mockPO('approved', { requisition_id: null, requisitionNumber: null })
    await openPO()
    expect(barTitle()).toBeInTheDocument()
    expect(screen.getByText(i18n.t('po.detail.poIsApprovedRecordAGoods'))).toBeInTheDocument()
  })

  it('goods received with nothing recorded yet is the same bar', async () => {
    mockPO('goods_received', {
      receipts: [],
      lines: [
        {
          id: 'l1',
          description: 'Spring',
          product_id: null,
          product_name: null,
          uom: 'pc',
          qty: 4,
          qty_received: 0,
          qty_from_stock: 0,
          unit_price: 1000,
          initial_unit_price: 1000,
          total: 4000,
          actual_unit_price: 1000,
          currency_code: 'IQD',
          market_price_currency: 'IQD',
          requested_currency_code: null,
          account_id: null,
          cost_center_id: null,
        },
      ],
    })
    await openPO()
    expect(barTitle()).toBeInTheDocument()
    expect(screen.getByText(i18n.t('po.detail.buyingIsDoneRecordWhatS'))).toBeInTheDocument()
    expect(nextStepCard()).not.toBeInTheDocument()
  })

  it('goods received after a confirmed receipt has the audit bar and no card', async () => {
    // the line itself still reads 0 received, so only the confirmed receipt says something was recorded
    mockPO('goods_received', {
      receipts: [{ id: 'r1', status: 'confirmed', receipt_number: 'RCPT-1', lines: [] }],
      lines: [
        {
          id: 'l1',
          description: 'Spring',
          product_id: null,
          product_name: null,
          uom: 'pc',
          qty: 4,
          qty_received: 0,
          qty_from_stock: 0,
          unit_price: 1000,
          initial_unit_price: 1000,
          total: 4000,
          actual_unit_price: 1000,
          currency_code: 'IQD',
          market_price_currency: 'IQD',
          requested_currency_code: null,
          account_id: null,
          cost_center_id: null,
        },
      ],
    })
    await openPO()
    expect(auditBarTitle()).toBeInTheDocument()
    expect(nextStepCard()).not.toBeInTheDocument()
    expect(barTitle()).not.toBeInTheDocument()
  })

  it('goods received through a jobsite delivery (no receipt row, goods counted) has the audit bar and no card', async () => {
    mockPO('goods_received', { receipts: [] })
    await openPO() // the fixture line is already received (1 of 1)
    expect(auditBarTitle()).toBeInTheDocument()
    expect(nextStepCard()).not.toBeInTheDocument()
    expect(barTitle()).not.toBeInTheDocument()
  })

  it('payment pending keeps its card and has no bar', async () => {
    perms = { 'finance.ap.view': true, 'finance.ap.approve': true, 'finance.ap.edit': true }
    mockPO('payment_pending')
    await openPO()
    expect(nextStepCard()).toBeInTheDocument()
    expect(barTitle()).not.toBeInTheDocument()
  })

  it('a closed PO has neither a card nor a bar', async () => {
    mockPO('closed')
    await openPO()
    expect(nextStepCard()).not.toBeInTheDocument()
    expect(barTitle()).not.toBeInTheDocument()
  })

  it('a draft receipt is still pointed out, above the lines, when the card is gone', async () => {
    mockPO('bought', {
      receipts: [{ id: 'd1', status: 'draft', receipt_number: 'RCPT-D1', lines: [] }],
    })
    await openPO()
    const open = screen.getByRole('button', {
      name: i18n.t('po.detail.openReceipt', { ref: 'RCPT-D1' }),
    })
    fireEvent.click(open)
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/store-in/d1')
    // above the tabs
    expect(
      open.compareDocumentPosition(screen.getByText('Edit requests')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('does not show the draft-receipt notice twice', async () => {
    mockPO('bought', {
      receipts: [{ id: 'd1', status: 'draft', receipt_number: 'RCPT-D1', lines: [] }],
    })
    await openPO()
    expect(screen.getAllByRole('button', { name: /RCPT-D1/ })).toHaveLength(1)
  })

  it('works on a phone: the bar is fixed above the bottom navigation', async () => {
    setWidth(390)
    mockPO('bought')
    await openPO()
    const button = screen.getByRole('button', { name: 'Record Receipt' })
    let el: HTMLElement | null = button
    let fixed = false
    while (el) {
      if (el.style.position === 'fixed') fixed = true
      el = el.parentElement
    }
    expect(fixed).toBe(true)
  })
})

describe('PO page: the Next Step card', () => {
  beforeEach(() => {
    perms = { 'finance.ap.view': true, 'finance.ap.approve': true, 'finance.ap.edit': true }
  })
  const cardOf = () => {
    const card = screen.getByText('Next Step').closest('div[style*="border-radius: 14px"]')
    if (!card) throw new Error('the Next Step card was not found')
    return card as HTMLElement
  }

  it('is a plain card, without the blue edge down its left side', async () => {
    mockPO('payment_pending')
    await openPO()
    // an ordinary 1px card edge, not the 4px accent bar it used to have on the left
    expect(cardOf().style.borderLeft).not.toContain('4px')
    expect(cardOf().style.borderInlineStart).toBe('')
  })

  // the body of the Next Step card: the nearest ancestor of a piece of its text that sets a max-width
  const bodyOf = (el: HTMLElement) => el.closest<HTMLElement>('div[style*="max-width"]')

  it('keeps a longer form at a readable width instead of stretching across the page', async () => {
    mockPO('draft', { requisition_id: null, requisitionNumber: null, priority: 'emergency' })
    await openPO()
    const body = bodyOf(screen.getByText(i18n.t('po.detail.emergencyPoSkipsInventoryCheckStore')))
    expect(body?.style.maxWidth).toBe('960px')
  })

  it('lets the one-line Payment pending strip run the width of the card', async () => {
    mockPO('payment_pending')
    await openPO()
    // no 960px cap around it: the nearest max-width is the page's own
    const body = bodyOf(screen.getByText(/How was this PO paid\?/))
    expect(body?.style.maxWidth).not.toBe('960px')
  })

  it('has no status tag in the strip: the header and the progress bar already say it', async () => {
    mockPO('payment_pending')
    await openPO()
    const card = screen.getByText('Next Step').closest('div[style*="border-radius: 14px"]')
    expect(card?.textContent).not.toContain('Payment pending')
  })

  it('labels the strip in small capitals, in the secondary grey', async () => {
    mockPO('payment_pending')
    await openPO()
    const label = screen.getByText('Next Step').closest<HTMLElement>('div[style*="text-transform"]')
    expect(label?.style.textTransform).toBe('uppercase')
    expect(label?.style.fontSize).toBe('12px')
  })

  it('confirms with the same solid 40px button as the newest screens', async () => {
    mockPO('payment_pending')
    await openPO()
    const confirm = screen.getByRole('button', { name: 'Confirm Funding Source' })
    expect(confirm.style.height).toBe('40px')
    expect(confirm.style.borderRadius).toBe('10px')
    // the solid accent, not the pale tint the shared Button draws
    const probe = document.createElement('div')
    probe.style.background = themes['light-flat'].accentSolid
    expect(confirm.style.background).toBe(probe.style.background)
  })

  it('offers the two ways of paying as quick choices that say which is picked', async () => {
    mockPO('payment_pending')
    await openPO()
    const vendor = screen.getByRole('button', { name: 'Vendor (Accounts Payable)' })
    const advance = screen.getByRole('button', { name: 'Employee Advance' })
    expect(vendor).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(advance)
    expect(advance).toHaveAttribute('aria-pressed', 'true')
    expect(vendor).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(vendor)
    expect(vendor).toHaveAttribute('aria-pressed', 'true')
    expect(advance).toHaveAttribute('aria-pressed', 'false')
  })

  // The two pickers that open under "Employee Advance" (the employee, then which of their advances) are drawn the same
  // way as the newest forms: 40px high, 10px corners, the darker field edge, one label style. The Advance box used to be
  // a grey 7px-padded native select with a paler, bolder label next to a default-height Employee box.
  describe('the employee and advance pickers', () => {
    const openPickers = async () => {
      mockPO('payment_pending')
      await openPO()
      fireEvent.click(screen.getByRole('button', { name: 'Employee Advance' }))
    }
    const advanceBox = () => {
      const el = document.getElementById('funding-advance-IQD')
      if (!(el instanceof HTMLSelectElement)) throw new Error('no advance box')
      return el
    }
    const employeeLabel = () => screen.getByText('Employee', { selector: 'label' })

    it('draws the Advance box 40px high with 10px corners and the field edge', async () => {
      await openPickers()
      const box = advanceBox()
      expect(box.style.height).toBe('40px')
      expect(box.style.borderRadius).toBe('10px')
      const probe = document.createElement('div')
      probe.style.borderColor = themes['light-flat'].borderField
      expect(box.style.border).toContain(probe.style.borderColor)
    })

    it('draws the Employee box at the same height', async () => {
      await openPickers()
      const trigger = employeeLabel().parentElement?.querySelector<HTMLElement>('[tabindex]')
      expect(trigger?.style.minHeight).toBe('40px')
      expect(trigger?.style.borderRadius).toBe('10px')
    })

    it('gives both the same label style', async () => {
      await openPickers()
      const advanceLabel = document.querySelector<HTMLElement>('label[for="funding-advance-IQD"]')
      expect(advanceLabel?.style.fontSize).toBe(employeeLabel().style.fontSize)
      expect(advanceLabel?.style.fontWeight).toBe(employeeLabel().style.fontWeight)
      expect(advanceLabel?.style.color).toBe(employeeLabel().style.color)
    })

    it('fills the Advance box with the card colour, not a grey of its own', async () => {
      await openPickers()
      const probe = document.createElement('div')
      probe.style.background = themes['light-flat'].bgSurface
      expect(advanceBox().style.background).toBe(probe.style.background)
    })
  })

  it('puts Confirm on the same row as the two choices', async () => {
    mockPO('payment_pending')
    await openPO()
    const row = screen.getByRole('button', { name: 'Employee Advance' }).parentElement
    expect(row).toContainElement(screen.getByRole('button', { name: 'Confirm Funding Source' }))
  })

  it('moves Confirm under the advance pickers once Employee Advance opens them', async () => {
    mockPO('payment_pending')
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Employee Advance' }))
    const row = screen.getByRole('button', { name: 'Employee Advance' }).parentElement
    expect(row).not.toContainElement(screen.getByRole('button', { name: 'Confirm Funding Source' }))
    expect(screen.getAllByRole('button', { name: 'Confirm Funding Source' })).toHaveLength(1)
  })

  it('draws the Record Receipt bar button the same way: solid, 40px', async () => {
    mockPO('bought')
    await openPO()
    const button = screen.getByRole('button', { name: 'Record Receipt' })
    expect(button.style.height).toBe('40px')
    const probe = document.createElement('div')
    probe.style.background = themes['light-flat'].accentSolid
    expect(button.style.background).toBe(probe.style.background)
  })

  it('draws the message boxes from the theme, not from fixed light colours', async () => {
    mockPO('draft', { requisition_id: null, requisitionNumber: null, priority: 'emergency' })
    await openPO()
    const warning = screen.getByText(i18n.t('po.detail.emergencyPoSkipsInventoryCheckStore'))
    // the old box was a fixed light orange (#fff7ed), unreadable on the dark theme
    expect(warning.style.background).not.toMatch(/255,\s*247,\s*237|#fff7ed/i)
    expect(warning.style.color).not.toMatch(/154,\s*52,\s*18|#9a3412/i)
  })

  it('does the same for a rejected PO', async () => {
    mockPO('rejected', { requisition_id: null, requisitionNumber: null })
    await openPO()
    const box = screen.getByText(i18n.t('po.detail.thisPoWasRejectedReviseAnd'))
    expect(box.style.background).not.toMatch(/254,\s*242,\s*242|#fef2f2/i)
    expect(box.style.color).not.toMatch(/153,\s*27,\s*27|#991b1b/i)
  })
})

describe('PO page: the print dialog', () => {
  // it was a hand-rolled overlay (no Escape, no focus trap, no dialog role); it is the shared Modal now
  const title = () => i18n.t('po.detail.printPurchaseOrderTitle', { number: 'PO-2026-0054' })

  it('opens as a named dialog', async () => {
    setWidth(1440)
    mockPO('payment_pending')
    await openPO()
    expect(screen.queryByRole('dialog', { name: title() })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Print PO' }))
    expect(screen.getByRole('dialog', { name: title() })).toHaveAttribute('aria-modal', 'true')
  })

  it('closes on Escape and gives focus back to the button that opened it', async () => {
    setWidth(1440)
    mockPO('payment_pending')
    await openPO()
    const button = screen.getByRole('button', { name: 'Print PO' })
    button.focus()
    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: title() })).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('closes from its Cancel button, and shows the preview and the notes box inside the dialog', async () => {
    setWidth(1440)
    mockPO('payment_pending')
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Print PO' }))
    const dialog = screen.getByRole('dialog', { name: title() })
    expect(dialog.querySelector('iframe')).not.toBeNull()
    // the shared Checkbox keeps a real input in the page
    expect(
      within(dialog).getByRole('checkbox', { name: i18n.t('po.detail.includeInternalLineNotesNotFor') }),
    ).not.toBeChecked()
    expect(within(dialog).getByRole('button', { name: i18n.t('po.detail.printSaveAsPdf') })).toBeEnabled()
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('po.detail.cancel') }))
    expect(screen.queryByRole('dialog', { name: title() })).not.toBeInTheDocument()
  })

  it('a click on the dark area closes it while nothing was changed', async () => {
    setWidth(1440)
    mockPO('payment_pending')
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Print PO' }))
    const dialog = screen.getByRole('dialog', { name: title() })
    const backdrop = dialog.parentElement
    if (!backdrop) throw new Error('the backdrop was not found')
    fireEvent.mouseDown(backdrop)
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog', { name: title() })).not.toBeInTheDocument()
  })
})

describe('PO page: the stage buttons are the solid accent button', () => {
  it('Submit for Inventory Check is the theme accent, not the old fixed blue or the pale tint', async () => {
    mockPO('draft', { requisition_id: null, requisitionNumber: null })
    await openPO()
    const button = screen.getByRole('button', { name: i18n.t('po.detail.submitForInventoryCheck') })
    expect(button).toHaveStyle({ background: themes['light-flat'].accentSolid })
    expect(button.style.background).not.toMatch(/37,\s*99,\s*235|#2563eb/i)
  })

  it('takes the dark theme accent with the dark theme', async () => {
    localStorage.setItem('fnc-theme', 'black')
    mockPO('draft', { requisition_id: null, requisitionNumber: null })
    await openPO()
    const button = screen.getByRole('button', { name: i18n.t('po.detail.submitForInventoryCheck') })
    expect(button).toHaveStyle({ background: themes.black.accentSolid })
    localStorage.removeItem('fnc-theme')
  })
})

describe('PO page: Arabic', () => {
  it('names the phases in Arabic and keeps the status inside them', async () => {
    await i18n.changeLanguage('ar')
    mockPO('goods_received', { requisition_id: null, requisitionNumber: null })
    await openPO()
    const group = screen.getAllByRole('group').find((g) => g.querySelector('ol'))
    expect(group).toBeDefined()
    expect(group?.textContent).toContain('الشراء والاستلام')
  })
})
