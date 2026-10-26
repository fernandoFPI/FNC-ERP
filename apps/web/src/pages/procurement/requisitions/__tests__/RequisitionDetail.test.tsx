import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

// ── Apollo mock ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})

vi.mock('../../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

let mockAuthUser: { id: string; role: string } = { id: 'user-organizer', role: 'system_admin' }
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: mockAuthUser }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'req-1' }),
  }
})

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions/req-1']}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

function baseReq(overrides: Record<string, unknown> = {}) {
  return {
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
    organizer_id: 'user-organizer',
    organizerName: 'Jane Doe',
    notes: null,
    created_at: '2026-01-15T10:00:00.000Z',
    updated_at: '2026-01-15T10:00:00.000Z',
    callerHasStoreKeeperPosition: false,
    callerHasStorePricingPosition: false,
    callerHasMarketPricingPosition: false,
    callerHasPriceVerificationPosition: false,
    callerCanApprove: false,
    currencyTotals: [{ currency_code: 'IQD', subtotal: '500', line_count: 1 }],
    lines: [
      {
        id: 'line-1',
        line_number: 1,
        description: 'Cement bags',
        product_id: 'prod-1',
        product_name: 'Cement',
        sku: 'CEM-1',
        qty: '5',
        uom: 'bag',
        currency_code: 'IQD',
        unit_price: '100',
        qty_from_stock: '0',
        store_price: null,
        market_price: null,
        verified_price: null,
        total: '500',
        purchases: [],
      },
    ],
    approval_log: [],
    ...overrides,
  }
}

function mockReq(
  overrides: Record<string, unknown> = {},
  availability: Record<string, unknown>[] = [],
  childPOs: Record<string, unknown>[] = [],
) {
  mockUseQuery.mockImplementation((doc: unknown, opts?: { variables?: Record<string, unknown> }) => {
    const opName = (doc as { definitions?: { kind?: string; name?: { value?: string } }[] }).definitions?.find((d) => d.kind === 'OperationDefinition')?.name
      ?.value
    if (opName === 'RequisitionChildPurchaseOrders') {
      return { data: { requisitionChildPurchaseOrders: childPOs }, loading: false, refetch: vi.fn() }
    }
    if (opName === 'RequisitionStockAvailability') {
      return { data: { requisitionStockAvailability: availability }, loading: false, refetch: vi.fn() }
    }
    if (opts?.variables && 'isActive' in opts.variables) {
      return { data: { stockLocations: [] }, loading: false, refetch: vi.fn() }
    }
    return { data: { requisition: baseReq(overrides) }, loading: false, refetch: vi.fn() }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockAuthUser = { id: 'user-organizer', role: 'system_admin' }
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({}), { loading: false }])
  mockReq()
})

