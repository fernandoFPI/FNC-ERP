import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { themes } from '../../../../theme/tokens'
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

// The lines read as one list: a header row names the columns once, each line is a row (ordered, from stock,
// left to buy, approved price, status), and the line still to be bought is the active one with the entry strip
// under it. Finish buying is a bar at the bottom. Every rule behind the buttons is unchanged.
describe('ItemsBoughtPage: the lines as one list', () => {
  const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  }
  afterEach(async () => {
    setWidth(1024)
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  const bought = (qty: string) => ({
    id: `p-${qty}`,
    vendor_id: 'vendor-1',
    vendor_name: 'Al-Rasheed Hardware',
    currency_code: 'IQD',
    qty,
    actual_unit_price: '100',
    bought_by: 'user-buyer',
    bought_by_name: 'Sara',
    bought_at: '2026-01-02T00:00:00.000Z',
    over_tolerance: false,
    receipt_file_id: 'f-1',
  })
  const open = async (lines: Record<string, unknown>[], over: Record<string, unknown> = {}) => {
    mockReq(lines, over)
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    return wrap(<ItemsBoughtPage />)
  }
  const row = (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-line-id="${id}"]`)
    if (!el) throw new Error(`no row for ${id}`)
    return el
  }
  const headerRow = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[aria-hidden="true"]')).find((el) =>
      el.textContent.includes('Left to buy'),
    )
  const toBuy = baseLine({
    id: 'line-1',
    description: 'Cement bags',
    qty: '10',
    qty_from_stock: '2',
    purchases: [bought('3')],
  })
  const done = baseLine({
    id: 'line-2',
    description: 'Rebar 12mm',
    qty: '4',
    purchases: [bought('4')],
  })
  const shorted = baseLine({
    id: 'line-3',
    description: 'Gloves',
    qty: '6',
    short_marked_at: '2026-01-03T00:00:00.000Z',
    short_reason: 'Vendor cannot supply',
  })

  it('names the six columns once, in a header row above the lines', async () => {
    await open([toBuy, done])
    const header = headerRow()
    expect(header).toBeDefined()
    for (const name of [
      'Item',
      'Ordered',
      'From stock',
      'Left to buy',
      'Approved price',
      'Status',
    ]) {
      expect(header?.textContent).toContain(name)
    }
  })

  it('gives every line one row, in the order the lines come', async () => {
    await open([toBuy, done, shorted])
    expect(
      Array.from(document.querySelectorAll('[data-line-id]')).map((el) =>
        el.getAttribute('data-line-id'),
      ),
    ).toEqual(['line-1', 'line-2', 'line-3'])
  })

  it('shows, in a line’s row, what was ordered, what stock covers, what is left and the approved price', async () => {
    await open([toBuy])
    const r = within(row('line-1'))
    expect(r.getByText('Cement bags')).toBeInTheDocument()
    expect(r.getByText('10 bag')).toBeInTheDocument()
    expect(r.getByText('2')).toBeInTheDocument()
    // 10 ordered, 2 from stock, 3 bought: 5 left
    expect(r.getByText('5')).toBeInTheDocument()
    expect(r.getByText('100 IQD')).toBeInTheDocument()
  })

  it('says each line’s state: not bought yet, fully bought, or marked short with the reason', async () => {
    await open([toBuy, done, shorted])
    expect(within(row('line-1')).getByText('Not bought yet')).toBeInTheDocument()
    expect(within(row('line-2')).getByText('Fully bought')).toBeInTheDocument()
    expect(within(row('line-3')).getByText(/Vendor cannot supply/)).toBeInTheDocument()
  })

  it('marks only the line that still has something to buy as the active one', async () => {
    await open([toBuy, done, shorted])
    expect(row('line-1')).toHaveAttribute('data-needs-buying', 'true')
    expect(row('line-2')).not.toHaveAttribute('data-needs-buying')
    expect(row('line-3')).not.toHaveAttribute('data-needs-buying')
  })

  it('puts the entry strip under the active row only', async () => {
    await open([toBuy, done])
    expect(
      within(row('line-1')).getByRole('button', { name: /record purchase/i }),
    ).toBeInTheDocument()
    expect(within(row('line-2')).queryByRole('button', { name: /record purchase/i })).toBeNull()
  })

  it('on a desktop, the labels are for a screen reader only, since the header row names the columns', async () => {
    await open([toBuy])
    const label = within(row('line-1')).getByText('Left to buy')
    expect(label).toHaveStyle({ position: 'absolute', width: '1px' })
  })

  it('on a phone, drops the header row and shows the facts as one labelled summary line', async () => {
    setWidth(390)
    await open([toBuy])
    expect(headerRow()).toBeUndefined()
    // label and value share one span ("Left to buy 5"), not five cells with a label stacked above each value
    const label = within(row('line-1')).getByText('Left to buy')
    expect(label).toHaveTextContent('Left to buy 5')
    expect(label).not.toHaveStyle({ position: 'absolute' })
    expect(within(row('line-1')).queryByText('Status')).toBeNull()
    expect(within(row('line-1')).getByText('Not bought yet')).toBeInTheDocument()
  })

  // Phone: four lines used to make a 4,500px page because every line that needed buying drew its whole entry card.
  // Now the lines are an accordion: one open at a time, the first that needs buying open to begin with.
  describe('on a phone, the lines are an accordion', () => {
    const toBuy2 = baseLine({ id: 'line-4', description: 'Sand', qty: '6' })
    const tapTarget = (id: string, name: string) => {
      const el = within(row(id)).getByText(name).closest<HTMLElement>('[role="button"]')
      if (!el) throw new Error(`no tap target on ${name}`)
      return el
    }
    const recordButton = (id: string) =>
      within(row(id)).queryByRole('button', { name: /record purchase/i })
    const page = async () => (await import('../ItemsBoughtPage')).default
    const sameTree = (Page: React.ComponentType) => (
      <MemoryRouter initialEntries={['/procurement/requisitions/req-1/items-bought']}>
        <ThemeProvider>
          <Page />
        </ThemeProvider>
      </MemoryRouter>
    )

    it('opens the first line that still needs buying and keeps every other line to one summary row', async () => {
      setWidth(390)
      await open([done, toBuy, toBuy2])
      expect(tapTarget('line-1', 'Cement bags')).toHaveAttribute('aria-expanded', 'true')
      expect(recordButton('line-1')).not.toBeNull()
      // what was already bought on the open line is shown with it ("3 @ 100 IQD")...
      expect(within(row('line-1')).getByText(/3 @ 100 IQD/)).toBeInTheDocument()
      // ...and the others are a row: no entry card, no purchases
      expect(tapTarget('line-4', 'Sand')).toHaveAttribute('aria-expanded', 'false')
      expect(recordButton('line-4')).toBeNull()
      expect(tapTarget('line-2', 'Rebar 12mm')).toHaveAttribute('aria-expanded', 'false')
      expect(within(row('line-2')).queryByText(/4 @ 100 IQD/)).toBeNull()
    })

    it('opens a line when its name is tapped and closes the one that was open', async () => {
      setWidth(390)
      await open([toBuy, toBuy2])
      fireEvent.click(tapTarget('line-4', 'Sand'))
      expect(recordButton('line-4')).not.toBeNull()
      expect(recordButton('line-1')).toBeNull()
      expect(tapTarget('line-4', 'Sand')).toHaveAttribute('aria-expanded', 'true')
      expect(tapTarget('line-1', 'Cement bags')).toHaveAttribute('aria-expanded', 'false')
    })

    it('opens and closes from the keyboard too (Enter and Space)', async () => {
      setWidth(390)
      await open([toBuy, toBuy2])
      fireEvent.keyDown(tapTarget('line-4', 'Sand'), { key: 'Enter' })
      expect(recordButton('line-4')).not.toBeNull()
      fireEvent.keyDown(tapTarget('line-4', 'Sand'), { key: ' ' })
      expect(recordButton('line-4')).toBeNull()
    })

    it('lets the open line be closed, and then leaves every line closed', async () => {
      setWidth(390)
      await open([toBuy, toBuy2])
      fireEvent.click(tapTarget('line-1', 'Cement bags'))
      expect(recordButton('line-1')).toBeNull()
      // it does not jump to the next line behind the person's back
      expect(recordButton('line-4')).toBeNull()
    })

    it('hands over to the first line that still needs buying when the line being bought is finished', async () => {
      setWidth(390)
      const Page = await page()
      mockReq([toBuy, toBuy2])
      const view = wrap(<Page />)
      fireEvent.click(tapTarget('line-4', 'Sand'))
      expect(recordButton('line-4')).not.toBeNull()
      // the buyer records the whole of line 4: it is fully bought, so nothing stays open on a finished line
      mockReq([toBuy, { ...toBuy2, purchases: [bought('6')] }])
      view.rerender(sameTree(Page))
      expect(recordButton('line-4')).toBeNull()
      expect(recordButton('line-1')).not.toBeNull()
    })

    it('a line opened to look at its purchases stays open (only a finished line the buyer was working on hands over)', async () => {
      setWidth(390)
      await open([toBuy, done])
      fireEvent.click(tapTarget('line-2', 'Rebar 12mm'))
      expect(within(row('line-2')).getByText(/4 @ 100 IQD/)).toBeInTheDocument()
      expect(tapTarget('line-2', 'Rebar 12mm')).toHaveAttribute('aria-expanded', 'true')
    })

    it('on a desktop every line that needs buying keeps its entry card, and the name is not a button', async () => {
      await open([toBuy, toBuy2])
      expect(recordButton('line-1')).not.toBeNull()
      expect(recordButton('line-4')).not.toBeNull()
      expect(within(row('line-1')).getByText('Cement bags').closest('[role="button"]')).toBeNull()
    })
  })

  // Phone: the "Apply to all items" card is one row until opened; its choices stay mounted so nothing is lost.
  describe('on a phone, the apply-to-all card is one row until opened', () => {
    const toBuy2 = baseLine({ id: 'line-4', description: 'Sand', qty: '6' })
    const trigger = () => screen.getByRole('button', { name: /^Apply to all items/ })

    it('starts closed, opens when pressed, and closes again', async () => {
      setWidth(390)
      await open([toBuy, toBuy2])
      expect(trigger()).toHaveAttribute('aria-expanded', 'false')
      // mounted (a choice made earlier is never lost) but not shown
      expect(screen.getByText('Choose the vendor once instead of on every line.')).not.toBeVisible()
      fireEvent.click(trigger())
      expect(trigger()).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Choose the vendor once instead of on every line.')).toBeVisible()
      fireEvent.click(trigger())
      expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    })

    it('stays open while one of its choices is on, so a choice made is never hidden', async () => {
      setWidth(390)
      await open([toBuy, toBuy2])
      fireEvent.click(trigger())
      fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
      fireEvent.click(trigger())
      expect(trigger()).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Choose the vendor once instead of on every line.')).toBeVisible()
    })

    it('on a desktop the card is always open and has no toggle button', async () => {
      await open([toBuy, toBuy2])
      expect(screen.queryByRole('button', { name: /^Apply to all items/ })).toBeNull()
      expect(screen.getByText('Choose the vendor once instead of on every line.')).toBeVisible()
    })
  })

  describe('the Finish buying bar', () => {
    const FINISH_BAR = { name: 'Finish buying' }

    it('holds the button, with the reasons it cannot be used yet as badges', async () => {
      await open([toBuy])
      const bar = screen.getByRole('region', FINISH_BAR)
      expect(within(bar).getByRole('button', { name: 'Finish Buying' })).toBeDisabled()
      expect(within(bar).getByText(/still have qty remaining/i)).toBeInTheDocument()
    })

    it('says it happens by itself, with the button only as the fallback', async () => {
      await open([toBuy])
      expect(
        within(screen.getByRole('region', FINISH_BAR)).getByText(/by itself/i),
      ).toBeInTheDocument()
    })

    it('shows no reasons, and an enabled button, once everything is bought', async () => {
      await open([done])
      const bar = screen.getByRole('region', FINISH_BAR)
      expect(within(bar).getByRole('button', { name: 'Finish Buying' })).not.toBeDisabled()
      expect(within(bar).queryByText(/still have qty remaining/i)).toBeNull()
    })

    it('is not drawn for someone who cannot buy', async () => {
      await open([toBuy], { callerHasBuyerPosition: false })
      expect(screen.queryByRole('region', FINISH_BAR)).not.toBeInTheDocument()
    })

    it('is not drawn once the requisition has left Items Bought', async () => {
      await open([done], { status: 'sourcing' })
      expect(screen.queryByRole('region', FINISH_BAR)).not.toBeInTheDocument()
    })
  })
})

// The batch card (same vendor / same receipt for all) has a title and two groups side by side; each row of the
// list carries its number; and a clear line separates one row from the next.
describe('ItemsBoughtPage: batch card, row numbers and separators', () => {
  const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  }
  afterEach(async () => {
    setWidth(1024)
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  const three = [
    baseLine({ id: 'line-1', description: 'Cement bags' }),
    baseLine({ id: 'line-2', description: 'Rebar 12mm' }),
    baseLine({ id: 'line-3', description: 'Gloves' }),
  ]
  const open = async (lines: Record<string, unknown>[], over: Record<string, unknown> = {}) => {
    mockReq(lines, over)
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    return wrap(<ItemsBoughtPage />)
  }
  const row = (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-line-id="${id}"]`)
    if (!el) throw new Error(`no row for ${id}`)
    return el
  }
  const numberOf = (id: string) => row(id).querySelector('[data-line-number]')?.textContent
  // The card is the nearest ancestor of the "same vendor" label that also holds the title.
  const batchCard = () => {
    let el: HTMLElement | null = screen.getByText(/all items are from the same vendor/i)
    while (el && !el.textContent.includes('Apply to all items')) el = el.parentElement
    if (!el) throw new Error('batch card not found')
    return el
  }

  describe('the batch card', () => {
    it('says what it is for: a title and a line of explanation', async () => {
      await open(three)
      expect(screen.getByText('Apply to all items')).toBeInTheDocument()
      expect(
        screen.getByText('Fill these in once and every line that still needs buying uses them.'),
      ).toBeInTheDocument()
    })

    it('holds both groups, the vendor one and the receipt one', async () => {
      await open(three)
      const card = within(batchCard())
      expect(card.getByLabelText(/all items are from the same vendor/i)).toBeInTheDocument()
      expect(card.getByLabelText(/attach one receipt for all items/i)).toBeInTheDocument()
    })

    it('is not drawn for a single line, which has nothing to share', async () => {
      await open([baseLine({ id: 'line-1', description: 'Cement bags' })])
      expect(screen.queryByText('Apply to all items')).not.toBeInTheDocument()
    })

    // The two choices are tiles; the grid that holds them is two levels above the checkbox (button, tile, grid).
    const tileGrid = () => {
      const grid = screen.getByLabelText(/attach one receipt for all items/i).parentElement
        ?.parentElement
      if (!grid) throw new Error('tile grid not found')
      return grid
    }

    it('puts the two tiles side by side on a desktop', async () => {
      await open(three)
      expect(tileGrid().style.gridTemplateColumns).toContain('repeat(2')
      const vendorTile = screen.getByLabelText(/all items are from the same vendor/i)
      expect(tileGrid().contains(vendorTile)).toBe(true)
    })

    it('stacks them on a phone, one under the other', async () => {
      setWidth(390)
      await open(three)
      expect(tileGrid().style.gridTemplateColumns).toBe('1fr')
    })

    it('draws each toggle as a tile that is a checkbox, both off to start with', async () => {
      await open(three)
      const vendor = screen.getByRole('checkbox', { name: /all items are from the same vendor/i })
      const receipt = screen.getByRole('checkbox', { name: /attach one receipt for all items/i })
      expect(vendor).toHaveAttribute('aria-checked', 'false')
      expect(receipt).toHaveAttribute('aria-checked', 'false')
    })

    it('each tile carries its own icon', async () => {
      await open(three)
      const vendor = screen.getByRole('checkbox', { name: /all items are from the same vendor/i })
      const receipt = screen.getByRole('checkbox', { name: /attach one receipt for all items/i })
      // both are off, so the only drawing in each is the icon (the tick has a check only when on)
      expect(vendor.querySelectorAll('svg')).toHaveLength(1)
      expect(receipt.querySelectorAll('svg')).toHaveLength(1)
      expect(vendor.querySelector('svg')?.innerHTML).not.toBe(
        receipt.querySelector('svg')?.innerHTML,
      )
    })

    it('each tile says why a buyer would switch it on', async () => {
      await open(three)
      expect(
        screen.getByRole('checkbox', { name: /all items are from the same vendor/i }),
      ).toHaveAccessibleDescription('Choose the vendor once instead of on every line.')
      expect(
        screen.getByRole('checkbox', { name: /attach one receipt for all items/i }),
      ).toHaveAccessibleDescription('Upload the receipt once and use it on every line.')
    })

    it('ticking one tile opens its own controls inside it and leaves the other alone', async () => {
      await open(three)
      const vendor = screen.getByRole('checkbox', { name: /all items are from the same vendor/i })
      const receipt = screen.getByRole('checkbox', { name: /attach one receipt for all items/i })
      const vendorTile = vendor.parentElement
      const receiptTile = receipt.parentElement
      if (!vendorTile || !receiptTile) throw new Error('tiles not found')
      fireEvent.click(vendor)
      expect(vendor).toHaveAttribute('aria-checked', 'true')
      expect(within(vendorTile).getByText('Vendor for all items')).toBeInTheDocument()
      expect(within(vendorTile).getByRole('group', { name: 'Quick pick' })).toBeInTheDocument()
      expect(receipt).toHaveAttribute('aria-checked', 'false')
      expect(within(receiptTile).queryByTestId('receipt-drop-zone')).toBeNull()
      fireEvent.click(receipt)
      expect(within(receiptTile).getByTestId('receipt-drop-zone')).toBeInTheDocument()
      expect(
        within(receiptTile).getByRole('button', { name: 'Record all purchases' }),
      ).toBeInTheDocument()
      // the vendor tile is not opened by the receipt tile's controls
      expect(within(vendorTile).queryByTestId('receipt-drop-zone')).toBeNull()
    })

    it('a tick switches it off again and closes what it opened', async () => {
      await open(three)
      const vendor = screen.getByRole('checkbox', { name: /all items are from the same vendor/i })
      fireEvent.click(vendor)
      expect(screen.getByText('Vendor for all items')).toBeInTheDocument()
      fireEvent.click(vendor)
      expect(vendor).toHaveAttribute('aria-checked', 'false')
      expect(screen.queryByText('Vendor for all items')).toBeNull()
    })

    it('reads in Arabic: both reasons are translated and no raw key shows', async () => {
      await act(async () => {
        await i18n.changeLanguage('ar')
      })
      await open(three)
      // the English-text lookup in batchCard() cannot find it here, so go by the translated title
      const title = screen.getByText(i18n.t('req.bought.applyToAllTitle'))
      const card = title.parentElement?.parentElement
      if (!card) throw new Error('batch card not found')
      expect(card.textContent).not.toMatch(/req\.bought\./)
      expect(within(card).getByText(i18n.t('req.bought.sameVendorTileHint'))).toBeInTheDocument()
      expect(within(card).getByText(i18n.t('req.bought.sameReceiptTileHint'))).toBeInTheDocument()
      expect(i18n.t('req.bought.sameVendorTileHint')).not.toBe(
        'Choose the vendor once instead of on every line.',
      )
    })

    it('still reveals the vendor picker and the receipt buttons when ticked', async () => {
      await open(three)
      fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
      fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
      const card = within(batchCard())
      expect(card.getByText('Vendor for all items')).toBeInTheDocument()
      expect(card.getByRole('button', { name: /record all purchases/i })).toBeInTheDocument()
    })
  })

  describe('row numbers', () => {
    it('numbers the rows 1, 2, 3 in the order the lines come, in a column of their own', async () => {
      await open(three)
      expect([numberOf('line-1'), numberOf('line-2'), numberOf('line-3')]).toEqual(['1', '2', '3'])
    })

    it('names the column in the header row', async () => {
      await open(three)
      const header = Array.from(
        document.querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
      ).find((el) => el.textContent.includes('Left to buy'))
      expect(header?.textContent.startsWith('#')).toBe(true)
    })

    it('numbers every row, bought, short or still to buy', async () => {
      await open([
        baseLine({ id: 'line-1', description: 'A', qty: '2', purchases: [] }),
        baseLine({
          id: 'line-2',
          description: 'B',
          short_marked_at: '2026-01-03T00:00:00.000Z',
          short_reason: 'No stock',
        }),
      ])
      expect([numberOf('line-1'), numberOf('line-2')]).toEqual(['1', '2'])
    })

    it('on a phone, puts the number in front of the item name instead of a column', async () => {
      setWidth(390)
      await open(three)
      expect(numberOf('line-2')).toBe('2. ')
      expect(within(row('line-2')).getByText('Rebar 12mm')).toBeInTheDocument()
    })

    it('draws the number in the readable grey, not the pale one', async () => {
      await open(three)
      const cell = row('line-1').querySelector<HTMLElement>('[data-line-number]')
      expect(cell).toHaveStyle({ color: themes['light-flat'].textSecondary })
      expect(cell).not.toHaveStyle({ color: themes['light-flat'].textMuted })
    })
  })

  describe('the line between rows', () => {
    it('draws a heavier line above every row but the first, so two rows are easy to tell apart', async () => {
      await open(three)
      expect(row('line-1').style.borderTop).not.toContain('solid')
      for (const id of ['line-2', 'line-3']) {
        expect(row(id).style.borderTop).toContain('2px solid')
      }
    })

    it('uses the strong border colour for it, not the faint one every card edge has', async () => {
      await open(three)
      expect(row('line-2')).toHaveStyle({
        borderTop: `2px solid ${themes['light-flat'].borderStrong}`,
      })
    })

    it('on a phone leaves each row its own card, with the ordinary edge', async () => {
      setWidth(390)
      await open(three)
      for (const id of ['line-1', 'line-2', 'line-3']) {
        expect(row(id).style.borderTop).toContain('1px solid')
        expect(row(id).style.borderTop).not.toContain('2px')
      }
    })
  })

  it('reads in Arabic with no raw key', async () => {
    await i18n.changeLanguage('ar')
    await open(three)
    expect(document.body.textContent).not.toMatch(/req\.bought\./)
    expect(screen.getByText(i18n.t('req.bought.applyToAllTitle'))).toBeInTheDocument()
  })
})

