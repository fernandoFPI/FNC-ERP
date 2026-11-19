// The requisition list on a phone: the title and the New button share a row, the five KPI cards are a row of chips, the
// four dropdown filters wait behind one button, and each requisition is a three-line card that shows its status and
// opens the requisition in one tap. A desktop keeps the table, the preview panel and the Export button.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

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

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions']}>
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
  sessionStorage.clear()
  vi.clearAllMocks()
  mockUseQuery.mockReturnValue({
    data: { requisitions: sampleRequisitions, myRequisitionApprovalQueue: [] },
    loading: false,
    refetch: vi.fn(),
  })
})
afterEach(() => {
  setWidth(1024)
})

const open = async () => {
  const RequisitionsPage = (await import('../RequisitionsPage')).default
  return wrap(<RequisitionsPage />)
}
/** The card of one requisition: the tappable element that holds its number. */
const card = (number: string) => {
  const el = screen.getByText(number).closest<HTMLElement>('[role="button"]')
  if (!el) throw new Error(`no card for ${number}`)
  return el
}

describe('RequisitionsPage on a phone', () => {
  describe('the top of the page', () => {
    it('keeps the New Requisition button beside the title and drops the CSV export', async () => {
      setWidth(390)
      await open()
      expect(screen.getByRole('button', { name: /new requisition/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /export csv/i })).toBeNull()
    })

    it('New Requisition goes to the form', async () => {
      setWidth(390)
      await open()
      fireEvent.click(screen.getByRole('button', { name: /new requisition/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/new')
    })

    it('shows the KPI cards as chips, each with its number and name', async () => {
      setWidth(390)
      await open()
      const chip = screen.getByRole('button', { name: /my queue/i })
      expect(chip).toHaveStyle({ borderRadius: '999px' })
      expect(chip.textContent).toMatch(/my queue/i)
    })
  })

  describe('each requisition is a three-line card', () => {
    it('shows the number, the status, what it is for and the project, then stage, organizer and age', async () => {
      setWidth(390)
      await open()
      const c = within(card('REQ-2026-002'))
      expect(c.getByText('Sourcing')).toBeInTheDocument()
      expect(c.getByText(/Tower A/)).toBeInTheDocument()
      expect(c.getByText(/John Smith/)).toBeInTheDocument()
      // the status is on the card itself, not behind a "+ more" fold
      expect(c.queryByText(/more/i)).toBeNull()
    })

    it('shows the emergency priority and its red edge', async () => {
      setWidth(390)
      await open()
      expect(within(card('REQ-2026-002')).getByText('Emergency')).toBeInTheDocument()
      expect(card('REQ-2026-002').style.borderInlineStart).toContain('3px solid')
      expect(within(card('REQ-2026-001')).queryByText('Emergency')).toBeNull()
    })

    it('leaves a requisition with no project to its purpose alone', async () => {
      setWidth(390)
      await open()
      const c = card('REQ-2026-001')
      expect(c.textContent).not.toMatch(/Tower A/)
      expect(within(c).getByText('Draft')).toBeInTheDocument()
    })

    it('goes straight to the requisition when tapped, with no preview panel in between', async () => {
      setWidth(390)
      await open()
      fireEvent.click(card('REQ-2026-002'))
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-2')
    })

    it('opens from the keyboard (Enter and Space)', async () => {
      setWidth(390)
      await open()
      fireEvent.keyDown(card('REQ-2026-001'), { key: 'Enter' })
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-1')
      mockNavigate.mockClear()
      fireEvent.keyDown(card('REQ-2026-001'), { key: ' ' })
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-1')
    })

    it('filters the cards by the search text', async () => {
      setWidth(390)
      await open()
      fireEvent.change(screen.getByPlaceholderText(/search/i), {
        target: { value: 'REQ-2026-002' },
      })
      expect(screen.queryByText('REQ-2026-001')).toBeNull()
      expect(screen.getByText('REQ-2026-002')).toBeInTheDocument()
    })

    it('falls back to the table’s own loading and empty states', async () => {
      setWidth(390)
      mockUseQuery.mockReturnValue({
        data: { requisitions: [], myRequisitionApprovalQueue: [] },
        loading: false,
        refetch: vi.fn(),
      })
      await open()
      expect(screen.getByText(/no requisitions yet/i)).toBeInTheDocument()
    })
  })

  describe('the filters', () => {
    const toggle = () => screen.getByRole('button', { name: 'Filters' })

    it('wait behind one button, which opens and closes them', async () => {
      setWidth(390)
      await open()
      expect(toggle()).toHaveAttribute('aria-expanded', 'false')
      // mounted (a saved filter keeps applying) but not shown
      expect(screen.getAllByText('Status')[0]).not.toBeVisible()
      fireEvent.click(toggle())
      expect(toggle()).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getAllByText('Status')[0]).toBeVisible()
      fireEvent.click(toggle())
      expect(screen.getAllByText('Status')[0]).not.toBeVisible()
    })

    it('say how many of the four dropdowns are set', async () => {
      setWidth(390)
      sessionStorage.setItem(
        'requisitions-page-filters',
        JSON.stringify({ status: 'sourcing', purpose: 'project' }),
      )
      await open()
      expect(toggle()).toHaveTextContent('2')
      // and a filter that is set still applies while the dropdowns are hidden
      expect(screen.queryByText('REQ-2026-001')).toBeNull()
      expect(screen.getByText('REQ-2026-002')).toBeInTheDocument()
    })

    it('show no number when none is set', async () => {
      setWidth(390)
      await open()
      expect(toggle().textContent).toBe('')
    })

    it('are not behind a button on a desktop', async () => {
      await open()
      expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull()
      expect(screen.getAllByText('Status')[0]).toBeVisible()
    })
  })
})

describe('RequisitionsPage on a desktop', () => {
  it('keeps the CSV export, the table and the preview panel', async () => {
    await open()
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    fireEvent.click(screen.getByText('REQ-2026-001'))
    // a row click opens the preview, not the page
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
