import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'

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

vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) => selector({ user: { id: 'user-1' } }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions/queue']}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

const items = [
  {
    id: 'req-1',
    requisition_number: 'REQ-2026-001',
    status: 'draft',
    priority: 'low',
    purpose: 'stock',
    project_id: null,
    projectName: null,
    branch_id: 'branch-1',
    branch_name: 'Main Branch',
    organizer_id: 'user-1',
    organizerName: 'Jane Doe',
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'req-2',
    requisition_number: 'REQ-2026-002',
    status: 'items_bought',
    priority: 'high',
    purpose: 'project',
    project_id: 'proj-1',
    projectName: 'Tower A',
    branch_id: 'branch-1',
    branch_name: 'Main Branch',
    organizer_id: 'user-2',
    organizerName: 'John Smith',
    created_at: '2026-01-10T10:00:00.000Z',
    updated_at: '2026-01-10T10:00:00.000Z',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockUseQuery.mockReturnValue({ data: { myRequisitionApprovalQueue: items }, loading: false, refetch: vi.fn() })
})

describe('MyRequisitionQueue', () => {
  it('groups items by the action waiting on them', async () => {
    const MyRequisitionQueue = (await import('../MyRequisitionQueue')).default
    wrap(<MyRequisitionQueue />)
    expect(screen.getByText(/submit for inventory check/i)).toBeInTheDocument()
    expect(screen.getByText(/record purchases/i)).toBeInTheDocument()
    expect(screen.getByText('REQ-2026-001')).toBeInTheDocument()
    expect(screen.getByText('REQ-2026-002')).toBeInTheDocument()
  })

  it('shows an empty state with zero items', async () => {
    mockUseQuery.mockReturnValue({ data: { myRequisitionApprovalQueue: [] }, loading: false, refetch: vi.fn() })
    const MyRequisitionQueue = (await import('../MyRequisitionQueue')).default
    wrap(<MyRequisitionQueue />)
    expect(screen.getByText(/no requisitions awaiting your action/i)).toBeInTheDocument()
  })

  it('navigates to the Items Bought page for an items_bought row, and the detail page otherwise', async () => {
    const MyRequisitionQueue = (await import('../MyRequisitionQueue')).default
    wrap(<MyRequisitionQueue />)
    fireEvent.click(screen.getByText('REQ-2026-001'))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-1')
    fireEvent.click(screen.getByText('REQ-2026-002'))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-2/items-bought')
  })
})
