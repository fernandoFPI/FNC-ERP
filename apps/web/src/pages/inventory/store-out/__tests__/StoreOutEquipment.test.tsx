// Store Out and equipment (playbook #107): the New Store Out dialog asks who it is issued to, lets a line be marked returnable (forced
// for a product flagged Equipment) with a due date and a serial note, and an issued Store Out shows who has the equipment and when it is
// due back. Renders the real page against mocked Apollo hooks.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import {
  ADD_MATERIAL_ISSUE_LINE,
  CREATE_MATERIAL_ISSUE,
  MATERIAL_ISSUES_QUERY,
} from '../../../../graphql/projects'
import { PRODUCTS_QUERY, STOCK_LOCATIONS_QUERY } from '../../../../graphql/inventory'
import { EMPLOYEES_QUERY } from '../../../../graphql/hr'
import StoreOutPage from '../StoreOutPage'

// A value the test needs to exist: throws a readable error instead of a non-null assertion.
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('expected a value')
  return v
}

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
  }
})

vi.mock('../../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))

const PRODUCTS = [
  {
    id: 'p-cons',
    sku: 'CON-001',
    name: 'Welding Rod',
    name_ar: null,
    uom: 'BOX',
    average_cost: '12',
    is_returnable: false,
    default_return_days: null,
  },
  {
    id: 'p-eq',
    sku: 'EQP-001',
    name: 'Welding Machine 400A',
    name_ar: null,
    uom: 'EA',
    average_cost: '450',
    is_returnable: true,
    default_return_days: 7,
  },
]
const EMPLOYEES = [
  {
    id: 'e-1',
    first_name: 'Karim',
    last_name: 'Hassan',
    employee_number: 'E-17',
    department_name: 'Electrical',
  },
]

const ISSUE = {
  id: 'i-1',
  issueNumber: 'SO-00201',
  issueDate: '2026-11-10',
  status: 'issued',
  notes: null,
  poId: null,
  requisitionId: null,
  poNumber: null,
  requisitionNumber: null,
  projectCode: null,
  projectName: null,
  issuedByName: 'Store Keeper',
  issuedToName: 'Ahmed Ali',
  issuedToEmployeeId: null,
  department: 'Maintenance',
  createdAt: '2026-11-10T08:00:00Z',
  lines: [
    {
      id: 'l-1',
      productId: 'p-eq',
      productName: 'Welding Machine 400A',
      productNameAr: null,
      sku: 'EQP-001',
      uom: 'EA',
      poLineId: null,
      fromLocationName: 'Main Warehouse',
      toLocationName: 'Virtual Consumption',
      qtyIssued: 2,
      unitCost: 450,
      totalCost: 900,
      isInvoiced: false,
      isReturnable: true,
      expectedReturnDate: '2026-11-17',
      serialNote: 'WM-4471',
      qtyReturned: 1,
    },
    {
      id: 'l-2',
      productId: 'p-cons',
      productName: 'Welding Rod',
      productNameAr: null,
      sku: 'CON-001',
      uom: 'BOX',
      poLineId: null,
      fromLocationName: 'Main Warehouse',
      toLocationName: 'Virtual Consumption',
      qtyIssued: 3,
      unitCost: 12,
      totalCost: 36,
      isInvoiced: false,
      isReturnable: false,
      expectedReturnDate: null,
      serialNote: null,
      qtyReturned: 0,
    },
  ],
}

// Results are built once and handed back unchanged on every render (a fresh object per call would re-run effects for ever).
const results = new Map<unknown, unknown>()
const createIssue = vi.fn()
const addLine = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  results.clear()
  results.set(MATERIAL_ISSUES_QUERY, {
    data: { materialIssues: [ISSUE] },
    loading: false,
    refetch: vi.fn(),
  })
  results.set(PRODUCTS_QUERY, { data: { products: PRODUCTS }, loading: false })
  results.set(STOCK_LOCATIONS_QUERY, {
    data: {
      stockLocations: [
        { id: 'loc-wh', name: 'Main Warehouse', code: 'WH', type: 'warehouse', is_active: true },
      ],
    },
    loading: false,
  })
  results.set(EMPLOYEES_QUERY, { data: { employees: EMPLOYEES }, loading: false })
  createIssue.mockResolvedValue({ data: { createMaterialIssue: { id: 'i-new' } } })
  addLine.mockResolvedValue({ data: {} })
  mockUseQuery.mockImplementation(
    (doc: unknown) => results.get(doc) ?? { data: undefined, loading: false, refetch: vi.fn() },
  )
  const createResult = [createIssue, { loading: false }]
  const addResult = [addLine, { loading: false }]
  const otherResult = [vi.fn().mockResolvedValue({}), { loading: false }]
  mockUseMutation.mockImplementation((doc: unknown) =>
    doc === CREATE_MATERIAL_ISSUE
      ? createResult
      : doc === ADD_MATERIAL_ISSUE_LINE
        ? addResult
        : otherResult,
  )
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <StoreOutPage />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

// The variables a mocked mutation was first called with.
const sentVars = (fn: { mock: { calls: unknown[][] } }): Record<string, unknown> => {
  const call = must(fn.mock.calls[0]) as [{ variables: Record<string, unknown> }]
  return call[0].variables
}
// The page's Input does not tie its label to the box: take the box in the label's own wrapper.
const boxOf = (label: string, root: HTMLElement = document.body): HTMLInputElement => {
  const box = within(root)
    .getByText(label)
    .closest('div')
    ?.querySelector<HTMLInputElement>('input, textarea')
  if (!box) throw new Error(`no box for ${label}`)
  return box
}
function openDialog(): HTMLElement {
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: '+ New Store Out' }))
  return screen.getByRole('dialog')
}
// The item picker is a searchable list drawn in a portal: click its placeholder, choose on mouse-down.
function chooseItem(name: string, shownNow = 'Search name or SKU…') {
  fireEvent.click(must(screen.getAllByText(shownNow)[0]))
  const matches = screen.getAllByText(name)
  fireEvent.mouseDown(must(matches.at(-1)))
}
const addButton = () => screen.getByRole<HTMLButtonElement>('button', { name: '+ Add' })
const createButton = () => screen.getByRole<HTMLButtonElement>('button', { name: /^Create/ })

