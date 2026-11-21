// Stale stock cost on the requisition page (playbook #111). A line drawn from stock whose item's Cost has not changed or been confirmed
// for over a month is tinted and tagged "Double-check the store price", and a notice above the lines lists the items. A store keeper (or an
// admin) can press "Price confirmed"; everyone else just sees the notice. At the Inventory Check the line is flagged as the quantity is
// typed, because that is the moment the store keeper decides to draw on stock.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})
vi.mock('../../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))

let mockAuthUser: { id: string; role: string } = { id: 'user-admin', role: 'system_admin' }
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: mockAuthUser }),
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: 'req-1' }) }
})

const NOTICE = 'stale-cost-notice'
const TAG_47 = 'Cost unchanged for 47 days. Double-check the store price.'

function line(over: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    line_number: 1,
    description: 'Pipe 2in',
    product_id: 'prod-1',
    product_name: 'Pipe 2in',
    sku: 'PIPE-2',
    qty: '5',
    uom: 'pc',
    currency_code: 'USD',
    unit_price: '12.5',
    qty_from_stock: '0',
    store_price: null,
    market_price: null,
    verified_price: null,
    total: '62.5',
    purchases: [],
    owner_handles: false,
    cost_age_days: 47,
    cost_stale: true,
    ...over,
  }
}

function baseReq(over: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    requisition_number: 'REQ-2026-001',
    status: 'pending_approval',
    priority: 'low',
    purpose: 'project',
    delivery_destination: 'inventory',
    project_id: 'proj-1',
    projectCode: 'PRJ-004',
    projectName: 'Tower A',
    branch_id: null,
    branch_name: null,
    organizer_id: 'user-organizer',
    organizerName: 'Jane Doe',
    notes: null,
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-01-15T10:00:00.000Z',
    callerHasStoreKeeperPosition: false,
    callerHasStorePricingPosition: false,
    callerHasMarketPricingPosition: false,
    callerHasPriceVerificationPosition: false,
    callerCanApprove: false,
    currencyTotals: [{ currency_code: 'USD', subtotal: '62.5', line_count: 1 }],
    lines: [line({ qty_from_stock: '2' })],
    approval_log: [],
    ...over,
  }
}

const availability = [
  {
    lineId: 'line-1',
    qtyRequired: 5,
    qtyOnHand: 8,
    qtyAvailable: 8,
    isAvailable: true,
    byLocation: [
      {
        companyId: 'co-1',
        companyName: 'Main Co',
        locationId: 'loc-1',
        locationName: 'Main Warehouse',
        qtyOnHand: 8,
        qtyAvailable: 8,
      },
    ],
  },
]

const refetchMock = vi.fn()
function mockReq(over: Record<string, unknown> = {}) {
  mockUseQuery.mockImplementation(
    (doc: unknown, opts?: { variables?: Record<string, unknown> }) => {
      const op = (
        doc as { definitions?: { kind?: string; name?: { value?: string } }[] }
      ).definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      if (op === 'POLineComments')
        return { data: { poLineComments: [] }, loading: false, refetch: vi.fn() }
      if (op === 'RequisitionChildPurchaseOrders')
        return { data: { requisitionChildPurchaseOrders: [] }, loading: false, refetch: vi.fn() }
      if (op === 'MaterialIssues')
        return { data: { materialIssues: [] }, loading: false, refetch: vi.fn() }
      if (op === 'RequisitionStockAvailability')
        return {
          data: { requisitionStockAvailability: availability },
          loading: false,
          refetch: vi.fn(),
        }
      if (opts?.variables && 'isActive' in opts.variables)
        return { data: { stockLocations: [] }, loading: false, refetch: vi.fn() }
      return { data: { requisition: baseReq(over) }, loading: false, refetch: refetchMock }
    },
  )
}

// a mock of the confirm mutation: typed so assigning it needs no `any`
const makeConfirm = (impl: () => Promise<unknown>) => vi.fn((_args?: unknown) => impl())
let confirmCost: ReturnType<typeof makeConfirm>
let confirmOptions: { onCompleted?: () => void; onError?: (e: Error) => void } = {}
function mutationsByName() {
  mockUseMutation.mockImplementation((doc: unknown, options?: typeof confirmOptions) => {
    const op =
      (doc as { definitions?: { kind?: string; name?: { value?: string } }[] }).definitions?.find(
        (d) => d.kind === 'OperationDefinition',
      )?.name?.value ?? ''
    if (op === 'ConfirmRequisitionStockCost') confirmOptions = options ?? {}
    return op === 'ConfirmRequisitionStockCost'
      ? [confirmCost, { loading: false }]
      : [vi.fn().mockResolvedValue({}), { loading: false }]
  })
}

