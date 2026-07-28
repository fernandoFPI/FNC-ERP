import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'

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

vi.mock('../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function wrap(ui: React.ReactNode, initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({}), { loading: false }])
  mockUseQuery.mockReturnValue({ data: undefined, loading: false, refetch: vi.fn() })
})

// ── PurchaseOrderForm ────────────────────────────────────────────────────────
describe('PurchaseOrderForm', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: { vendors: [], analyticAccounts: [], products: [] },
      loading: false,
    })
  })

  it('starts with one PO line and an Add Line button', async () => {
    const PurchaseOrderForm = (await import('../purchase-orders/PurchaseOrderForm')).default
    wrap(<PurchaseOrderForm />)
    expect(screen.getByRole('button', { name: /add line/i })).toBeInTheDocument()
  })

  it('adds a PO line on Add Line click', async () => {
    const PurchaseOrderForm = (await import('../purchase-orders/PurchaseOrderForm')).default
    wrap(<PurchaseOrderForm />)
    // Start with 1 line → 1 × button
    const removeBefore = screen.getAllByText('×').length
    fireEvent.click(screen.getByRole('button', { name: /\+ add line/i }))
    const removeAfter = screen.getAllByText('×').length
    expect(removeAfter).toBeGreaterThan(removeBefore)
  })

  it('shows total amount panel', async () => {
    const PurchaseOrderForm = (await import('../purchase-orders/PurchaseOrderForm')).default
    wrap(<PurchaseOrderForm />)
    // The form renders "Total: 0 IQD" in the lines section footer
    expect(screen.getByText(/total:/i)).toBeInTheDocument()
  })

  it('shows Order Lines section heading', async () => {
    const PurchaseOrderForm = (await import('../purchase-orders/PurchaseOrderForm')).default
    wrap(<PurchaseOrderForm />)
    expect(screen.getByText(/order lines/i)).toBeInTheDocument()
  })

  it('shows Create Purchase Order submit button', async () => {
    const PurchaseOrderForm = (await import('../purchase-orders/PurchaseOrderForm')).default
    wrap(<PurchaseOrderForm />)
    expect(screen.getByRole('button', { name: /create purchase order/i })).toBeInTheDocument()
  })
})

// ── PurchaseOrderDetail ──────────────────────────────────────────────────────
describe('PurchaseOrderDetail', () => {
  function mockPO(status: string) {
    const po = {
      id: 'po-1',
      po_number: 'PO-FNC-2026-001',
      vendor_name: 'Acme Supplies',
      currency_code: 'USD',
      status,
      subtotal: '1000',
      tax_amount: '100',
      total_amount: '1100',
      fx_rate: '1480',
      notes: '',
      created_at: '2026-01-15T10:00:00.000Z',
      lines: [],
      receipts: [],
      approval_log: [],
    }
    mockUseQuery.mockReturnValue({ data: { purchaseOrder: po }, loading: false })
  }

  it('shows Submit for inventory check button for draft status', async () => {
    mockPO('draft')
    const PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
    wrap(<PurchaseOrderDetail />, '/procurement/orders/po-1')
    expect(screen.getByRole('button', { name: /submit for inventory check/i })).toBeInTheDocument()
  })

  it('shows Approve PO button for pending_approval status', async () => {
    mockPO('pending_approval')
    const PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
    wrap(<PurchaseOrderDetail />, '/procurement/orders/po-1')
    expect(screen.getByRole('button', { name: /approve po/i })).toBeInTheDocument()
  })

  it('does not show Submit button for non-opening statuses', async () => {
    mockPO('pending_approval')
    const PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
    wrap(<PurchaseOrderDetail />, '/procurement/orders/po-1')
    expect(
      screen.queryByRole('button', { name: /submit for inventory check/i }),
    ).not.toBeInTheDocument()
  })

  it('shows approve and reject UI for pending_approval status', async () => {
    mockPO('pending_approval')
    const PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
    wrap(<PurchaseOrderDetail />, '/procurement/orders/po-1')
    expect(screen.getByRole('button', { name: /approve po/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter reason/i)).toBeInTheDocument()
  })

  it('shows action notes textarea in inline action panel', async () => {
    mockPO('pending_approval')
    const PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
    wrap(<PurchaseOrderDetail />, '/procurement/orders/po-1')
    await waitFor(() => {
      expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0)
    })
  })

  it('renders StatusBar for the PO workflow', async () => {
    mockPO('submitted')
    const PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
    wrap(<PurchaseOrderDetail />, '/procurement/orders/po-1')
    // StatusBar renders step labels — multiple "submitted" matches expected (badge + step)
    expect(screen.getAllByText(/submitted/i).length).toBeGreaterThan(0)
  })

  it('shows PO number in the header', async () => {
    mockPO('draft')
    const PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
    wrap(<PurchaseOrderDetail />, '/procurement/orders/po-1')
    expect(screen.getByText('PO-FNC-2026-001')).toBeInTheDocument()
  })

  it('does not show Reject/Cancel buttons for closed PO', async () => {
    mockPO('closed')
    const PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
    wrap(<PurchaseOrderDetail />, '/procurement/orders/po-1')
    expect(screen.queryByRole('button', { name: /^reject$/i })).not.toBeInTheDocument()
  })
})

// ── ApprovalQueue ────────────────────────────────────────────────────────────
describe('ApprovalQueue', () => {
  const pendingPOs = [
    {
      id: 'po-2',
      po_number: 'PO-FNC-2026-002',
      vendor_name: 'Test Vendor',
      currency_code: 'IQD',
      status: 'submitted',
      total_amount: '5000',
      created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
      assigned_to_email: 'admin@fnc.com',
    },
  ]

  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: { myApprovalQueue: pendingPOs, purchaseOrders: pendingPOs },
      loading: false,
      refetch: vi.fn(),
    })
  })

  it('renders POs in the approval queue', async () => {
    const ApprovalQueue = (await import('../purchase-orders/ApprovalQueue')).default
    wrap(<ApprovalQueue />)
    expect(screen.getByText('PO-FNC-2026-002')).toBeInTheDocument()
  })

  it('shows the Submitted column header', async () => {
    const ApprovalQueue = (await import('../purchase-orders/ApprovalQueue')).default
    wrap(<ApprovalQueue />)
    // "Submitted" appears as both a column header and a status badge
    expect(screen.getAllByText(/submitted/i).length).toBeGreaterThan(0)
  })

  it('renders Approve action buttons', async () => {
    const ApprovalQueue = (await import('../purchase-orders/ApprovalQueue')).default
    wrap(<ApprovalQueue />)
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })
})
