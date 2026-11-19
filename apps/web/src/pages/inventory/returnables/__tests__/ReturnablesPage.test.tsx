// Returnables: equipment handed out through a Store Out that must come back (playbook #107).
// Renders the real page against mocked Apollo hooks. What matters here: the list and its summary, what each row says about who may
// take it back (decided by the server, never re-derived on the page), the receive-back dialog and the payload it sends.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import {
  CREATE_EQUIPMENT_RETURN,
  RETURNABLE_ITEMS_QUERY,
  RETURNABLE_ITEMS_SUMMARY_QUERY,
  STOCK_LOCATIONS_QUERY,
} from '../../../../graphql/inventory'
import ReturnablesPage from '../ReturnablesPage'

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

const toasts: { type: string; message: string }[] = []
vi.mock('../../../../store/toastStore', () => ({
  useToastStore: () => (t: { type: string; message: string }) => {
    toasts.push(t)
  },
}))

function item(over: Record<string, unknown> = {}) {
  return {
    issueLineId: 'il-1',
    issueId: 'i-1',
    issueNumber: 'SO-00101',
    issueDate: '2026-11-10',
    productId: 'p-1',
    productName: 'Welding Machine 400A',
    productNameAr: null,
    sku: 'EQP-001',
    uom: 'EA',
    isEquipment: true,
    qtyIssued: 2,
    qtyReturned: 0,
    qtyLost: 0,
    qtyOutstanding: 2,
    expectedReturnDate: '2026-11-17',
    daysOverdue: null,
    status: 'out',
    serialNote: 'WM-4471',
    issuedToName: 'Ahmed Ali',
    department: 'Maintenance',
    projectCode: null,
    projectName: null,
    storeName: 'Main Warehouse',
    fromLocationId: 'loc-wh',
    isLoan: false,
    ownerCompanyName: 'Nishtimani Factory',
    borrowerCompanyName: 'Nishtimani Factory',
    lastReturnDate: null,
    canReceiveBack: true,
    ...over,
  }
}

const ITEMS = [
  item(),
  item({
    issueLineId: 'il-2',
    issueNumber: 'SO-00102',
    productName: 'Rotary Hammer Drill',
    sku: 'EQP-002',
    serialNote: null,
    issuedToName: 'Karim Hassan',
    department: 'Electrical',
    projectCode: 'PRJ-7',
    status: 'overdue',
    daysOverdue: 3,
    expectedReturnDate: '2026-11-05',
    qtyIssued: 3,
    qtyOutstanding: 3,
  }),
  item({
    issueLineId: 'il-3',
    issueNumber: 'SO-00103',
    productName: 'Aluminium Ladder 3m',
    sku: 'EQP-005',
    serialNote: null,
    issuedToName: 'Omar Jasim',
    isLoan: true,
    canReceiveBack: false,
    ownerCompanyName: 'Nishtimani Factory',
    borrowerCompanyName: 'Nishtimani Yakam',
  }),
  item({
    issueLineId: 'il-4',
    issueNumber: 'SO-00104',
    productName: 'Digital Multimeter',
    sku: 'EQP-004',
    serialNote: null,
    status: 'returned',
    qtyIssued: 2,
    qtyReturned: 1,
    qtyLost: 1,
    qtyOutstanding: 0,
    lastReturnDate: '2026-11-12',
  }),
  item({
    issueLineId: 'il-5',
    issueNumber: 'SO-00105',
    productName: 'Portable Generator 5kVA',
    sku: 'EQP-003',
    serialNote: null,
    isLoan: true,
    canReceiveBack: true,
    borrowerCompanyName: 'Nishtimani Yakam',
    fromLocationId: 'loc-virtual',
  }),
]

const SUMMARY = { openLines: 4, overdueLines: 1, dueSoonLines: 2, unitsOut: 9 }
const LOCATIONS = [
  { id: 'loc-wh', name: 'Main Warehouse', code: 'WH', type: 'warehouse', is_active: true },
  { id: 'loc-site', name: 'Site Store', code: 'SITE', type: 'site', is_active: true },
  {
    id: 'loc-virtual',
    name: 'Virtual Consumption',
    code: null,
    type: 'virtual_out',
    is_active: true,
  },
]

// Results are built ONCE and the same object is handed back every render: a fresh object per call would re-run effects forever.
let listResult: {
  data?: unknown
  loading: boolean
  error?: Error
  refetch: ReturnType<typeof vi.fn>
}
const summaryResult = {
  data: { returnableItemsSummary: SUMMARY },
  loading: false,
  refetch: vi.fn(),
}
const locationsResult = { data: { stockLocations: LOCATIONS }, loading: false }
const createReturn = vi.fn()
let mutationOptions: { onCompleted?: (r: unknown) => void } = {}

