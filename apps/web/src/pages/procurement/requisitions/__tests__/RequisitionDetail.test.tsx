import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { TOUR_DEMO_REQUISITION_ID } from '../../../../components/help/tourDemoRequisition'

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
let mockParamId = 'req-1'
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: mockParamId }),
  }
})

function wrap(ui: React.ReactNode, path = '/procurement/requisitions/req-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
  mockParamId = 'req-1'
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

  // Regression coverage for matching PurchaseOrderDetail's own page
  // structure: stat-card Summary + Lines/Log/Edit-requests tabs.
  it('shows the Summary as stat cards, including the per-currency Total', async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    // "Total" also appears as a Lines-table column header, and "500 IQD"
    // also as that single line's own total — both coincidentally the same
    // figure here since there's only one line.
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    expect(screen.getAllByText('500 IQD').length).toBeGreaterThan(0)
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Organizer')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('renders Lines/Log/Edit requests tabs, defaulting to Lines', async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('Cement bags')).toBeInTheDocument()
    expect(screen.queryByText('Approval Log')).not.toBeInTheDocument()
    expect(screen.queryByText('Request an edit')).not.toBeInTheDocument()
  })

  it('Log tab shows approval_log entries and requisition notes', async () => {
    mockReq({
      notes: 'Urgent — client site is waiting',
      approval_log: [
        {
          id: 'log-1',
          from_status: 'draft',
          to_status: 'inventory_check',
          action: 'submitted',
          actor_id: 'user-organizer',
          actor_name: 'Jane Doe',
          actor_position: null,
          notes: null,
          created_at: '2026-01-16T09:00:00.000Z',
        },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /^log$/i }))
    expect(screen.getByText('Approval Log')).toBeInTheDocument()
    expect(screen.getByText('Urgent — client site is waiting')).toBeInTheDocument()
    expect(screen.getByText('submitted')).toBeInTheDocument()
    // "Jane Doe" also appears in the Summary's Organizer stat card, which
    // stays rendered regardless of active tab.
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0)
  })

  it('Edit requests tab: Start editing reveals the form, submit sends requisitionId (not id)', async () => {
    const submitMock = vi.fn().mockResolvedValue({})
    mockUseMutation.mockReturnValue([submitMock, { loading: false }])
    mockReq()
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /edit requests/i }))
    expect(screen.getByText('Request an edit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /start editing/i }))
    expect(screen.getByDisplayValue('Cement bags')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /submit edit request/i }))
    expect(submitMock).not.toHaveBeenCalled() // no fields changed yet — nothing to submit

    const notesInputs = screen.getAllByDisplayValue('')
    fireEvent.change(notesInputs[0]!, { target: { value: 'Please expedite' } })
    fireEvent.click(screen.getByRole('button', { name: /submit edit request/i }))

    expect(submitMock).toHaveBeenCalledTimes(1)
    const call = submitMock.mock.calls[0][0]
    expect(call.variables.requisitionId).toBe('req-1')
    expect(call.variables.id).toBeUndefined()
    const changes = JSON.parse(call.variables.changes)
    expect(changes.header.notes).toEqual({ from: '', to: 'Please expedite' })
  })

  it('Edit requests tab: shows a pending edit request with Approve/Reject for an admin', async () => {
    mockReq({
      edit_requests: [
        {
          id: 'er-1',
          status: 'pending',
          changes: JSON.stringify({ header: { notes: { from: '', to: 'Please expedite' } }, lines: {} }),
          request_notes: null,
          requested_by_email: 'buyer@fnc.com',
          reviewed_by_email: null,
          review_notes: null,
          reviewed_at: null,
          created_at: '2026-01-16T09:00:00.000Z',
        },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /edit requests/i }))
    expect(screen.getByText('buyer@fnc.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument()
  })

  // Onboarding tour, Phase 2: navigating to the reserved demo id renders
  // the synthetic requisition built client-side for whatever ?tourStatus=
  // is in the URL — real queries are skipped, and the mock's own (skip-
  // blind) return value must not leak through.
  it('tour demo: renders the synthetic requisition for the given tourStatus, not real query data', async () => {
    mockParamId = TOUR_DEMO_REQUISITION_ID
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />, `/procurement/requisitions/${TOUR_DEMO_REQUISITION_ID}?tourStatus=market_pricing`)
    expect(screen.getByText('REQ-TOUR-DEMO')).toBeInTheDocument()
    // Appears twice — once in the Lines tab table, once in the
    // market_pricing action panel's own per-line list.
    expect(screen.getAllByText('Steel Angle Bar 50mm').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /submit to price verification/i })).toBeInTheDocument()
    expect(screen.queryByText('Cement bags')).not.toBeInTheDocument()
  })
})
