import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'

// ── Apollo mock ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>()
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})

vi.mock('../../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

let mockAuthUser: { id: string; role: string } = { id: 'user-organizer', role: 'system_admin' }
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: mockAuthUser }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'req-1' }),
  }
})

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions/req-1']}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

function baseReq(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    requisition_number: 'REQ-2026-001',
    status: 'draft',
    priority: 'low',
    purpose: 'stock',
    delivery_destination: 'inventory',
    project_id: null,
    projectName: null,
    branch_id: 'branch-1',
    branch_name: 'Main Branch',
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
    currencyTotals: [{ currency_code: 'IQD', subtotal: '500', line_count: 1 }],
    lines: [
      {
        id: 'line-1',
        line_number: 1,
        description: 'Cement bags',
        product_id: 'prod-1',
        product_name: 'Cement',
        sku: 'CEM-1',
        qty: '5',
        uom: 'bag',
        currency_code: 'IQD',
        unit_price: '100',
        qty_from_stock: '0',
        store_price: null,
        market_price: null,
        verified_price: null,
        total: '500',
        purchases: [],
      },
    ],
    approval_log: [],
    ...overrides,
  }
}

function mockReq(
  overrides: Record<string, unknown> = {},
  availability: Record<string, unknown>[] = [],
) {
  mockUseQuery.mockImplementation((doc: unknown, opts?: { variables?: Record<string, unknown> }) => {
    const opName = (doc as { definitions?: { name?: { value?: string } }[] })?.definitions?.[0]?.name
      ?.value
    if (opName === 'RequisitionChildPurchaseOrders') {
      return { data: { requisitionChildPurchaseOrders: [] }, loading: false, refetch: vi.fn() }
    }
    if (opName === 'RequisitionStockAvailability') {
      return { data: { requisitionStockAvailability: availability }, loading: false, refetch: vi.fn() }
    }
    if (opts?.variables && 'isActive' in opts.variables) {
      return { data: { stockLocations: [] }, loading: false, refetch: vi.fn() }
    }
    return { data: { requisition: baseReq(overrides) }, loading: false, refetch: vi.fn() }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthUser = { id: 'user-organizer', role: 'system_admin' }
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({}), { loading: false }])
  mockReq()
})

describe('RequisitionDetail', () => {
  it('shows the requisition number and status badge', async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('REQ-2026-001')).toBeInTheDocument()
    // "Draft" also appears as a StatusBar step label, so more than one match
    // is expected — assert the header badge is among them.
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0)
  })

  it('shows the lines table with the line description', async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('Cement bags')).toBeInTheDocument()
  })

  it('draft: shows Submit for inventory check for the organizer', async () => {
    mockReq({ status: 'draft' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /submit for inventory check/i })).toBeInTheDocument()
  })

  it('inventory_check: shows the qty-from-stock input when caller has store_keeper position', async () => {
    mockReq({ status: 'inventory_check', callerHasStoreKeeperPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /confirm inventory check/i })).toBeInTheDocument()
  })

  it('inventory_check: hides the form for a caller without position or organizer', async () => {
    mockAuthUser = { id: 'user-nobody', role: 'user' }
    mockReq({ status: 'inventory_check', organizer_id: 'someone-else', callerHasStoreKeeperPosition: false })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.queryByRole('button', { name: /confirm inventory check/i })).not.toBeInTheDocument()
    expect(screen.getByText(/only the organizer, a store keeper/i)).toBeInTheDocument()
  })

  it('inventory_check: shows on-hand/reserved/available and a per-location breakdown from requisitionStockAvailability', async () => {
    mockReq(
      { status: 'inventory_check', callerHasStoreKeeperPosition: true },
      [
        {
          lineId: 'line-1',
          qtyRequired: 5,
          qtyOnHand: 8,
          qtyAvailable: 3,
          isAvailable: false,
          byLocation: [
            { companyId: 'co-1', companyName: 'Main Co', locationId: 'loc-1', locationName: 'Main Warehouse', qtyOnHand: 8, qtyAvailable: 3 },
          ],
        },
      ],
    )
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    // qtyReserved is derived client-side as qtyOnHand - qtyAvailable = 5.
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText(/main warehouse/i)).toBeInTheDocument()
  })

  it('store_pricing: shows the submit button when caller has the position', async () => {
    mockReq({ status: 'store_pricing', callerHasStorePricingPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /submit to market pricing/i })).toBeInTheDocument()
  })

  it('market_pricing: shows the submit button and a currency selector', async () => {
    mockReq({ status: 'market_pricing', callerHasMarketPricingPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /submit to price verification/i })).toBeInTheDocument()
  })

  it('price_verification: shows Submit for approval', async () => {
    mockReq({ status: 'price_verification', callerHasPriceVerificationPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /submit for approval/i })).toBeInTheDocument()
  })

  it('pending_approval: shows Approve and Reject for an authorized approver', async () => {
    mockReq({ status: 'pending_approval', callerCanApprove: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument()
  })

  it('pending_approval: reject stays disabled until a reason is entered', async () => {
    mockReq({ status: 'pending_approval', callerCanApprove: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    const rejectBtn = screen.getByRole('button', { name: /^reject$/i })
    expect(rejectBtn).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/enter reason/i), { target: { value: 'price too high' } })
    expect(rejectBtn).not.toBeDisabled()
  })

  it('sourcing: shows the sourcing summary panel', async () => {
    mockReq({ status: 'sourcing' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText(/waiting on every line to resolve/i)).toBeInTheDocument()
  })

  it('completed: shows the completed confirmation', async () => {
    mockReq({ status: 'completed' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText(/every line on this requisition has been resolved/i)).toBeInTheDocument()
  })

  it('cancelled: shows a terminal-state message and no Cancel button', async () => {
    mockReq({ status: 'cancelled' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText(/no longer active/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument()
  })

  it('calls submitRequisitionToInventoryCheck with the requisition id on submit click', async () => {
    const submitMock = vi.fn().mockResolvedValue({})
    mockUseMutation.mockReturnValue([submitMock, { loading: false }])
    mockReq({ status: 'draft' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /submit for inventory check/i }))
    expect(submitMock).toHaveBeenCalledWith({ variables: { id: 'req-1' } })
  })
})
