import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'

import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

// ── Apollo mock ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
const mockUseLazyQuery = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    useLazyQuery: (...args: unknown[]): unknown => mockUseLazyQuery(...args),
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})

vi.mock('../../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string }; accessToken: string }) => unknown) =>
    selector({ user: { id: 'user-buyer' }, accessToken: 'test-token' }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'req-1' }) }
})

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions/req-1/items-bought']}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

function baseLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    line_number: 1,
    description: 'Cement bags',
    product_id: 'prod-1',
    product_name: 'Cement',
    sku: 'CEM-1',
    qty: '10',
    uom: 'bag',
    currency_code: 'IQD',
    unit_price: '100',
    approved_unit_price: '100',
    qty_from_stock: '0',
    short_reason: null,
    short_marked_by: null,
    short_marked_at: null,
    account_id: null,
    account_code: null,
    account_name: null,
    cost_center_id: null,
    cost_center_name: null,
    purchases: [],
    ...overrides,
  }
}

function mockReq(lines: Record<string, unknown>[], overrides: Record<string, unknown> = {}) {
  mockUseQuery.mockImplementation((doc: unknown) => {
    const opName = (doc as { definitions?: { kind?: string; name?: { value?: string } }[] }).definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
    if (opName === 'Vendors') {
      return {
        data: {
          vendors: [
            { id: 'vendor-1', name: 'Al-Rasheed Hardware', is_cash_purchase: false },
            { id: 'vendor-cash', name: 'Cash Purchase', is_cash_purchase: true },
          ],
        },
        loading: false,
      }
    }
    return {
      data: {
        requisition: {
          id: 'req-1',
          requisition_number: 'REQ-2026-001',
          status: 'items_bought',
          callerHasBuyerPosition: true,
          callerCanApprove: false,
          lines,
          ...overrides,
        },
      },
      loading: false,
      refetch: vi.fn(),
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMutation.mockReturnValue([
    vi.fn().mockResolvedValue({ data: { ensureCashPurchaseVendor: { id: 'vendor-cash' } } }),
    { loading: false },
  ])
  mockUseLazyQuery.mockReturnValue([vi.fn(), { data: undefined, loading: false }])
  mockReq([baseLine()])
})

describe('ItemsBoughtPage', () => {
  it('renders the line and a Cash Purchase option in the vendor picker', async () => {
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByText('Cement bags')).toBeInTheDocument()
    // The option only renders once the SearchableSelect dropdown opens.
    fireEvent.click(screen.getByText('Search vendor…'))
    expect(screen.getByText(/cash purchase/i)).toBeInTheDocument()
  })

  it('shows a read-only message when the caller has no buyer position', async () => {
    mockReq([baseLine()], { callerHasBuyerPosition: false })
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByText(/only a buyer position holder/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record purchase/i })).not.toBeInTheDocument()
  })

  it('shows Fully bought and hides the record-purchase form once a line is fully covered', async () => {
    mockReq([
      baseLine({
        purchases: [
          {
            id: 'p1',
            vendor_id: 'vendor-1',
            vendor_name: 'Al-Rasheed Hardware',
            currency_code: 'IQD',
            qty: '10',
            actual_unit_price: '100',
            bought_by: 'user-buyer',
            bought_by_name: 'Buyer One',
            bought_at: '2026-01-01T00:00:00.000Z',
            over_tolerance: false,
            tolerance_approved_by: null,
            receipt_file_id: 'file-1',
            receipt_filename: 'receipt.jpg',
          },
        ],
      }),
    ])
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByText('Fully bought')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^record purchase$/i })).not.toBeInTheDocument()
  })

  it('shows Marked short and no record-purchase form for a shorted line', async () => {
    mockReq([baseLine({ short_marked_at: '2026-01-02T00:00:00.000Z', short_reason: 'vendor out of stock' })])
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByText(/marked short/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^record purchase$/i })).not.toBeInTheDocument()
  })

  it('disables Finish Buying and explains why when a line is unresolved', async () => {
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    const finishBtn = screen.getByRole('button', { name: /finish buying/i })
    expect(finishBtn).toBeDisabled()
    expect(screen.getByText(/still have qty remaining/i)).toBeInTheDocument()
  })

  it('disables Finish Buying when a purchase is missing its receipt', async () => {
    mockReq([
      baseLine({
        purchases: [
          {
            id: 'p1',
            vendor_id: 'vendor-1',
            vendor_name: 'Al-Rasheed Hardware',
            currency_code: 'IQD',
            qty: '10',
            actual_unit_price: '100',
            bought_by: 'user-buyer',
            over_tolerance: false,
            tolerance_approved_by: null,
            receipt_file_id: null,
            bought_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ])
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByRole('button', { name: /finish buying/i })).toBeDisabled()
    expect(screen.getByText(/missing a receipt photo/i)).toBeInTheDocument()
  })

  it('disables Finish Buying when an over-tolerance purchase is unapproved, and enables it once fully resolved', async () => {
    mockReq([
      baseLine({
        purchases: [
          {
            id: 'p1',
            vendor_id: 'vendor-1',
            vendor_name: 'Al-Rasheed Hardware',
            currency_code: 'IQD',
            qty: '10',
            actual_unit_price: '150',
            bought_by: 'user-buyer',
            over_tolerance: true,
            tolerance_approved_by: null,
            receipt_file_id: 'file-1',
            bought_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ])
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByRole('button', { name: /finish buying/i })).toBeDisabled()
    expect(screen.getByText(/still need supervisor approval/i)).toBeInTheDocument()

    mockReq([
      baseLine({
        purchases: [
          {
            id: 'p1',
            vendor_id: 'vendor-1',
            vendor_name: 'Al-Rasheed Hardware',
            currency_code: 'IQD',
            qty: '10',
            actual_unit_price: '150',
            bought_by: 'user-buyer',
            over_tolerance: true,
            tolerance_approved_by: 'user-supervisor',
            tolerance_approved_by_name: 'Supervisor One',
            receipt_file_id: 'file-1',
            bought_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ])
    wrap(<ItemsBoughtPage />)
    const enabledFinishButtons = screen.getAllByRole('button', { name: /finish buying/i })
    expect(enabledFinishButtons[enabledFinishButtons.length - 1]).not.toBeDisabled()
  })

  it('pre-fills Qty with the remaining quantity and Actual price with the approved price, without typing', async () => {
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    const { container } = wrap(<ItemsBoughtPage />)
    const numberInputs = container.querySelectorAll('input[type="number"]')
    const qtyInput = numberInputs[0] as HTMLInputElement
    const priceInput = numberInputs[1] as HTMLInputElement
    expect(qtyInput.value).toBe('10')
    expect(priceInput.value).toBe('100')
  })

  it('does not offer the "same vendor" toggle for a single-line requisition', async () => {
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.queryByText(/all items are from the same vendor/i)).not.toBeInTheDocument()
  })

  it('applies one vendor to every line via the "same vendor for all" toggle', async () => {
    mockReq([
      baseLine({ id: 'line-1', description: 'Cement bags' }),
      baseLine({ id: 'line-2', description: 'Rebar', product_name: 'Rebar' }),
    ])
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)

    // Before toggling, each line has its own vendor picker.
    expect(screen.getAllByText('Search vendor…')).toHaveLength(2)

    fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))

    // Toggled on: one shared picker replaces both per-line ones.
    expect(screen.getAllByText('Search vendor…')).toHaveLength(1)
    fireEvent.click(screen.getByText('Search vendor…'))
    fireEvent.mouseDown(screen.getByText('Al-Rasheed Hardware'))

    // The shared vendor now shows read-only against both lines, plus once
    // more as the shared picker's own selected value.
    expect(screen.getAllByText('Al-Rasheed Hardware')).toHaveLength(3)
  })

  it('attaches one receipt to every line via the "same receipt for all" toggle', async () => {
    mockReq([
      baseLine({ id: 'line-1', description: 'Cement bags' }),
      baseLine({ id: 'line-2', description: 'Rebar', product_name: 'Rebar' }),
    ])
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    const { container } = wrap(<ItemsBoughtPage />)

    fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))

    const file = new File(['x'], 'invoice.jpg', { type: 'image/jpeg' })
    const globalFileInput = container.querySelector('input[type="file"]')
    if (!globalFileInput) throw new Error('Expected a file input in the container')
    fireEvent.change(globalFileInput, { target: { files: [file] } })

    // Both lines show the shared receipt(s) read-only instead of their own attach button.
    expect(screen.getAllByText(/1 file \(same for all items\)/)).toHaveLength(2)
    expect(screen.queryByText('Attach receipt photo(s) *')).not.toBeInTheDocument()
  })

  it('disables the Approve override button for the same user who recorded the purchase', async () => {
    mockReq(
      [
        baseLine({
          purchases: [
            {
              id: 'p1',
              vendor_id: 'vendor-1',
              vendor_name: 'Al-Rasheed Hardware',
              currency_code: 'IQD',
              qty: '10',
              actual_unit_price: '150',
              bought_by: 'user-buyer',
              over_tolerance: true,
              tolerance_approved_by: null,
              receipt_file_id: 'file-1',
              bought_at: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      ],
      { callerCanApprove: true },
    )
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByRole('button', { name: /needs a different approver/i })).toBeDisabled()
  })
})

// Migration 315: the requisition's organizer may buy the lines he took at Market pricing (owner_handles); procurement
// buys the rest, and can step in on any line. The test user here is 'user-buyer'.
describe('ItemsBoughtPage: the organizer buys the lines he took', () => {
  const mine = (overrides: Record<string, unknown> = {}) =>
    baseLine({ id: 'line-mine', description: 'Kitchen gloves', owner_handles: true, ...overrides })
  const theirs = (overrides: Record<string, unknown> = {}) =>
    baseLine({ id: 'line-theirs', description: 'Cement bags', owner_handles: false, ...overrides })
  const asOrganizer = { organizer_id: 'user-buyer', callerHasBuyerPosition: false }

  it('shows the record form for his own line, with a note and a marker, and hides the "buyer only" warning', async () => {
    mockReq([mine()], asOrganizer)
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByRole('button', { name: /record purchase/i })).toBeInTheDocument()
    expect(screen.getByText(/you can record purchases for the items you took/i)).toBeInTheDocument()
    expect(screen.getByText("Organizer's item")).toBeInTheDocument()
    expect(screen.queryByText(/only a buyer position holder/i)).not.toBeInTheDocument()
  })

  it("offers the form only on his lines, not on procurement's", async () => {
    mockReq([mine(), theirs()], asOrganizer)
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getAllByRole('button', { name: /record purchase/i })).toHaveLength(1)
    expect(screen.getAllByText('Mark short')).toHaveLength(1)
  })

  it('does not offer "all items are from the same vendor" when only one line is his to buy', async () => {
    mockReq([mine(), theirs()], asOrganizer)
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.queryByText(/all items are from the same vendor/i)).not.toBeInTheDocument()
  })

  it('offers it when two of the lines are his', async () => {
    mockReq([mine(), mine({ id: 'line-mine-2', description: 'Dish soap' })], asOrganizer)
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByText(/all items are from the same vendor/i)).toBeInTheDocument()
  })

  it('gives him no Finish Buying button: that stays with procurement', async () => {
    mockReq([mine()], asOrganizer)
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.queryByRole('button', { name: /^finish buying$/i })).not.toBeInTheDocument()
  })

  it('keeps the read-only warning when none of the lines is his', async () => {
    mockReq([theirs()], asOrganizer)
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByText(/only a buyer position holder/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record purchase/i })).not.toBeInTheDocument()
  })

  it("does not let someone else use the flag on another person's requisition", async () => {
    mockReq([mine()], { organizer_id: 'somebody-else', callerHasBuyerPosition: false })
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getByText(/only a buyer position holder/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /record purchase/i })).not.toBeInTheDocument()
  })

  it('a procurement buyer still sees the form on every line, and the Finish Buying card says it happens by itself', async () => {
    mockReq([mine(), theirs()], { organizer_id: 'somebody-else', callerHasBuyerPosition: true })
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    expect(screen.getAllByRole('button', { name: /record purchase/i })).toHaveLength(2)
    expect(
      screen.getByText(/this happens by itself once every item is bought/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^finish buying$/i })).toBeInTheDocument()
  })
})