// A line's Arabic name sits right under its English name, a little larger than the small grey lines around it. It
// used to hang at the right end of the item column (a right-to-left block puts "start" on the right), under the
// handler's name instead of the item's.
describe('ItemsBoughtPage: the Arabic name of a line', () => {
  const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  }
  afterEach(() => {
    setWidth(1024)
  })
  const open = async (lines: Record<string, unknown>[]) => {
    mockReq(lines)
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    return wrap(<ItemsBoughtPage />)
  }
  const arabicBlock = () => {
    const el = document.querySelector<HTMLElement>('[data-arabic-name]')
    if (!el) throw new Error('no Arabic name on the page')
    return el
  }
  const arabicText = () => {
    const el = arabicBlock().querySelector<HTMLElement>('[dir="rtl"]')
    if (!el) throw new Error('the Arabic text is not marked right-to-left')
    return el
  }
  const withName = () => baseLine({ product_name_ar: 'بردة هواء 22*22 90' })

  it('shows the Arabic name', async () => {
    await open([withName()])
    expect(screen.getByText('بردة هواء 22*22 90')).toBeInTheDocument()
  })

  it('puts it directly under the English name, in the same column', async () => {
    await open([withName()])
    const english = screen.getByText('Cement bags')
    expect(english.nextElementSibling).toBe(arabicBlock())
    expect(english.parentElement).toBe(arabicBlock().parentElement)
  })

  it('keeps the text right-to-left but lets the block follow the page, so it starts under the English name', async () => {
    await open([withName()])
    expect(arabicText()).toHaveAttribute('dir', 'rtl')
    // a block that is itself dir="rtl" would put its start on the right edge
    expect(arabicBlock()).not.toHaveAttribute('dir')
    expect(arabicBlock().style.textAlign).toBe('start')
  })

  it('is 14 px, the size of the English name, and no longer the small 12 px', async () => {
    await open([withName()])
    expect(arabicText()).toHaveStyle({ fontSize: '14px' })
    expect(arabicText().style.lineHeight).toBe('1.5')
  })

  it('reads in the readable grey, not the pale one', async () => {
    await open([withName()])
    expect(arabicText()).toHaveStyle({ color: themes['light-flat'].textSecondary })
    expect(arabicText()).not.toHaveStyle({ color: themes['light-flat'].textMuted })
  })

  it('is not drawn for a line that has no Arabic name', async () => {
    await open([baseLine()])
    expect(document.querySelector('[data-arabic-name]')).toBeNull()
  })

  it('is drawn the same way on a phone', async () => {
    setWidth(390)
    await open([withName()])
    const english = screen.getByText(/Cement bags/)
    expect(english.nextElementSibling).toBe(arabicBlock())
    expect(arabicText()).toHaveStyle({ fontSize: '14px' })
  })
})