describe('New Store Out: equipment lines', () => {
  it('shows the returnable controls once an item is chosen: a consumable can be ticked, equipment is forced on and cannot be unticked', () => {
    const dialog = openDialog()
    expect(screen.queryByTestId('returnable-fields')).toBeNull()

    chooseItem('Welding Rod')
    const fields = screen.getByTestId('returnable-fields')
    const tick = within(fields).getByRole<HTMLInputElement>('checkbox')
    expect(tick.checked).toBe(false)
    expect(within(fields).getByText('Must come back')).toBeTruthy()
    expect(within(dialog).queryByText('Expected return')).toBeNull()
    fireEvent.click(tick)
    expect(within(dialog).getByText('Expected return')).toBeTruthy()
    expect(within(dialog).getByText('Serial / asset no.')).toBeTruthy()

    chooseItem('Welding Machine 400A', 'Welding Rod')
    const eqTick = within(screen.getByTestId('returnable-fields')).getByRole<HTMLInputElement>(
      'checkbox',
    )
    expect(eqTick.checked).toBe(true)
    expect(eqTick.disabled).toBe(true)
    expect(screen.getByText('Equipment always comes back')).toBeTruthy()
  })

  it('lets equipment be added with no cost typed, but a consumable still needs one', () => {
    const dialog = openDialog()
    chooseItem('Welding Rod')
    // choosing the product pre-fills its cost; clear it to see the rule
    fireEvent.change(boxOf('Unit Cost (IQD)', dialog), { target: { value: '' } })
    fireEvent.change(boxOf('Qty', dialog), { target: { value: '2' } })
    expect(addButton().disabled).toBe(true)

    chooseItem('Welding Machine 400A', 'Welding Rod')
    fireEvent.change(boxOf('Unit Cost (IQD)', dialog), { target: { value: '' } })
    expect(addButton().disabled).toBe(false)
  })

  it('will not create a manual Store Out with equipment until it says who has it, then sends the person, the department and the line fields', async () => {
    const dialog = openDialog()
    chooseItem('Welding Machine 400A')
    fireEvent.change(boxOf('Qty', dialog), { target: { value: '2' } })
    fireEvent.change(boxOf('Expected return', dialog), { target: { value: '2026-12-01' } })
    fireEvent.change(boxOf('Serial / asset no.', dialog), { target: { value: ' WM-4471 ' } })
    fireEvent.click(addButton())

    // equipment is in the list, nobody to hand it to yet
    expect(within(dialog).getByText('Returnable')).toBeTruthy()
    expect(createButton().disabled).toBe(true)
    expect(within(dialog).getByText('Enter who the equipment is issued to')).toBeTruthy()

    fireEvent.change(boxOf('Or type a name (contractor)', dialog), {
      target: { value: 'Ahmed Ali' },
    })
    fireEvent.change(boxOf('Department', dialog), { target: { value: 'Civil' } })
    expect(createButton().disabled).toBe(false)
    fireEvent.click(createButton())

    await waitFor(() => {
      expect(addLine).toHaveBeenCalledTimes(1)
    })
    const header = sentVars(createIssue)
    expect(header).toMatchObject({
      issuedToName: 'Ahmed Ali',
      issuedToEmployeeId: null,
      department: 'Civil',
    })
    const line = sentVars(addLine)
    expect(line).toMatchObject({
      issueId: 'i-new',
      productId: 'p-eq',
      qtyIssued: 2,
      isReturnable: true,
      expectedReturnDate: '2026-12-01',
      serialNote: 'WM-4471',
    })
  })

  it('does not ask for a person when only consumables go out, and sends them as ordinary lines', async () => {
    const dialog = openDialog()
    chooseItem('Welding Rod')
    fireEvent.change(boxOf('Qty', dialog), { target: { value: '3' } })
    fireEvent.click(addButton())
    expect(within(dialog).queryByText('Returnable')).toBeNull()
    expect(createButton().disabled).toBe(false)
    fireEvent.click(createButton())
    await waitFor(() => {
      expect(addLine).toHaveBeenCalledTimes(1)
    })
    const line = sentVars(addLine)
    expect(line.isReturnable).toBeUndefined()
    expect(line.expectedReturnDate).toBeUndefined()
    expect(line.serialNote).toBeUndefined()
    expect(sentVars(createIssue)).toMatchObject({
      issuedToName: null,
      department: null,
    })
  })

  it('takes the person from the employee list when one is chosen, and switches the typed-name box off', async () => {
    const dialog = openDialog()
    chooseItem('Welding Machine 400A')
    fireEvent.change(boxOf('Qty', dialog), { target: { value: '1' } })
    fireEvent.click(addButton())
    expect(createButton().disabled).toBe(true)

    // nobody chosen reads "No employee (type a name)"; open the list from it and choose on mouse-down
    fireEvent.click(screen.getByText('No employee (type a name)'))
    fireEvent.mouseDown(screen.getByText('Karim Hassan'))
    expect(boxOf('Or type a name (contractor)', dialog).disabled).toBe(true)
    expect(createButton().disabled).toBe(false)
    fireEvent.click(createButton())

    await waitFor(() => {
      expect(createIssue).toHaveBeenCalledTimes(1)
    })
    expect(sentVars(createIssue)).toMatchObject({
      issuedToEmployeeId: 'e-1',
      issuedToName: null,
    })
  })
})

