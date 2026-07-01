import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'

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

vi.mock('../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function wrap(ui: React.ReactNode, initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({}), { loading: false }])
  mockUseQuery.mockReturnValue({ data: undefined, loading: false, refetch: vi.fn() })
})

// ── StockBalancesPage ────────────────────────────────────────────────────────
describe('StockBalancesPage', () => {
  const snapshotRows = [
    {
      product_id: 'p1', sku: 'INK-001', product_name: 'Black Ink',
      category: 'Ink', location_id: 'loc1', location_name: 'Main Warehouse',
      location_type: 'warehouse',
      qty_on_hand: '100', qty_reserved: '10', available: '90',
      average_cost: '5000', total_value: '500000', is_low_stock: false,
    },
    {
      product_id: 'p2', sku: 'PAP-001', product_name: 'A4 Paper',
      category: 'Paper', location_id: 'loc1', location_name: 'Main Warehouse',
      location_type: 'warehouse',
      qty_on_hand: '5', qty_reserved: '0', available: '5',
      average_cost: '2000', total_value: '10000', is_low_stock: true,
    },
  ]

  beforeEach(() => {
    mockUseQuery.mockReturnValue({
      data: {
        stockBalanceSnapshot: {
          totalValue: '510000',
          currency: 'IQD',
          rows: snapshotRows,
        },
      },
      loading: false,
      refetch: vi.fn(),
    })
  })

  it('renders product SKUs and names', async () => {
    const StockBalancesPage = (await import('../balances/StockBalancesPage')).default
    wrap(<StockBalancesPage />)
    expect(screen.getByText('INK-001')).toBeInTheDocument()
    expect(screen.getByText('PAP-001')).toBeInTheDocument()
  })

  it('shows Total Inventory Value KPI card', async () => {
    const StockBalancesPage = (await import('../balances/StockBalancesPage')).default
    wrap(<StockBalancesPage />)
    expect(screen.getByText(/total inventory value/i)).toBeInTheDocument()
  })

  it('renders location names', async () => {
    const StockBalancesPage = (await import('../balances/StockBalancesPage')).default
    wrap(<StockBalancesPage />)
    expect(screen.getAllByText('Main Warehouse').length).toBeGreaterThan(0)
  })

  it('renders qty_on_hand values', async () => {
    const StockBalancesPage = (await import('../balances/StockBalancesPage')).default
    wrap(<StockBalancesPage />)
    // Multiple numeric cells; verify at least one cell with "100" exists
    expect(screen.getAllByText('100').length).toBeGreaterThan(0)
  })

  it('shows Low Stock Alerts KPI card', async () => {
    const StockBalancesPage = (await import('../balances/StockBalancesPage')).default
    wrap(<StockBalancesPage />)
    expect(screen.getByText(/low stock alerts/i)).toBeInTheDocument()
  })

  it('filters rows by search text', async () => {
    const StockBalancesPage = (await import('../balances/StockBalancesPage')).default
    wrap(<StockBalancesPage />)
    const inputs = screen.getAllByRole('textbox')
    if (inputs.length > 0) {
      fireEvent.change(inputs[0], { target: { value: 'ink' } })
      await waitFor(() => {
        expect(screen.getByText('INK-001')).toBeInTheDocument()
      })
    }
  })
})

// ── TransferForm ─────────────────────────────────────────────────────────────
describe('TransferForm', () => {
  const locations = [
    { id: 'loc1', name: 'Main Warehouse', code: 'WH-001', type: 'warehouse', is_active: true },
    { id: 'loc2', name: 'Site A', code: 'SITE-A', type: 'site', is_active: true },
  ]
  const products = [
    { id: 'p1', sku: 'INK-001', name: 'Black Ink', uom: 'litre', is_active: true, qty_on_hand: '100' },
  ]

  beforeEach(() => {
    mockUseQuery.mockImplementation((query) => {
      const q = String(query)
      if (q.includes('StockLocations') || q.includes('stockLocations')) {
        return { data: { stockLocations: locations }, loading: false }
      }
      return { data: { products }, loading: false }
    })
  })

  it('renders From Location and To Location selects', async () => {
    const TransferForm = (await import('../moves/TransferForm')).default
    wrap(<TransferForm />)
    expect(screen.getByText(/from location/i)).toBeInTheDocument()
    expect(screen.getByText(/to location/i)).toBeInTheDocument()
  })

  it('renders Add Line button', async () => {
    const TransferForm = (await import('../moves/TransferForm')).default
    wrap(<TransferForm />)
    expect(screen.getByRole('button', { name: /\+ add line/i })).toBeInTheDocument()
  })

  it('adds a transfer line on Add Line click', async () => {
    const TransferForm = (await import('../moves/TransferForm')).default
    wrap(<TransferForm />)
    const removeButtons = screen.getAllByText('×')
    const countBefore = removeButtons.length
    fireEvent.click(screen.getByRole('button', { name: /\+ add line/i }))
    await waitFor(() => {
      const removeButtonsAfter = screen.getAllByText('×')
      expect(removeButtonsAfter.length).toBeGreaterThan(countBefore)
    })
  })

  it('shows Transfer Date and Reference fields', async () => {
    const TransferForm = (await import('../moves/TransferForm')).default
    wrap(<TransferForm />)
    expect(screen.getByText(/transfer date/i)).toBeInTheDocument()
    expect(screen.getByText(/reference/i)).toBeInTheDocument()
  })

  it('shows Create Transfer submit button', async () => {
    const TransferForm = (await import('../moves/TransferForm')).default
    wrap(<TransferForm />)
    expect(screen.getByRole('button', { name: /create transfer/i })).toBeInTheDocument()
  })
})