describe('RequisitionDetail', () => {
  it('shows the requisition number and status badge', async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('REQ-2026-001')).toBeInTheDocument()
    // "Draft" also appears as a StatusBar step label, so more than one match
    // is expected — assert the header badge is among them.
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0)
  })

  it('shows the project code alongside the project name, and the expected delivery date', async () => {
    mockReq({
      project_id: 'proj-1',
      projectCode: 'PRJ-004',
      projectName: 'Tower A',
      expected_delivery_date: '2026-06-15T00:00:00.000Z',
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('PRJ-004 — Tower A')).toBeInTheDocument()
    expect(screen.getByText('2026-06-15')).toBeInTheDocument()
  })

  it('lets a long item name wrap instead of pushing Qty and the price columns off the card', async () => {
    const longName =
      '110-003-019 UNIVERSAL SLIM WC SEAT MODEL 2 - ROUND FORM (DUROPLAST, SOFT-CLOSING, DETACHABLE METAL HINGE, TOP FIXING)'
    mockReq({
      status: 'pending_approval',
      currencyTotals: [],
      lines: [
        {
          ...baseReq().lines[0],
          description: longName,
          qty: '3',
          uom: 'pcs',
          qty_from_stock: '0',
          store_price: '110',
          store_price_currency: 'USD',
          market_price: '125.5',
          market_price_currency: 'USD',
          verified_price: '125.5',
          verified_price_currency: 'USD',
        },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    const itemCell = screen.getByText(longName).closest('td')
    expect(itemCell).toHaveStyle({
      whiteSpace: 'normal',
      overflowWrap: 'anywhere',
      minWidth: '220px',
    })
    // the quantity and the price columns the user could not see are still on the one row
    const row = itemCell?.closest('tr')
    expect(row).toHaveTextContent('3 pcs')
    expect(row).toHaveTextContent('125.5 USD')
    // and they stay on one line each
    expect(screen.getByText('3 pcs').closest('td')).toHaveStyle({ whiteSpace: 'nowrap' })
  })

  it('shows the lines table with the line description', async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('Cement bags')).toBeInTheDocument()
  })

  it('Print button opens a print modal with the requisition number, closable via ×', async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.queryByText('Print Requisition — REQ-2026-001')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^print$/i }))
    expect(screen.getByText('Print Requisition — REQ-2026-001')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /print \/ save as pdf/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '×' }))
    expect(screen.queryByText('Print Requisition — REQ-2026-001')).not.toBeInTheDocument()
  })

  it('a fully-from-stock line shows its store-price reference value instead of a bare 0 total', async () => {
    // Mirrors confirmRequisitionInventoryCheck's own zeroing rule: total_price
    // is 0 because nothing is being purchased, not because the item has no
    // value — the Lines table (and Summary Total) should show store_price ×
    // qty for display, in store_price's own currency, instead of just "0 IQD".
    mockReq({
      status: 'pending_approval',
      currencyTotals: [],
      lines: [
        {
          id: 'line-1',
          line_number: 1,
          description: 'Plastic Cravty Lover lhv160',
          product_id: 'prod-1',
          product_name: 'Plastic Cravty Lover lhv160',
          sku: 'ELEC-858',
          qty: '1',
          uom: 'EA',
          currency_code: 'IQD',
          unit_price: '0',
          qty_from_stock: '1',
          store_price: '10.72',
          store_price_currency: 'USD',
          market_price: null,
          verified_price: null,
          total: '0',
          purchases: [],
        },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    // Shows up in both the Lines table's Total column and, folded in, the
    // Summary panel's Total stat (RTL matches every ancestor whose own
    // textContent also equals just this text, so >=2 rather than an exact
    // count, which would be brittle against incidental DOM nesting).
    expect(screen.getAllByText(/10\.72 USD/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText(/\(from stock\)/).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('0 IQD')).not.toBeInTheDocument()
    // Summary panel specifically — prefixed with "+" since it's additive to
    // (here, empty) currencyTotals.
    expect(screen.getByText(/\+ 10\.72 USD \(from stock\)/)).toBeInTheDocument()
  })

  it('a partially-from-stock line keeps showing its real purchase total, not the store-price reference', async () => {
    mockReq({
      status: 'pending_approval',
      lines: [
        {
          id: 'line-1',
          line_number: 1,
          description: 'Rebar 12mm',
          product_id: 'prod-1',
          product_name: 'Rebar 12mm',
          sku: 'REB-1',
          qty: '10',
          uom: 'unit',
          currency_code: 'IQD',
          unit_price: '20',
          qty_from_stock: '4',
          store_price: '15',
          store_price_currency: 'USD',
          market_price: '20',
          verified_price: '20',
          total: '200',
          purchases: [],
        },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText(/200 IQD/)).toBeInTheDocument()
    expect(screen.queryByText(/\(from stock\)/)).not.toBeInTheDocument()
  })

  it('draft: shows Submit for inventory check for the organizer', async () => {
    mockReq({ status: 'draft' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /submit for inventory check/i })).toBeInTheDocument()
  })

  it('inventory_check: shows the qty-from-stock input when caller has store_keeper position', async () => {
    mockReq({ status: 'inventory_check', callerHasStoreKeeperPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /confirm inventory check/i })).toBeInTheDocument()
  })

  it('inventory_check: hides the form for a caller without position or organizer', async () => {
    mockAuthUser = { id: 'user-nobody', role: 'user' }
    mockReq({ status: 'inventory_check', organizer_id: 'someone-else', callerHasStoreKeeperPosition: false })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.queryByRole('button', { name: /confirm inventory check/i })).not.toBeInTheDocument()
    expect(screen.getByText(/only the organizer, a store keeper/i)).toBeInTheDocument()
  })

  it('inventory_check: shows on-hand/reserved/available and a per-location breakdown from requisitionStockAvailability', async () => {
    mockReq(
      { status: 'inventory_check', callerHasStoreKeeperPosition: true },
      [
        {
          lineId: 'line-1',
          qtyRequired: 5,
          qtyOnHand: 8,
          qtyAvailable: 3,
          isAvailable: false,
          byLocation: [
            { companyId: 'co-1', companyName: 'Main Co', locationId: 'loc-1', locationName: 'Main Warehouse', qtyOnHand: 8, qtyAvailable: 3 },
          ],
        },
      ],
    )
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    // qtyReserved is derived client-side as qtyOnHand - qtyAvailable = 5.
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText(/main warehouse/i)).toBeInTheDocument()
  })

  it('store_pricing: shows the submit button when caller has the position', async () => {
    mockReq({ status: 'store_pricing', callerHasStorePricingPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /submit to market pricing/i })).toBeInTheDocument()
  })

  it('market_pricing: shows the submit button and a currency selector', async () => {
    mockReq({ status: 'market_pricing', callerHasMarketPricingPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /submit to price verification/i })).toBeInTheDocument()
  })

  // Regression coverage for REQ-2026-0007: a line left blank at market
  // pricing was silently dropped from the submitted payload instead of
  // blocking submission, so it kept its creation-time price of 0 all the
  // way to approval. The submit button must stay disabled until every line
  // has an explicit, valid price.
  it('market_pricing: disables submit until every line has a price, including a single free-text line', async () => {
    mockReq({ status: 'market_pricing', callerHasMarketPricingPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    const submit = screen.getByRole('button', { name: /submit to price verification/i })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/enter a price for every line/i)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '150' } })
    expect(submit).not.toBeDisabled()
  })

  it('market_pricing: stays disabled if only one of two lines has a price', async () => {
    mockReq({
      status: 'market_pricing',
      callerHasMarketPricingPosition: true,
      lines: [
        { id: 'line-1', line_number: 1, description: 'Cement bags', product_id: 'prod-1', product_name: 'Cement', sku: 'CEM-1', qty: '5', uom: 'bag', currency_code: 'IQD', unit_price: '0', qty_from_stock: '0', store_price: null, market_price: null, verified_price: null, total: '0', purchases: [] },
        { id: 'line-2', line_number: 2, description: 'Electricity fees', product_id: null, product_name: null, sku: null, qty: '1', uom: 'unit', currency_code: 'IQD', unit_price: '0', qty_from_stock: '0', store_price: null, market_price: null, verified_price: null, total: '0', purchases: [] },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    const submit = screen.getByRole('button', { name: /submit to price verification/i })
    expect(submit).toBeDisabled()

    const inputs = screen.getAllByPlaceholderText('0.00')
    expect(inputs).toHaveLength(2)
    fireEvent.change(inputs[0], { target: { value: '150' } })
    expect(submit).toBeDisabled() // second line (the free-text one) still blank

    fireEvent.change(inputs[1], { target: { value: '0' } }) // an explicit 0 still counts as entered
    expect(submit).not.toBeDisabled()
  })

  // A line fully covered from stock was already zeroed and store-priced at
  // inventory check — it never needs a market price, so it must not show up
  // here at all (mirrors PurchaseOrderDetail's own purchaseLines filter).
  it('market_pricing: excludes a line fully covered from stock, only asking for the line that still needs buying', async () => {
    mockReq({
      status: 'market_pricing',
      callerHasMarketPricingPosition: true,
      lines: [
        { id: 'line-1', line_number: 1, description: 'Fully from stock', product_id: 'prod-1', product_name: 'Cement', sku: 'CEM-1', qty: '5', uom: 'bag', currency_code: 'IQD', unit_price: '0', qty_from_stock: '5', store_price: 10, market_price: null, verified_price: null, total: '0', purchases: [] },
        { id: 'line-2', line_number: 2, description: 'Needs buying', product_id: 'prod-2', product_name: 'Rebar', sku: 'REB-1', qty: '3', uom: 'unit', currency_code: 'IQD', unit_price: '0', qty_from_stock: '0', store_price: null, market_price: null, verified_price: null, total: '0', purchases: [] },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    // "Fully from stock" still appears once, in the always-visible Lines
    // table — but only one "Market price" input is rendered (for the line
    // that still needs buying), proving the fully-covered line was left out
    // of the action panel itself.
    expect(screen.getAllByText('Fully from stock')).toHaveLength(1)
    expect(screen.getAllByText('Needs buying').length).toBeGreaterThan(0)
    expect(screen.getAllByPlaceholderText('0.00')).toHaveLength(1)
  })

  // The vendor quote is for what still has to be bought, so each line card
  // states that quantity (requested less what stock already covers).
  it('market_pricing: shows the quantity to buy on each line card', async () => {
    mockReq({
      status: 'market_pricing',
      callerHasMarketPricingPosition: true,
      lines: [
        { id: 'line-1', line_number: 1, description: 'Cement bags', product_id: 'prod-1', product_name: 'Cement', sku: 'CEM-1', qty: '5', uom: 'bag', currency_code: 'IQD', unit_price: '0', qty_from_stock: '0', store_price: null, market_price: null, verified_price: null, total: '0', purchases: [] },
        { id: 'line-2', line_number: 2, description: 'Electricity fees', product_id: null, product_name: null, sku: null, qty: '12.5', uom: 'unit', currency_code: 'IQD', unit_price: '0', qty_from_stock: '0', store_price: null, market_price: null, verified_price: null, total: '0', purchases: [] },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('Qty to buy: 5 bag')).toBeInTheDocument()
    expect(screen.getByText('Qty to buy: 12.5 unit')).toBeInTheDocument()
    // nothing is covered from stock, so there's no "from stock" note
    expect(screen.queryByText(/requested, .* from stock/i)).not.toBeInTheDocument()
  })

  it('market_pricing: a partly stock-covered line shows only what is left to buy, plus how it splits', async () => {
    mockReq({
      status: 'market_pricing',
      callerHasMarketPricingPosition: true,
      lines: [
        { id: 'line-1', line_number: 1, description: 'Rebar 12mm', product_id: 'prod-2', product_name: 'Rebar', sku: 'REB-1', qty: '8', uom: 'unit', currency_code: 'IQD', unit_price: '0', qty_from_stock: '3', store_price: 10, market_price: null, verified_price: null, total: '0', purchases: [] },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('Qty to buy: 5 unit')).toBeInTheDocument()
    expect(screen.getByText('8 requested, 3 from stock')).toBeInTheDocument()
  })

  it('market_pricing: shows a clear message and a Continue button (no inputs) when every line is already covered from stock', async () => {
    const submitMock = vi.fn().mockResolvedValue({})
    mockUseMutation.mockReturnValue([submitMock, { loading: false }])
    mockReq({
      status: 'market_pricing',
      callerHasMarketPricingPosition: true,
      lines: [
        { id: 'line-1', line_number: 1, description: 'Fully from stock', product_id: 'prod-1', product_name: 'Cement', sku: 'CEM-1', qty: '5', uom: 'bag', currency_code: 'IQD', unit_price: '0', qty_from_stock: '5', store_price: 10, market_price: null, verified_price: null, total: '0', purchases: [] },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText(/every line is covered from stock/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('0.00')).not.toBeInTheDocument()

    // Regression: this used to be a dead end — an informational message
    // with no way to actually move the requisition past market_pricing.
    fireEvent.click(screen.getByRole('button', { name: /continue to price verification/i }))
    expect(submitMock).toHaveBeenCalledWith({ variables: { id: 'req-1', linePrices: [] } })
  })

  it('price_verification: shows a clear message and a Continue button (no inputs) when every line is already covered from stock', async () => {
    const verifyMock = vi.fn().mockResolvedValue({})
    mockUseMutation.mockReturnValue([verifyMock, { loading: false }])
    mockReq({
      status: 'price_verification',
      callerHasPriceVerificationPosition: true,
      lines: [
        { id: 'line-1', line_number: 1, description: 'Fully from stock', product_id: 'prod-1', product_name: 'Cement', sku: 'CEM-1', qty: '5', uom: 'bag', currency_code: 'IQD', unit_price: '0', qty_from_stock: '5', store_price: 10, market_price: null, verified_price: null, total: '0', purchases: [] },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText(/every line is covered from stock/i)).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('0.00')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /continue to approval/i }))
    expect(verifyMock).toHaveBeenCalledWith({ variables: { id: 'req-1', lineAdjustments: [] } })
  })

  it('price_verification: shows Submit for approval, disabled until a verified price exists', async () => {
    mockReq({ status: 'price_verification', callerHasPriceVerificationPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    const submit = screen.getByRole('button', { name: /submit for approval/i })
    // Base fixture's line has market_price: null — exactly REQ-2026-0007's
    // state — so this must NOT silently default to 0.
    expect(submit).toBeDisabled()
    expect(screen.getByText(/does not default to 0/i)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '150' } })
    expect(submit).not.toBeDisabled()
  })

  it('price_verification: is enabled by default when the line already has a market price', async () => {
    mockReq({
      status: 'price_verification',
      callerHasPriceVerificationPosition: true,
      lines: [
        { id: 'line-1', line_number: 1, description: 'Cement bags', product_id: 'prod-1', product_name: 'Cement', sku: 'CEM-1', qty: '5', uom: 'bag', currency_code: 'IQD', unit_price: '100', qty_from_stock: '0', store_price: null, market_price: 100, market_price_currency: 'IQD', verified_price: null, total: '500', purchases: [] },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /submit for approval/i })).not.toBeDisabled()
  })

  it('price_verification: excludes a line fully covered from stock, only asking to verify the line that was market-priced', async () => {
    mockReq({
      status: 'price_verification',
      callerHasPriceVerificationPosition: true,
      lines: [
        { id: 'line-1', line_number: 1, description: 'Fully from stock', product_id: 'prod-1', product_name: 'Cement', sku: 'CEM-1', qty: '5', uom: 'bag', currency_code: 'IQD', unit_price: '0', qty_from_stock: '5', store_price: 10, market_price: null, verified_price: null, total: '0', purchases: [] },
        { id: 'line-2', line_number: 2, description: 'Needs verification', product_id: 'prod-2', product_name: 'Rebar', sku: 'REB-1', qty: '3', uom: 'unit', currency_code: 'IQD', unit_price: '20', qty_from_stock: '0', store_price: null, market_price: 20, market_price_currency: 'IQD', verified_price: null, total: '60', purchases: [] },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    // Same reasoning as the market_pricing test above — only one
    // "Verified price" input is rendered for the line that needs it.
    // The flag-to-reject checkbox lives on the line's own row in the Lines
    // table (no separate line-name picker elsewhere), so the description
    // still appears exactly once.
    expect(screen.getAllByText('Fully from stock')).toHaveLength(1)
    expect(screen.getAllByText('Needs verification').length).toBeGreaterThan(0)
    expect(screen.getAllByPlaceholderText('0.00')).toHaveLength(1)
  })

  it('pending_approval: shows Approve and the reject-box destinations for an authorized approver', async () => {
    mockReq({ status: 'pending_approval', callerCanApprove: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    // "Reset to Draft" is the same reject-to-draft action as before, restyled
    // into PurchaseOrderDetail's boxed reject layout alongside the two new
    // destinations (Send Back to Inventory Check / Market Pricing).
    expect(screen.getByRole('button', { name: /^reset to draft$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^send back to inventory check$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^send back to market pricing$/i })).toBeInTheDocument()
  })

  it('pending_approval: reject-box destinations stay disabled until a line is flagged with a reason', async () => {
    mockReq({ status: 'pending_approval', callerCanApprove: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    const resetBtn = screen.getByRole('button', { name: /^reset to draft$/i })
    expect(resetBtn).toBeDisabled()
    // Filling only the overall reason box is no longer enough — at least one
    // line must be flagged (checkbox) with its own non-empty reason.
    fireEvent.change(screen.getByPlaceholderText(/enter reason/i), { target: { value: 'price too high' } })
    expect(resetBtn).toBeDisabled()
    // The flag checkbox now lives on the line's own row in the Lines tab
    // table (not a separate line-name picker), identified by its title.
    fireEvent.click(screen.getByRole('checkbox', { name: /flag this line/i }))
    expect(resetBtn).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/what's wrong with this line/i), {
      target: { value: 'wrong item' },
    })
    expect(resetBtn).not.toBeDisabled()
  })

  it('sourcing: shows the sourcing summary panel', async () => {
    mockReq({ status: 'sourcing' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText(/waiting on every line to resolve/i)).toBeInTheDocument()
  })

  // Regression (D10): a child PO whose lines span two currencies has
  // total_amount NULL. The Child POs table showed a misleading "0 IQD" there
  // (and, before the schema fix, the whole list errored). One line per
  // currency, never summed.
  it('sourcing: a mixed-currency child PO shows one total per currency, not NaN', async () => {
    const children = [
      {
        id: 'po-mixed',
        po_number: 'PO-MIXED-1',
        status: 'bought',
        vendor_id: 'v-1',
        vendor_name: 'Acme',
        total_amount: null,
        currency_code: 'IQD',
        currencyTotals: [
          { currency_code: 'IQD', subtotal: '50.0000', line_count: 1 },
          { currency_code: 'USD', subtotal: '5.0000', line_count: 1 },
        ],
        created_at: '2026-01-16T10:00:00.000Z',
      },
      {
        id: 'po-single',
        po_number: 'PO-SINGLE-1',
        status: 'bought',
        vendor_id: 'v-2',
        vendor_name: 'Beta',
        total_amount: '70.0000',
        currency_code: 'IQD',
        currencyTotals: [{ currency_code: 'IQD', subtotal: '70.0000', line_count: 1 }],
        created_at: '2026-01-16T10:00:00.000Z',
      },
    ]
    mockReq({ status: 'sourcing' }, [], children)
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('PO-MIXED-1')).toBeInTheDocument()
    expect(screen.getByText('PO-SINGLE-1')).toBeInTheDocument()
    expect(screen.getByText(/^50\s+IQD$/)).toBeInTheDocument()
    expect(screen.getByText(/^5\s+USD$/)).toBeInTheDocument()
    expect(screen.getByText(/^70\s+IQD$/)).toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^55\b/)).not.toBeInTheDocument()
  })

  it('completed: shows the completed confirmation', async () => {
    mockReq({ status: 'completed' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText(/every line on this requisition has been resolved/i)).toBeInTheDocument()
  })

  it('cancelled: shows a terminal-state message and no Cancel button', async () => {
    mockReq({ status: 'cancelled' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText(/no longer active/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument()
  })

  it('calls submitRequisitionToInventoryCheck with the requisition id on submit click', async () => {
    const submitMock = vi.fn().mockResolvedValue({})
    mockUseMutation.mockReturnValue([submitMock, { loading: false }])
    mockReq({ status: 'draft' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /submit for inventory check/i }))
    expect(submitMock).toHaveBeenCalledWith({ variables: { id: 'req-1' } })
  })

  // Regression coverage for matching PurchaseOrderDetail's own page
  // structure: stat-card Summary + Lines/Log/Edit-requests tabs.
  it('shows the Summary as stat cards, including the per-currency Total', async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    // "Total" also appears as a Lines-table column header, and "500 IQD"
    // also as that single line's own total — both coincidentally the same
    // figure here since there's only one line.
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    expect(screen.getAllByText('500 IQD').length).toBeGreaterThan(0)
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Organizer')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('renders Lines/Log/Edit requests tabs, defaulting to Lines', async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByText('Cement bags')).toBeInTheDocument()
    expect(screen.queryByText('Approval Log')).not.toBeInTheDocument()
    expect(screen.queryByText('Request an edit')).not.toBeInTheDocument()
  })

  it('Log tab shows approval_log entries and requisition notes', async () => {
    mockReq({
      notes: 'Urgent — client site is waiting',
      approval_log: [
        {
          id: 'log-1',
          from_status: 'draft',
          to_status: 'inventory_check',
          action: 'submitted',
          actor_id: 'user-organizer',
          actor_name: 'Jane Doe',
          actor_position: null,
          notes: null,
          created_at: '2026-01-16T09:00:00.000Z',
        },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /^log$/i }))
    expect(screen.getByText('Approval Log')).toBeInTheDocument()
    expect(screen.getByText('Urgent — client site is waiting')).toBeInTheDocument()
    expect(screen.getByText('submitted')).toBeInTheDocument()
    // "Jane Doe" also appears in the Summary's Organizer stat card, which
    // stays rendered regardless of active tab.
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0)
  })

  it('Edit requests tab: Start editing reveals the form, submit sends requisitionId (not id)', async () => {
    const submitMock = vi
      .fn<[{ variables: { requisitionId?: string; id?: string; changes: string } }], Promise<unknown>>()
      .mockResolvedValue({})
    mockUseMutation.mockReturnValue([submitMock, { loading: false }])
    mockReq()
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /edit requests/i }))
    expect(screen.getByText('Request an edit')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /start editing/i }))
    expect(screen.getByDisplayValue('Cement bags')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /submit edit request/i }))
    expect(submitMock).not.toHaveBeenCalled() // no fields changed yet — nothing to submit

    const notesInputs = screen.getAllByDisplayValue('')
    fireEvent.change(notesInputs[0], { target: { value: 'Please expedite' } })
    fireEvent.click(screen.getByRole('button', { name: /submit edit request/i }))

    expect(submitMock).toHaveBeenCalledTimes(1)
    const call = submitMock.mock.calls[0][0]
    expect(call.variables.requisitionId).toBe('req-1')
    expect(call.variables.id).toBeUndefined()
    const changes = JSON.parse(call.variables.changes) as { header: Record<string, unknown> }
    expect(changes.header.notes).toEqual({ from: '', to: 'Please expedite' })
  })

  it('Edit requests tab: shows a pending edit request with Approve/Reject for an admin', async () => {
    mockReq({
      edit_requests: [
        {
          id: 'er-1',
          status: 'pending',
          changes: JSON.stringify({ header: { notes: { from: '', to: 'Please expedite' } }, lines: {} }),
          request_notes: null,
          requested_by_email: 'buyer@fnc.com',
          reviewed_by_email: null,
          review_notes: null,
          reviewed_at: null,
          created_at: '2026-01-16T09:00:00.000Z',
        },
      ],
    })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /edit requests/i }))
    expect(screen.getByText('buyer@fnc.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^reject$/i })).toBeInTheDocument()
  })

  // Regression: "Start editing" used to be shown to anyone who could view
  // the requisition at all, with no client-side check matching the
  // backend's own organizer-or-project-member-or-admin gate — a stranger
  // could fill out a whole draft only to have submit fail. Now hidden
  // (not just disabled) for a caller who is neither the organizer nor an
  // admin.
  it('Edit requests tab: hides Start editing for a caller who is neither the organizer nor an admin', async () => {
    mockAuthUser = { id: 'user-stranger', role: 'user' }
    mockReq({ organizer_id: 'someone-else' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /edit requests/i }))
    expect(screen.queryByRole('button', { name: /start editing/i })).not.toBeInTheDocument()
    // "Only the organizer or an admin" also matches the unrelated Draft
    // panel's own submit-permission message (visible alongside this one,
    // since the default mocked status is 'draft') — scope to the phrase
    // unique to the edit-request panel.
    expect(screen.getByText(/only the organizer or an admin can request an edit/i)).toBeInTheDocument()
  })

  // The shared Select component's <label> isn't associated to its
  // <select> via htmlFor/id (see getPurposeSelect's own comment
  // elsewhere in this suite for the same gotcha) — Priority is always
  // the first <select> the edit form renders, Delivery Destination
  // (when shown) the second; the Lines tab's own content is unmounted
  // while on the Edit requests tab, so no other <select> can appear.
  function getEditDeliveryDestinationSelect(container: HTMLElement): HTMLSelectElement {
    return container.querySelectorAll('select')[1]
  }

  it('Edit requests tab: shows Delivery Destination for a Project Supply requisition and includes it in the submitted diff', async () => {
    const submitMock = vi
      .fn<[{ variables: { requisitionId?: string; id?: string; changes: string } }], Promise<unknown>>()
      .mockResolvedValue({})
    mockUseMutation.mockReturnValue([submitMock, { loading: false }])
    mockReq({ purpose: 'project', delivery_destination: 'inventory' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    const { container } = wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /edit requests/i }))
    fireEvent.click(screen.getByRole('button', { name: /start editing/i }))

    expect(screen.getByText('Delivery Destination')).toBeInTheDocument()
    const destinationSelect = getEditDeliveryDestinationSelect(container)
    expect(destinationSelect).not.toBeDisabled()
    fireEvent.change(destinationSelect, { target: { value: 'jobsite' } })
    fireEvent.click(screen.getByRole('button', { name: /submit edit request/i }))

    expect(submitMock).toHaveBeenCalledTimes(1)
    const changes = JSON.parse(submitMock.mock.calls[0][0].variables.changes) as {
      header: Record<string, unknown>
    }
    expect(changes.header.delivery_destination).toEqual({ from: 'inventory', to: 'jobsite' })
  })

  it('Edit requests tab: omits Delivery Destination for a General Stock requisition', async () => {
    mockReq({ purpose: 'stock' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /edit requests/i }))
    fireEvent.click(screen.getByRole('button', { name: /start editing/i }))
    expect(screen.queryByText('Delivery Destination')).not.toBeInTheDocument()
  })

  // Once Finish Buying has run for every line (status 'sourcing'), each
  // child PO already has its own frozen copy of delivery_destination from
  // fork time — editing the requisition's own value here would silently
  // do nothing, so it's shown disabled with an explanation instead of
  // quietly accepting an edit that goes nowhere.
  it('Edit requests tab: disables Delivery Destination once the requisition has reached sourcing', async () => {
    mockReq({ purpose: 'project', delivery_destination: 'jobsite', status: 'sourcing' })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    const { container } = wrap(<RequisitionDetail />)
    fireEvent.click(screen.getByRole('button', { name: /edit requests/i }))
    fireEvent.click(screen.getByRole('button', { name: /start editing/i }))
    expect(getEditDeliveryDestinationSelect(container)).toBeDisabled()
    expect(screen.getByText(/already forked this into one or more purchase orders/i)).toBeInTheDocument()
  })

  it('inventory_check: restores an in-progress qty-from-stock draft after a refresh', async () => {
    localStorage.setItem(
      'fnc_inv_check_draft_req-1',
      JSON.stringify({ invQty: { 'line-1': '3' }, invLoc: {}, productOverride: {} }),
    )
    mockReq({ status: 'inventory_check', callerHasStoreKeeperPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(screen.getByDisplayValue('3')).toBeInTheDocument()
  })

  it('inventory_check: saves the qty-from-stock draft to localStorage as it\'s typed', async () => {
    mockReq({ status: 'inventory_check', callerHasStoreKeeperPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    const input = screen.getByPlaceholderText('0')
    fireEvent.change(input, { target: { value: '2' } })
    const raw = localStorage.getItem('fnc_inv_check_draft_req-1')
    expect(raw).toBeTruthy()
    if (!raw) throw new Error('Expected draft to be saved to localStorage')
    expect(JSON.parse(raw)).toMatchObject({ invQty: { 'line-1': '2' } })
  })

  it('inventory_check: clears the draft once the confirm mutation succeeds', async () => {
    localStorage.setItem(
      'fnc_inv_check_draft_req-1',
      JSON.stringify({ invQty: { 'line-1': '5' }, invLoc: {}, productOverride: {} }),
    )
    const confirmMock = vi.fn().mockResolvedValue({})
    mockUseMutation.mockReturnValue([confirmMock, { loading: false }])
    mockReq({ status: 'inventory_check', callerHasStoreKeeperPosition: true })
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
    expect(localStorage.getItem('fnc_inv_check_draft_req-1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /confirm inventory check/i }))
    await vi.waitFor(() => {
      expect(localStorage.getItem('fnc_inv_check_draft_req-1')).toBeNull()
    })
  })
})

// The lines table: an "Inventory cost" reference column (the product's own Cost, not the store
// price typed on the line) and a Columns menu, remembered per person under its own table id.
describe('RequisitionDetail: inventory cost column and Columns menu', () => {
  // back to English while the page is still mounted, so the re-render is inside act()
  afterEach(async () => {
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  const costLine = (over: Record<string, unknown> = {}) => ({
    ...baseReq().lines[0],
    description: 'Cement bags',
    inventory_cost: '12.5',
    inventory_cost_currency: 'USD',
    ...over,
  })
  const open = async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    return wrap(<RequisitionDetail />)
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
  const cellOf = (lineName: string, columnName: string) => {
    const headers = within(linesTable()).getAllByRole('columnheader')
    const at = headers.findIndex((h) => h.textContent === columnName)
    const row = within(linesTable()).getByText(lineName).closest('tr') as HTMLElement
    return within(row).getAllByRole('cell')[at]
  }

  it('shows the product cost from Inventory check onward', async () => {
    mockReq({ status: 'inventory_check', lines: [costLine()] })
    await open()
    expect(header('Inventory cost')).toBeInTheDocument()
    expect(within(linesTable()).getByText('12.5 USD')).toBeInTheDocument()
  })

  it('is a different figure from the store price, and both show once pricing starts', async () => {
    mockReq({
      status: 'store_pricing',
      currencyTotals: [],
      lines: [costLine({ store_price: '110', store_price_currency: 'USD' })],
    })
    await open()
    expect(header('Store price')).toBeInTheDocument()
    expect(cellOf('Cement bags', 'Store price')).toHaveTextContent('110 USD')
    expect(cellOf('Cement bags', 'Inventory cost')).toHaveTextContent('12.5 USD')
  })

  it('is off on a draft, but can be switched on', async () => {
    mockReq({ status: 'draft', lines: [costLine()] })
    await open()
    expect(header('Inventory cost')).toBeNull()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inventory cost' }))
    expect(header('Inventory cost')).toBeInTheDocument()
    expect(within(linesTable()).getByText('12.5 USD')).toBeInTheDocument()
  })

  it('says "currency not set" for an older cost saved without one, and a dash for no cost', async () => {
    mockReq({
      status: 'inventory_check',
      lines: [
        costLine({ id: 'line-1', inventory_cost: '800', inventory_cost_currency: null }),
        costLine({
          id: 'line-2',
          description: 'Custom item',
          inventory_cost: null,
          inventory_cost_currency: null,
        }),
      ],
    })
    await open()
    expect(cellOf('Cement bags', 'Inventory cost')).toHaveTextContent('800')
    expect(cellOf('Cement bags', 'Inventory cost')).toHaveTextContent('currency not set')
    expect(cellOf('Custom item', 'Inventory cost')).toHaveTextContent(/^—$/)
  })

  it('never changes what a line costs', async () => {
    mockReq({ status: 'inventory_check', lines: [costLine()] })
    await open()
    // 5 x 12.5 would be 62.5; the line keeps its own total
    expect(cellOf('Cement bags', 'Total')).toHaveTextContent(/^500 IQD$/)
  })

  it('lists only the columns this stage has, and keeps Qty and Total from being hidden', async () => {
    mockReq({ status: 'inventory_check', lines: [costLine()] })
    await open()
    openColumns()
    expect(screen.getByRole('checkbox', { name: 'Inventory cost' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'From stock' })).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Store price' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Market price' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Qty' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Total' })).toBeDisabled()
    expect(screen.getByText('Item, Qty and Total always stay visible')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Columns · 4 of 4' })).toBeInTheDocument()
  })

  it('hides a column when it is cleared, including one that was already there before', async () => {
    mockReq({ status: 'inventory_check', lines: [costLine()] })
    await open()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'From stock' }))
    expect(header('From stock')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inventory cost' }))
    expect(header('Inventory cost')).toBeNull()
    expect(header('Item')).toBeInTheDocument()
    expect(header('Qty')).toBeInTheDocument()
    expect(header('Total')).toBeInTheDocument()
  })

  it('remembers the choice on the next requisition, under its own table, apart from the PO lines', async () => {
    mockReq({ status: 'inventory_check', lines: [costLine()] })
    const first = await open()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inventory cost' }))
    first.unmount()

    expect(localStorage.getItem('fnc_table_view_v1_user-organizer_req-lines')).not.toBeNull()
    expect(localStorage.getItem('fnc_table_view_v1_user-organizer_po-lines')).toBeNull()

    mockReq({ id: 'req-2', status: 'store_pricing', lines: [costLine()] })
    await open()
    expect(header('Inventory cost')).toBeNull()
  })

  it('goes back to the defaults on "Reset to default"', async () => {
    mockReq({ status: 'inventory_check', lines: [costLine()] })
    await open()
    openColumns()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inventory cost' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(header('Inventory cost')).toBeInTheDocument()
  })

  it('reads in Arabic without raw keys', async () => {
    await i18n.changeLanguage('ar')
    mockReq({
      status: 'inventory_check',
      lines: [costLine({ inventory_cost: '800', inventory_cost_currency: null })],
    })
    await open()
    const table = screen
      .getAllByRole('table')
      .find((el) => within(el).queryByRole('columnheader', { name: 'تكلفة المخزون' }))
    if (!table) throw new Error('lines table not found')
    expect(within(table).getByText('العملة غير محددة')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^الأعمدة/ }))
    expect(screen.getByText('المادة والكمية والإجمالي تظهر دائمًا')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(
      /po\.detail\.|req\.detail\.linesAlwaysVisible|ui\.tableView\./,
    )
  })
})
