// The PO page at Goods received, in the new UI: the bar that sends it to Finance Audit, the Received column that agrees
// with it (playbook #41), the Actions dialog (cancel with a reason, the admin override), the summary pickers, and the
// Receipts / Returns / Log tabs. Gates are unchanged: these tests pin who sees what, not new rules.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { themes } from '../../../theme/tokens'
import { PO_RETURNS_QUERY, VENDORS_QUERY } from '../../../graphql/procurement'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    // the photo viewer window asks for the client (one object, like the real one)
    useApolloClient: () => ({ query: vi.fn().mockResolvedValue({ data: {} }) }),
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

// Someone else may hold the edit lock; the page then disables every action.
let lockedByOther = false
vi.mock('../../../hooks/useRecordLock', () => ({
  useRecordLock: () => ({
    loading: false,
    lockedByMe: !lockedByOther,
    lockedByOther,
    lockedByName: lockedByOther ? 'Sara Ali' : null,
  }),
}))

vi.mock('../../../lib/axios', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

type Line = Record<string, unknown>
const line = (id: string, over: Line = {}): Line => ({
  id,
  description: `Item ${id}`,
  product_id: null,
  product_name: null,
  uom: 'pc',
  qty: 4,
  qty_received: 4,
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
  ...over,
})

const confirmedReceipt = {
  id: 'r1',
  status: 'confirmed',
  receipt_number: 'RCPT-1',
  receipt_date: '2026-11-10',
  location_name: 'Main store',
  received_by_name: 'Omar Noor',
  received_by_email: 'omar@example.com',
  location_notes: null,
  notes: null,
  photos: [],
  lines: [],
}

// One result object per query, built once: a fresh object on each call would re-run the page's effects forever.
const results = {
  po: { data: undefined as unknown, loading: false, refetch: vi.fn() },
  returns: { data: { poReturns: [] as unknown[] }, loading: false },
  vendors: { data: { vendors: [{ id: 'v1', name: 'Acme Supplies' }] }, loading: false },
  other: { data: undefined, loading: false },
}
function mockPO(status: string, over: Record<string, unknown> = {}) {
  const po = {
    id: 'po-1',
    po_number: 'PO-2026-0056',
    vendor_id: null,
    vendor_name: 'Cash Purchase',
    currency_code: 'IQD',
    status,
    priority: 'low',
    requisition_id: 'req-1',
    requisitionNumber: 'REQ-2026-0045',
    subtotal: null,
    tax_amount: '0',
    total_amount: null,
    currencyTotals: [{ currency_code: 'IQD', subtotal: '4000', line_count: 1 }],
    notes: '',
    expected_delivery_date: '',
    created_at: '2026-10-24T10:00:00.000Z',
    created_by_email: 'buyer@example.com',
    callerIsFinanceTeam: true,
    funding_source: 'vendor_ap',
    funding_decided: false,
    funding_advance_id: null,
    receipts: [confirmedReceipt],
    approval_log: [],
    edit_requests: [],
    lines: [line('l1')],
    ...over,
  }
  results.po = {
    data: {
      purchaseOrder: po,
      poFxRates: { base_currency: 'IQD', rates: [{ currency_code: 'IQD' }] },
    },
    loading: false,
    refetch: vi.fn(),
  }
}

// Mutations by operation name, so a test can see which one ran and with what.
const mutationCalls = new Map<string, ReturnType<typeof vi.fn>>()
const mutation = (name: string) => {
  let fn = mutationCalls.get(name)
  if (!fn) {
    fn = vi.fn().mockResolvedValue({})
    mutationCalls.set(name, fn)
  }
  return fn
}

let PurchaseOrderDetail: ComponentType
beforeAll(async () => {
  PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
}, 120_000)

async function openPO() {
  const view = render(
    <MemoryRouter initialEntries={['/procurement/purchase-orders/po-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/procurement/purchase-orders/:id" element={<PurchaseOrderDetail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
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
  lockedByOther = false
  mutationCalls.clear()
  results.returns = { data: { poReturns: [] }, loading: false }
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === PO_RETURNS_QUERY) return results.returns
    if (doc === VENDORS_QUERY) return results.vendors
    return results.po
  })
  mockUseMutation.mockImplementation((doc: { definitions?: { name?: { value?: string } }[] }) => [
    mutation(doc.definitions?.[0]?.name?.value ?? 'unknown'),
    { loading: false },
  ])
})
afterEach(async () => {
  setWidth(1024)
  await i18n.changeLanguage('en')
})

