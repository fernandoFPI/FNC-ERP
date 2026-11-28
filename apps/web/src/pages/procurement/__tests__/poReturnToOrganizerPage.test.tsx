// Finance sends a purchase order that failed its review back to the requisition's Organizer Review, and it keeps its number
// (migration 337, playbook #129). The PO page's part: the Return to Organizer button in the Finance review bar, its dialog (a reason is
// required), and the bar a PO shows while it is held. The server's rules are in services/gateway/tests/po-return-to-organizer-review.test.ts.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
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
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})
vi.mock('../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))
const navigateSpy = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => navigateSpy }
})
let systemLevel = false
vi.mock('../../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => false, canAny: () => false, isSystemLevel: systemLevel }),
}))
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

type Line = Record<string, unknown>
const line = (id: string): Line => ({
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
  audit_status: null,
  audit_note: null,
})

const results = {
  po: { data: undefined as unknown, loading: false, refetch: vi.fn() },
  returns: { data: { poReturns: [] as unknown[] }, loading: false },
  vendors: { data: { vendors: [] as unknown[] }, loading: false },
}
function mockPO(status: string, over: Record<string, unknown> = {}) {
  const po = {
    id: 'po-1',
    po_number: 'PO-2026-0056',
    vendor_id: 'v1',
    vendor_name: 'Cash Purchase',
    currency_code: 'IQD',
    status,
    priority: 'low',
    requisition_id: 'req-1',
    requisitionNumber: 'REQ-2026-0045',
    subtotal: null,
    tax_amount: '0',
    total_amount: null,
    currencyTotals: [{ currency_code: 'IQD', subtotal: '8000', line_count: 2 }],
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
    lines: [line('l1'), line('l2')],
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
  render(
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
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  systemLevel = false
  lockedByOther = false
  mutationCalls.clear()
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
  await i18n.changeLanguage('en')
})

const returnButton = () => screen.queryByRole('button', { name: 'Return to Organizer' })

describe('the Return to Organizer button in the Finance review bar', () => {
  it('is there for Finance on a purchase order made from a requisition, next to Return for Correction', async () => {
    mockPO('finance_review')
    await openPO()
    expect(returnButton()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return for Correction' })).toBeInTheDocument()
  })

  it('is not there for someone who may not audit (the bar only explains)', async () => {
    mockPO('finance_review', { callerIsFinanceTeam: false })
    await openPO()
    expect(returnButton()).toBeNull()
  })

  it('is there for a system-level user even when they are not on the finance team', async () => {
    systemLevel = true
    mockPO('finance_review', { callerIsFinanceTeam: false })
    await openPO()
    expect(returnButton()).toBeInTheDocument()
  })

  it('is not there for a purchase order made without a requisition (it has no review to go back to)', async () => {
    mockPO('finance_review', { requisition_id: null })
    await openPO()
    expect(returnButton()).toBeNull()
  })

  it('is not there at the older Finance audit status (only a requisition-split child PO can go back)', async () => {
    mockPO('finance_audit')
    await openPO()
    expect(returnButton()).toBeNull()
  })

  it('is disabled while someone else is editing the order', async () => {
    lockedByOther = true
    mockPO('finance_review')
    await openPO()
    expect(returnButton()).toBeDisabled()
  })
})

describe('the dialog', () => {
  // the overall reason box is the last text box: the ticked lines' own reason boxes come before it
  const lastTextbox = (dialog: HTMLElement): HTMLElement => {
    const boxes = within(dialog).getAllByRole('textbox')
    const last = boxes.at(-1)
    if (!last) throw new Error('no text box in the dialog')
    return last
  }
  async function openDialog() {
    mockPO('finance_review')
    await openPO()
    const open = returnButton()
    if (!open) throw new Error('no Return to Organizer button')
    fireEvent.click(open)
    return screen.getByRole('dialog', { name: 'Return to Organizer' })
  }

  it('explains that the order keeps its number, and will not send without a reason', async () => {
    const dialog = await openDialog()
    expect(dialog).toHaveTextContent('It keeps its number and is locked')
    const confirm = within(dialog).getByRole('button', { name: 'Return to Organizer' })
    expect(confirm).toBeDisabled()
    fireEvent.click(confirm)
    expect(mutationCalls.get('ReturnPOToOrganizer')).toBeDefined()
    expect(mutationCalls.get('ReturnPOToOrganizer')).not.toHaveBeenCalled()
  })

  it('sends the trimmed reasons with the order id and the lines that were ticked', async () => {
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /#2 Item l2/ }))
    fireEvent.change(within(dialog).getByPlaceholderText(/the invoice says 45 USD/i), {
      target: { value: '  Invoice says 45, we paid 40  ' },
    })
    fireEvent.change(lastTextbox(dialog), { target: { value: '  Invoice shows 45 USD  ' } })
    const confirm = within(dialog).getByRole('button', { name: 'Return to Organizer' })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(mutationCalls.get('ReturnPOToOrganizer')).toHaveBeenCalledTimes(1)
    expect(mutationCalls.get('ReturnPOToOrganizer')).toHaveBeenCalledWith({
      variables: {
        id: 'po-1',
        reason: 'Invoice shows 45 USD',
        lineFlags: [{ lineId: 'l2', reason: 'Invoice says 45, we paid 40' }],
      },
    })
  })

  it('lists every line of the order, none ticked to begin with', async () => {
    const dialog = await openDialog()
    const box = within(dialog).getByTestId('return-flag-lines')
    expect(within(box).getByText('Which lines are wrong?')).toBeInTheDocument()
    const ticks = within(box).getAllByRole('checkbox')
    expect(ticks).toHaveLength(2)
    expect(ticks.every((c) => !(c as HTMLInputElement).checked)).toBe(true)
    expect(within(dialog).queryByPlaceholderText(/the invoice says 45 USD/i)).toBeNull()
  })

  it('will not send without a ticked line, or with a ticked line that has no reason', async () => {
    const dialog = await openDialog()
    const confirm = within(dialog).getByRole('button', { name: 'Return to Organizer' })
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Prices do not match' },
    })
    // an overall reason alone is not enough: Finance must say which lines
    expect(confirm).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /#1 Item l1/ }))
    // ticked, but its reason is empty
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByPlaceholderText(/the invoice says 45 USD/i), {
      target: { value: '   ' },
    })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(dialog).getByPlaceholderText(/the invoice says 45 USD/i), {
      target: { value: 'wrong price' },
    })
    expect(confirm).toBeEnabled()
    // unticking it takes it out again: the box is empty, its reason box is gone and there is nothing left to send
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /#1 Item l1/ }))
    expect(within(dialog).getByRole('checkbox', { name: /#1 Item l1/ })).not.toBeChecked()
    expect(within(dialog).queryByPlaceholderText(/the invoice says 45 USD/i)).toBeNull()
    expect(confirm).toBeDisabled()
    expect(mutationCalls.get('ReturnPOToOrganizer')).not.toHaveBeenCalled()
  })

  it('will not send a ticked line with its reason but no overall reason', async () => {
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /#1 Item l1/ }))
    fireEvent.change(within(dialog).getByPlaceholderText(/the invoice says 45 USD/i), {
      target: { value: 'wrong price' },
    })
    const confirm = within(dialog).getByRole('button', { name: 'Return to Organizer' })
    expect(confirm).toBeDisabled()
    fireEvent.change(lastTextbox(dialog), { target: { value: 'Prices do not match' } })
    expect(confirm).toBeEnabled()
  })

  it('starts with the lines Finance already flagged in the audit, with the note it wrote', async () => {
    mockPO('finance_review', {
      lines: [{ ...line('l1'), audit_status: 'flagged', audit_note: 'Price is off' }, line('l2')],
    })
    await openPO()
    const open = returnButton()
    if (!open) throw new Error('no Return to Organizer button')
    fireEvent.click(open)
    const dialog = screen.getByRole('dialog', { name: 'Return to Organizer' })
    expect(within(dialog).getByRole('checkbox', { name: /#1 Item l1/ })).toBeChecked()
    expect(within(dialog).getByRole('checkbox', { name: /#2 Item l2/ })).not.toBeChecked()
    expect(within(dialog).getByPlaceholderText(/the invoice says 45 USD/i)).toHaveValue(
      'Price is off',
    )
  })

  it('Cancel closes it without sending', async () => {
    const dialog = await openDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Return to Organizer' })).toBeNull()
    })
    expect(mutationCalls.get('ReturnPOToOrganizer')).toBeDefined()
    expect(mutationCalls.get('ReturnPOToOrganizer')).not.toHaveBeenCalled()
  })
})

describe('a purchase order that was sent back', () => {
  const held = {
    returned_to_organizer_reason: 'Invoice shows 45 USD',
    returned_to_organizer_at: '2026-11-27T08:00:00Z',
  }

  it('says why and that it keeps its number, and points at the review', async () => {
    mockPO('returned_to_organizer', held)
    await openPO()
    expect(screen.getByText('Next Step: Waiting for the organizer')).toBeInTheDocument()
    expect(screen.getByText(/Invoice shows 45 USD/)).toBeInTheDocument()
    expect(screen.getByText(/keeps its number/, { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open the requisition review' }))
    expect(navigateSpy).toHaveBeenCalledWith('/procurement/requisitions/req-1')
  })

  it('still reads sensibly when the reason is missing', async () => {
    mockPO('returned_to_organizer', { returned_to_organizer_reason: null })
    await openPO()
    expect(
      screen.getByText(
        /Finance sent this purchase order back to the requisition's Organizer Review\. It keeps its number/,
      ),
    ).toBeInTheDocument()
  })

  it('offers no audit buttons and no second send-back while it is held', async () => {
    mockPO('returned_to_organizer', held)
    await openPO()
    expect(returnButton()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Return for Correction' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Pass Audit/ })).toBeNull()
  })

  it('shows its status with its own name in the header', async () => {
    mockPO('returned_to_organizer', held)
    await openPO()
    expect(screen.getAllByText('Returned to organizer').length).toBeGreaterThan(0)
  })
})