async function open() {
  const RequisitionDetail = (await import('../RequisitionDetail')).default
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions/req-1']}>
      <ThemeProvider>
        <RequisitionDetail />
      </ThemeProvider>
    </MemoryRouter>,
  )
}
const noticeOf = () => screen.queryByTestId(NOTICE)
const tags = () => screen.queryAllByTestId('stale-cost-tag')
// the same, for a test that expects the notice / the first tag to be there: a readable failure instead of a non-null assertion
const noticeEl = (): HTMLElement => {
  const n = noticeOf()
  if (!n) throw new Error('the stale cost notice is not on the page')
  return n
}
const tagAt = (i: number): HTMLElement => {
  const x = tags().at(i)
  if (!x) throw new Error(`tag ${i} is not on the page`)
  return x
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  confirmOptions = {}
  mockAuthUser = { id: 'user-admin', role: 'system_admin' }
  confirmCost = makeConfirm(() => Promise.resolve({}))
  mutationsByName()
  mockReq()
})
afterEach(async () => {
  if (i18n.language !== 'en')
    await act(async () => {
      await i18n.changeLanguage('en')
    })
})

describe('a line drawn from stock whose item Cost is old', () => {
  it('is tagged on its row, and the requisition lists the item in a notice that says to double-check the store price', async () => {
    await open()
    expect(tags()).toHaveLength(1)
    expect(within(tagAt(0)).getByText(TAG_47)).toBeInTheDocument()
    const notice = within(noticeEl())
    expect(notice.getByText('Double-check the store price')).toBeInTheDocument()
    expect(notice.getByText('Pipe 2in')).toBeInTheDocument()
    expect(notice.getByText('PIPE-2')).toBeInTheDocument()
    expect(notice.getByText('Cost unchanged for 47 days')).toBeInTheDocument()
    expect(notice.getByRole('link', { name: 'Open item' })).toHaveAttribute(
      'href',
      '/inventory/products/prod-1',
    )
  })

  it('has its row tinted with the warning edge, like a flagged line but in the warning colour', async () => {
    await open()
    const row = screen
      .getAllByText('Pipe 2in')
      .map((e) => e.closest('tr'))
      .find((r) => r && within(r).queryByTestId('stale-cost-tag'))
    expect(row).toBeTruthy()
    expect(row?.getAttribute('style') ?? '').toMatch(/border-inline-start:\s*4px solid/)
  })

  it('is not flagged when no stock covers it, even though the Cost is old', async () => {
    mockReq({ lines: [line({ qty_from_stock: '0' })] })
    await open()
    expect(tags()).toHaveLength(0)
    expect(noticeOf()).toBeNull()
  })

  it('is not flagged when the server says the Cost is recent', async () => {
    mockReq({ lines: [line({ qty_from_stock: '2', cost_stale: false, cost_age_days: 3 })] })
    await open()
    expect(tags()).toHaveLength(0)
    expect(noticeOf()).toBeNull()
  })

  it('is not flagged for a custom line with no catalog item', async () => {
    mockReq({
      lines: [
        line({ qty_from_stock: '2', product_id: null, cost_stale: false, cost_age_days: null }),
      ],
    })
    await open()
    expect(noticeOf()).toBeNull()
  })

  it('lists one item once however many lines draw on it, with the oldest age', async () => {
    mockReq({
      lines: [
        line({ id: 'line-1', qty_from_stock: '2', cost_age_days: 40 }),
        line({ id: 'line-2', line_number: 2, qty_from_stock: '1', cost_age_days: 52 }),
      ],
    })
    await open()
    expect(tags()).toHaveLength(2)
    const notice = within(noticeEl())
    expect(notice.getAllByRole('link', { name: 'Open item' })).toHaveLength(1)
    expect(notice.getByText('Cost unchanged for 52 days')).toBeInTheDocument()
  })
})

describe('Price confirmed', () => {
  it('is offered to a Store Keeper of the requisition and sends the requisition and the item', async () => {
    mockAuthUser = { id: 'user-keeper', role: 'user' }
    mockReq({ callerHasStoreKeeperPosition: true })
    await open()
    fireEvent.click(within(noticeEl()).getByRole('button', { name: /Price confirmed/ }))
    expect(confirmCost).toHaveBeenCalledTimes(1)
    expect(confirmCost).toHaveBeenCalledWith({
      variables: { requisitionId: 'req-1', productId: 'prod-1' },
    })
  })

  it('is offered to an administrator too', async () => {
    await open()
    expect(within(noticeEl()).getByRole('button', { name: /Price confirmed/ })).toBeInTheDocument()
  })

  it('is not offered to anyone else, who still sees the notice', async () => {
    mockAuthUser = { id: 'user-nobody', role: 'user' }
    await open()
    expect(noticeOf()).not.toBeNull()
    expect(within(noticeEl()).queryByRole('button', { name: /Price confirmed/ })).toBeNull()
  })

  it('is held (disabled, busy) while it is being saved, so it cannot be sent twice', async () => {
    confirmCost = makeConfirm(() => new Promise(() => undefined))
    mutationsByName()
    await open()
    const button = () => within(noticeEl()).getByRole('button', { name: /Price confirmed/ })
    fireEvent.click(button())
    expect(button()).toBeDisabled()
    fireEvent.click(button())
    expect(confirmCost).toHaveBeenCalledTimes(1)
  })
})

