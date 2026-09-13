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

  // Third of three call sites migrated onto requisitions (Project and
  // Vendor already done) — ManufacturingOrderDetail's "Create Requisition
  // for missing items" now links here with ?moId=, and pre-fills specific
  // line items via sessionStorage instead of a URL param (mirrors
  // PurchaseOrderForm's own ?moId=/po_prefill_lines handling, under its
  // own req_prefill_lines key so the two forms' prefill state never
  // collides).
  it('pre-selects Manufacturing / BOM and the MO, and consumes req_prefill_lines, when opened with ?moId=', async () => {
    mockUseQuery.mockImplementation((doc: { definitions?: { name?: { value?: string } }[] }) => {
      const opName = doc?.definitions?.[0]?.name?.value
      if (opName === 'ManufacturingOrders') {
        return { data: { manufacturingOrders: [{ id: 'mo-1', mo_number: 'MO-2026-0001', product_name: 'Steel Frame' }] }, loading: false }
      }
      return { data: undefined, loading: false }
    })
    sessionStorage.setItem(
      'req_prefill_lines',
      JSON.stringify([
        { product_id: 'p1', description: 'Rebar 12mm', qty: '20', unit_price: '0', uom: 'pc', account_id: '', cost_center_id: '' },
      ]),
    )
    const RequisitionForm = (await import('../RequisitionForm')).default
    wrap(<RequisitionForm />, '/procurement/requisitions/new?moId=mo-1')
    expect(screen.getByText(/manufacturing order \*/i)).toBeInTheDocument()
    expect(screen.getByText('MO-2026-0001 — Steel Frame')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Rebar 12mm')).toBeInTheDocument()
    expect(sessionStorage.getItem('req_prefill_lines')).toBeNull()
  })

  it('submits a Manufacturing / BOM requisition with linked_mo_id set', async () => {
    mockUseQuery.mockImplementation((doc: { definitions?: { name?: { value?: string } }[] }) => {
      const opName = doc?.definitions?.[0]?.name?.value
      if (opName === 'ManufacturingOrders') {
        return { data: { manufacturingOrders: [{ id: 'mo-1', mo_number: 'MO-2026-0001' }] }, loading: false }
      }
      return { data: undefined, loading: false }
    })
    const createMock = vi.fn().mockResolvedValue({ data: { createRequisition: { id: 'req-new-1' } } })
    mockUseMutation.mockReturnValue([createMock, { loading: false }])
    const RequisitionForm = (await import('../RequisitionForm')).default
    wrap(<RequisitionForm />, '/procurement/requisitions/new?moId=mo-1')
    fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Rebar 12mm' } })
    fireEvent.click(screen.getByRole('button', { name: /create requisition/i }))
    await vi.waitFor(() => {
      expect(createMock).toHaveBeenCalled()
    })
    const callArgs = createMock.mock.calls[0][0]
    expect(callArgs.variables.input.purpose).toBe('manufacturing')
    expect(callArgs.variables.input.linked_mo_id).toBe('mo-1')
  })

  it('starts with one line and can add another', async () => {
    const RequisitionForm = (await import('../RequisitionForm')).default
    wrap(<RequisitionForm />)
    const descriptionsBefore = screen.getAllByPlaceholderText('Description').length
    fireEvent.click(screen.getByRole('button', { name: /add line/i }))
    const descriptionsAfter = screen.getAllByPlaceholderText('Description').length
    expect(descriptionsAfter).toBeGreaterThan(descriptionsBefore)
  })

  // Regression: GL Account/Cost Center used to be per-line columns here,
  // with an "Auto (default)" placeholder — removed because a requester
  // has no reason to know either; both still default automatically
  // server-side (createRequisition), just with nothing to show or set
  // for it on this form anymore.
  it('does not show GL Account or Cost Center columns', async () => {
    const RequisitionForm = (await import('../RequisitionForm')).default
    wrap(<RequisitionForm />)
    expect(screen.queryByText('GL Account')).not.toBeInTheDocument()
    expect(screen.queryByText('Cost Center')).not.toBeInTheDocument()
    expect(screen.queryByText('Auto (default)')).not.toBeInTheDocument()
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

  // Regression coverage for matching PurchaseOrderForm's own layout: an
  // unbounded-width page with a two-column Details/Summary split instead
  // of a single centered ~1100px column.
  it('shows a Summary sidebar that updates with the draft lines', async () => {
    const RequisitionForm = (await import('../RequisitionForm')).default
    wrap(<RequisitionForm />)
    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.getByText('Line Items')).toBeInTheDocument()
    expect(screen.getByText('Total Qty')).toBeInTheDocument()
    expect(screen.getByText('Est. Total')).toBeInTheDocument()
    // One empty starter line has no description/product yet, so it isn't
    // counted as a "real" line — matches PurchaseOrderForm's own realLines
    // filter (description || product_id). Line Items/Total Qty/Est. Total
    // all read 0, plus the Lines table's own per-row Total column (also 0
    // for that starter line) — 4 "0"s in total.
    expect(screen.getAllByText('0').length).toBe(4)

    fireEvent.change(screen.getByPlaceholderText('Description'), { target: { value: 'Cement bags' } })
    // Line Items and Total Qty both become 1 (qty defaults to 1); Est.
    // Total and the Lines table's row Total both stay 0 (unit_price
    // defaults to 0) — so "1" appears twice and "0" still appears twice.
    expect(screen.getAllByText('1').length).toBe(2)
  })

  it('Summary sidebar reflects the project-vs-stock context line', async () => {
    const RequisitionForm = (await import('../RequisitionForm')).default
    const { container } = wrap(<RequisitionForm />)
    expect(screen.getByText(/not linked to a project/i)).toBeInTheDocument()
    fireEvent.change(getPurposeSelect(container), { target: { value: 'project' } })
    // "for Project" also appears in the Lines section's own hint text, so
    // match on "not selected" — unique to the Summary sidebar's context line.
    expect(screen.getByText(/not selected/i)).toBeInTheDocument()
  })
})
