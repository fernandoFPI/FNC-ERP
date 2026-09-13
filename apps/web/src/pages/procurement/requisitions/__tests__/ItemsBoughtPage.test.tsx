import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { TOUR_DEMO_REQUISITION_ID } from '../../../../components/help/tourDemoRequisition'

// ── Apollo mock ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
const mockUseLazyQuery = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>()
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
    useLazyQuery: (...args: unknown[]) => mockUseLazyQuery(...args),
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
let mockParamId = 'req-1'
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: mockParamId }) }
})

function wrap(ui: React.ReactNode, path = '/procurement/requisitions/req-1/items-bought') {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
    const opName = (doc as { definitions?: { name?: { value?: string } }[] })?.definitions?.[0]?.name?.value
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
  mockParamId = 'req-1'
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

  // Onboarding tour, Phase 3: navigating to the reserved demo id renders
  // the synthetic items-bought requisition, not real query data — one
  // line already fully bought, one over-tolerance and unapproved, one
  // still open for a purchase to be recorded.
  it('tour demo: renders the synthetic requisition, not real query data', async () => {
    mockParamId = TOUR_DEMO_REQUISITION_ID
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    wrap(<ItemsBoughtPage />, `/procurement/requisitions/${TOUR_DEMO_REQUISITION_ID}/items-bought`)
    // Both the fully-resolved Steel Angle Bar line and the over-tolerance
    // Cement Bags line (also fully bought, just not yet approved) show it.
    expect(screen.getAllByText('Fully bought').length).toBe(2)
    expect(screen.getByRole('button', { name: /approve override/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^record purchase$/i })).toBeInTheDocument()
    expect(screen.queryByText('Cement bags')).not.toBeInTheDocument()
  })
})