// The card a buyer fills in to record a purchase: vendor (search plus quick picks), quantity with a stepper,
// price with its currency inside the box and a live total, a receipt drop zone, and the three ways to finish
// the line. Every rule behind them (what is sent, the validations, the batch toggles) is the page's own.
describe('ItemsBoughtPage: the record-a-purchase card', () => {
  interface RecordArg {
    variables: {
      input: {
        lineId: string
        vendorId: string
        qty: number
        actualUnitPrice: number
        currencyCode: string
        receiptFileId: string
      }
    }
  }
  const recordCalls = vi.fn<[RecordArg], Promise<unknown>>()
  // every receipt file past the first goes on the purchase through this call
  const attachCalls = vi.fn<[unknown], Promise<unknown>>()
  const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  }

  beforeEach(() => {
    recordCalls.mockReset()
    recordCalls.mockResolvedValue({ data: { recordLinePurchase: { id: 'purchase-x' } } })
    attachCalls.mockReset()
    attachCalls.mockResolvedValue({ data: { attachFile: { id: 'attachment-x' } } })
    mockUseMutation.mockImplementation((doc: unknown) => {
      const opName = (
        doc as { definitions?: { kind?: string; name?: { value?: string } }[] }
      ).definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      if (opName === 'RequestUploadUrl')
        return [
          vi.fn().mockResolvedValue({ data: { requestUploadUrl: { fileId: 'file-1' } } }),
          { loading: false },
        ]
      if (opName === 'RecordLinePurchase') return [recordCalls, { loading: false }]
      if (opName === 'AttachFile') return [attachCalls, { loading: false }]
      return [
        vi.fn().mockResolvedValue({ data: { ensureCashPurchaseVendor: { id: 'vendor-cash' } } }),
        { loading: false },
      ]
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    setWidth(1024)
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  // Same data as mockReq, but the vendors are the caller's own, so "recent vendors" can be tested with several.
  function mockWithVendors(
    lines: Record<string, unknown>[],
    vendors: { id: string; name: string; is_cash_purchase: boolean }[],
  ) {
    mockUseQuery.mockImplementation((doc: unknown) => {
      const opName = (
        doc as { definitions?: { kind?: string; name?: { value?: string } }[] }
      ).definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      if (opName === 'Vendors') return { data: { vendors }, loading: false }
      return {
        data: {
          requisition: {
            id: 'req-1',
            requisition_number: 'REQ-2026-001',
            status: 'items_bought',
            callerHasBuyerPosition: true,
            callerCanApprove: false,
            lines,
          },
        },
        loading: false,
        refetch: vi.fn(),
      }
    })
  }

  const purchase = (
    id: string,
    vendorId: string,
    vendorName: string,
    boughtAt: string,
    qty = '1',
  ) => ({
    id,
    vendor_id: vendorId,
    vendor_name: vendorName,
    currency_code: 'IQD',
    qty,
    actual_unit_price: '100',
    bought_by: 'user-buyer',
    over_tolerance: false,
    receipt_file_id: 'file-x',
    bought_at: boughtAt,
  })
  const vendor = (id: string, name: string) => ({ id, name, is_cash_purchase: false })

  async function open() {
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    const rendered = wrap(<ItemsBoughtPage />)
    // The page fetches the cash vendor's id as it opens; let that land before anyone picks Cash.
    await act(async () => {
      await Promise.resolve()
    })
    return rendered
  }
  const card = (lineId: string) => {
    const el = document.querySelector<HTMLElement>(`[data-entry-card="${lineId}"]`)
    if (!el) throw new Error(`No entry card for ${lineId}`)
    return el
  }
  const qty = () => screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Qty' })
  const price = () => screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Actual price' })
  const attach = (container: HTMLElement, name = 'invoice.jpg') => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('Expected a file input')
    fireEvent.change(input, { target: { files: [new File(['x'], name, { type: 'image/jpeg' })] } })
  }
  const lastRecord = () => {
    const calls = recordCalls.mock.calls
    return calls[calls.length - 1][0].variables.input
  }

  describe('what is on it', () => {
    it('is a card with a title and a caption naming what is left to buy and the approved price', async () => {
      await open()
      const c = within(card('line-1'))
      expect(c.getByText('Record a purchase')).toBeInTheDocument()
      expect(c.getByText('Left to buy 10 bag · approved price 100 IQD')).toBeInTheDocument()
    })

    it('sits inside the active row of the line it belongs to, and only the active line has one', async () => {
      mockReq([
        baseLine({ id: 'line-1', description: 'Cement bags' }),
        baseLine({ id: 'line-2', description: 'Rebar', short_marked_at: '2026-01-01T00:00:00Z' }),
        baseLine({ id: 'line-3', description: 'Sand', qty: '5', qty_from_stock: '5' }),
      ])
      await open()
      expect(document.querySelectorAll('[data-entry-card]')).toHaveLength(1)
      expect(card('line-1').closest('[data-line-id]')).toHaveAttribute('data-line-id', 'line-1')
      expect(card('line-1').closest('[data-needs-buying]')).not.toBeNull()
    })

    it('has the vendor picker, the quick picks, the stepper, the price with its currency and the receipt zone', async () => {
      await open()
      const c = within(card('line-1'))
      expect(c.getByText('Search vendor…')).toBeInTheDocument()
      expect(c.getByRole('group', { name: 'Quick pick' })).toBeInTheDocument()
      expect(c.getByRole('button', { name: 'Decrease quantity' })).toBeInTheDocument()
      expect(c.getByRole('button', { name: 'Increase quantity' })).toBeInTheDocument()
      expect(c.getByRole('spinbutton', { name: 'Qty' })).toBeInTheDocument()
      expect(c.getByRole('spinbutton', { name: 'Actual price' })).toBeInTheDocument()
      expect(c.getByRole('combobox', { name: 'Currency' })).toBeInTheDocument()
      expect(c.getByTestId('receipt-drop-zone')).toBeInTheDocument()
    })

    it('ends with Mark short, Resolve from stock and the one solid Record purchase', async () => {
      await open()
      const c = within(card('line-1'))
      expect(c.getByRole('button', { name: 'Mark short' })).toBeInTheDocument()
      expect(c.getByRole('button', { name: 'Resolve from stock' })).toBeInTheDocument()
      const record = c.getByRole('button', { name: 'Record purchase' })
      expect(record).toHaveStyle({ backgroundColor: themes['light-flat'].accentSolid })
    })

    it('offers Resolve from stock only for a line that is a catalogue product', async () => {
      mockReq([
        baseLine({ id: 'line-1', product_id: 'prod-1' }),
        baseLine({ id: 'line-2', product_id: null, description: 'Loose item' }),
      ])
      await open()
      expect(
        within(card('line-1')).queryByRole('button', { name: 'Resolve from stock' }),
      ).not.toBeNull()
      expect(
        within(card('line-2')).queryByRole('button', { name: 'Resolve from stock' }),
      ).toBeNull()
    })

    it('Resolve from stock opens the stock panel, Mark short opens the reason box', async () => {
      await open()
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Resolve from stock' }))
      expect(
        screen.getByText(/stock arrived after inventory check marked this line/i),
      ).toBeInTheDocument()
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Mark short' }))
      expect(screen.getByText("Reason the vendor can't supply the rest")).toBeInTheDocument()
    })

    it('the vendor picker is drawn like the other entry controls (the 40 px field look)', async () => {
      await open()
      const trigger = within(card('line-1'))
        .getByText('Search vendor…')
        .closest<HTMLElement>('div[tabindex]')
      expect(trigger).toHaveStyle({ minHeight: '40px', borderRadius: '10px' })
    })
  })

  describe('quantity and price', () => {
    it('start at what the buyer would very likely enter: the whole remainder at the approved price in its currency', async () => {
      await open()
      expect(qty().value).toBe('10')
      expect(price().value).toBe('100')
      expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Currency' }).value).toBe(
        'IQD',
      )
    })

    it('minus lowers the quantity and plus raises it again, but never above what is left to buy', async () => {
      await open()
      fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }))
      expect(qty().value).toBe('9')
      fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
      expect(qty().value).toBe('10')
      expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled()
    })

    it('shows the total as quantity times price in the box’s currency, and follows every change', async () => {
      await open()
      expect(within(card('line-1')).getByText('Total')).toBeInTheDocument()
      expect(within(card('line-1')).getByText('1,000 IQD')).toBeInTheDocument()
      fireEvent.change(qty(), { target: { value: '4' } })
      expect(within(card('line-1')).getByText('400 IQD')).toBeInTheDocument()
      fireEvent.change(screen.getByRole('combobox', { name: 'Currency' }), {
        target: { value: 'USD' },
      })
      expect(within(card('line-1')).getByText('400 USD')).toBeInTheDocument()
    })

    it('shows no total, and marks the price as wrong, when the price is not above zero', async () => {
      await open()
      fireEvent.change(price(), { target: { value: '0' } })
      expect(price()).toHaveAttribute('aria-invalid', 'true')
      // the caption also ends in "IQD", so look for the total's own label
      expect(within(card('line-1')).queryByText('Total')).toBeNull()
    })

    it('does not mark a good price as wrong', async () => {
      await open()
      expect(price()).not.toHaveAttribute('aria-invalid')
    })

    it('offers a currency the line already has even if it is not one of the usual five', async () => {
      mockReq([baseLine({ currency_code: 'SAR' })])
      await open()
      const pill = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Currency' })
      expect(pill.value).toBe('SAR')
      expect(Array.from(pill.options).map((o) => o.value)).toEqual([
        'SAR',
        'IQD',
        'USD',
        'EUR',
        'TRY',
        'AED',
      ])
    })
  })

  describe('vendor quick picks', () => {
    it('Cash is one tap: it becomes the vendor, shown as picked', async () => {
      await open()
      const cash = within(card('line-1')).getByRole('button', { name: 'Cash' })
      expect(cash).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(cash)
      expect(cash).toHaveAttribute('aria-pressed', 'true')
    })

    it('offers the vendors already used on this requisition, on every line that still needs buying', async () => {
      mockReq([
        baseLine({
          id: 'line-1',
          purchases: [
            purchase('p1', 'vendor-1', 'Al-Rasheed Hardware', '2026-01-01T00:00:00Z', '4'),
          ],
        }),
        baseLine({ id: 'line-2', description: 'Rebar' }),
      ])
      await open()
      expect(
        within(card('line-1')).getByRole('button', { name: 'Al-Rasheed Hardware' }),
      ).toBeInTheDocument()
      const onSecond = within(card('line-2')).getByRole('button', { name: 'Al-Rasheed Hardware' })
      fireEvent.click(onSecond)
      expect(onSecond).toHaveAttribute('aria-pressed', 'true')
      // picking it on one line does not pick it on the other
      expect(
        within(card('line-1')).getByRole('button', { name: 'Al-Rasheed Hardware' }),
      ).toHaveAttribute('aria-pressed', 'false')
    })

    it('offers no recent vendor when nothing has been bought yet, only Cash and + New vendor', async () => {
      await open()
      const group = within(card('line-1')).getByRole('group', { name: 'Quick pick' })
      expect(
        within(group)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Cash', '+ New vendor'])
    })

    it('shows at most the three most recent vendors, newest first', async () => {
      mockWithVendors(
        [
          baseLine({
            id: 'line-1',
            qty: '20',
            purchases: [
              purchase('p1', 'v1', 'Alpha Co', '2026-01-01T00:00:00Z'),
              purchase('p2', 'v2', 'Beta Co', '2026-01-02T00:00:00Z'),
              purchase('p3', 'v3', 'Gamma Co', '2026-01-03T00:00:00Z'),
              purchase('p4', 'v4', 'Delta Co', '2026-01-04T00:00:00Z'),
            ],
          }),
        ],
        [
          vendor('v1', 'Alpha Co'),
          vendor('v2', 'Beta Co'),
          vendor('v3', 'Gamma Co'),
          vendor('v4', 'Delta Co'),
        ],
      )
      await open()
      const group = within(card('line-1')).getByRole('group', { name: 'Quick pick' })
      expect(
        within(group)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Cash', 'Delta Co', 'Gamma Co', 'Beta Co', '+ New vendor'])
    })

    it('lists a vendor once however many purchases it has', async () => {
      mockWithVendors(
        [
          baseLine({
            id: 'line-1',
            qty: '20',
            purchases: [
              purchase('p1', 'v1', 'Alpha Co', '2026-01-01T00:00:00Z'),
              purchase('p2', 'v1', 'Alpha Co', '2026-01-02T00:00:00Z'),
            ],
          }),
        ],
        [vendor('v1', 'Alpha Co')],
      )
      await open()
      expect(within(card('line-1')).getAllByRole('button', { name: 'Alpha Co' })).toHaveLength(1)
    })

    it('never offers the cash vendor as a recent vendor: Cash has its own chip', async () => {
      mockReq([
        baseLine({
          id: 'line-1',
          purchases: [purchase('p1', 'vendor-cash', 'Cash Purchase', '2026-01-01T00:00:00Z', '2')],
        }),
      ])
      await open()
      expect(within(card('line-1')).queryByRole('button', { name: 'Cash Purchase' })).toBeNull()
      expect(within(card('line-1')).getAllByRole('button', { name: 'Cash' })).toHaveLength(1)
    })

    it('+ New vendor opens the new-vendor box', async () => {
      await open()
      fireEvent.click(within(card('line-1')).getByRole('button', { name: '+ New vendor' }))
      expect(screen.getByText('New vendor')).toBeInTheDocument()
      expect(screen.getByText('Vendor name')).toBeInTheDocument()
    })

    it('when one vendor is used for all items the lines lose their quick picks (the apply-to-all card has them)', async () => {
      mockReq([
        baseLine({ id: 'line-1', description: 'Cement bags' }),
        baseLine({ id: 'line-2', description: 'Rebar' }),
      ])
      await open()
      expect(screen.getAllByRole('group', { name: 'Quick pick' })).toHaveLength(2)
      fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
      expect(within(card('line-1')).queryByRole('group', { name: 'Quick pick' })).toBeNull()
      expect(within(card('line-2')).queryByRole('group', { name: 'Quick pick' })).toBeNull()
      expect(screen.getAllByRole('group', { name: 'Quick pick' })).toHaveLength(1)
    })
  })

  describe('the receipt', () => {
    it('picked files are listed as chips with their names, and the button says add more', async () => {
      const { container } = await open()
      attach(container, 'invoice.jpg')
      const c = within(card('line-1'))
      expect(c.getByText('invoice.jpg')).toBeInTheDocument()
      expect(c.getByRole('button', { name: /1 file — add more/ })).toBeInTheDocument()
    })

    it('a chip’s × removes just that file, and the button goes back to Attach', async () => {
      const { container } = await open()
      attach(container, 'invoice.jpg')
      fireEvent.click(screen.getByRole('button', { name: 'Remove invoice.jpg' }))
      const c = within(card('line-1'))
      expect(c.queryByText('invoice.jpg')).toBeNull()
      expect(c.getByRole('button', { name: 'Attach receipt photo(s) *' })).toBeInTheDocument()
    })

    it('Clear drops every file', async () => {
      const { container } = await open()
      attach(container, 'a.jpg')
      attach(container, 'b.jpg')
      expect(within(card('line-1')).getAllByRole('listitem')).toHaveLength(2)
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Clear' }))
      expect(within(card('line-1')).queryAllByRole('listitem')).toHaveLength(0)
    })

    it('each line keeps its own files', async () => {
      mockReq([
        baseLine({ id: 'line-1', description: 'Cement bags' }),
        baseLine({ id: 'line-2', description: 'Rebar' }),
      ])
      await open()
      const input = card('line-1').querySelector<HTMLInputElement>('input[type="file"]')
      if (!input) throw new Error('Expected a file input on line 1')
      fireEvent.change(input, {
        target: { files: [new File(['x'], 'only-first.jpg', { type: 'image/jpeg' })] },
      })
      expect(within(card('line-1')).getByText('only-first.jpg')).toBeInTheDocument()
      expect(within(card('line-2')).queryByText('only-first.jpg')).toBeNull()
    })

    it('with one receipt for all items there is no zone on the lines, only a note, and no per-line Record purchase', async () => {
      mockReq([
        baseLine({ id: 'line-1', description: 'Cement bags' }),
        baseLine({ id: 'line-2', description: 'Rebar' }),
      ])
      await open()
      fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
      // the lines have none; the one shared zone is on the apply-to-all card
      expect(within(card('line-1')).queryByTestId('receipt-drop-zone')).toBeNull()
      expect(within(card('line-2')).queryByTestId('receipt-drop-zone')).toBeNull()
      expect(screen.getAllByTestId('receipt-drop-zone')).toHaveLength(1)
      expect(
        within(card('line-1')).getByText('Attach the shared receipt(s) above'),
      ).toBeInTheDocument()
      expect(within(card('line-1')).queryByRole('button', { name: 'Record purchase' })).toBeNull()
    })
  })

  describe('recording sends what the card shows', () => {
    it('Cash, the defaults and one receipt: the whole remainder at the approved price', async () => {
      const { container } = await open()
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Cash' }))
      attach(container)
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Record purchase' }))
      await waitFor(() => {
        expect(recordCalls).toHaveBeenCalledTimes(1)
      })
      expect(lastRecord()).toEqual({
        lineId: 'line-1',
        vendorId: 'vendor-cash',
        qty: 10,
        actualUnitPrice: 100,
        currencyCode: 'IQD',
        receiptFileId: 'file-1',
      })
    })

    it('a lowered quantity, a typed price and another currency are what is sent', async () => {
      const { container } = await open()
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Cash' }))
      fireEvent.click(screen.getByRole('button', { name: 'Decrease quantity' }))
      fireEvent.change(price(), { target: { value: '120.5' } })
      fireEvent.change(screen.getByRole('combobox', { name: 'Currency' }), {
        target: { value: 'USD' },
      })
      attach(container)
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Record purchase' }))
      await waitFor(() => {
        expect(recordCalls).toHaveBeenCalledTimes(1)
      })
      expect(lastRecord()).toMatchObject({ qty: 9, actualUnitPrice: 120.5, currencyCode: 'USD' })
    })

    it('a vendor picked from the quick picks is the vendor sent', async () => {
      mockReq([
        baseLine({
          id: 'line-1',
          qty: '20',
          purchases: [
            purchase('p1', 'vendor-1', 'Al-Rasheed Hardware', '2026-01-01T00:00:00Z', '4'),
          ],
        }),
      ])
      const { container } = await open()
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Al-Rasheed Hardware' }))
      attach(container)
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Record purchase' }))
      await waitFor(() => {
        expect(recordCalls).toHaveBeenCalledTimes(1)
      })
      expect(lastRecord().vendorId).toBe('vendor-1')
      expect(lastRecord().qty).toBe(16)
    })

    it('without a vendor nothing is recorded (the page’s own check)', async () => {
      const { container } = await open()
      attach(container)
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Record purchase' }))
      await act(async () => {
        await Promise.resolve()
      })
      expect(recordCalls).not.toHaveBeenCalled()
    })

    it('without a receipt nothing is recorded (the page’s own check)', async () => {
      await open()
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Cash' }))
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Record purchase' }))
      await act(async () => {
        await Promise.resolve()
      })
      expect(recordCalls).not.toHaveBeenCalled()
    })

    it('with a price of zero nothing is recorded (the page’s own check)', async () => {
      const { container } = await open()
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Cash' }))
      fireEvent.change(price(), { target: { value: '0' } })
      attach(container)
      fireEvent.click(within(card('line-1')).getByRole('button', { name: 'Record purchase' }))
      await act(async () => {
        await Promise.resolve()
      })
      expect(recordCalls).not.toHaveBeenCalled()
    })
  })

  // The "Apply to all items" card above the lines is drawn like the line cards: the same vendor picker and quick
  // picks, the same receipt drop zone, and a solid main button. What it does is unchanged.
  describe('the apply-to-all card', () => {
    const two = () => {
      mockReq([
        baseLine({
          id: 'line-1',
          description: 'Cement bags',
          qty: '20',
          purchases: [
            purchase('p1', 'vendor-1', 'Al-Rasheed Hardware', '2026-01-01T00:00:00Z', '4'),
          ],
        }),
        baseLine({ id: 'line-2', description: 'Rebar' }),
      ])
    }
    const batch = () => {
      // Desktop: title and hint sit in a div inside the card. Phone: the title is inside the toggle button.
      const title = screen.getByText('Apply to all items')
      const toggle = title.closest('button')
      const el = toggle ? toggle.parentElement : title.parentElement?.parentElement
      if (!el) throw new Error('Expected the apply-to-all card')
      return within(el)
    }

    it('with one vendor for all items: the vendor picker has the field look, with the quick picks under it', async () => {
      two()
      await open()
      fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
      const trigger = batch().getByText('Search vendor…').closest<HTMLElement>('div[tabindex]')
      expect(trigger).toHaveStyle({ minHeight: '40px', borderRadius: '10px' })
      const group = batch().getByRole('group', { name: 'Quick pick' })
      expect(
        within(group)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['Cash', 'Al-Rasheed Hardware', '+ New vendor'])
    })

    it('has no quick picks until "all items are from the same vendor" is ticked', async () => {
      two()
      await open()
      expect(batch().queryByRole('group', { name: 'Quick pick' })).toBeNull()
    })

    it('Cash applies to every line that still needs buying, and shows as picked', async () => {
      two()
      await open()
      fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
      const cash = batch().getByRole('button', { name: 'Cash' })
      expect(cash).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(cash)
      expect(cash).toHaveAttribute('aria-pressed', 'true')
      expect(within(card('line-1')).getByText('💵 Cash Purchase')).toBeInTheDocument()
      expect(within(card('line-2')).getByText('💵 Cash Purchase')).toBeInTheDocument()
    })

    it('a recent vendor applies to every line the same way', async () => {
      two()
      await open()
      fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
      fireEvent.click(batch().getByRole('button', { name: 'Al-Rasheed Hardware' }))
      expect(within(card('line-1')).getByText('Al-Rasheed Hardware')).toBeInTheDocument()
      expect(within(card('line-2')).getByText('Al-Rasheed Hardware')).toBeInTheDocument()
      // the vendor picker beside the chips now shows the same name (and is a button for a screen reader), so ask for
      // the one that is pressed: the chip
      expect(
        batch().getByRole('button', { name: 'Al-Rasheed Hardware', pressed: true }),
      ).toHaveAttribute('aria-pressed', 'true')
    })

    it('+ New vendor opens the new-vendor box', async () => {
      two()
      await open()
      fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
      fireEvent.click(batch().getByRole('button', { name: '+ New vendor' }))
      expect(screen.getByText('New vendor')).toBeInTheDocument()
      expect(screen.getByText('Vendor name')).toBeInTheDocument()
    })

    it('with one receipt for all items: a drop zone, not a plain button', async () => {
      two()
      await open()
      expect(batch().queryByTestId('receipt-drop-zone')).toBeNull()
      fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
      expect(batch().getByTestId('receipt-drop-zone')).toBeInTheDocument()
      expect(batch().getByRole('button', { name: 'Attach receipt photo(s) *' })).toBeInTheDocument()
    })

    it('shared files are chips the lines then report, and removing one is carried to the lines', async () => {
      two()
      const { container } = await open()
      fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
      attach(container, 'shared.jpg')
      expect(batch().getByText('shared.jpg')).toBeInTheDocument()
      expect(within(card('line-1')).getByText('📎 1 file (same for all items)')).toBeInTheDocument()
      fireEvent.click(batch().getByRole('button', { name: 'Remove shared.jpg' }))
      expect(batch().queryByText('shared.jpg')).toBeNull()
      expect(
        within(card('line-1')).getByText('Attach the shared receipt(s) above'),
      ).toBeInTheDocument()
    })

    it('Clear drops every shared file', async () => {
      two()
      const { container } = await open()
      fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
      attach(container, 'a.jpg')
      attach(container, 'b.jpg')
      expect(batch().getAllByRole('listitem')).toHaveLength(2)
      fireEvent.click(batch().getByRole('button', { name: 'Clear' }))
      expect(batch().queryAllByRole('listitem')).toHaveLength(0)
    })

    it('removing a shared file makes the next Record all upload what is left, not the files kept from before', async () => {
      // Line 2 has a price of zero, so the first Record all records line 1 and stops there.
      mockReq([
        baseLine({ id: 'line-1', description: 'Cement bags' }),
        baseLine({
          id: 'line-2',
          description: 'Rebar',
          unit_price: '0',
          approved_unit_price: '0',
        }),
      ])
      const { container } = await open()
      fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
      fireEvent.click(batch().getByRole('button', { name: 'Cash' }))
      fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
      attach(container, 'a.jpg')
      attach(container, 'b.jpg')
      const recordAll = () => batch().getByRole('button', { name: 'Record all purchases' })
      fireEvent.click(recordAll())
      // b.jpg goes on line 1 as its extra file, then the loop stops at line 2
      await waitFor(() => {
        expect(attachCalls).toHaveBeenCalledTimes(1)
        expect(recordAll()).not.toHaveAttribute('aria-busy')
      })
      expect(recordCalls).toHaveBeenCalledTimes(1)
      // the buyer drops b.jpg and gives line 2 a price
      fireEvent.click(batch().getByRole('button', { name: 'Remove b.jpg' }))
      fireEvent.change(screen.getAllByRole('spinbutton', { name: 'Actual price' })[1], {
        target: { value: '50' },
      })
      fireEvent.click(recordAll())
      await waitFor(() => {
        expect(recordCalls.mock.calls.length).toBeGreaterThan(2)
      })
      // only a.jpg is left, so no purchase gets an extra file this time
      expect(attachCalls).toHaveBeenCalledTimes(1)
    })

    it('adding a shared file makes the next Record all upload it too, not just the files kept from before', async () => {
      // Line 2 has a price of zero, so the first Record all records line 1 (with only a.jpg) and stops there.
      mockReq([
        baseLine({ id: 'line-1', description: 'Cement bags' }),
        baseLine({
          id: 'line-2',
          description: 'Rebar',
          unit_price: '0',
          approved_unit_price: '0',
        }),
      ])
      const { container } = await open()
      fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
      fireEvent.click(batch().getByRole('button', { name: 'Cash' }))
      fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
      attach(container, 'a.jpg')
      const recordAll = () => batch().getByRole('button', { name: 'Record all purchases' })
      fireEvent.click(recordAll())
      await waitFor(() => {
        expect(recordCalls).toHaveBeenCalledTimes(1)
        expect(recordAll()).not.toHaveAttribute('aria-busy')
      })
      // one file, so nothing extra was attached
      expect(attachCalls).not.toHaveBeenCalled()
      // the buyer adds b.jpg and gives line 2 a price
      attach(container, 'b.jpg')
      fireEvent.change(screen.getAllByRole('spinbutton', { name: 'Actual price' })[1], {
        target: { value: '50' },
      })
      fireEvent.click(recordAll())
      await waitFor(() => {
        expect(recordCalls.mock.calls.length).toBeGreaterThan(2)
      })
      // both files go on each purchase: the second one as an extra, on both lines recorded
      expect(attachCalls).toHaveBeenCalledTimes(2)
    })

    it('Record all purchases is the one solid button of the card', async () => {
      two()
      await open()
      fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
      const all = batch().getByRole('button', { name: 'Record all purchases' })
      expect(all).toHaveStyle({ backgroundColor: themes['light-flat'].accentSolid })
      expect(all.style.width).toBe('')
    })

    it('on a phone Record all purchases fills the row', async () => {
      setWidth(390)
      two()
      await open()
      fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
      expect(batch().getByRole('button', { name: 'Record all purchases' })).toHaveStyle({
        width: '100%',
      })
    })
  })

  describe('on a phone and in Arabic', () => {
    it('the main action fills the row and Mark short drops below it', async () => {
      setWidth(390)
      await open()
      const c = within(card('line-1'))
      expect(c.getByRole('button', { name: 'Record purchase' })).toHaveStyle({ width: '100%' })
      expect(c.getByRole('button', { name: 'Resolve from stock' })).toHaveStyle({ width: '100%' })
      expect(c.getByRole('button', { name: 'Mark short' }).parentElement).toHaveStyle({
        order: '2',
      })
    })

    it('the entry boxes use 16 px text on a phone so the browser does not zoom the page in', async () => {
      setWidth(390)
      await open()
      expect(qty()).toHaveStyle({ fontSize: '16px' })
      expect(price()).toHaveStyle({ fontSize: '16px' })
    })

    it('on a desktop the main action is its own width', async () => {
      await open()
      expect(
        within(card('line-1')).getByRole('button', { name: 'Record purchase' }).style.width,
      ).toBe('')
    })

    it('reads in Arabic with no raw key', async () => {
      await act(async () => {
        await i18n.changeLanguage('ar')
      })
      await open()
      const c = within(card('line-1'))
      expect(c.getByText(i18n.t('req.bought.recordAPurchase'))).toBeInTheDocument()
      expect(c.getByRole('button', { name: i18n.t('req.bought.cashChip') })).toBeInTheDocument()
      expect(
        c.getByRole('button', { name: i18n.t('req.bought.newVendorChip') }),
      ).toBeInTheDocument()
      expect(c.getByRole('group', { name: i18n.t('req.bought.quickPick') })).toBeInTheDocument()
      expect(card('line-1').textContent).not.toMatch(/req\.bought\./)
      expect(i18n.t('req.bought.recordAPurchase')).not.toBe('Record a purchase')
    })
  })
})