// "Record all purchases" walks every line that still needs buying; for the organizer that must be only the lines he
// took, or the loop would stop at the first line the server refuses.
describe('ItemsBoughtPage: record all purchases only walks the lines the caller may buy', () => {
  interface RecordArg {
    variables: { input: { lineId: string } }
  }
  const recordCalls = vi.fn<[RecordArg], Promise<unknown>>()

  beforeEach(() => {
    recordCalls.mockReset()
    mockUseMutation.mockImplementation((doc: unknown) => {
      const opName = (
        doc as { definitions?: { kind?: string; name?: { value?: string } }[] }
      ).definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      if (opName === 'RequestUploadUrl')
        return [
          vi.fn().mockResolvedValue({ data: { requestUploadUrl: { fileId: 'file-1' } } }),
          { loading: false },
        ]
      if (opName === 'RecordLinePurchase') {
        recordCalls.mockResolvedValue({ data: { recordLinePurchase: { id: 'purchase-x' } } })
        return [recordCalls, { loading: false }]
      }
      return [
        vi.fn().mockResolvedValue({ data: { ensureCashPurchaseVendor: { id: 'vendor-cash' } } }),
        { loading: false },
      ]
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const line = (id: string, owner: boolean) =>
    baseLine({ id, description: `Item ${id}`, owner_handles: owner })

  async function recordAll() {
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    const { container } = wrap(<ItemsBoughtPage />)
    fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
    fireEvent.click(screen.getByText('Search vendor…'))
    // the options choose on mouse-down, not click
    fireEvent.mouseDown(screen.getByText('Al-Rasheed Hardware'))
    fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
    const input = container.querySelector('input[type="file"]')
    if (!input) throw new Error('Expected a file input in the container')
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'receipt.jpg', { type: 'image/jpeg' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: /record all purchases/i }))
    await waitFor(() => {
      expect(recordCalls).toHaveBeenCalled()
    })
  }
  const recordedLines = () => recordCalls.mock.calls.map(([arg]) => arg.variables.input.lineId)

  it('the organizer records his two lines and leaves the one that is procurement’s alone', async () => {
    mockReq([line('line-a', true), line('line-b', false), line('line-c', true)], {
      organizer_id: 'user-buyer',
      callerHasBuyerPosition: false,
    })
    await recordAll()
    await waitFor(() => {
      expect(recordedLines()).toEqual(['line-a', 'line-c'])
    })
  })

  it('a procurement buyer records all three, the organizer’s included', async () => {
    mockReq([line('line-a', true), line('line-b', false), line('line-c', true)], {
      organizer_id: 'somebody-else',
      callerHasBuyerPosition: true,
    })
    await recordAll()
    await waitFor(() => {
      expect(recordedLines()).toEqual(['line-a', 'line-b', 'line-c'])
    })
  })
})

// Every line that needs buying says who buys it; one fully covered from stock has nobody to say.
describe('ItemsBoughtPage: each line says who buys it', () => {
  it('tags the organizer’s line and procurement’s line, and leaves a stock-covered line untagged', async () => {
    mockReq(
      [
        baseLine({ id: 'line-a', description: 'Kitchen gloves', owner_handles: true }),
        baseLine({ id: 'line-b', description: 'Cement bags', owner_handles: false }),
        baseLine({
          id: 'line-c',
          description: 'From the shelf',
          qty: '4',
          qty_from_stock: '4',
          owner_handles: false,
        }),
      ],
      {
        organizer_id: 'somebody-else',
        organizerName: 'Jane Doe',
        procurementOfficerName: 'Ahmed Ali',
        callerHasBuyerPosition: true,
      },
    )
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    // the tag sits inside the element that holds the item name
    const cardOf = (name: string) => within(screen.getByText(name))
    expect(cardOf('Kitchen gloves').getByText("Organizer's item")).toBeInTheDocument()
    expect(cardOf('Kitchen gloves').queryByText("Procurement's item")).not.toBeInTheDocument()
    expect(cardOf('Cement bags').getByText("Procurement's item")).toBeInTheDocument()
    expect(cardOf('From the shelf').queryByText("Procurement's item")).not.toBeInTheDocument()
    expect(cardOf('From the shelf').queryByText("Organizer's item")).not.toBeInTheDocument()
  })

  it('names the person beside the tag, and the buyer once someone has recorded a purchase', async () => {
    mockReq(
      [
        baseLine({ id: 'line-a', description: 'Kitchen gloves', owner_handles: true }),
        baseLine({ id: 'line-b', description: 'Cement bags', owner_handles: false }),
        baseLine({
          id: 'line-c',
          description: 'Rebar',
          owner_handles: false,
          purchases: [
            {
              id: 'p1',
              vendor_id: 'vendor-1',
              vendor_name: 'Al-Rasheed Hardware',
              currency_code: 'IQD',
              qty: '4',
              actual_unit_price: '100',
              bought_by: 'u-sara',
              bought_by_name: 'Sara Hassan',
              bought_at: '2026-01-01T00:00:00.000Z',
              over_tolerance: false,
              tolerance_approved_by: null,
              receipt_file_id: 'file-1',
            },
          ],
        }),
      ],
      {
        organizer_id: 'somebody-else',
        organizerName: 'Jane Doe',
        procurementOfficerName: 'Ahmed Ali',
        callerHasBuyerPosition: true,
      },
    )
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />)
    const nameCell = (name: string) => within(screen.getByText(name))
    expect(nameCell('Kitchen gloves').getByText('Jane Doe')).toBeInTheDocument()
    expect(nameCell('Cement bags').getByText('Ahmed Ali')).toBeInTheDocument()
    // Rebar was bought by Sara, so she is named in the tag instead of the officer who priced it
    expect(nameCell('Rebar').getByText('Sara Hassan')).toBeInTheDocument()
    expect(nameCell('Rebar').queryByText('Ahmed Ali')).not.toBeInTheDocument()
  })
})

// The extra layer of approval on Items Bought (migration 316): purchases recorded by a marked buyer wait for the
// organizer, who approves them all at once or sends one back with a reason. Who may act is decided on the server
// (caller_can_approve on each purchase); the page keeps no copy of the rule. The test user here is 'user-buyer'.
describe('ItemsBoughtPage: the organizer approves what a marked buyer bought', () => {
  const purchase = (over: Record<string, unknown> = {}) => ({
    id: 'p-1',
    vendor_id: 'vendor-1',
    vendor_name: 'Al-Rasheed Hardware',
    currency_code: 'IQD',
    qty: '10',
    actual_unit_price: '100',
    bought_by: 'user-marked',
    bought_by_name: 'Marked Buyer',
    bought_at: '2026-01-01T00:00:00.000Z',
    over_tolerance: false,
    tolerance_approved_by: null,
    receipt_file_id: 'file-1',
    needs_organizer_approval: true,
    organizer_approved_by: null,
    organizer_approved_by_name: null,
    caller_can_approve: false,
    ...over,
  })
  const waitingLine = (p: Record<string, unknown> = {}) =>
    baseLine({ id: 'line-a', description: 'Kitchen gloves', purchases: [purchase(p)] })

  const approveCalls = vi.fn().mockResolvedValue({})
  const sendBackCalls = vi.fn().mockResolvedValue({})
  beforeEach(() => {
    approveCalls.mockClear()
    sendBackCalls.mockClear()
    mockUseMutation.mockImplementation((doc: unknown) => {
      const name = (
        doc as { definitions?: { kind?: string; name?: { value?: string } }[] }
      ).definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      if (name === 'ApproveItemsBought') return [approveCalls, { loading: false }]
      if (name === 'SendBackPurchase') return [sendBackCalls, { loading: false }]
      return [
        vi.fn().mockResolvedValue({ data: { ensureCashPurchaseVendor: { id: 'vendor-cash' } } }),
        { loading: false },
      ]
    })
  })
  const open = async (lines: Record<string, unknown>[], over: Record<string, unknown> = {}) => {
    mockReq(lines, { organizer_id: 'user-buyer', callerHasBuyerPosition: false, ...over })
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    return wrap(<ItemsBoughtPage />)
  }

  it('says the requisition is waiting, and gives the organizer an Approve button', async () => {
    await open([waitingLine({ caller_can_approve: true })])
    expect(screen.getByText("Waiting for the organizer's approval")).toBeInTheDocument()
    expect(
      screen.getByText(
        /1 purchase\(s\) were recorded by a buyer whose purchases need the organizer's approval/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve items bought' })).toBeInTheDocument()
  })

  it('approves the whole requisition in one click', async () => {
    await open([waitingLine({ caller_can_approve: true })])
    fireEvent.click(screen.getByRole('button', { name: 'Approve items bought' }))
    expect(approveCalls).toHaveBeenCalledWith({ variables: { requisitionId: 'req-1' } })
  })

  it('shows the banner but no Approve button to someone who may not approve (decided by the server)', async () => {
    await open([waitingLine({ caller_can_approve: false })], {
      callerHasBuyerPosition: true,
      organizer_id: 'somebody-else',
    })
    expect(screen.getByText("Waiting for the organizer's approval")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve items bought' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send back' })).not.toBeInTheDocument()
  })

  it('tells the buyer who recorded them that someone else has to approve', async () => {
    await open([waitingLine({ bought_by: 'user-buyer', caller_can_approve: false })], {
      callerHasBuyerPosition: true,
    })
    expect(
      screen.getByText('You recorded some of these yourself, so someone else has to approve them.'),
    ).toBeInTheDocument()
  })

  it('does not say it for purchases somebody else recorded', async () => {
    await open([waitingLine({ caller_can_approve: true })])
    expect(screen.queryByText(/you recorded some of these yourself/i)).not.toBeInTheDocument()
  })

  it('marks the purchase as waiting, then as approved with the approver’s name', async () => {
    const { unmount } = await open([waitingLine({ caller_can_approve: true })])
    expect(screen.getByText('Waiting for organizer approval')).toBeInTheDocument()
    unmount()
    await open([
      waitingLine({
        organizer_approved_by: 'user-buyer',
        organizer_approved_by_name: 'Jane Doe',
        caller_can_approve: false,
      }),
    ])
    expect(screen.getByText('Approved by Jane Doe')).toBeInTheDocument()
    expect(screen.queryByText("Waiting for the organizer's approval")).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve items bought' })).not.toBeInTheDocument()
  })

  it('shows nothing about approval for a purchase that never needed it', async () => {
    await open([waitingLine({ needs_organizer_approval: false, caller_can_approve: false })])
    expect(screen.queryByText("Waiting for the organizer's approval")).not.toBeInTheDocument()
    expect(screen.queryByText('Waiting for organizer approval')).not.toBeInTheDocument()
  })

  it('shows no banner once the requisition has left Items Bought', async () => {
    await open([waitingLine({ caller_can_approve: true })], { status: 'sourcing' })
    expect(screen.queryByText("Waiting for the organizer's approval")).not.toBeInTheDocument()
  })

  describe('sending a purchase back', () => {
    it('offers Send back only on a purchase the caller may act on', async () => {
      await open([waitingLine({ caller_can_approve: true })])
      expect(screen.getByRole('button', { name: 'Send back' })).toBeInTheDocument()
    })

    it('asks for a reason, and sends nothing without one', async () => {
      await open([waitingLine({ caller_can_approve: true })])
      fireEvent.click(screen.getByRole('button', { name: 'Send back' }))
      const confirm = screen.getByRole('button', { name: 'Confirm send back' })
      expect(confirm).toBeDisabled()
      // the page's Input does not tie its label to the box, so find the box next to the label text
      const box = screen.getByText(/why is this sent back/i).parentElement?.querySelector('input')
      if (!box) throw new Error('reason input not found')
      fireEvent.change(box, { target: { value: 'wrong brand' } })
      expect(confirm).not.toBeDisabled()
      fireEvent.click(confirm)
      expect(sendBackCalls).toHaveBeenCalledWith({
        variables: { purchaseId: 'p-1', reason: 'wrong brand' },
      })
    })

    it('can be cancelled without sending anything', async () => {
      await open([waitingLine({ caller_can_approve: true })])
      fireEvent.click(screen.getByRole('button', { name: 'Send back' }))
      const cancels = screen.getAllByRole('button', { name: 'Cancel' })
      fireEvent.click(cancels[cancels.length - 1])
      expect(screen.queryByText(/why is this sent back/i)).not.toBeInTheDocument()
      expect(sendBackCalls).not.toHaveBeenCalled()
    })
  })

  describe('the Finish Buying card', () => {
    const asBuyer = { organizer_id: 'somebody-else', callerHasBuyerPosition: true }
    const fullyBought = (p: Record<string, unknown>) =>
      baseLine({
        id: 'line-a',
        description: 'Kitchen gloves',
        purchases: [purchase({ qty: '10', ...p })],
      })

    it('lists the waiting approvals and keeps the button off', async () => {
      await open([fullyBought({ caller_can_approve: false })], asBuyer)
      expect(
        screen.getByText("1 purchase(s) are waiting for the organizer's approval"),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Finish Buying' })).toBeDisabled()
    })

    it('turns the button on once everything is approved', async () => {
      await open(
        [fullyBought({ organizer_approved_by: 'u-org', organizer_approved_by_name: 'Jane Doe' })],
        asBuyer,
      )
      expect(screen.queryByText(/are waiting for the organizer's approval/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Finish Buying' })).not.toBeDisabled()
    })

    it('does not hold back a purchase that never needed approval', async () => {
      await open([fullyBought({ needs_organizer_approval: false })], asBuyer)
      expect(screen.getByRole('button', { name: 'Finish Buying' })).not.toBeDisabled()
    })
  })

  it('reads in Arabic without raw keys', async () => {
    await i18n.changeLanguage('ar')
    try {
      await open([waitingLine({ caller_can_approve: true })])
      expect(screen.getByText('بانتظار موافقة مُنشئ الطلب')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'الموافقة على المشتريات' })).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/req\.bought\./)
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })
})
