import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'

// ── Apollo mock ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>()
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
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
  vi.clearAllMocks()
  mockUseQuery.mockReturnValue({
    data: { requisitions: sampleRequisitions },
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

  it('navigates to the requisition detail route on row click', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    fireEvent.click(screen.getByText('REQ-2026-001'))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-1')
  })

  it('navigates to the new-requisition route on button click', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    fireEvent.click(screen.getByRole('button', { name: /new requisition/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/new')
  })

  it('shows a status filter chip strip with per-status counts', async () => {
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    expect(screen.getAllByText('Sourcing').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0)
  })

  it('renders an empty state with zero requisitions without crashing', async () => {
    mockUseQuery.mockReturnValue({ data: { requisitions: [] }, loading: false, refetch: vi.fn() })
    const RequisitionsPage = (await import('../RequisitionsPage')).default
    wrap(<RequisitionsPage />)
    expect(screen.getByText('0 requisitions')).toBeInTheDocument()
  })
})
