// The Lines table on a purchase order: which columns show, remembered per person across
// purchase orders and refreshes; a text filter; row spacing; the order total underneath.
// Before this, every column always showed, one long item name set the table's width, and the
// quantity and price columns ended up behind a sideways scrollbar on a laptop.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'

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

const LONG_NAME =
  '110-003-019 UNIVERSAL SLIM WC SEAT MODEL 2 - ROUND FORM (DUROPLAST, SOFT-CLOSING, DETACHABLE METAL HINGE, TOP FIXING)'

function line(over: Record<string, unknown>) {
  return {
    product_id: null,
    product_name: null,
    uom: 'pcs',
    qty_received: 0,
    qty_from_stock: 0,
    market_price_currency: 'USD',
    requested_currency_code: 'USD',
    store_price: 95,
    store_price_currency: 'USD',
    initial_unit_price: 90,
    verified_price: 100,
    verified_price_currency: 'USD',
    actual_unit_price: 105,
    ...over,
  }
}

function mockPO(status: string, over: Record<string, unknown> = {}) {
  const po = {
    id: 'po-1',
    po_number: 'PO-FNC-2026-001',
    vendor_name: 'Acme Supplies',
    currency_code: 'USD',
    status,
    subtotal: '1000',
    tax_amount: '0',
    total_amount: '15600',
    currencyTotals: [{ currency_code: 'USD', subtotal: '15600', line_count: 3 }],
    notes: '',
    created_at: '2026-01-15T10:00:00.000Z',
    receipts: [],
    approval_log: [],
    lines: [
      line({
        id: 'l1',
        description: 'Cement bags',
        qty: 5,
        qty_received: 5,
        unit_price: 100,
        total: 500,
      }),
      line({ id: 'l2', description: 'Steel rebar 12mm', qty: 20, unit_price: 700, total: 14000 }),
      line({ id: 'l3', description: LONG_NAME, qty: 3, unit_price: 366.67, total: 1100 }),
    ],
    ...over,
  }
  mockUseQuery.mockReturnValue({ data: { purchaseOrder: po }, loading: false, refetch: vi.fn() })
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
const header = (name: string) => within(linesTable()).queryByRole('columnheader', { name })
const openColumns = () => {
  fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({}), { loading: false }])
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('PO Lines table: which columns show', () => {
  it('shows the everyday columns and keeps the rarely used prices out of the way', async () => {
    mockPO('goods_received')
    await openPO()
    for (const name of [
      '#',
      'Item',
      'Qty',
      'Received',
      'Market Price',
      'Inventory cost',
      'Total',
      'Notes',
    ])
      expect(header(name), name).toBeInTheDocument()
    for (const name of ['Initial Price', 'Store Price', 'Verified Price', 'Actual price'])
      expect(header(name), name).toBeNull()
  })

  it('shows the store price while prices are being worked out, when it is what you compare with', async () => {
    mockPO('price_verification')
    await openPO()
    expect(header('Store Price')).toBeInTheDocument()
  })

  it('lets a person tick another column, and the values appear', async () => {
    mockPO('goods_received')
    await openPO()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Initial Price' }))
    expect(header('Initial Price')).toBeInTheDocument()
    expect(within(linesTable()).getAllByText('90 USD').length).toBe(3)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Verified Price' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Actual price' }))
    expect(within(linesTable()).getAllByText('100 USD').length).toBeGreaterThan(0)
    expect(within(linesTable()).getAllByText('105 USD').length).toBe(3)
  })

  it('lets a person hide a column, but never the item or the total', async () => {
    mockPO('goods_received')
    await openPO()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Notes' }))
    expect(header('Notes')).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Total' })).toBeDisabled()
    expect(screen.getByText('Item and Total always stay visible')).toBeInTheDocument()
    expect(header('Item')).toBeInTheDocument()
    expect(header('Total')).toBeInTheDocument()
  })

  it('counts what is showing in the button', async () => {
    mockPO('goods_received')
    await openPO()
    expect(screen.getByRole('button', { name: 'Columns · 6 of 10' })).toBeInTheDocument()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Initial Price' }))
    expect(screen.getByRole('button', { name: 'Columns · 7 of 10' })).toBeInTheDocument()
  })
})