const goTab = (name: RegExp) => {
  fireEvent.click(screen.getByRole('button', { name }))
}
const auditBarTitle = () => screen.queryByText('Next Step: Send to Finance Audit')
const nextStepCard = () => screen.queryByText('Next Step')

describe('Goods received: the Send to Finance Audit bar', () => {
  const twoLinesOneDone = () => {
    mockPO('goods_received', {
      lines: [line('l1'), line('l2', { qty: 2, qty_received: 0 })],
    })
  }

  it('says how many lines are fully received and offers both buttons when some are still missing', async () => {
    twoLinesOneDone()
    await openPO()
    expect(auditBarTitle()).toBeInTheDocument()
    expect(screen.getByText('Lines fully received: 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record Receipt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send to Finance Audit' })).toBeInTheDocument()
    // what the old card said, now the bar's longer text
    expect(screen.getByText(i18n.t('po.detail.notEveryLineIsFullyReceived'))).toBeInTheDocument()
    expect(nextStepCard()).not.toBeInTheDocument()
  })

  it('Record Receipt goes to the receiving page', async () => {
    twoLinesOneDone()
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Record Receipt' }))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/purchase-orders/po-1/receive')
  })

  it('Send to Finance Audit runs the audit mutation for this PO', async () => {
    twoLinesOneDone()
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Send to Finance Audit' }))
    expect(mutation('SendPOToAudit')).toHaveBeenCalledWith({ variables: { id: 'po-1' } })
  })

  it('with every line received there is nothing left to record: no Record Receipt button, a green badge', async () => {
    mockPO('goods_received')
    await openPO()
    expect(screen.getByText('Every line is fully received')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record Receipt' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send to Finance Audit' })).toBeInTheDocument()
  })

  it('a line covered entirely from stock counts as covered (the same rule as the Lines table)', async () => {
    mockPO('goods_received', {
      lines: [line('l1', { qty: 5, qty_received: 0, qty_from_stock: 5 })],
    })
    await openPO()
    expect(screen.getByText('Every line is fully received')).toBeInTheDocument()
  })

  it('both buttons wait while someone else holds the edit lock', async () => {
    lockedByOther = true
    twoLinesOneDone()
    await openPO()
    expect(screen.getByRole('button', { name: 'Record Receipt' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send to Finance Audit' })).toBeDisabled()
  })

  it('with nothing recorded yet the step is Record Receipt, not Send to Finance Audit', async () => {
    mockPO('goods_received', { receipts: [], lines: [line('l1', { qty_received: 0 })] })
    await openPO()
    expect(screen.getByText('Next Step: Record Receipt')).toBeInTheDocument()
    expect(auditBarTitle()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send to Finance Audit' })).not.toBeInTheDocument()
  })

  it('the badge is amber while lines are missing and green once every line is covered', async () => {
    twoLinesOneDone()
    const view = await openPO()
    expect(screen.getByText('Lines fully received: 1 of 2')).toHaveStyle({
      color: themes['light-flat'].warning,
    })
    view.unmount()
    mockPO('goods_received')
    await openPO()
    expect(screen.getByText('Every line is fully received')).toHaveStyle({
      color: themes['light-flat'].success,
    })
  })

  it('is the same bar on a phone', async () => {
    setWidth(390)
    twoLinesOneDone()
    await openPO()
    expect(auditBarTitle()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send to Finance Audit' })).toBeInTheDocument()
  })
})

describe('Goods received: the Lines table says the same thing as the bar', () => {
  const cell = (text: string) => {
    const el = screen.getByText(text)
    const box = el.closest('div[style*="min-width: 92px"]')
    if (!box) throw new Error(`no Received cell around ${text}`)
    return box as HTMLElement
  }

  it('shows what arrived out of what was ordered, with a bar that fills to match', async () => {
    mockPO('goods_received', { lines: [line('l1', { qty: 4, qty_received: 2 })] })
    await openPO()
    const bar = within(cell('2/4')).getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '50')
  })

  it('a line covered from stock reads full and says where it came from (it used to read 0/n)', async () => {
    mockPO('goods_received', {
      lines: [line('l1', { qty: 5, qty_received: 0, qty_from_stock: 5 })],
    })
    await openPO()
    const box = cell('5/5')
    expect(within(box).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
    expect(within(box).getByText('0 received + 5 from stock')).toBeInTheDocument()
  })

  it('an over-receipt still shows what really arrived, with the bar full', async () => {
    mockPO('goods_received', { lines: [line('l1', { qty: 4, qty_received: 6 })] })
    await openPO()
    expect(within(cell('6/4')).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('a line with nothing yet is grey, not red', async () => {
    mockPO('goods_received', { lines: [line('l1', { qty: 4, qty_received: 0 }), line('l2')] })
    await openPO()
    const box = cell('0/4')
    expect(within(box).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})

describe('the Actions dialog', () => {
  const actionsButton = () => screen.getByRole('button', { name: 'Actions' })
  const dialog = () => screen.getByRole('dialog', { name: 'Actions' })

  it('is a button that opens a dialog, not a hand-made popover', async () => {
    mockPO('approved')
    await openPO()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(actionsButton())
    expect(dialog()).toBeInTheDocument()
    expect(within(dialog()).getByText('Cancel this PO')).toBeInTheDocument()
  })

  it('cancels with the reason that was typed, and never asks the browser with window.prompt', async () => {
    const prompt = vi.spyOn(window, 'prompt')
    mockPO('approved')
    await openPO()
    fireEvent.click(actionsButton())
    fireEvent.change(within(dialog()).getByRole('textbox'), {
      target: { value: '  Ordered twice by mistake ' },
    })
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel PO' }))
    expect(mutation('CancelPO')).toHaveBeenCalledWith({
      variables: { id: 'po-1', reason: 'Ordered twice by mistake' },
    })
    expect(prompt).not.toHaveBeenCalled()
    prompt.mockRestore()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a blank reason is sent as no reason', async () => {
    mockPO('approved')
    await openPO()
    fireEvent.click(actionsButton())
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel PO' }))
    expect(mutation('CancelPO')).toHaveBeenCalledWith({
      variables: { id: 'po-1', reason: undefined },
    })
  })

  it('Escape closes it without cancelling anything', async () => {
    mockPO('approved')
    await openPO()
    fireEvent.click(actionsButton())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mutation('CancelPO')).not.toHaveBeenCalled()
  })

  it('shows no admin override to an ordinary user', async () => {
    mockPO('approved')
    await openPO()
    fireEvent.click(actionsButton())
    expect(within(dialog()).queryByText('Admin Override')).not.toBeInTheDocument()
  })

  it('a system administrator also gets the status override, held back until a different status is chosen', async () => {
    systemLevel = true
    mockPO('approved')
    await openPO()
    fireEvent.click(actionsButton())
    const d = dialog()
    expect(within(d).getByText('Admin Override')).toBeInTheDocument()
    const apply = within(d).getByRole('button', { name: 'Apply' })
    expect(apply).toBeDisabled()
    fireEvent.change(within(d).getByRole('combobox'), { target: { value: 'goods_received' } })
    expect(apply).toBeEnabled()
    // the dialog closes once the mutation's promise settles
    await act(async () => {
      fireEvent.click(apply)
      await Promise.resolve()
    })
    expect(mutation('AdminSetPOStatus')).toHaveBeenCalledWith({
      variables: { id: 'po-1', status: 'goods_received' },
    })
  })

  it('a cancelled PO has no Actions for an ordinary user', async () => {
    mockPO('cancelled')
    await openPO()
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('a cancelled PO keeps the override for a system administrator, without the cancel part', async () => {
    systemLevel = true
    mockPO('cancelled')
    await openPO()
    fireEvent.click(actionsButton())
    expect(within(dialog()).queryByText('Cancel this PO')).not.toBeInTheDocument()
    expect(within(dialog()).getByText('Admin Override')).toBeInTheDocument()
  })

  it('waits while someone else holds the edit lock', async () => {
    lockedByOther = true
    mockPO('approved')
    await openPO()
    expect(actionsButton()).toBeDisabled()
  })

  it('on a phone the menu item waits too while someone else holds the edit lock', async () => {
    setWidth(390)
    lockedByOther = true
    mockPO('approved')
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Actions' })).toBeDisabled()
  })

  it('opens from the menu on a phone, where there is no separate button', async () => {
    setWidth(390)
    mockPO('approved')
    await openPO()
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Actions' }))
    expect(dialog()).toBeInTheDocument()
  })
})

describe('the summary', () => {
  const summaryTile = (label: string): HTMLElement => {
    const card = screen.getByText('PO Summary').parentElement
    if (!card) throw new Error('the summary card was not found')
    const tile = within(card).getByText(label).parentElement
    if (!tile) throw new Error(`no ${label} tile`)
    return tile
  }

  it('fills its tiles instead of boxing each one in a hairline', async () => {
    mockPO('goods_received')
    await openPO()
    const tile = summaryTile('Total')
    expect(tile.style.border).toBe('')
    expect(tile.style.borderRadius).toBe('12px')
  })

  it('lets the vendor be chosen in the shared picker while the PO is still being priced', async () => {
    mockPO('market_pricing', { vendor_id: null, vendor_name: null })
    await openPO()
    const tile = summaryTile('Vendor')
    fireEvent.click(within(tile).getByRole('button', { name: /not yet selected/i }))
    fireEvent.mouseDown(screen.getByText('Acme Supplies'))
    expect(mutation('SetPOVendor')).toHaveBeenCalledWith({
      variables: { id: 'po-1', vendorId: 'v1' },
    })
  })

  it('shows the vendor as plain text once pricing is over', async () => {
    mockPO('goods_received', { vendor_id: 'v1', vendor_name: 'Acme Supplies' })
    await openPO()
    const tile = summaryTile('Vendor')
    expect(within(tile).getByText('Acme Supplies')).toBeInTheDocument()
    expect(within(tile).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('the Receipts tab', () => {
  it('names the location and the receiver as a definition list and marks a confirmed receipt', async () => {
    mockPO('goods_received')
    await openPO()
    goTab(/^Receipts/)
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText('Location').tagName).toBe('DT')
    expect(screen.getByText('Main store').tagName).toBe('DD')
    expect(screen.getByText('Omar Noor').tagName).toBe('DD')
  })

  it('says so when nothing has been received', async () => {
    mockPO('approved', { receipts: [] })
    await openPO()
    goTab(/^Receipts/)
    expect(screen.getByText('No receipts yet.')).toBeInTheDocument()
  })
})

describe('the Returns tab', () => {
  const aReturn = {
    id: 'ret-1',
    return_number: 'RTN-NY-PO-2026-0101',
    status: 'credited',
    return_type: 'damage',
    total_returned_value: '9',
    currency_code: 'USD',
  }
  const card = () => screen.getByRole('link', { name: /RTN-NY-PO-2026-0101/ })

  it('draws each return as a link the keyboard can reach and open', async () => {
    results.returns = { data: { poReturns: [aReturn] }, loading: false }
    mockPO('goods_received')
    await openPO()
    goTab(/^Returns/)
    expect(card()).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(card(), { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/purchase-orders/po-1/returns/ret-1')
  })

  it('a click opens it too, and Space does', async () => {
    results.returns = { data: { poReturns: [aReturn] }, loading: false }
    mockPO('goods_received')
    await openPO()
    goTab(/^Returns/)
    fireEvent.click(card())
    fireEvent.keyDown(card(), { key: ' ' })
    expect(mockNavigate).toHaveBeenCalledTimes(2)
  })

  it('names the status in the viewer language, not the raw value', async () => {
    results.returns = { data: { poReturns: [aReturn] }, loading: false }
    mockPO('goods_received')
    await openPO()
    goTab(/^Returns/)
    expect(within(card()).getByText('Credited')).toBeInTheDocument()
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    expect(within(card()).getByText('تم إصدار إشعار دائن')).toBeInTheDocument()
  })

  it('shows the value in the return currency without a pale accent colour', async () => {
    results.returns = { data: { poReturns: [aReturn] }, loading: false }
    mockPO('goods_received')
    await openPO()
    goTab(/^Returns/)
    const value = within(card()).getByText(/USD\s+9/)
    expect(value).toHaveStyle({ color: themes['light-flat'].textPrimary })
  })
})

describe('the Log tab', () => {
  const log = [
    {
      id: 'a1',
      action: 'approved',
      user_email: 'boss@example.com',
      notes: null,
      created_at: '2026-10-25T08:30:00Z',
    },
    {
      id: 'a2',
      action: 'rejected_to_draft',
      user_email: 'checker@example.com',
      notes: 'Wrong vendor',
      created_at: '2026-10-26T09:00:00Z',
    },
    {
      id: 'a3',
      action: 'edit_applied',
      user_email: null,
      notes: null,
      created_at: '2026-10-27T10:15:00Z',
    },
  ]

  it('is a timeline: what happened, by whom and when, with a reason drawn as a quote', async () => {
    mockPO('goods_received', { approval_log: log })
    await openPO()
    goTab(/^Log/)
    const timeline = screen.getByRole('list', { name: 'Approval Log' })
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(3)
    expect(within(timeline).getByText('Approved')).toBeInTheDocument()
    expect(within(timeline).getByText('Rejected to draft')).toBeInTheDocument()
    expect(within(timeline).getByText('Edit applied')).toBeInTheDocument()
    expect(within(timeline).getByText(/checker@example\.com/)).toBeInTheDocument()
    expect(within(timeline).getByText('Wrong vendor')).toBeInTheDocument()
    // an entry with no person behind it is the system
    expect(within(timeline).getByText(/System/)).toBeInTheDocument()
  })

  it('colours the dot by the action: approved, rejected and the rest all differ', async () => {
    mockPO('goods_received', { approval_log: log })
    await openPO()
    goTab(/^Log/)
    const dotColour = (li: HTMLElement) => {
      const dot = li.querySelector<HTMLElement>('span[style*="border-radius: 50%"]')
      if (!dot) throw new Error('an entry has no dot')
      return dot.style.background
    }
    const dots = within(screen.getByRole('list', { name: 'Approval Log' }))
      .getAllByRole('listitem')
      .map(dotColour)
    expect(new Set(dots).size).toBe(3)
    expect(dots[0]).toContain('rgb')
  })

  it('says so when there is no activity, and when there are only notes', async () => {
    mockPO('goods_received')
    await openPO()
    goTab(/^Log/)
    expect(screen.getByText('No activity yet.')).toBeInTheDocument()
  })

  it('with PO notes but no activity it says there is no approval activity', async () => {
    mockPO('goods_received', { notes: 'Deliver to gate 2' })
    await openPO()
    goTab(/^Log/)
    expect(screen.getByText('Deliver to gate 2')).toBeInTheDocument()
    expect(screen.getByText('No approval activity yet.')).toBeInTheDocument()
  })

  it('adds a note to the log', async () => {
    mockPO('goods_received')
    await openPO()
    goTab(/^Log/)
    const add = screen.getByRole('button', { name: 'Add Note' })
    expect(add).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(i18n.t('po.detail.addNotePlaceholder')), {
      target: { value: ' Vendor called ' },
    })
    expect(add).toBeEnabled()
    fireEvent.click(add)
    expect(mutation('AddPOLogNote')).toHaveBeenCalledWith({
      variables: { poId: 'po-1', note: 'Vendor called' },
    })
  })
})

describe('the receipts and photos window', () => {
  const photosButton = () => screen.getByRole('button', { name: 'Receipts & photos ↗' })
  const frameWindow = (): Window => {
    const frame = document.createElement('iframe')
    document.body.appendChild(frame)
    if (!frame.contentWindow) throw new Error('no frame window')
    return frame.contentWindow
  }
  // not vi.restoreAllMocks(): that would empty every mutation mock this file builds with mockResolvedValue
  afterEach(() => {
    Reflect.deleteProperty(window, 'documentPictureInPicture')
    openSpy?.mockRestore()
    openSpy = undefined
  })
  let openSpy: { mockRestore: () => void } | undefined

  it('is a button at the top of the Receipts tab', async () => {
    mockPO('goods_received')
    await openPO()
    goTab(/^Receipts/)
    expect(photosButton()).toBeInTheDocument()
  })

  it('floats the viewer in a window of its own, drawn from this page, when the browser can', async () => {
    const win = frameWindow()
    const requestWindow = vi.fn().mockResolvedValue(win)
    Object.defineProperty(window, 'documentPictureInPicture', {
      value: { requestWindow },
      configurable: true,
    })
    const open = vi.spyOn(window, 'open')
    openSpy = open
    mockPO('goods_received')
    await openPO()
    goTab(/^Receipts/)
    await act(async () => {
      fireEvent.click(photosButton())
      await Promise.resolve()
    })
    expect(requestWindow).toHaveBeenCalledTimes(1)
    expect(open).not.toHaveBeenCalled()
    // the viewer is in the other window's document
    await waitFor(() => {
      expect(win.document.body.textContent).toContain('PO-2026-0056 · Receipts & photos')
    })
  })

  it('closes the floating window with the page', async () => {
    const win = frameWindow()
    const close = vi.spyOn(win, 'close')
    Object.defineProperty(window, 'documentPictureInPicture', {
      value: { requestWindow: vi.fn().mockResolvedValue(win) },
      configurable: true,
    })
    mockPO('goods_received')
    const view = await openPO()
    goTab(/^Receipts/)
    await act(async () => {
      fireEvent.click(photosButton())
      await Promise.resolve()
    })
    view.unmount()
    expect(close).toHaveBeenCalled()
  })

  it('opens a pop-up window when the browser has no floating window', async () => {
    const open = vi
      .spyOn(window, 'open')
      .mockReturnValue({ closed: false, focus: vi.fn() } as unknown as Window)
    openSpy = open
    mockPO('goods_received')
    await openPO()
    goTab(/^Receipts/)
    await act(async () => {
      fireEvent.click(photosButton())
      await Promise.resolve()
    })
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toBe('/viewer/purchase-orders/po-1/photos')
  })
})

describe('the Lines items look like the requisition', () => {
  const cellOf = (name: string): HTMLElement => {
    const el = screen.getByText(name).parentElement
    if (!el) throw new Error(`no item cell around ${name}`)
    return el
  }
  const childTexts = (el: HTMLElement) => Array.from(el.children).map((c) => c.textContent)

  it('shows the name, the Arabic name under it, then the SKU, and the name only once', async () => {
    mockPO('goods_received', {
      lines: [
        line('l1', {
          description: 'AC cover Nylon inside',
          product_name: 'AC cover Nylon inside',
          product_name_ar: 'كيس نايلون كفر للقطع الداخلية',
          sku: 'AC-001',
        }),
      ],
    })
    await openPO()
    // getByText throws when the name is drawn twice (it used to be: description, then the same product name)
    expect(childTexts(cellOf('AC cover Nylon inside'))).toEqual([
      'AC cover Nylon inside',
      'كيس نايلون كفر للقطع الداخلية',
      'AC-001',
    ])
  })

  it('draws the Arabic name right-to-left inside a block that follows the page', async () => {
    mockPO('goods_received', {
      lines: [line('l1', { product_name_ar: 'كيس نايلون', sku: 'AC-001' })],
    })
    await openPO()
    const arabic = screen.getByText('كيس نايلون')
    expect(arabic).toHaveAttribute('dir', 'rtl')
    expect(arabic.parentElement).toHaveStyle({ textAlign: 'start' })
  })

  it('adds the catalog name under an edited description, because it says something else', async () => {
    mockPO('goods_received', {
      lines: [
        line('l1', { description: 'Cover, grey, 2 pcs', product_name: 'AC cover Nylon inside' }),
      ],
    })
    await openPO()
    expect(childTexts(cellOf('Cover, grey, 2 pcs'))).toEqual([
      'Cover, grey, 2 pcs',
      'AC cover Nylon inside',
    ])
  })

  it('uses the catalog name when the line has no description of its own', async () => {
    mockPO('goods_received', {
      lines: [line('l1', { description: null, product_name: 'Pipe 1.5 inch' })],
    })
    await openPO()
    expect(childTexts(cellOf('Pipe 1.5 inch'))).toEqual(['Pipe 1.5 inch'])
  })

  it('shows only the name when there is no Arabic name and no SKU', async () => {
    mockPO('goods_received', { lines: [line('l1', { product_name: null })] })
    await openPO()
    expect(childTexts(cellOf('Item l1'))).toEqual(['Item l1'])
  })
})

describe('the Lines cards on a phone look like the requisition', () => {
  const card = (name: string): HTMLElement => {
    const el = screen.getByText(name).closest<HTMLElement>('[style*="border-radius: 12px"]')
    if (!el) throw new Error(`no card around ${name}`)
    return el
  }
  const labels = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('dt')).map((d) => d.textContent)

  it('keeps the field order of the columns: Qty first, Total, Received and Notes last', async () => {
    setWidth(390)
    mockPO('goods_received', { lines: [line('l1')] })
    await openPO()
    const names = labels(card('Item l1'))
    expect(names[0]).toBe('Qty')
    expect(names.at(-1)).toBe('Notes')
    expect(names.indexOf('Total')).toBeLessThan(names.indexOf('Received'))
    expect(names.indexOf('Received')).toBeLessThan(names.indexOf('Notes'))
  })

  it('keeps its own fill and edge, so there is a gap between the cards', async () => {
    setWidth(390)
    mockPO('goods_received', { lines: [line('l1'), line('l2')] })
    await openPO()
    const first = card('Item l1')
    expect(first).toHaveStyle({ background: themes['light-flat'].bgSurface })
    // the plain row style used to set a transparent background and its own 1px bottom border over the card's 0.5px edge
    expect(first.style.borderBottom).toContain('0.5px')
    expect(card('Item l2')).not.toBe(first)
  })

  it('still tints a line that has a state, such as a flagged audit line', async () => {
    setWidth(390)
    mockPO('finance_audit', {
      lines: [line('l1', { audit_status: 'flagged', audit_note: 'Wrong vendor' }), line('l2')],
    })
    await openPO()
    const flagged = card('Item l1')
    expect(flagged.style.background).not.toBe('')
    expect(flagged).not.toHaveStyle({ background: themes['light-flat'].bgSurface })
    expect(card('Item l2')).toHaveStyle({ background: themes['light-flat'].bgSurface })
  })

  it('has no second border around the cards: the Lines card is only a heading on a phone', async () => {
    setWidth(390)
    mockPO('goods_received', { lines: [line('l1')] })
    await openPO()
    const outer = screen
      .getByText('Purchase Order Lines')
      .closest<HTMLElement>('[style*="border-radius: 14px"]')
    if (!outer) throw new Error('no Lines card')
    expect(outer.style.background).toBe('transparent')
    expect(outer.style.boxShadow).toBe('none')
  })

  it('keeps the card around the table on a desktop', async () => {
    mockPO('goods_received', { lines: [line('l1')] })
    await openPO()
    const outer = screen
      .getByText('Purchase Order Lines')
      .closest<HTMLElement>('[style*="border-radius: 14px"]')
    if (!outer) throw new Error('no Lines card')
    expect(outer.style.background).not.toBe('transparent')
  })

  it('leaves the desktop rows as they were (a hairline and a 3px edge)', async () => {
    mockPO('goods_received', { lines: [line('l1')] })
    await openPO()
    const row = screen.getByText('Item l1').closest('tr')
    if (!row) throw new Error('no row')
    expect(row.style.borderLeft).toContain('3px')
  })
})
