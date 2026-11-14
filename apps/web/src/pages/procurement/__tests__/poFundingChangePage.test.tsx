// "Change funding source" on a PO that is waiting for payment.
//
// Funding used to be final after one click, and every PO starts as "vendor AP", so a cash purchase confirmed as AP could not be
// moved to the employee advance that paid for it (NY-PO-2026-0090). Finance can now re-open the same picker while the PO is
// waiting; the server refuses once a vendor invoice exists, a line is settled, or the PO is completed. Renders the real page.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ComponentType } from 'react'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'

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
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn() }
})

let perms: Record<string, boolean> = {}
vi.mock('../../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: (k: string) => !!perms[k],
    canAny: () => false,
    isSystemLevel: false,
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

const TOTALS = [{ currency_code: 'IQD', subtotal: '750000', line_count: 1 }]

function mockPO(status: string, over: Record<string, unknown> = {}) {
  const po = {
    id: 'po-1',
    po_number: 'NY-PO-2026-0090',
    vendor_name: 'Cash Purchase',
    currency_code: 'IQD',
    status,
    subtotal: '750000',
    tax_amount: '0',
    total_amount: '750000',
    currencyTotals: TOTALS,
    notes: '',
    expected_delivery_date: '',
    created_at: '2026-11-09T10:00:00.000Z',
    callerIsFinanceTeam: true,
    funding_source: 'vendor_ap',
    funding_decided: true,
    funding_advance_id: null,
    receipts: [],
    approval_log: [],
    edit_requests: [],
    lines: [
      {
        id: 'l1',
        description: 'Plastering, labour and materials',
        qty: 1,
        unit_price: 750000,
        initial_unit_price: 750000,
        total: 750000,
        actual_unit_price: 750000,
        currency_code: 'IQD',
        product_id: null,
        product_name: null,
        uom: 'lot',
        qty_received: 1,
        qty_from_stock: 0,
        account_id: null,
        cost_center_id: null,
      },
    ],
    ...over,
  }
  mockUseQuery.mockReturnValue({
    data: { purchaseOrder: po, poFxRates: { base_currency: 'IQD', rates: [] } },
    loading: false,
    refetch: vi.fn(),
  })
}

// The PO page is one of the largest modules in the app: importing it inside the first test can take longer than the 5 s test
// limit on a busy machine (it did, in a full run), so it is imported once, up front, with its own generous limit.
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
  // let the vendor-invoice lookup settle before asserting on what depends on it
  await act(async () => {
    await Promise.resolve()
  })
  return view
}

const t = (k: string, o?: Record<string, unknown>) => i18n.t(`po.detail.${k}`, o)
const changeButton = () => screen.queryByRole('button', { name: t('changeFundingSource') })
const requireChangeButton = () => {
  const el = changeButton()
  if (!el) throw new Error('the Change funding source button is not on the page')
  return el
}
const setFundingCalls: { variables: Record<string, unknown> }[] = []
let setFundingOptions: { onCompleted?: () => void } = {}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setFundingCalls.length = 0
  setFundingOptions = {}
  vendorInvoices = []
  perms = { 'finance.ap.view': true, 'finance.ap.approve': true, 'finance.ap.edit': true }
  mockUseMutation.mockImplementation(
    (
      doc: { definitions?: { name?: { value?: string } }[] },
      options?: { onCompleted?: () => void },
    ) => {
      const name = doc.definitions?.[0]?.name?.value
      if (name === 'SetPOFunding') {
        setFundingOptions = options ?? {}
        return [
          (args: { variables: Record<string, unknown> }) => {
            setFundingCalls.push(args)
            return Promise.resolve({})
          },
          { loading: false },
        ]
      }
      return [vi.fn().mockResolvedValue({}), { loading: false }]
    },
  )
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('who sees "Change funding source", and when', () => {
  it('Finance, on a vendor-AP PO that is waiting for payment and has no vendor invoice', async () => {
    mockPO('payment_pending')
    await openPO()
    expect(changeButton()).toBeInTheDocument()
  })

  it('Finance, on an advance-funded PO that is waiting for payment', async () => {
    mockPO('payment_pending', { funding_source: 'employee_advance', funding_advance_id: 'adv-1' })
    await openPO()
    expect(changeButton()).toBeInTheDocument()
  })

  it('the old-flow stage (invoiced) too', async () => {
    mockPO('invoiced')
    await openPO()
    expect(changeButton()).toBeInTheDocument()
  })

  it('not once a vendor invoice exists in AP', async () => {
    vendorInvoices = [{ id: 'inv-1', invoice_number: 'INV-1', status: 'draft' }]
    mockPO('payment_pending')
    await openPO()
    await waitFor(() => {
      expect(screen.getByText(t('vendorInvoiceCreated'))).toBeInTheDocument()
    })
    expect(changeButton()).toBeNull()
  })

  it('not for someone who can view AP but not approve', async () => {
    perms = { 'finance.ap.view': true }
    mockPO('payment_pending')
    await openPO()
    expect(changeButton()).toBeNull()
  })

  it('not on a PO that is completed or closed, and not for someone outside the finance team', async () => {
    mockPO('closed')
    const first = await openPO()
    expect(changeButton()).toBeNull()
    first.unmount()
    mockPO('payment_pending', { callerIsFinanceTeam: false })
    await openPO()
    expect(changeButton()).toBeNull()
  })

  it('not while the funding has not been decided: the picker is already open then', async () => {
    mockPO('payment_pending', { funding_decided: false })
    await openPO()
    expect(changeButton()).toBeNull()
    expect(screen.getByRole('button', { name: t('confirmFundingSource') })).toBeInTheDocument()
  })
})

