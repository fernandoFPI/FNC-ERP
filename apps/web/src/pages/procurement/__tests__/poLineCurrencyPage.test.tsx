// A line on a purchase order is shown, totalled and edited in the currency it is STORED in.
// NF-PO-2026-0163: line 3 was added after approval (stored IQD, no market or requested currency) on a USD order.
// The table printed it in the order's USD while the Order total counted it as IQD, and the Edit PO form started
// from that USD, so choosing USD compared USD with USD and saved nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { Kind, visit } from 'graphql'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { PO_LIFECYCLE_QUERY } from '../../../graphql/procurement'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})

vi.mock('../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn() }
})

type LineOver = Record<string, unknown>

function line(over: LineOver) {
  return {
    product_id: null,
    product_name: null,
    uom: 'pc',
    qty_received: 0,
    qty_from_stock: 0,
    ...over,
  }
}

// What production holds for NF-PO-2026-0163: two USD lines priced at market pricing, and line 3 added later.
const priced = { currency_code: 'USD', market_price_currency: 'USD', requested_currency_code: null }
const addedLater = {
  currency_code: 'IQD',
  market_price_currency: null,
  requested_currency_code: null,
}

function threeLines() {
  return [
    line({
      id: 'l1',
      description: 'Acoustic tile',
      qty: 75.24,
      unit_price: 6.25,
      initial_unit_price: 6.25,
      total: 470.25,
      actual_unit_price: 6.25,
      ...priced,
    }),
    line({
      id: 'l2',
      description: 'Aluminium ceiling',
      qty: 18,
      unit_price: 12.5,
      initial_unit_price: 12.5,
      total: 225,
      actual_unit_price: 12.5,
      ...priced,
    }),
    line({
      id: 'l3',
      description: 'Corner angle',
      qty: 16,
      unit_price: 1.5,
      initial_unit_price: 1.5,
      total: 24,
      actual_unit_price: 1.5,
      ...addedLater,
    }),
  ]
}

const TOTALS = [
  { currency_code: 'IQD', subtotal: '24', line_count: 1 },
  { currency_code: 'USD', subtotal: '695.25', line_count: 2 },
]

function mockPO(status: string, over: Record<string, unknown> = {}) {
  const po = {
    id: 'po-1',
    po_number: 'NF-PO-2026-0163',
    vendor_name: 'Cash Purchase',
    currency_code: 'USD',
    status,
    subtotal: null,
    tax_amount: '0',
    total_amount: null,
    currencyTotals: TOTALS,
    notes: '',
    expected_delivery_date: '',
    created_at: '2026-11-09T10:00:00.000Z',
    receipts: [],
    approval_log: [],
    edit_requests: [],
    lines: threeLines(),
    ...over,
  }
  // one object for every useQuery: the page reads purchaseOrder, the currency list reads poFxRates
  const result = {
    data: {
      purchaseOrder: po,
      poFxRates: { base_currency: 'IQD', rates: [{ currency_code: 'USD' }] },
    },
    loading: false,
    refetch: vi.fn(),
  }
  mockUseQuery.mockReturnValue(result)
}