describe('PO Lines table: the choice is remembered', () => {
  it('is still there after a refresh, or when the next purchase order is opened', async () => {
    mockPO('goods_received')
    const first = await openPO()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Initial Price' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Notes' }))
    first.unmount()

    mockPO('goods_received', { id: 'po-2', po_number: 'PO-FNC-2026-002' })
    await openPO()
    expect(header('Initial Price')).toBeInTheDocument()
    expect(header('Notes')).toBeNull()
  })

  it('applies a remembered choice at every stage', async () => {
    mockPO('goods_received')
    const first = await openPO()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Initial Price' }))
    first.unmount()

    mockPO('price_verification')
    await openPO()
    expect(header('Initial Price')).toBeInTheDocument()
    expect(header('Store Price')).toBeInTheDocument() // the stage default still applies to the rest
  })

  it('keeps a store price the person switched off even at the stage where it is on by default', async () => {
    mockPO('price_verification')
    const first = await openPO()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Store Price' }))
    expect(header('Store Price')).toBeNull()
    first.unmount()

    mockPO('price_verification')
    await openPO()
    expect(header('Store Price')).toBeNull()
  })

  it('goes back to the defaults on "Reset to default"', async () => {
    mockPO('goods_received')
    const first = await openPO()
    openColumns()
    expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Initial Price' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(header('Initial Price')).toBeNull()
    first.unmount()

    await openPO()
    expect(header('Initial Price')).toBeNull()
  })

  it('remembers the row spacing too', async () => {
    mockPO('goods_received')
    const first = await openPO()
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }))
    const cellOf = () => within(linesTable()).getByText('Cement bags').closest('td')
    expect(cellOf()).toHaveStyle({ padding: '8px 14px' })
    first.unmount()

    await openPO()
    expect(screen.getByRole('button', { name: 'Compact' })).toHaveAttribute('aria-pressed', 'true')
    expect(cellOf()).toHaveStyle({ padding: '8px 14px' })
  })

  it("starts with today's comfortable spacing", async () => {
    mockPO('goods_received')
    await openPO()
    expect(screen.getByRole('button', { name: 'Comfortable' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(linesTable()).getByText('Cement bags').closest('td')).toHaveStyle({
      padding: '12px 14px',
    })
  })
})

describe('PO Lines table: the filter', () => {
  it('narrows the lines and says how many are showing', async () => {
    mockPO('goods_received')
    await openPO()
    fireEvent.change(screen.getByPlaceholderText('Filter lines'), { target: { value: 'steel' } })
    expect(within(linesTable()).getByText('Steel rebar 12mm')).toBeInTheDocument()
    expect(within(linesTable()).queryByText('Cement bags')).toBeNull()
    expect(screen.getByText('Showing 1 of 3')).toBeInTheDocument()
  })

  it("keeps each line's own number while filtered", async () => {
    mockPO('goods_received')
    await openPO()
    fireEvent.change(screen.getByPlaceholderText('Filter lines'), { target: { value: 'steel' } })
    const row = within(linesTable()).getByText('Steel rebar 12mm').closest('tr')
    expect(row).toHaveTextContent(/^2/)
  })

  it('says so when nothing matches, and is not fooled by capitals', async () => {
    mockPO('goods_received')
    await openPO()
    const box = screen.getByPlaceholderText('Filter lines')
    fireEvent.change(box, { target: { value: 'CEMENT' } })
    expect(within(linesTable()).getByText('Cement bags')).toBeInTheDocument()
    fireEvent.change(box, { target: { value: 'zzz' } })
    expect(screen.getByText('No lines match this filter.')).toBeInTheDocument()
  })

  it('starts empty on every purchase order: the filter is not remembered', async () => {
    mockPO('goods_received')
    const first = await openPO()
    fireEvent.change(screen.getByPlaceholderText('Filter lines'), { target: { value: 'steel' } })
    first.unmount()
    await openPO()
    expect(screen.getByPlaceholderText('Filter lines')).toHaveValue('')
    expect(within(linesTable()).getByText('Cement bags')).toBeInTheDocument()
  })

  it('does not call an empty order "no match"', async () => {
    mockPO('draft', { lines: [], currencyTotals: [] })
    await openPO()
    expect(screen.queryByText('No lines match this filter.')).toBeNull()
  })
})

