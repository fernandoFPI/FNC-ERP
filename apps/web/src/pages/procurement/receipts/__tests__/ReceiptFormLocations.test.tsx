// Regression (playbook #105): the Record Receipt form listed EVERY active stock location, including the two
// virtual system ones. A receipt booked into "Virtual Consumption" moves the goods straight to the used-up
// sink, so they never became stock and the project they were bought for was never charged (13 receipts on
// production, NY-PRJ-2026-0032: USD 3,330.65 + IQD 79,950). The form must not offer them; the server refuses
// them as well (services/gateway tests/receipt-location-virtual.test.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { PURCHASE_ORDER_QUERY } from '../../../../graphql/procurement'
import { STOCK_LOCATIONS_QUERY } from '../../../../graphql/inventory'
import type * as ApolloClientModule from '@apollo/client'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
const addToast = vi.fn<[{ type: string; message: string }], undefined>()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
  }
})

vi.mock('../../../../store/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}))

vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (
    selector: (s: { user: { id: string; companyId: string; role: string } }) => unknown,
  ) => selector({ user: { id: 'user-1', companyId: 'company-1', role: 'user' } }),
}))

// A stock purchase: it goes to inventory, so the form asks where the goods are put.
const stockPO = {
  id: 'po-1',
  po_number: 'NF-PO-2026-0001',
  vendor_name: 'PHILIPS',
  status: 'bought',
  purpose: 'stock',
  delivery_destination: null,
  created_at: '2026-09-23T07:04:14Z',
  assigned_receiver_name: null,
  lines: [
    {
      id: 'line-1',
      description: 'Indoor Wi-Fi camera',
      sku: null,
      qty: '2',
      qty_received: '0',
      qty_from_stock: '0',
      unit_price: '70000',
    },
  ],
}

const location = (id: string, name: string, type: string, code: string | null = null) => ({
  id,
  name,
  type,
  code,
  is_active: true,
})

const everyLocation = [
  location('loc-virtual-in', 'Virtual Receipts', 'virtual_in'),
  location('loc-main', 'Main Warehouse', 'warehouse', 'WH'),
  location('loc-virtual-out', 'Virtual Consumption', 'virtual_out'),
  location('loc-site', 'Site Store', 'site'),
]

function mockData(stockLocations: unknown[]) {
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === PURCHASE_ORDER_QUERY) return { data: { purchaseOrder: stockPO }, loading: false }
    if (doc === STOCK_LOCATIONS_QUERY) return { data: { stockLocations }, loading: false }
    return { data: undefined, loading: false }
  })
}

async function renderForm() {
  const ReceiptForm = (await import('../ReceiptForm')).default
  return render(
    <MemoryRouter initialEntries={['/procurement/purchase-orders/po-1/receive']}>
      <ThemeProvider>
        <Routes>
          <Route path="/procurement/purchase-orders/:id/receive" element={<ReceiptForm />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

// The receiving-location box is the select whose first choice is "Select location…".
function locationSelect(): HTMLSelectElement {
  // the first one on the page (a temporary store adds a second box, the final destination, with the same placeholder)
  const placeholder = screen.getAllByText('Select location…')[0]
  const select = placeholder.closest('select')
  if (!select) throw new Error('the "Select location…" choice is not inside a select')
  return select
}

function choices(select: HTMLSelectElement): string[] {
  return Array.from(select.options).map((o) => o.textContent.trim())
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMutation.mockImplementation(() => [
    vi.fn().mockResolvedValue({ data: {} }),
    { loading: false },
  ])
})

describe('ReceiptForm: where the goods can be received', () => {
  it('does not offer Virtual Receipts or Virtual Consumption', async () => {
    mockData(everyLocation)
    await renderForm()
    const shown = choices(locationSelect())
    expect(shown.join(' | ')).not.toMatch(/virtual/i)
  })

  it('still offers every real location, in the order the server returned them', async () => {
    mockData(everyLocation)
    await renderForm()
    expect(choices(locationSelect())).toEqual([
      'Select location…',
      'Main Warehouse (WH)',
      'Site Store',
    ])
  })

  it('has only the empty choice when a company has nothing but its virtual locations', async () => {
    mockData([
      location('loc-virtual-in', 'Virtual Receipts', 'virtual_in'),
      location('loc-virtual-out', 'Virtual Consumption', 'virtual_out'),
    ])
    await renderForm()
    expect(choices(locationSelect())).toEqual(['Select location…'])
  })

  it('does not hide a real location whose name merely says "virtual"', async () => {
    // The rule is the location TYPE, never its name: a warehouse a person called "Virtual stock" is a real place.
    mockData([
      location('loc-odd', 'Virtual stock room', 'warehouse'),
      location('loc-virtual-out', 'Virtual Consumption', 'virtual_out'),
    ])
    await renderForm()
    expect(choices(locationSelect())).toEqual(['Select location…', 'Virtual stock room'])
  })

  it('lets a real location be picked, and it is the value the box then holds', async () => {
    mockData(everyLocation)
    await renderForm()
    const select = locationSelect()
    fireEvent.change(select, { target: { value: 'loc-site' } })
    expect(select.value).toBe('loc-site')
  })

  it('has no way to pick a virtual location, even by value', async () => {
    mockData(everyLocation)
    await renderForm()
    const select = locationSelect()
    fireEvent.change(select, { target: { value: 'loc-virtual-out' } })
    // an option that is not in the list cannot be selected: the box falls back to the empty choice
    expect(select.value).toBe('')
  })
})

describe('ReceiptForm: a temporary store needs a final destination (playbook #108)', () => {
  const withTemporary = [
    ...everyLocation,
    location('loc-temp', 'Erbil Temporary Store', 'temporary'),
    location('loc-temp2', 'Basrah Temporary Store', 'temporary'),
    location('loc-transit', 'Transit', 'transit'),
  ]

  it('offers a temporary store (tagged) but never the transit location', async () => {
    mockData(withTemporary)
    await renderForm()
    const list = choices(locationSelect())
    expect(list).toContain('Erbil Temporary Store · Temporary')
    expect(list).not.toContain('Transit')
  })

  it('asks where the goods are going once a temporary store is chosen, offering warehouses and sites only, and not before', async () => {
    mockData(withTemporary)
    await renderForm()
    expect(screen.queryByText('Final destination')).toBeNull()
    fireEvent.change(locationSelect(), { target: { value: 'loc-main' } })
    expect(screen.queryByText('Final destination')).toBeNull()
    fireEvent.change(locationSelect(), { target: { value: 'loc-temp' } })
    const destination = screen.getByText('Final destination').closest('div')?.querySelector('select')
    if (!destination) throw new Error('no destination select')
    const offered = choices(destination)
    expect(offered).toContain('Main Warehouse (WH)')
    expect(offered).toContain('Site Store')
    expect(offered).not.toContain('Erbil Temporary Store')
    expect(offered).not.toContain('Basrah Temporary Store')
    expect(offered).not.toContain('Virtual Consumption')
  })

  it('forgets the destination again when the receiving location changes', async () => {
    mockData(withTemporary)
    await renderForm()
    fireEvent.change(locationSelect(), { target: { value: 'loc-temp' } })
    const select = () => screen.getByText('Final destination').closest('div')?.querySelector('select')
    const first = select()
    if (!first) throw new Error('no destination select')
    fireEvent.change(first, { target: { value: 'loc-site' } })
    expect(first.value).toBe('loc-site')
    fireEvent.change(locationSelect(), { target: { value: 'loc-main' } })
    fireEvent.change(locationSelect(), { target: { value: 'loc-temp' } })
    expect(select()?.value).toBe('')
  })
})
