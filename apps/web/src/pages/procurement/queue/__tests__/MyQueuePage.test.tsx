import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
  }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../../../lib/axios', () => ({ api: { get: vi.fn().mockResolvedValue({ data: [] }) } }))
vi.mock('../../../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => false, canAny: () => false, isSystemLevel: false }),
}))
vi.mock('../../../../hooks/useEntityChanged', () => ({ useEntityChanged: vi.fn() }))

function wrap(path = '/procurement/queue') {
  return import('../MyQueuePage').then(({ default: MyQueuePage }) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <MyQueuePage />
        </ThemeProvider>
      </MemoryRouter>,
    ),
  )
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

const requisitions = [
  {
    id: 'req-1',
    requisition_number: 'REQ-2026-001',
    status: 'inventory_check',
    priority: 'low',
    purpose: 'stock',
    project_id: null,
    projectCode: null,
    projectName: null,
    branch_id: 'b1',
    branch_name: 'Basra Office',
    organizer_id: 'u-other',
    organizerName: 'Jane Doe',
    created_at: daysAgo(6),
    updated_at: daysAgo(5),
  },
  {
    id: 'req-2',
    requisition_number: 'REQ-2026-002',
    status: 'items_bought',
    priority: 'high',
    purpose: 'project',
    project_id: 'p1',
    projectCode: 'PRJ-1',
    projectName: 'Tower A',
    branch_id: 'b1',
    branch_name: 'Basra Office',
    organizer_id: 'u-other',
    organizerName: 'John Smith',
    created_at: daysAgo(2),
    updated_at: daysAgo(1),
  },
]

const purchaseOrders = [
  {
    id: 'po-1',
    po_number: 'PO-2026-001',
    requisitionNumber: 'REQ-2026-009',
    priority: 'low',
    projectCode: 'PRJ-2',
    projectName: 'Lab',
    organizerName: 'Sam',
    status: 'pending_approval',
    currency_code: 'IQD',
    total_amount: '100',
    created_at: daysAgo(4),
    updated_at: daysAgo(4),
    organizer_id: 'u-other',
    project_id: 'p2',
    vendor_id: 'v1',
    vendor_name: 'Acme Supplies',
    delivery_destination: null,
  },
  {
    id: 'po-2',
    po_number: 'PO-2026-002',
    requisitionNumber: null,
    priority: 'low',
    projectCode: null,
    projectName: null,
    organizerName: 'Sam',
    status: 'bought',
    currency_code: 'IQD',
    total_amount: '50',
    created_at: daysAgo(1),
    updated_at: daysAgo(0),
    organizer_id: 'u-other',
    project_id: null,
    vendor_id: 'v2',
    vendor_name: 'Beta Trading',
    delivery_destination: 'jobsite',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockUseQuery.mockReturnValue({
    data: { myRequisitionApprovalQueue: requisitions, myPOQueue: purchaseOrders },
    loading: false,
    refetch: vi.fn(),
  })
})

describe('MyQueuePage', () => {
  it('merges requisitions and purchase orders into one list', async () => {
    await wrap()
    for (const n of ['REQ-2026-001', 'REQ-2026-002', 'PO-2026-001', 'PO-2026-002']) {
      expect(screen.getByText(n)).toBeInTheDocument()
    }
  })

  it('names the action each item is waiting on', async () => {
    await wrap()
    // each action appears in its row and again as an option of the Action filter
    for (const action of [
      'Confirm inventory check',
      'Record purchases',
      'Approve',
      // a 'bought' PO delivered to a jobsite is not the generic receipt action
      'Confirm jobsite delivery',
    ]) {
      expect(screen.getAllByText(action).length).toBeGreaterThan(0)
    }
  })

  it('lists the longest-waiting item first', async () => {
    await wrap()
    const rows = screen.getAllByText(/^(REQ|PO)-2026-00\d$/).map((e) => e.textContent)
    expect(rows[0]).toBe('REQ-2026-001') // 5 days, the oldest
    expect(rows[rows.length - 1]).toBe('PO-2026-002') // updated today
  })

  it('opens the right page for each kind of row', async () => {
    await wrap()
    fireEvent.click(screen.getByText('REQ-2026-001'))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-1')
    fireEvent.click(screen.getByText('REQ-2026-002'))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-2/items-bought')
    fireEvent.click(screen.getByText('PO-2026-001'))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/purchase-orders/po-1')
  })

  it('filters to items that need my approval (also the target of the old Approval Queue link)', async () => {
    await wrap('/procurement/queue?filter=approval')
    expect(screen.getByText('PO-2026-001')).toBeInTheDocument() // pending_approval
    expect(screen.queryByText('PO-2026-002')).not.toBeInTheDocument()
    expect(screen.queryByText('REQ-2026-001')).not.toBeInTheDocument()
  })

  it('filters by type from the KPI tiles', async () => {
    await wrap()
    fireEvent.click(screen.getByRole('button', { name: /purchase orders/i }))
    expect(screen.queryByText('REQ-2026-001')).not.toBeInTheDocument()
    expect(screen.getByText('PO-2026-001')).toBeInTheDocument()
  })

  it('searches across number, project and vendor', async () => {
    await wrap()
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'acme' } })
    expect(screen.getByText('PO-2026-001')).toBeInTheDocument()
    expect(screen.queryByText('PO-2026-002')).not.toBeInTheDocument()
  })

  it('shows an all-caught-up state when nothing is waiting', async () => {
    mockUseQuery.mockReturnValue({
      data: { myRequisitionApprovalQueue: [], myPOQueue: [] },
      loading: false,
      refetch: vi.fn(),
    })
    await wrap()
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
  })
})