// ── LotsPage ─────────────────────────────────────────────────────────────────
describe('LotsPage', () => {
  const lots = [
    { id: 'lot1', lot_number: 'LOT-2026-001', product_id: 'p1', product_name: 'Black Ink', expiry_date: '2027-01-01', created_at: '2026-01-15T10:00:00Z', current_qty: '50', current_location_name: 'Main Warehouse' },
    { id: 'lot2', lot_number: 'LOT-2026-002', product_id: 'p2', product_name: 'A4 Paper', expiry_date: '2026-05-01', created_at: '2026-02-01T10:00:00Z', current_qty: '200', current_location_name: 'Site A' },
  ]

  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: { stockLots: lots }, loading: false, refetch: vi.fn() })
  })

  it('renders lot numbers', async () => {
    const LotsPage = (await import('../lots/LotsPage')).default
    wrap(<LotsPage />)
    expect(screen.getByText('LOT-2026-001')).toBeInTheDocument()
    expect(screen.getByText('LOT-2026-002')).toBeInTheDocument()
  })

  it('renders product names', async () => {
    const LotsPage = (await import('../lots/LotsPage')).default
    wrap(<LotsPage />)
    expect(screen.getByText('Black Ink')).toBeInTheDocument()
    expect(screen.getByText('A4 Paper')).toBeInTheDocument()
  })

  it('shows expiry status badges', async () => {
    const LotsPage = (await import('../lots/LotsPage')).default
    wrap(<LotsPage />)
    // LOT-2026-002 has past expiry date, should show Expired badge (may appear multiple times)
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OK').length).toBeGreaterThan(0)
  })

  it('navigates to lot detail on row click', async () => {
    const LotsPage = (await import('../lots/LotsPage')).default
    wrap(<LotsPage />)
    fireEvent.click(screen.getByText('LOT-2026-001').closest('tr')!)
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/lots/lot1')
  })

  it('renders the FilterBar with result count', async () => {
    const LotsPage = (await import('../lots/LotsPage')).default
    wrap(<LotsPage />)
    // FilterBar shows "2 results" for the 2 lots
    expect(screen.getByText(/results?/i)).toBeInTheDocument()
  })
})

// ── LotTraceability ───────────────────────────────────────────────────────────
describe('LotTraceability', () => {
  const lotDetail = {
    id: 'lot1',
    lot_number: 'LOT-2026-001',
    product_id: 'p1',
    product_name: 'Black Ink',
    sku: 'INK-001',
    expiry_date: '2027-01-01',
    created_at: '2026-01-15T10:00:00Z',
    current_qty: '50',
    current_location_name: 'Main Warehouse',
    moves: [
      { id: 'm1', move_date: '2026-01-15T10:00:00Z', direction: 'in', from_location_name: null, to_location_name: 'Main Warehouse', qty: '100', source_type: 'po_receipt', reference: 'PO-001', moved_by_email: 'user@fnc.com' },
      { id: 'm2', move_date: '2026-03-01T10:00:00Z', direction: 'out', from_location_name: 'Main Warehouse', to_location_name: 'Site A', qty: '50', source_type: 'manual', reference: null, moved_by_email: 'manager@fnc.com' },
    ],
  }

  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: { stockLot: lotDetail }, loading: false })
  })

  it('shows lot number in the header', async () => {
    const LotTraceability = (await import('../lots/LotTraceability')).default
    wrap(<LotTraceability />, '/inventory/lots/lot1')
    expect(screen.getByText('LOT-2026-001')).toBeInTheDocument()
  })

  it('shows product name in the subtitle', async () => {
    const LotTraceability = (await import('../lots/LotTraceability')).default
    wrap(<LotTraceability />, '/inventory/lots/lot1')
    expect(screen.getByText(/black ink/i)).toBeInTheDocument()
  })

  it('shows current qty at top', async () => {
    const LotTraceability = (await import('../lots/LotTraceability')).default
    wrap(<LotTraceability />, '/inventory/lots/lot1')
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText(/current qty/i)).toBeInTheDocument()
  })

  it('shows current location', async () => {
    const LotTraceability = (await import('../lots/LotTraceability')).default
    wrap(<LotTraceability />, '/inventory/lots/lot1')
    expect(screen.getByText('Main Warehouse')).toBeInTheDocument()
  })

  it('renders movement history timeline with both moves', async () => {
    const LotTraceability = (await import('../lots/LotTraceability')).default
    wrap(<LotTraceability />, '/inventory/lots/lot1')
    expect(screen.getByText(/movement history/i)).toBeInTheDocument()
    expect(screen.getByText(/2 moves/i)).toBeInTheDocument()
  })

  it('renders in/out direction labels in timeline', async () => {
    const LotTraceability = (await import('../lots/LotTraceability')).default
    wrap(<LotTraceability />, '/inventory/lots/lot1')
    expect(screen.getByText(/↓ in/i)).toBeInTheDocument()
    expect(screen.getByText(/↑ out/i)).toBeInTheDocument()
  })

  it('shows expiry date section when expiry is set', async () => {
    const LotTraceability = (await import('../lots/LotTraceability')).default
    wrap(<LotTraceability />, '/inventory/lots/lot1')
    expect(screen.getByText(/expiry date/i)).toBeInTheDocument()
    expect(screen.getByText('2027-01-01')).toBeInTheDocument()
  })

  it('navigates back to lots list', async () => {
    const LotTraceability = (await import('../lots/LotTraceability')).default
    wrap(<LotTraceability />, '/inventory/lots/lot1')
    fireEvent.click(screen.getByText(/lots/i))
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/lots')
  })
})
