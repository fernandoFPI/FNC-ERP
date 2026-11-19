import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

// ── Apollo mock ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function wrap(ui: React.ReactNode, initialPath = '/procurement/requisitions') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

const sampleRequisitions = [
  {
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
    organizer_id: 'user-1',
    organizerName: 'Jane Doe',
    notes: null,
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'req-2',
    requisition_number: 'REQ-2026-002',
    status: 'sourcing',
    priority: 'emergency',
    purpose: 'project',
    delivery_destination: 'jobsite',
    project_id: 'proj-1',
    projectName: 'Tower A',
    branch_id: 'branch-1',
    branch_name: 'Main Branch',
    organizer_id: 'user-2',
    organizerName: 'John Smith',
    notes: null,
    created_at: '2026-01-16T10:00:00.000Z',
    updated_at: '2026-01-16T10:00:00.000Z',
  },
]

beforeEach(() => {
  // The page persists its filters in sessionStorage; don't leak between tests.
  sessionStorage.clear()
  vi.clearAllMocks()
  mockUseQuery.mockReturnValue({
    // useQuery is mocked for every query on the page, so the queue count's field is supplied too.
    data: { requisitions: sampleRequisitions, myRequisitionApprovalQueue: [] },
    loading: false,
    refetch: vi.fn(),
  })
})

describe('RequisitionsPage', () => {
  it('renders the page title and both requisitions', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    expect(screen.getByText('Requisitions')).toBeInTheDocument()
    expect(screen.getByText('REQ-2026-001')).toBeInTheDocument()
    expect(screen.getByText('REQ-2026-002')).toBeInTheDocument()
  })

  it('shows a status badge per row', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    // "Draft"/"Sourcing" also appear as filter-chip labels, so more than one
    // match is expected — assert at least the row badge is present.
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sourcing').length).toBeGreaterThan(0)
  })

  it('shows the emergency priority badge', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    expect(screen.getByText('Emergency')).toBeInTheDocument()
  })

  it('filters by search text', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    const search = screen.getByPlaceholderText(/search/i)
    fireEvent.change(search, { target: { value: 'REQ-2026-002' } })
    expect(screen.queryByText('REQ-2026-001')).not.toBeInTheDocument()
    expect(screen.getByText('REQ-2026-002')).toBeInTheDocument()
  })

  it('opens the preview panel on row click, then navigates to the detail route from it', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    fireEvent.click(screen.getByText('REQ-2026-001'))
    expect(mockNavigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /(open|edit) requisition/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-1')
  })

  it('navigates to the detail route from the row menu', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Row actions' })[0])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open full page' }))
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/procurement\/requisitions\/req-/),
    )
  })

  it('navigates to the new-requisition route on button click', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /new requisition/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/new')
  })

  it('offers the requisition statuses in the Status filter', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    expect(screen.getAllByText('Sourcing').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0)
  })

  it('renders an empty state with zero requisitions without crashing', async () => {
    mockUseQuery.mockReturnValue({
      data: { requisitions: [], myRequisitionApprovalQueue: [] },
      loading: false,
      refetch: vi.fn(),
    })
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    expect(screen.getByText('Showing 0-0 of 0 entries')).toBeInTheDocument()
  })

  it("defaults to the full list, not just the signed-in user's own requisitions", async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    const [, options] = mockUseQuery.mock.calls[0] as [
      unknown,
      { variables: { myQueueOnly?: boolean } },
    ]
    expect(options.variables.myQueueOnly).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    expect(screen.getByLabelText(/only requisitions i organized/i)).not.toBeChecked()
  })

  it('seeds a "My Requisitions" preset for a fresh browser, restoring the old default on demand', async () => {
    localStorage.clear()
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    fireEvent.click(screen.getByTitle('Saved filter presets'))
    const presetButton = screen.getByRole('button', { name: 'My Requisitions' })
    fireEvent.click(presetButton)
    // The page also runs the My Queue count query (no variables), so pick the
    // last call that actually carries the list query's variables.
    const listCalls = (
      mockUseQuery.mock.calls as [unknown, { variables?: { myQueueOnly?: boolean } }?][]
    ).filter((c) => c[1]?.variables !== undefined)
    expect(listCalls.at(-1)?.[1]?.variables?.myQueueOnly).toBe(true)
  })

  it('does not re-seed the preset after the user deletes it', async () => {
    localStorage.clear()
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    const { unmount } = wrap(<RequisitionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    fireEvent.click(screen.getByTitle('Saved filter presets'))
    fireEvent.click(screen.getByTitle('Delete preset'))
    unmount()

    wrap(<RequisitionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    fireEvent.click(screen.getByTitle('Saved filter presets'))
    expect(screen.getByText('No saved presets')).toBeInTheDocument()
  })
})

// A direct supply is a purpose like the others: it can be filtered on, and its rows name it properly instead of
// printing the stored value (direct_supply).
describe('RequisitionsPage: direct supply', () => {
  const directSupply = {
    ...sampleRequisitions[1],
    id: 'req-3',
    requisition_number: 'REQ-2026-003',
    status: 'pending_approval',
    purpose: 'direct_supply',
    projectName: 'Tower B',
    organizerName: 'Sara Ali',
  }
  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: {
        requisitions: [...sampleRequisitions, directSupply],
        myRequisitionApprovalQueue: [],
      },
      loading: false,
      refetch: vi.fn(),
    })
  })

  it('offers Direct Supply in the Purpose filter, after Project Supply', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    const filter = screen.getByRole('combobox', { name: 'Purpose' })
    const options = [...filter.querySelectorAll('option')].map((o) => [o.getAttribute('value'), o.textContent])
    expect(options).toContainEqual(['direct_supply', 'Direct Supply'])
    const values = options.map((o) => o[0])
    expect(values.indexOf('direct_supply')).toBe(values.indexOf('project') + 1)
  })

  it('narrows the list to direct supplies when that purpose is chosen', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    expect(screen.getByText('REQ-2026-001')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Purpose' }), {
      target: { value: 'direct_supply' },
    })
    expect(screen.getByText('REQ-2026-003')).toBeInTheDocument()
    expect(screen.queryByText('REQ-2026-001')).not.toBeInTheDocument()
    expect(screen.queryByText('REQ-2026-002')).not.toBeInTheDocument()
  })

  it('names the purpose on its row, not the stored value', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    expect(screen.getByText('Direct supply')).toBeInTheDocument()
    expect(screen.queryByText('direct_supply')).not.toBeInTheDocument()
  })
})