describe('PO Lines table: layout and totals', () => {
  it('lets a long item name wrap, so the numbers beside it stay in view', async () => {
    mockPO('goods_received')
    await openPO()
    expect(within(linesTable()).getByText(LONG_NAME).closest('td')).toHaveStyle({
      whiteSpace: 'normal',
      minWidth: '220px',
    })
    expect(within(linesTable()).getByText('5 pcs').closest('td')).toHaveStyle({
      whiteSpace: 'nowrap',
    })
  })

  it('shows the order total underneath, one line per currency and never added together', async () => {
    mockPO('goods_received', {
      currencyTotals: [
        { currency_code: 'IQD', subtotal: '4125750', line_count: 2 },
        { currency_code: 'USD', subtotal: '15600', line_count: 3 },
      ],
    })
    await openPO()
    const table = within(linesTable())
    expect(table.getByText('Order total')).toBeInTheDocument()
    expect(table.getByText('4,125,750 IQD')).toBeInTheDocument()
    expect(table.getByText('15,600 USD')).toBeInTheDocument()
  })

  it('shows no total row when the viewer is not allowed to see totals', async () => {
    mockPO('goods_received', { currencyTotals: [] })
    await openPO()
    expect(within(linesTable()).queryByText('Order total')).toBeNull()
  })
})

