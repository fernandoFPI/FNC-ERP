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
    gql: actual.gql,
  }
})

vi.mock('../../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { companyId: string } }) => unknown) =>
    selector({ user: { companyId: 'company-1' } }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function wrap(ui: React.ReactNode, initialPath = '/procurement/requisitions/new') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

// The shared Select component's <label> isn't associated to its <select>
// via htmlFor/id (true across the whole app, not specific to this form),
// so getByLabelText doesn't work here — Purpose is the first native
// <select> the form renders (Branch/GL Account/Cost Center use the
// options-array variant, which renders a SearchableSelect instead).
function getPurposeSelect(container: HTMLElement): HTMLSelectElement {
  return container.querySelectorAll('select')[0] as HTMLSelectElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseQuery.mockImplementation((_doc: unknown) => {
    return { data: undefined, loading: false }
  })
  mockUseMutation.mockReturnValue([
    vi.fn().mockResolvedValue({ data: { createRequisition: { id: 'req-new-1' } } }),
    { loading: false },
  ])
})

describe('RequisitionForm', () => {
  it('renders the purpose selector defaulted to General Stock, with no project fields shown', async () => {
    const RequisitionForm = (await import('../RequisitionForm')).default
    wrap(<RequisitionForm />)
    expect(screen.getByText('New Requisition')).toBeInTheDocument()
    expect(screen.queryByText(/project \*/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/delivery destination \*/i)).not.toBeInTheDocument()
  })

  it('shows Project and Delivery Destination fields when purpose is switched to Project Supply', async () => {
    const RequisitionForm = (await import('../RequisitionForm')).default
    const { container } = wrap(<RequisitionForm />)
    fireEvent.change(getPurposeSelect(container), { target: { value: 'project' } })
    expect(screen.getByText(/project \*/i)).toBeInTheDocument()
    expect(screen.getByText(/delivery destination \*/i)).toBeInTheDocument()
  })

  // Regression coverage for ProjectDetail's "+ New Requisition" button,
  // which now links here instead of straight to PO creation — mirrors
  // PurchaseOrderForm's own ?projectId= pre-fill.
  it('pre-selects Project Supply and the project when opened with ?projectId=', async () => {
    mockUseQuery.mockImplementation((doc: { definitions?: { name?: { value?: string } }[] }) => {
      const opName = doc?.definitions?.[0]?.name?.value
      if (opName === 'Projects') {
        return { data: { projects: { data: [{ id: 'proj-1', code: 'PRJ-001', name: 'Erbil Tower' }] } }, loading: false }
      }
      return { data: undefined, loading: false }
    })
    const RequisitionForm = (await import('../RequisitionForm')).default
    wrap(<RequisitionForm />, '/procurement/requisitions/new?projectId=proj-1')
    expect(screen.getByText(/project \*/i)).toBeInTheDocument()
    expect(screen.getByText(/delivery destination \*/i)).toBeInTheDocument()
    expect(screen.getByText('PRJ-001 — Erbil Tower')).toBeInTheDocument()
  })

  it('starts with one line and can add another', async () => {
    const RequisitionForm = (await import('../RequisitionForm')).default
    wrap(<RequisitionForm />)
    const descriptionsBefore = screen.getAllByPlaceholderText('Description').length
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    const descriptionsAfter = screen.getAllByPlaceholderText('Description').length
    expect(descriptionsAfter).toBeGreaterThan(descriptionsBefore)
  })

  it('shows Auto (default) as the GL account and cost center placeholder per line', async () => {
    const RequisitionForm = (await import('../RequisitionForm')).default
    wrap(<RequisitionForm />)
    expect(screen.getAllByText('Auto (default)').length).toBeGreaterThanOrEqual(2)
  })

  it('rejects submit for Project Supply with no project selected', async () => {
    const createMock = vi.fn()
    mockUseMutation.mockReturnValue([createMock, { loading: false }])
    const RequisitionForm = (await import('../RequisitionForm')).default
    const { container } = wrap(<RequisitionForm />)
    fireEvent.change(getPurposeSelect(container), { target: { value: 'project' } })
    fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Rebar' } })
    fireEvent.click(screen.getByRole('button', { name: /create requisition/i }))
    expect(createMock).not.toHaveBeenCalled()
  })

  it('submits a General Stock requisition and navigates to its detail page', async () => {
    const createMock = vi.fn().mockResolvedValue({ data: { createRequisition: { id: 'req-new-1' } } })
    mockUseMutation.mockReturnValue([createMock, { loading: false }])
    const RequisitionForm = (await import('../RequisitionForm')).default
    wrap(<RequisitionForm />)
    fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Cement bags' } })
    fireEvent.click(screen.getByRole('button', { name: /create requisition/i }))
    await vi.waitFor(() => {
      expect(createMock).toHaveBeenCalled()
    })
    const callArgs = createMock.mock.calls[0][0]
    expect(callArgs.variables.input.purpose).toBe('stock')
    expect(callArgs.variables.input.lines).toHaveLength(1)
    expect(callArgs.variables.input.lines[0].description).toBe('Cement bags')
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-new-1')
    })
  })
})