describe('after pressing Price confirmed', () => {
  const button = () => within(noticeEl()).getByRole('button', { name: /Price confirmed/ })

  it('refreshes the requisition when the confirmation is saved, so the flag clears, and frees the button', async () => {
    await open()
    fireEvent.click(button())
    expect(button()).toBeDisabled()
    const before = refetchMock.mock.calls.length
    act(() => {
      confirmOptions.onCompleted?.()
    })
    expect(refetchMock.mock.calls.length).toBeGreaterThan(before)
    expect(button()).not.toBeDisabled()
  })

  it('frees the button again when the confirmation is refused, so it can be tried again', async () => {
    await open()
    fireEvent.click(button())
    expect(button()).toBeDisabled()
    act(() => {
      confirmOptions.onError?.(new Error('Only a Store Keeper can confirm a store price'))
    })
    expect(button()).not.toBeDisabled()
  })
})

describe('at the inventory check', () => {
  const keeper = () => {
    mockAuthUser = { id: 'user-keeper', role: 'user' }
    mockReq({
      status: 'inventory_check',
      callerHasStoreKeeperPosition: true,
      lines: [line({ qty_from_stock: '0' })],
    })
  }
  const qtyBox = () => screen.getByLabelText<HTMLInputElement>(/^Qty from stock: Pipe 2in$/)

  it('flags the line as the quantity to take from stock is typed, and clears the flag when it goes back to zero', async () => {
    keeper()
    await open()
    expect(tags()).toHaveLength(0)
    expect(noticeOf()).toBeNull()
    fireEvent.change(qtyBox(), { target: { value: '2' } })
    expect(tags()).toHaveLength(1)
    expect(noticeOf()).not.toBeNull()
    fireEvent.change(qtyBox(), { target: { value: '0' } })
    expect(tags()).toHaveLength(0)
    expect(noticeOf()).toBeNull()
  })

  it('does not flag a line whose item has a recent Cost, whatever is typed', async () => {
    mockAuthUser = { id: 'user-keeper', role: 'user' }
    mockReq({
      status: 'inventory_check',
      callerHasStoreKeeperPosition: true,
      lines: [line({ qty_from_stock: '0', cost_stale: false, cost_age_days: 4 })],
    })
    await open()
    fireEvent.change(qtyBox(), { target: { value: '2' } })
    expect(tags()).toHaveLength(0)
  })

  it('makes no claim about a line whose item was replaced at the check: the age belongs to the original item', async () => {
    mockAuthUser = { id: 'user-keeper', role: 'user' }
    mockReq({
      status: 'inventory_check',
      callerHasStoreKeeperPosition: true,
      lines: [line({ qty_from_stock: '0' })],
    })
    // the store keeper had picked a different item for this line and typed a quantity (the page keeps that draft across a refresh)
    localStorage.setItem(
      'fnc_inv_check_draft_req-1',
      JSON.stringify({
        invQty: { 'line-1': '2' },
        invLoc: {},
        productOverride: { 'line-1': 'prod-other' },
      }),
    )
    await open()
    expect(qtyBox().value).toBe('2')
    expect(tags()).toHaveLength(0)
    expect(noticeOf()).toBeNull()
  })

  it('shows nothing to someone who cannot enter the check: no stock has been chosen yet', async () => {
    mockAuthUser = { id: 'user-nobody', role: 'user' }
    mockReq({ status: 'inventory_check', lines: [line({ qty_from_stock: '0' })] })
    await open()
    expect(tags()).toHaveLength(0)
    expect(noticeOf()).toBeNull()
  })
})

describe('in Arabic', () => {
  it('is written in Arabic, with no raw key on the page', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    await open()
    expect(noticeOf()).not.toBeNull()
    expect(document.body.textContent).not.toMatch(/req\.detail\.staleCost/)
    expect(within(noticeEl()).getByText('راجع سعر المخزن مرة أخرى')).toBeInTheDocument()
    expect(within(noticeEl()).getByRole('button', { name: /تم تأكيد السعر/ })).toBeInTheDocument()
    expect(
      within(tagAt(0)).getByText('التكلفة لم تتغير منذ 47 يوماً. راجع سعر المخزن.'),
    ).toBeInTheDocument()
  })
})