describe('changing it', () => {
  it('opens the same picker, says what it is now, and offers to keep it', async () => {
    mockPO('payment_pending')
    await openPO()
    fireEvent.click(requireChangeButton())
    expect(
      screen.getByText(t('currentFunding', { source: t('vendorAccountsPayable') })),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('keepFundingSource') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('employeeAdvance') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('confirmFundingSource') })).toBeDisabled() // nothing chosen yet
    expect(changeButton()).toBeNull() // the control is replaced by the picker
  })

  it('an advance-funded PO says so', async () => {
    mockPO('payment_pending', { funding_source: 'employee_advance', funding_advance_id: 'adv-1' })
    await openPO()
    fireEvent.click(requireChangeButton())
    expect(
      screen.getByText(t('currentFunding', { source: t('employeeAdvance') })),
    ).toBeInTheDocument()
  })

  it('moving to an employee advance asks for the employee and the advance, and waits for them', async () => {
    mockPO('payment_pending')
    await openPO()
    fireEvent.click(requireChangeButton())
    fireEvent.click(screen.getByRole('button', { name: t('employeeAdvance') }))
    expect(screen.getByText(t('advance'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('confirmFundingSource') })).toBeDisabled()
    expect(setFundingCalls).toHaveLength(0)
  })

  it('moving an advance-funded PO to vendor AP sends the change, without an advance', async () => {
    mockPO('payment_pending', { funding_source: 'employee_advance', funding_advance_id: 'adv-1' })
    await openPO()
    fireEvent.click(requireChangeButton())
    fireEvent.click(screen.getByRole('button', { name: t('vendorAccountsPayable') }))
    fireEvent.click(screen.getByRole('button', { name: t('confirmFundingSource') }))
    expect(setFundingCalls).toEqual([
      { variables: { id: 'po-1', fundingSource: 'vendor_ap', fundingAdvanceId: undefined } },
    ])
  })

  it('"keep current funding" closes the picker and sends nothing', async () => {
    mockPO('payment_pending')
    await openPO()
    fireEvent.click(requireChangeButton())
    fireEvent.click(screen.getByRole('button', { name: t('keepFundingSource') }))
    expect(changeButton()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('confirmFundingSource') })).toBeNull()
    expect(setFundingCalls).toHaveLength(0)
  })

  it('once the server has saved the change the picker closes', async () => {
    mockPO('payment_pending')
    await openPO()
    fireEvent.click(requireChangeButton())
    expect(screen.getByRole('button', { name: t('confirmFundingSource') })).toBeInTheDocument()
    act(() => {
      setFundingOptions.onCompleted?.()
    })
    expect(screen.queryByRole('button', { name: t('confirmFundingSource') })).toBeNull()
    expect(changeButton()).toBeInTheDocument()
  })

  it('is available in Arabic with its own text', async () => {
    await i18n.changeLanguage('ar')
    mockPO('payment_pending')
    await openPO()
    expect(
      screen.getByRole('button', { name: i18n.t('po.detail.changeFundingSource') }),
    ).toBeInTheDocument()
    expect(i18n.t('po.detail.changeFundingSource')).not.toBe('Change funding source')
    expect(i18n.t('po.detail.changeFundingSource')).not.toMatch(/po\.detail/)
  })
})