describe('an issued Store Out', () => {
  it('shows who has it and, for equipment, that it must come back, by when, with its serial and how much is already back', () => {
    renderPage()
    fireEvent.click(screen.getByText('SO-00201'))
    expect(
      screen.getByText('Issued by Store Keeper · Issued to Ahmed Ali · Maintenance'),
    ).toBeTruthy()
    expect(screen.getByText('Returnable')).toBeTruthy()
    expect(screen.getByText('Back by 2026-11-17')).toBeTruthy()
    expect(screen.getByText('WM-4471')).toBeTruthy()
    expect(screen.getByText('1 of 2 back')).toBeTruthy()
    // the consumable line carries no equipment marks
    expect(screen.getAllByText('Returnable')).toHaveLength(1)
  })
})

describe('adding to a draft Store Out', () => {
  it('offers the same returnable fields, forces them for equipment, and sends them with the line', () => {
    results.set(MATERIAL_ISSUES_QUERY, {
      data: {
        materialIssues: [
          { ...ISSUE, id: 'i-draft', issueNumber: 'SO-00300', status: 'draft', lines: [] },
        ],
      },
      loading: false,
      refetch: vi.fn(),
    })
    renderPage()
    fireEvent.click(screen.getByText('SO-00300'))
    expect(screen.queryByTestId('draft-returnable-fields')).toBeNull()

    fireEvent.click(must(screen.getAllByText('Search name or SKU…')[0]))
    fireEvent.mouseDown(must(screen.getAllByText('Welding Machine 400A').at(-1)))
    const fields = screen.getByTestId('draft-returnable-fields')
    const form = must(fields.parentElement)
    const tick = within(fields).getByRole<HTMLInputElement>('checkbox')
    expect(tick.checked).toBe(true)
    expect(tick.disabled).toBe(true)
    fireEvent.change(boxOf('Qty', form), { target: { value: '1' } })
    fireEvent.change(boxOf('Expected return', fields), { target: { value: '2026-12-05' } })
    // equipment needs no cost typed
    fireEvent.change(boxOf('Unit Cost (IQD)', form), { target: { value: '' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(addLine).toHaveBeenCalledTimes(1)
    expect(sentVars(addLine)).toMatchObject({
      issueId: 'i-draft',
      productId: 'p-eq',
      qtyIssued: 1,
      unitCost: 0,
      isReturnable: true,
      expectedReturnDate: '2026-12-05',
    })
  })
})

describe('New Store Out: width', () => {
  it('is a wide dialog, with date, project, PO, issued to, name and department in one row of boxes', () => {
    const dialog = openDialog()
    const panel = must(dialog.closest<HTMLElement>('[data-modal-panel]') ?? dialog)
    expect(panel.style.maxWidth).toBe('1240px')
    const labels = [
      'Issue Date',
      'Project (optional)',
      'Link to PO (optional)',
      'Issued to (employee)',
      'Or type a name (contractor)',
      'Department',
    ].map((l) => within(dialog).getByText(l))
    // the nearest ancestor holding all six is the one grid whose direct children are the six fields
    let ancestor: HTMLElement | null = must(labels[0]).parentElement
    while (ancestor && !labels.every((l) => ancestor?.contains(l))) ancestor = ancestor.parentElement
    expect(must(ancestor).children).toHaveLength(6)
  })
})