describe('PO Lines table: Arabic', () => {
  it('shows the controls in Arabic without raw keys', async () => {
    await i18n.changeLanguage('ar')
    mockPO('goods_received')
    await openPO()
    expect(screen.getByPlaceholderText('تصفية البنود')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'الأعمدة · 6 من 10' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'مضغوط' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^الأعمدة/ }))
    expect(screen.getByRole('checkbox', { name: 'السعر الموثّق' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(
      /ui\.tableView\.|po\.detail\.(verifiedPriceCol|orderTotal|inventoryCost)/,
    )
  })
})

// A reference column: what the item costs in inventory right now (the product's own Cost), which
// is not the store price somebody typed on the line and never part of a total.
describe('PO Lines table: inventory cost', () => {
  const costLines = () => [
    line({
      id: 'l1',
      description: 'Cement bags',
      qty: 5,
      unit_price: 100,
      total: 500,
      inventory_cost: '12.5',
      inventory_cost_currency: 'USD',
    }),
    line({
      id: 'l2',
      description: 'Steel rebar 12mm',
      qty: 20,
      unit_price: 700,
      total: 14000,
      inventory_cost: '800.0000',
      inventory_cost_currency: null,
    }),
    line({
      id: 'l3',
      description: 'Custom line',
      qty: 3,
      unit_price: 366.67,
      total: 1100,
      inventory_cost: null,
      inventory_cost_currency: null,
    }),
  ]

  it('shows once the order is past draft, with the product cost and its currency', async () => {
    mockPO('inventory_check', { lines: costLines() })
    await openPO()
    expect(header('Inventory cost')).toBeInTheDocument()
    expect(within(linesTable()).getByText('12.5 USD')).toBeInTheDocument()
  })

  it('is not the store price: both figures show side by side when the store price is on', async () => {
    mockPO('price_verification', { lines: costLines() })
    await openPO()
    const table = within(linesTable())
    expect(header('Store Price')).toBeInTheDocument()
    expect(table.getAllByText('95 USD').length).toBe(3) // what the store keeper typed
    expect(table.getByText('12.5 USD')).toBeInTheDocument() // what inventory holds
  })

  it('is off while the order is still a draft, and can be switched on', async () => {
    mockPO('draft', { lines: costLines() })
    await openPO()
    expect(header('Inventory cost')).toBeNull()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inventory cost' }))
    expect(header('Inventory cost')).toBeInTheDocument()
    expect(within(linesTable()).getByText('12.5 USD')).toBeInTheDocument()
  })

  it('shows an old cost that has no currency, saying so rather than guessing one', async () => {
    mockPO('inventory_check', { lines: costLines() })
    await openPO()
    const cell = within(linesTable()).getByText('800').closest('td')
    expect(cell).toHaveTextContent('currency not set')
    // only that one cost is missing its currency
    expect(within(linesTable()).getAllByText('currency not set').length).toBe(1)
  })

  // the cell of one named column in the row of one named line
  const cellOf = (lineName: string, columnName: string) => {
    const headers = within(linesTable()).getAllByRole('columnheader')
    const at = headers.findIndex((h) => h.textContent === columnName)
    const row = within(linesTable()).getByText(lineName).closest('tr') as HTMLElement
    return within(row).getAllByRole('cell')[at]
  }

  it('shows a dash, not 0, for an item with no recorded cost', async () => {
    mockPO('inventory_check', { lines: costLines() })
    await openPO()
    expect(cellOf('Custom line', 'Inventory cost')).toHaveTextContent(/^—$/)
  })

  it('never changes what a line or the order costs', async () => {
    mockPO('inventory_check', { lines: costLines() })
    await openPO()
    // 5 x 12.5 would be 62.5; the line is still priced from its own price
    expect(cellOf('Cement bags', 'Total')).toHaveTextContent(/^500 USD$/)
    expect(within(linesTable()).getByText('15,600 USD')).toBeInTheDocument()
  })

  it('can be hidden, and stays hidden on the next purchase order', async () => {
    mockPO('inventory_check', { lines: costLines() })
    const first = await openPO()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inventory cost' }))
    expect(header('Inventory cost')).toBeNull()
    first.unmount()

    mockPO('goods_received', { id: 'po-2', lines: costLines() })
    await openPO()
    expect(header('Inventory cost')).toBeNull()
  })

  it('reads in Arabic', async () => {
    await i18n.changeLanguage('ar')
    mockPO('inventory_check', { lines: costLines() })
    await openPO()
    // the table finder above looks for the English "Item" heading
    const table = screen
      .getAllByRole('table')
      .find((el) => within(el).queryByRole('columnheader', { name: 'تكلفة المخزون' }))
    if (!table) throw new Error('lines table not found')
    expect(within(table).getByText('العملة غير محددة')).toBeInTheDocument()
  })
})

describe('PO Lines table: not clipped, and not squeezed by the Next Step panel', () => {
  // the nearest ancestor that carries a flex setting is the page column
  const columnFlexOf = (el: HTMLElement) => {
    let node: HTMLElement | null = el
    while (node && !node.style.flex) node = node.parentElement
    if (!node) throw new Error('no column found')
    return node.style.flex
  }
  const grow = (flex: string) => parseFloat(flex.split(' ')[0] ?? '0')

  it('draws the columns menu outside the lines card, so a one-line order does not cut it off', async () => {
    mockPO('goods_received', {
      lines: [line({ id: 'l1', description: 'Cement bags', qty: 5, unit_price: 100, total: 500 })],
    })
    await openPO()
    openColumns()
    const menu = screen.getByRole('group', { name: 'Show columns' })
    expect(menu.parentElement).toBe(document.body)
    expect(screen.getByRole('checkbox', { name: 'Notes' })).toBeInTheDocument()
  })

  it('gives the lines about ten times as much of the spare width as the Next Step panel', async () => {
    mockPO('goods_received')
    await openPO()
    const left = columnFlexOf(screen.getAllByText('Next Step')[0])
    const right = columnFlexOf(linesTable())
    expect(left).not.toBe(right)
    expect(grow(left)).toBeGreaterThan(0)
    expect(grow(right) / grow(left)).toBeGreaterThanOrEqual(8)
    expect(grow(right) / grow(left)).toBeLessThanOrEqual(12)
    // both still start from the same width, so they stack at the same window size as before
    expect(left.endsWith('460px')).toBe(true)
    expect(right.endsWith('460px')).toBe(true)
  })
})