beforeEach(() => {
  vi.clearAllMocks()
  toasts.length = 0
  listResult = { data: { returnableItems: ITEMS }, loading: false, refetch: vi.fn() }
  createReturn.mockResolvedValue({})
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === RETURNABLE_ITEMS_QUERY) return listResult
    if (doc === RETURNABLE_ITEMS_SUMMARY_QUERY) return summaryResult
    if (doc === STOCK_LOCATIONS_QUERY) return locationsResult
    return { data: undefined, loading: false }
  })
  const mutationResult = [createReturn, { loading: false }]
  mockUseMutation.mockImplementation((doc: unknown, opts: typeof mutationOptions) => {
    if (doc === CREATE_EQUIPMENT_RETURN) mutationOptions = opts
    return mutationResult
  })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ReturnablesPage />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

// The page's Input does not tie its label to the box (getByLabelText cannot find it): take the box in the label's own wrapper.
const boxOf = (root: HTMLElement, label: string): HTMLInputElement => {
  const box = within(root)
    .getByText(label)
    .closest('div')
    ?.querySelector<HTMLInputElement>('input, textarea')
  if (!box) throw new Error(`no box for ${label}`)
  return box
}
// The one line the dialog sent to the return mutation.
const sentLine = (): Record<string, unknown> => {
  const call = must(createReturn.mock.calls[0]) as unknown as [
    { variables: { input: { lines: Record<string, unknown>[] } } },
  ]
  return must(call[0].variables.input.lines[0])
}
const rowOf = (text: string): HTMLElement => {
  const el = screen.getByText(text).closest('tr') ?? screen.getByText(text).closest('[data-row]')
  if (!el) throw new Error(`no row around ${text}`)
  return el as HTMLElement
}
const lastListVariables = () => {
  const calls = (mockUseQuery.mock.calls as unknown[][]).filter(
    (c) => c[0] === RETURNABLE_ITEMS_QUERY,
  ) as unknown as [unknown, { variables: Record<string, unknown> }][]
  return must(calls.at(-1))[1].variables
}

describe('ReturnablesPage: list and summary', () => {
  it('shows the four numbers from the summary query', () => {
    renderPage()
    expect(screen.getAllByText('Still out').length).toBeGreaterThan(0)
    for (const n of ['4', '1', '2', '9']) expect(screen.getAllByText(n).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0)
    expect(screen.getByText('Due in 2 days')).toBeTruthy()
    expect(screen.getByText('Units out')).toBeTruthy()
  })

  it('draws each row with who has it, the due date, the serial, and a status that says how late it is', () => {
    renderPage()
    expect(screen.getByText('Welding Machine 400A')).toBeTruthy()
    expect(screen.getByText(/EQP-001 · WM-4471/)).toBeTruthy()
    const first = within(rowOf('SO-00101'))
    expect(first.getByText('Ahmed Ali')).toBeTruthy()
    expect(first.getByText('Maintenance')).toBeTruthy()
    expect(first.getByText('To be returned')).toBeTruthy()
    expect(within(rowOf('SO-00102')).getByText('Overdue 3 d')).toBeTruthy()
    expect(within(rowOf('SO-00104')).getByText('Returned')).toBeTruthy()
    expect(screen.getAllByText('To be returned')).toHaveLength(3)
    expect(screen.getByText(/Electrical · PRJ-7/)).toBeTruthy()
    // a returned row shows what was lost and has no action
    expect(screen.getByText('1 lost')).toBeTruthy()
  })

  it('offers Receive back only where the server said this company may take it back, and names the lender otherwise', () => {
    renderPage()
    const buttons = screen.getAllByRole('button', { name: 'Receive back' })
    // il-1, il-2 and il-5 can be taken back; il-3 belongs to the lender; il-4 is done
    expect(buttons).toHaveLength(3)
    expect(screen.getByText('Only Nishtimani Factory can take this back.')).toBeTruthy()
    // a loan is labelled from each side
    expect(screen.getByText('From Nishtimani Factory')).toBeTruthy()
    expect(screen.getByText('Lent to Nishtimani Yakam')).toBeTruthy()
  })

  it('asks the server for the filter and the search the person chose', () => {
    renderPage()
    expect(lastListVariables()).toEqual({ status: 'open', search: undefined })
    fireEvent.change(must(document.querySelector('select')), { target: { value: 'overdue' } })
    expect(lastListVariables().status).toBe('overdue')
    fireEvent.change(screen.getByPlaceholderText('Search person, item, voucher…'), {
      target: { value: '  zanyar ' },
    })
    expect(lastListVariables()).toEqual({ status: 'overdue', search: 'zanyar' })
  })

  it('filters from a tile, names the filter in a chip, and clears it again', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull()
    fireEvent.click(screen.getByText('Past their return date'))
    expect(lastListVariables().status).toBe('overdue')
    expect(screen.getByRole('button', { name: /clear all/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))
    expect(lastListVariables().status).toBe('open')
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull()
  })

  it('says so when nothing is out, and shows the error when the list cannot load', () => {
    listResult = { data: { returnableItems: [] }, loading: false, refetch: vi.fn() }
    const { unmount } = renderPage()
    expect(screen.getByText('Nothing is out')).toBeTruthy()
    unmount()
    listResult = { data: undefined, loading: false, error: new Error('boom'), refetch: vi.fn() }
    renderPage()
    expect(screen.getByText('Could not load the list')).toBeTruthy()
    expect(screen.getByText('boom')).toBeTruthy()
  })
})