async function openPO() {
  const PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
  return render(
    <MemoryRouter initialEntries={['/procurement/purchase-orders/po-1']}>
      <ThemeProvider>
        <PurchaseOrderDetail />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

const linesTable = () => {
  const found = screen
    .getAllByRole('table')
    .find((el) => within(el).queryByRole('columnheader', { name: 'Item' }))
  if (!found) throw new Error('lines table not found')
  return found
}

// the cell of one named column in the row of one named line
const cellOf = (lineName: string, columnName: string) => {
  const headers = within(linesTable()).getAllByRole('columnheader')
  const at = headers.findIndex((h) => h.textContent === columnName)
  if (at < 0) throw new Error(`no ${columnName} column`)
  const row = within(linesTable()).getByText(lineName).closest('tr')
  if (!row) throw new Error(`no row for ${lineName}`)
  return within(row).getAllByRole('cell')[at]
}

const showColumn = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
  fireEvent.click(screen.getByRole('checkbox', { name }))
}

type SubmitArgs = [{ variables: { changes: string } }]
const makeSubmit = () => vi.fn<SubmitArgs, Promise<unknown>>().mockResolvedValue({})
let submitEditRequest: ReturnType<typeof makeSubmit>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  submitEditRequest = makeSubmit()
  mockUseMutation.mockImplementation((doc: { definitions?: { name?: { value?: string } }[] }) => {
    const name = doc.definitions?.[0]?.name?.value
    return [
      name === 'SubmitPOEditRequest' ? submitEditRequest : vi.fn().mockResolvedValue({}),
      { loading: false },
    ]
  })
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('PO Lines table: a line is shown in the currency it is stored in', () => {
  it('shows the line that was added later in IQD, not in the order USD', async () => {
    mockPO('bought')
    await openPO()
    expect(cellOf('Corner angle', 'Total')).toHaveTextContent(/^24 IQD$/)
    expect(cellOf('Corner angle', 'Market Price')).toHaveTextContent(/^1\.5 IQD$/)
  })

  it('leaves the lines priced in USD as USD', async () => {
    mockPO('bought')
    await openPO()
    expect(cellOf('Acoustic tile', 'Total')).toHaveTextContent(/^470\.25 USD$/)
    expect(cellOf('Aluminium ceiling', 'Total')).toHaveTextContent(/^225 USD$/)
  })

  it('agrees with the order total: what the Total cells add up to, per currency', async () => {
    mockPO('bought')
    await openPO()
    const sums = new Map<string, number>()
    for (const name of ['Acoustic tile', 'Aluminium ceiling', 'Corner angle']) {
      const m = /^([\d,.]+) ([A-Z]{3})$/.exec(cellOf(name, 'Total').textContent)
      if (!m) throw new Error(`${name}: Total cell is not "amount CURRENCY"`)
      sums.set(m[2], (sums.get(m[2]) ?? 0) + Number(m[1].replace(/,/g, '')))
    }
    expect(Object.fromEntries(sums)).toEqual(
      Object.fromEntries(TOTALS.map((t) => [t.currency_code, Number(t.subtotal)])),
    )
  })

  it('shows the actual price in the stored currency too', async () => {
    mockPO('bought')
    await openPO()
    showColumn('Actual price')
    expect(cellOf('Corner angle', 'Actual price')).toHaveTextContent(/^1\.5 IQD$/)
    expect(cellOf('Acoustic tile', 'Actual price')).toHaveTextContent(/^6\.25 USD$/)
  })

  it('shows the initial price of the line that was added later in IQD too', async () => {
    mockPO('bought')
    await openPO()
    showColumn('Initial Price')
    expect(cellOf('Corner angle', 'Initial Price')).toHaveTextContent(/^1\.5 IQD$/)
  })

  it('prints the line in IQD as well, not in the order USD', async () => {
    mockPO('bought')
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Print PO' }))
    const frame = document.querySelector('iframe')
    const html = frame?.getAttribute('srcdoc') ?? ''
    const row = html.split('<tr').find((r) => r.includes('Corner angle')) ?? ''
    expect(row).toContain('IQD')
    expect(row).not.toContain('USD')
    const usdRow = html.split('<tr').find((r) => r.includes('Acoustic tile')) ?? ''
    expect(usdRow).toContain('USD')
  })

  it('shows the line total on the buying panel in IQD as well', async () => {
    mockPO('items_bought')
    await openPO()
    // the line's own row in the buying panel (not the Lines table, and not the order summary, which also say 24 IQD)
    const name = screen.getAllByText('Corner angle').find((el) => !linesTable().contains(el))
    if (!name) throw new Error('no buying panel row for Corner angle')
    let row: HTMLElement | null = name
    while (row && !/\b(IQD|USD)\b/.test(row.textContent)) row = row.parentElement
    if (!row) throw new Error('no amount in the buying panel row')
    const text = row.textContent.replace(/\s+/g, ' ')
    expect(text).toMatch(/24(\.00)? IQD/)
    expect(text).not.toMatch(/24(\.00)? USD/)
  })

  it('does not let a stale requested or market currency win over the stored one', async () => {
    // NF-PO-2026-0046 line 1: stored USD, but the creator once picked IQD
    mockPO('completed', {
      lines: [
        line({
          id: 'l1',
          description: 'Stale request',
          qty: 10,
          unit_price: 3,
          total: 30,
          currency_code: 'USD',
          market_price_currency: null,
          requested_currency_code: 'IQD',
        }),
      ],
      currencyTotals: [{ currency_code: 'USD', subtotal: '30', line_count: 1 }],
    })
    await openPO()
    expect(cellOf('Stale request', 'Total')).toHaveTextContent(/^30 USD$/)
  })

  it('still reads market, requested and the order currency when the stored currency was not loaded', async () => {
    mockPO('bought', {
      lines: [
        line({
          id: 'l1',
          description: 'No stored',
          qty: 1,
          unit_price: 5,
          total: 5,
          market_price_currency: 'EUR',
        }),
        line({ id: 'l2', description: 'Nothing at all', qty: 1, unit_price: 7, total: 7 }),
      ],
      currencyTotals: [{ currency_code: 'USD', subtotal: '12', line_count: 2 }],
    })
    await openPO()
    expect(cellOf('No stored', 'Total')).toHaveTextContent(/^5 EUR$/)
    expect(cellOf('Nothing at all', 'Total')).toHaveTextContent(/^7 USD$/)
  })
})

describe('The purchase order query', () => {
  // The tests above mock Apollo, so they cannot tell whether the page really asks for the stored currency.
  it('asks for the stored currency of every line', () => {
    const lineSelections: string[][] = []
    visit(PO_LIFECYCLE_QUERY, {
      Field(node) {
        if (node.name.value !== 'lines') return
        lineSelections.push(
          (node.selectionSet?.selections ?? []).flatMap((s) =>
            s.kind === Kind.FIELD ? [s.name.value] : [],
          ),
        )
      },
    })
    // the lines of the purchase order itself (the receipts have their own `lines`)
    const poLines = lineSelections.find((names) => names.includes('requested_currency_code'))
    expect(poLines).toBeDefined()
    expect(poLines).toContain('currency_code')
  })
})

describe('Edit PO form: the currency starts from what is stored', () => {
  async function startEditing() {
    mockPO('bought')
    await openPO()
    fireEvent.click(screen.getByRole('button', { name: /^Edit requests/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start editing' }))
  }

  // the currency boxes of the form, one per line, in line order
  const currencyBoxes = () =>
    screen
      .getAllByRole<HTMLSelectElement>('combobox')
      .filter((el) => el.value === 'USD' || el.value === 'IQD')

  const submittedChanges = () => {
    expect(submitEditRequest).toHaveBeenCalledTimes(1)
    const [call] = submitEditRequest.mock.calls[0]
    return JSON.parse(call.variables.changes) as {
      lines: { edited: { id: string; field: string; from: unknown; to: unknown }[] }
    }
  }

  it('opens with line 3 on IQD, what it is stored in', async () => {
    await startEditing()
    expect(currencyBoxes().map((el) => el.value)).toEqual(['USD', 'USD', 'IQD'])
  })

  it('sends no currency change for a line nobody touched', async () => {
    await startEditing()
    fireEvent.click(screen.getByRole('button', { name: 'Submit edit request' }))
    expect(submittedChanges().lines.edited).toEqual([])
  })

  it('can change line 3 from IQD to USD, which used to be impossible', async () => {
    await startEditing()
    fireEvent.change(currencyBoxes()[2], { target: { value: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit edit request' }))
    expect(submittedChanges().lines.edited).toEqual([
      { id: 'l3', field: 'currency_code', from: 'IQD', to: 'USD' },
    ])
  })
})