describe('ReturnablesPage: receiving equipment back', () => {
  const open = (voucher: string) => {
    renderPage()
    fireEvent.click(within(rowOf(voucher)).getByRole('button', { name: 'Receive back' }))
    return screen.getByRole('dialog')
  }

  it('opens with the whole outstanding quantity, Good, and the shelf it came from, and sends exactly that', () => {
    const dialog = open('SO-00101')
    expect(within(dialog).getByText('Receive back: Welding Machine 400A')).toBeTruthy()
    expect(within(dialog).getByText(/Ahmed Ali · SO-00101 · 2 still out/)).toBeTruthy()
    expect(within(dialog).getByLabelText<HTMLInputElement>('Quantity').value).toBe('2')
    fireEvent.change(boxOf(dialog, 'Received by'), { target: { value: ' Store keeper ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm return' }))
    expect(createReturn).toHaveBeenCalledTimes(1)
    expect(createReturn).toHaveBeenCalledWith({
      variables: {
        input: {
          receivedByName: 'Store keeper',
          lines: [
            {
              issueLineId: 'il-1',
              qtyReturned: 2,
              condition: 'good',
              toLocationId: 'loc-wh',
              remarks: undefined,
            },
          ],
        },
      },
    })
  })

  it('refuses a quantity above what is out and keeps Confirm off', () => {
    const dialog = open('SO-00101')
    fireEvent.change(within(dialog).getByLabelText<HTMLInputElement>('Quantity'), { target: { value: '3' } })
    expect(within(dialog).getByText('Enter a quantity up to 2')).toBeTruthy()
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Confirm return' }).disabled,
    ).toBe(true)
    fireEvent.change(within(dialog).getByLabelText<HTMLInputElement>('Quantity'), { target: { value: '1' } })
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Confirm return' }).disabled,
    ).toBe(false)
  })

  it('does not offer a virtual location, and asks for a place when the shelf it came from is not one', () => {
    // il-5 left a virtual location (as a loan's stock does): it must not be preselected, and the list must not contain it
    const dialog = open('SO-00105')
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Confirm return' }).disabled,
    ).toBe(true)
    fireEvent.click(within(dialog).getByText('Select a location'))
    expect(screen.queryByText('Virtual Consumption')).toBeNull()
    expect(screen.getAllByText('Site Store (SITE)').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Main Warehouse (WH)').length).toBeGreaterThan(0)
    fireEvent.mouseDown(must(screen.getAllByText('Site Store (SITE)').at(-1)))
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Confirm return' }).disabled,
    ).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm return' }))
    expect(sentLine()).toMatchObject({
      issueLineId: 'il-5',
      toLocationId: 'loc-site',
    })
  })

  it('records a lost quantity with no location and a reason, and says what a loss does', () => {
    const dialog = open('SO-00101')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lost' }))
    expect(within(dialog).queryByText('Goes back into')).toBeNull()
    expect(within(dialog).getByText(/does not come back/)).toBeTruthy()
    const confirm = within(dialog).getByRole<HTMLButtonElement>('button', {
      name: 'Confirm return',
    })
    expect(confirm.disabled).toBe(true) // no reason yet
    fireEvent.change(boxOf(dialog, 'What happened (required)'), {
      target: { value: 'Fell off the scaffold' },
    })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(sentLine()).toEqual({
      issueLineId: 'il-1',
      qtyReturned: 2,
      condition: 'lost',
      toLocationId: undefined,
      remarks: 'Fell off the scaffold',
    })
  })

  it('tells a lender that a lost loan charges nobody', () => {
    const dialog = open('SO-00105')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lost' }))
    expect(within(dialog).getByText(/Nothing is charged to the borrower's project/)).toBeTruthy()
  })

  it('toasts the return number and refreshes both the list and the summary when it is saved', () => {
    open('SO-00101')
    mutationOptions.onCompleted?.({ createEquipmentReturn: { returnNumber: 'ERET-00007' } })
    expect(toasts.at(-1)).toEqual({ type: 'success', message: 'Returned: ERET-00007' })
    expect(listResult.refetch).toHaveBeenCalled()
    expect(summaryResult.refetch).toHaveBeenCalled()
  })
})
