import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { themes } from '../../../../theme/tokens'
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
  materialIssues: Record<string, unknown>[] = [],
  lineComments: Record<string, unknown>[] = [],
) {
  mockUseQuery.mockImplementation((doc: unknown, opts?: { variables?: Record<string, unknown> }) => {
    const opName = (doc as { definitions?: { kind?: string; name?: { value?: string } }[] }).definitions?.find((d) => d.kind === 'OperationDefinition')?.name
      ?.value
    if (opName === 'POLineComments') {
      return { data: { poLineComments: lineComments }, loading: false, refetch: vi.fn() }
    }
    if (opName === 'RequisitionChildPurchaseOrders') {
      return { data: { requisitionChildPurchaseOrders: childPOs }, loading: false, refetch: vi.fn() }
    }
    if (opName === 'MaterialIssues') {
      return { data: { materialIssues }, loading: false, refetch: vi.fn() }
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

  // Procurement can leave a note on an item while pricing it, from the Lines
  // table's Notes column. It is the same thread as the PO page's "+ Note"
  // (po_line_comments). The market-pricing line card itself carries only the
  // price and currency: no note button and no vendor quote ref field.
  describe('line notes', () => {
    const comment = (overrides: Record<string, unknown> = {}) => ({
      id: 'c-1',
      po_line_id: 'line-1',
      comment: 'Vendor can only deliver half this week',
      created_by_name: 'Nadia Saleh',
      created_at: '2026-01-16T09:30:00.000Z',
      flag: null,
      resolved: false,
      resolved_at: null,
      ...overrides,
    })

    it('market_pricing: the only note button is the Lines table one; the line card has none', async () => {
      mockReq({ status: 'market_pricing', callerHasMarketPricingPosition: true })
      const RequisitionDetail = (await import('../RequisitionDetail')).default
      wrap(<RequisitionDetail />)
      // the market-pricing form is on screen, and still just the table's button
      expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: '+ Note' })).toHaveLength(1)
    })

    it('market_pricing: the line card has no vendor quote ref field', async () => {
      mockReq({ status: 'market_pricing', callerHasMarketPricingPosition: true })
      const RequisitionDetail = (await import('../RequisitionDetail')).default
      wrap(<RequisitionDetail />)
      expect(screen.queryByText(/vendor quote ref/i)).not.toBeInTheDocument()
    })

    it('market_pricing: submit sends only the line, price and currency (no vendorQuoteRef)', async () => {
      const submitMock = vi.fn().mockResolvedValue({})
      mockUseMutation.mockReturnValue([submitMock, { loading: false }])
      mockReq({ status: 'market_pricing', callerHasMarketPricingPosition: true })
      const RequisitionDetail = (await import('../RequisitionDetail')).default
      wrap(<RequisitionDetail />)
      fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '150' } })
      fireEvent.click(screen.getByRole('button', { name: /submit to price verification/i }))
      expect(submitMock).toHaveBeenCalledWith({
        variables: {
          id: 'req-1',
          linePrices: [{ lineId: 'line-1', marketPrice: 150, currencyCode: 'IQD' }],
        },
      })
    })

    it('market_pricing: the Lines table button opens the note thread for that item', async () => {
      mockReq({ status: 'market_pricing', callerHasMarketPricingPosition: true })
      const RequisitionDetail = (await import('../RequisitionDetail')).default
      wrap(<RequisitionDetail />)
      expect(screen.queryByPlaceholderText('Type your comment…')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '+ Note' }))
      expect(screen.getByPlaceholderText('Type your comment…')).toBeInTheDocument()
      expect(screen.getByText('No comments yet.')).toBeInTheDocument()
      // the modal names the item the note is for (the name also appears in the table and card)
      expect(screen.getByText('Item Description: Cement bags')).toBeInTheDocument()
    })

    it('shows the comment count once the line has notes', async () => {
      mockReq(
        { status: 'market_pricing', callerHasMarketPricingPosition: true },
        [],
        [],
        [],
        [comment(), comment({ id: 'c-2', comment: 'Second note' })],
      )
      const RequisitionDetail = (await import('../RequisitionDetail')).default
      wrap(<RequisitionDetail />)
      expect(screen.getByRole('button', { name: '💬 2' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '+ Note' })).not.toBeInTheDocument()
    })

    it('shows the most severe unresolved flag instead of the count, like the PO page', async () => {
      mockReq(
        { status: 'market_pricing', callerHasMarketPricingPosition: true },
        [],
        [],
        [],
        [
          comment({ id: 'c-1', flag: 'info' }),
          comment({ id: 'c-2', flag: 'dispute' }),
          comment({ id: 'c-3', flag: 'warning', resolved: true }),
        ],
      )
      const RequisitionDetail = (await import('../RequisitionDetail')).default
      wrap(<RequisitionDetail />)
      // dispute outranks info; the resolved warning is not counted as open
      expect(screen.getByRole('button', { name: /Dispute · 2 open/ })).toBeInTheDocument()
    })

    it('opens the thread with the existing comments listed', async () => {
      mockReq(
        { status: 'market_pricing', callerHasMarketPricingPosition: true },
        [],
        [],
        [],
        [comment()],
      )
      const RequisitionDetail = (await import('../RequisitionDetail')).default
      wrap(<RequisitionDetail />)
      fireEvent.click(screen.getByRole('button', { name: '💬 1' }))
      expect(screen.getByText('Vendor can only deliver half this week')).toBeInTheDocument()
      expect(screen.getByText(/Nadia Saleh/)).toBeInTheDocument()
    })

    it('the Lines table has a Notes column at every stage, not only market pricing', async () => {
      mockReq({ status: 'draft' })
      const RequisitionDetail = (await import('../RequisitionDetail')).default
      wrap(<RequisitionDetail />)
      expect(screen.getByRole('columnheader', { name: 'Notes' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '+ Note' })).toBeInTheDocument()
    })
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

  // Regression (NF-PO-2026-0163): a line added by an edit had no currency, so the server stored it as IQD on a USD
  // requisition. The form now carries one, starting from the currency the lines already share.
  describe('Edit requests tab: a line added by an edit names its currency', () => {
    const reqLine = (id: string, n: number, currency: string) => ({
      id,
      line_number: n,
      description: `Item ${n}`,
      product_id: null,
      product_name: null,
      sku: null,
      qty: '5',
      uom: 'bag',
      currency_code: currency,
      unit_price: '100',
      qty_from_stock: '0',
      store_price: null,
      market_price: null,
      verified_price: null,
      total: '500',
      purchases: [],
    })
    type SubmitArgs = [{ variables: { requisitionId: string; changes: string } }]
    const makeSubmit = () => vi.fn<SubmitArgs, Promise<unknown>>().mockResolvedValue({})
    type Submit = ReturnType<typeof makeSubmit>

    const startAddingALine = async (currencies: string[]): Promise<Submit> => {
      const submitMock = makeSubmit()
      mockUseMutation.mockReturnValue([submitMock, { loading: false }])
      mockReq({ lines: currencies.map((c, i) => reqLine(`line-${i + 1}`, i + 1, c)) })
      const RequisitionDetail = (await import('../RequisitionDetail')).default
      wrap(<RequisitionDetail />)
      fireEvent.click(screen.getByRole('button', { name: /edit requests/i }))
      fireEvent.click(screen.getByRole('button', { name: /start editing/i }))
      fireEvent.click(screen.getAllByRole('button', { name: /add line/i })[0])
      fireEvent.change(screen.getByPlaceholderText('Description'), {
        target: { value: 'Corner angle' },
      })
      return submitMock
    }
    const currencyBox = () => screen.getByRole<HTMLSelectElement>('combobox', { name: 'Currency' })
    const submit = () =>
      fireEvent.click(screen.getByRole('button', { name: /submit edit request/i }))
    interface Changes {
      lines: { added: { description: string; currency_code?: string }[] }
    }
    const addedLines = (submitMock: Submit) => {
      const [call] = submitMock.mock.calls[0]
      return (JSON.parse(call.variables.changes) as Changes).lines.added
    }

    it('starts a new line on the currency every line already has, and sends it', async () => {
      const submitMock = await startAddingALine(['USD', 'USD'])
      expect(currencyBox()).toHaveValue('USD')
      submit()
      expect(submitMock).toHaveBeenCalledTimes(1)
      expect(addedLines(submitMock)).toEqual([
        expect.objectContaining({ description: 'Corner angle', currency_code: 'USD' }),
      ])
    })

    it('does not guess when the requisition mixes currencies: nothing is sent until one is chosen', async () => {
      const submitMock = await startAddingALine(['IQD', 'USD'])
      expect(currencyBox()).toHaveValue('')
      submit()
      expect(submitMock).not.toHaveBeenCalled()

      fireEvent.change(currencyBox(), { target: { value: 'USD' } })
      submit()
      expect(submitMock).toHaveBeenCalledTimes(1)
      expect(addedLines(submitMock)[0]).toMatchObject({ currency_code: 'USD' })
    })

    it('lets the person pick another currency than the one the lines share', async () => {
      const submitMock = await startAddingALine(['USD', 'USD'])
      fireEvent.change(currencyBox(), { target: { value: 'EUR' } })
      submit()
      expect(addedLines(submitMock)[0]).toMatchObject({ currency_code: 'EUR' })
    })

    it("offers the requisition's own currency even when it is not one of the usual ones", async () => {
      await startAddingALine(['JPY', 'JPY'])
      expect(currencyBox()).toHaveValue('JPY')
      expect(within(currencyBox()).getByRole('option', { name: 'IQD' })).toBeInTheDocument()
    })
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
    mockReq({ status: 'approved', lines: [costLine()] })
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

// The Store Outs card lists the ones made by hand for the bought items too (the gateway now
// returns those), saying which PO each belongs to; and the Sourcing panel keeps saying it waits
// for the Store Outs of stock-covered lines, whatever the delivery destination.
describe('RequisitionDetail: Store Outs card and the Sourcing panel', () => {
  afterEach(async () => {
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  const storeOuts = [
    {
      id: 'mi-1',
      issueNumber: 'NF-SO-2026-00227',
      status: 'issued',
      poNumber: 'NF-PO-2026-0100',
      requisitionId: null,
      lines: [],
    },
    {
      id: 'mi-2',
      issueNumber: 'NF-SO-2026-00300',
      status: 'draft',
      poNumber: null,
      requisitionId: 'req-1',
      lines: [],
    },
  ]
  const open = async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    return wrap(<RequisitionDetail />)
  }
  const storeOutTable = () => {
    const found = screen
      .getAllByRole('table')
      .find((el) => within(el).queryByRole('columnheader', { name: 'Issue Number' }))
    if (!found) throw new Error('Store Outs table not found')
    return found
  }

  it('shows which PO a Store Out was made against, and a dash for one made against the requisition', async () => {
    mockReq({ status: 'sourcing' }, [], [], storeOuts)
    await open()
    const table = within(storeOutTable())
    expect(table.getByRole('columnheader', { name: 'PO Number' })).toBeInTheDocument()
    const byPo = table.getByText('NF-SO-2026-00227').closest('tr') as HTMLElement
    expect(within(byPo).getByText('NF-PO-2026-0100')).toBeInTheDocument()
    const byReq = table.getByText('NF-SO-2026-00300').closest('tr') as HTMLElement
    expect(within(byReq).getByText('—')).toBeInTheDocument()
  })

  it('says the card covers both the stock-covered part and the items issued from its purchase orders', async () => {
    mockReq({ status: 'sourcing' }, [], [], storeOuts)
    await open()
    expect(
      screen.getByText(
        'Store Outs for this requisition: the part covered from stock, and items issued from its purchase orders.',
      ),
    ).toBeInTheDocument()
  })

  it('shows no Store Outs card when there are none', async () => {
    mockReq({ status: 'sourcing' })
    await open()
    expect(screen.queryByText('Store Outs')).toBeNull()
  })

  it.each([
    [
      'a project requisition delivered to inventory',
      { purpose: 'project', delivery_destination: 'inventory' },
    ],
    [
      'a project requisition delivered to the jobsite',
      { purpose: 'project', delivery_destination: 'jobsite' },
    ],
    ['a stock requisition', { purpose: 'stock', delivery_destination: null }],
  ])(
    '%s: Sourcing says it waits on the Store Out of its stock-covered lines',
    async (_label, over) => {
      mockReq({ status: 'sourcing', ...over })
      await open()
      expect(screen.getByText(/Waiting on every line to resolve/)).toBeInTheDocument()
      expect(screen.queryByText(/needs no Store Out/)).toBeNull()
    },
  )

  it('reads in Arabic without raw keys', async () => {
    await i18n.changeLanguage('ar')
    mockReq(
      { status: 'sourcing', purpose: 'project', delivery_destination: 'inventory' },
      [],
      [],
      storeOuts,
    )
    await open()
    expect(screen.getByText(/بانتظار معالجة كل بند/)).toBeInTheDocument()
    expect(screen.getByText(/إذونات الصرف الخاصة بهذا الطلب/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/req\.detail\./)
  })
})

// Market pricing in two parts (migration 315): the organizer takes the lines he will price and buy himself, procurement
// does the rest, and the requisition moves on once each part that has lines has been submitted.
describe('RequisitionDetail: Market pricing in two parts', () => {
  afterEach(async () => {
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  const line = (id: string, description: string, over: Record<string, unknown> = {}) => ({
    id,
    line_number: Number(id.replace('line-', '')),
    description,
    product_id: null,
    product_name: null,
    sku: null,
    qty: '2',
    uom: 'unit',
    currency_code: 'IQD',
    unit_price: '0',
    qty_from_stock: '0',
    store_price: null,
    market_price: null,
    verified_price: null,
    total: '0',
    purchases: [],
    owner_handles: false,
    ...over,
  })
  const split = (over: Record<string, unknown> = {}) => ({
    status: 'market_pricing',
    lines: [
      line('line-1', 'Kitchen gloves', { owner_handles: true }),
      line('line-2', 'Cement bags'),
      line('line-3', 'Rebar 12mm'),
    ],
    ...over,
  })
  const asOrganizer = () => {
    mockAuthUser = { id: 'user-organizer', role: 'user' }
  }
  const asProcurement = () => {
    mockAuthUser = { id: 'user-proc', role: 'user' }
  }
  // Every mutation resolves; the ones the tests inspect are told apart by operation name.
  function mutations() {
    const submit = vi.fn().mockResolvedValue({})
    const setOwner = vi.fn().mockResolvedValue({})
    mockUseMutation.mockImplementation((doc: unknown) => {
      const opName = (
        doc as { definitions?: { kind?: string; name?: { value?: string } }[] }
      ).definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      if (opName === 'SubmitRequisitionMarketPricing') return [submit, { loading: false }]
      if (opName === 'SetRequisitionLineOwner') return [setOwner, { loading: false }]
      return [vi.fn().mockResolvedValue({}), { loading: false }]
    })
    return { submit, setOwner }
  }
  const open = async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    return wrap(<RequisitionDetail />)
  }
  // The price boxes of the cards in the panel (the Lines table above has none).
  const priceBoxes = () => screen.queryAllByPlaceholderText('0.00')

  describe('the organizer without a procurement position', () => {
    it('sees the lines instead of the "only a procurement officer" message, and can take one', async () => {
      asOrganizer()
      mutations()
      mockReq(split({ callerHasMarketPricingPosition: false }))
      await open()
      expect(screen.queryByText(/only a procurement officer/i)).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /i'll handle this item/i })).toHaveLength(2)
    })

    it('takes a line with the right mutation arguments', async () => {
      asOrganizer()
      const { setOwner } = mutations()
      mockReq(split())
      await open()
      fireEvent.click(screen.getAllByRole('button', { name: /i'll handle this item/i })[0])
      expect(setOwner).toHaveBeenCalledWith({ variables: { lineId: 'line-2', byOwner: true } })
    })

    it('prices only the lines he took; the others say procurement prices them', async () => {
      asOrganizer()
      mutations()
      mockReq(split())
      await open()
      expect(priceBoxes()).toHaveLength(1)
      expect(screen.getAllByText(/procurement prices this item/i)).toHaveLength(2)
    })

    it('submits only his lines, as the organizer part, once each has a price', async () => {
      asOrganizer()
      const { submit } = mutations()
      mockReq(split())
      await open()
      const button = screen.getByRole('button', { name: /^submit my items$/i })
      expect(button).toBeDisabled()
      expect(screen.getByText(/enter a price for every item you took/i)).toBeInTheDocument()
      fireEvent.change(priceBoxes()[0], { target: { value: '12' } })
      expect(button).not.toBeDisabled()
      fireEvent.click(button)
      expect(submit).toHaveBeenCalledWith({
        variables: {
          id: 'req-1',
          side: 'OWNER',
          linePrices: [{ lineId: 'line-1', marketPrice: 12, currencyCode: 'IQD' }],
        },
      })
    })

    it("has no submit button for procurement's part", async () => {
      asOrganizer()
      mutations()
      mockReq(split())
      await open()
      expect(screen.queryByRole('button', { name: /procurement's items/i })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /submit to price verification/i }),
      ).not.toBeInTheDocument()
    })

    it('can hand a line back while it has no price, but not once it has one', async () => {
      asOrganizer()
      const { setOwner } = mutations()
      mockReq(
        split({
          lines: [
            line('line-1', 'Kitchen gloves', { owner_handles: true }),
            line('line-2', 'Dish soap', {
              owner_handles: true,
              market_price: '5',
              market_price_currency: 'IQD',
            }),
          ],
        }),
      )
      await open()
      const back = screen.getAllByRole('button', { name: /hand back to procurement/i })
      expect(back).toHaveLength(1)
      fireEvent.click(back[0])
      expect(setOwner).toHaveBeenCalledWith({ variables: { lineId: 'line-1', byOwner: false } })
    })

    it('cannot take a line that already has a market price', async () => {
      asOrganizer()
      mutations()
      mockReq(
        split({
          lines: [
            line('line-1', 'Cement bags', { market_price: '5', market_price_currency: 'IQD' }),
            line('line-2', 'Rebar'),
          ],
        }),
      )
      await open()
      expect(screen.getAllByRole('button', { name: /i'll handle this item/i })).toHaveLength(1)
    })

    it('after submitting, the button says Update and the progress shows his part as submitted', async () => {
      asOrganizer()
      mutations()
      mockReq(split({ owner_pricing_submitted_at: '2026-01-16T09:00:00.000Z' }))
      await open()
      expect(screen.getByRole('button', { name: /^update my items$/i })).toBeInTheDocument()
      const ownerRow = screen.getByText(/organizer's items: 1/i).closest('span') as HTMLElement
      expect(within(ownerRow).getByText('Submitted')).toBeInTheDocument()
      const procRow = screen.getByText(/procurement's items: 2/i).closest('span') as HTMLElement
      expect(within(procRow).getByText('Waiting')).toBeInTheDocument()
    })
  })

  it('an organizer without the position gets no Continue button when every line is covered from stock', async () => {
    asOrganizer()
    mutations()
    mockReq(
      split({ lines: [line('line-1', 'Fully from stock', { qty: '5', qty_from_stock: '5' })] }),
    )
    await open()
    expect(
      screen.getByText(/nothing on this requisition needs a market price/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /continue to price verification/i }),
    ).not.toBeInTheDocument()
  })

  describe('a stranger', () => {
    it('still sees only the message, with no way to take a line', async () => {
      mockAuthUser = { id: 'user-nobody', role: 'user' }
      mutations()
      mockReq(split({ organizer_id: 'someone-else' }))
      await open()
      expect(screen.getByText(/only a procurement officer/i)).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /i'll handle this item/i }),
      ).not.toBeInTheDocument()
      expect(priceBoxes()).toHaveLength(0)
    })
  })

  describe('procurement', () => {
    const procurement = (over: Record<string, unknown> = {}) =>
      split({ organizer_id: 'someone-else', callerHasMarketPricingPosition: true, ...over })

    it("prices every line, the organizer's included, and submits its own part without a side", async () => {
      asProcurement()
      const { submit } = mutations()
      mockReq(procurement())
      await open()
      expect(priceBoxes()).toHaveLength(3)
      const button = screen.getByRole('button', { name: /^submit procurement's items$/i })
      expect(button).toBeDisabled()
      fireEvent.change(priceBoxes()[1], { target: { value: '30' } })
      expect(button).toBeDisabled() // line 3 still blank
      fireEvent.change(priceBoxes()[2], { target: { value: '40' } })
      expect(button).not.toBeDisabled()
      fireEvent.click(button)
      expect(submit).toHaveBeenCalledWith({
        variables: {
          id: 'req-1',
          linePrices: [
            { lineId: 'line-2', marketPrice: 30, currencyCode: 'IQD' },
            { lineId: 'line-3', marketPrice: 40, currencyCode: 'IQD' },
          ],
        },
      })
    })

    it("can step in and submit the organizer's part for him", async () => {
      asProcurement()
      const { submit } = mutations()
      mockReq(procurement())
      await open()
      const button = screen.getByRole('button', { name: /^submit the organizer's items$/i })
      expect(button).toBeDisabled()
      fireEvent.change(priceBoxes()[0], { target: { value: '9' } })
      fireEvent.click(button)
      expect(submit).toHaveBeenCalledWith({
        variables: {
          id: 'req-1',
          side: 'OWNER',
          linePrices: [{ lineId: 'line-1', marketPrice: 9, currencyCode: 'IQD' }],
        },
      })
    })

    it('can take over a line the organizer took, even one that is already priced', async () => {
      asProcurement()
      const { setOwner } = mutations()
      mockReq(
        procurement({
          lines: [
            line('line-1', 'Kitchen gloves', {
              owner_handles: true,
              market_price: '5',
              market_price_currency: 'IQD',
            }),
            line('line-2', 'Cement bags'),
          ],
        }),
      )
      await open()
      fireEvent.click(screen.getByRole('button', { name: /^take over$/i }))
      expect(setOwner).toHaveBeenCalledWith({ variables: { lineId: 'line-1', byOwner: false } })
    })

    it('does not offer to push a line onto the organizer', async () => {
      asProcurement()
      mutations()
      mockReq(procurement())
      await open()
      expect(
        screen.queryByRole('button', { name: /i'll handle this item/i }),
      ).not.toBeInTheDocument()
    })

    it('has nothing to submit when the organizer took every line, and says it is waiting', async () => {
      asProcurement()
      mutations()
      mockReq(procurement({ lines: [line('line-1', 'Kitchen gloves', { owner_handles: true })] }))
      await open()
      expect(screen.getByText(/nothing is left for procurement/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /procurement's items/i })).not.toBeInTheDocument()
      const procRow = screen.getByText(/procurement's items: 0/i).closest('span') as HTMLElement
      expect(within(procRow).getByText('None')).toBeInTheDocument()
    })

    it('with nothing split keeps the single submit it always had, and no progress strip', async () => {
      asProcurement()
      mutations()
      mockReq(procurement({ lines: [line('line-1', 'Cement bags'), line('line-2', 'Rebar 12mm')] }))
      await open()
      expect(
        screen.getByRole('button', { name: /^submit to price verification$/i }),
      ).toBeInTheDocument()
      expect(screen.queryByText(/organizer's items:/i)).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /i'll handle this item/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('reads in Arabic without raw keys', async () => {
    await i18n.changeLanguage('ar')
    asOrganizer()
    mutations()
    mockReq(split({ owner_pricing_submitted_at: '2026-01-16T09:00:00.000Z' }))
    await open()
    expect(document.body.textContent).not.toMatch(/req\.(detail|bought)\./)
    expect(screen.getAllByText(/المسؤول عنه/).length).toBeGreaterThan(0)
    expect(screen.getByText(/تحديث بنودي/)).toBeInTheDocument()
  })
})

// Every line says who prices and buys it, in the Lines table, from Market pricing on (migration 315).
describe('RequisitionDetail: who handles each line', () => {
  afterEach(async () => {
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  const mk = (id: string, description: string, over: Record<string, unknown> = {}) => ({
    id,
    line_number: Number(id.replace('line-', '')),
    description,
    product_id: null,
    product_name: null,
    sku: null,
    qty: '2',
    uom: 'unit',
    currency_code: 'IQD',
    unit_price: '10',
    qty_from_stock: '0',
    store_price: null,
    market_price: null,
    verified_price: null,
    total: '20',
    purchases: [],
    owner_handles: false,
    ...over,
  })
  const lines = () => [
    mk('line-1', 'Kitchen gloves', { owner_handles: true }),
    mk('line-2', 'Cement bags'),
    mk('line-3', 'Fully from stock', { qty: '5', qty_from_stock: '5' }),
  ]
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
  const cellOf = (lineName: string, columnName: string) => {
    const headers = within(linesTable()).getAllByRole('columnheader')
    const at = headers.findIndex((h) => h.textContent === columnName)
    const row = within(linesTable()).getByText(lineName).closest('tr')
    if (!row) throw new Error('row not found')
    return within(row).getAllByRole('cell')[at]
  }

  it('marks each line Organizer or Procurement, and a line covered from stock with a dash', async () => {
    mockReq({ status: 'market_pricing', lines: lines() })
    await open()
    expect(cellOf('Kitchen gloves', 'Handled by')).toHaveTextContent('Organizer')
    expect(cellOf('Kitchen gloves', 'Handled by')).not.toHaveTextContent('Procurement')
    expect(cellOf('Cement bags', 'Handled by')).toHaveTextContent('Procurement')
    expect(cellOf('Cement bags', 'Handled by')).not.toHaveTextContent('Organizer')
    expect(cellOf('Fully from stock', 'Handled by')).toHaveTextContent(/^—$/)
  })

  it('sits right after Item, ahead of the numbers', async () => {
    mockReq({ status: 'market_pricing', lines: lines() })
    await open()
    const names = within(linesTable())
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(names.indexOf('Handled by')).toBe(names.indexOf('Item') + 1)
    expect(names.indexOf('Handled by')).toBeLessThan(names.indexOf('Qty'))
  })

  it('names the organizer under his lines', async () => {
    mockReq({ status: 'market_pricing', lines: lines() })
    await open()
    expect(within(cellOf('Kitchen gloves', 'Handled by')).getByText('Jane Doe')).toBeInTheDocument()
    expect(cellOf('Cement bags', 'Handled by')).not.toHaveTextContent('Jane Doe')
  })

  it("names the procurement officer under procurement's lines once procurement has submitted its part", async () => {
    mockReq({ status: 'price_verification', procurementOfficerName: 'Ahmed Ali', lines: lines() })
    await open()
    expect(within(cellOf('Cement bags', 'Handled by')).getByText('Ahmed Ali')).toBeInTheDocument()
    expect(cellOf('Kitchen gloves', 'Handled by')).not.toHaveTextContent('Ahmed Ali')
  })

  it('names nobody for a procurement line before procurement has submitted: the marker stands alone', async () => {
    mockReq({ status: 'market_pricing', procurementOfficerName: null, lines: lines() })
    await open()
    // While pricing, the cell also carries the organizer's "take this line" button; the marker is
    // still the only thing that is not a button, so no name appears next to it.
    const cell = cellOf('Cement bags', 'Handled by')
    expect(cell.textContent.replace("I'll handle this item", '')).toBe('Procurement')
  })

  it('names whoever recorded the purchase, even on a line the organizer took (procurement stepping in)', async () => {
    const bought = (name: string) => [
      {
        id: 'p-' + name,
        vendor_id: 'v-1',
        vendor_name: 'Al-Rasheed',
        currency_code: 'IQD',
        qty: '2',
        actual_unit_price: '10',
        bought_at: '2026-01-02T00:00:00.000Z',
        bought_by_name: name,
        over_tolerance: false,
      },
    ]
    mockReq({
      status: 'items_bought',
      procurementOfficerName: 'Ahmed Ali',
      lines: [
        mk('line-1', 'Kitchen gloves', { owner_handles: true, purchases: bought('Sara Hassan') }),
        mk('line-2', 'Cement bags', { purchases: bought('Omar Khalid') }),
      ],
    })
    await open()
    const gloves = cellOf('Kitchen gloves', 'Handled by')
    expect(gloves).toHaveTextContent('Organizer')
    expect(within(gloves).getByText('Sara Hassan')).toBeInTheDocument()
    expect(gloves).not.toHaveTextContent('Jane Doe')
    const cement = cellOf('Cement bags', 'Handled by')
    expect(within(cement).getByText('Omar Khalid')).toBeInTheDocument()
    expect(cement).not.toHaveTextContent('Ahmed Ali')
  })

  // Market pricing used to repeat the marker in a card beside the table; the prices are typed in
  // the table now, so the one marker is the Handled by cell, name included.
  it('keeps the name in the Handled by cell while prices are being entered, with no second marker', async () => {
    mockReq({ status: 'market_pricing', lines: lines() })
    await open()
    expect(within(cellOf('Kitchen gloves', 'Handled by')).getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.queryByText('Handled by: Organizer · Jane Doe')).not.toBeInTheDocument()
  })

  it.each(['draft', 'inventory_check', 'store_pricing'])(
    'has no such column at %s: nothing is decided yet',
    async (status) => {
      mockReq({ status, lines: lines() })
      await open()
      expect(header('Handled by')).toBeNull()
    },
  )

  it.each([
    'market_pricing',
    'price_verification',
    'pending_approval',
    'approved',
    'items_bought',
    'sourcing',
    'completed',
  ])('shows it at %s', async (status) => {
    mockReq({ status, lines: lines() })
    await open()
    expect(header('Handled by')).toBeInTheDocument()
    expect(cellOf('Kitchen gloves', 'Handled by')).toHaveTextContent('Organizer')
  })

  it('is in the Columns menu, on by default, and can be switched off without touching Item', async () => {
    mockReq({ status: 'items_bought', lines: lines() })
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    expect(screen.getByRole('checkbox', { name: 'Handled by' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Handled by' }))
    expect(header('Handled by')).toBeNull()
    expect(header('Item')).toBeInTheDocument()
  })

  it('reads in Arabic without raw keys', async () => {
    await i18n.changeLanguage('ar')
    mockReq({ status: 'market_pricing', lines: lines() })
    await open()
    const table = screen
      .getAllByRole('table')
      .find((el) => within(el).queryByRole('columnheader', { name: 'المسؤول عنه' }))
    if (!table) throw new Error('lines table not found')
    expect(within(table).getByText('المُنشئ')).toBeInTheDocument()
    expect(within(table).getByText('المشتريات')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/req\.(detail|bought)\./)
  })
})

// A requisition can wait in Items Bought for the organizer's approval of what a marked buyer bought (migration 316); the
// detail page says so, next to the way into the Items Bought screen.
describe('RequisitionDetail: waiting for the organizer’s approval', () => {
  const purchase = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    vendor_id: 'v-1',
    vendor_name: 'Al-Rasheed',
    currency_code: 'IQD',
    qty: '2',
    actual_unit_price: '10',
    bought_at: '2026-01-02T00:00:00.000Z',
    bought_by_name: 'Marked Buyer',
    over_tolerance: false,
    needs_organizer_approval: true,
    organizer_approved_by: null,
    ...over,
  })
  const withPurchases = (purchases: Record<string, unknown>[]) => [
    {
      id: 'line-1',
      line_number: 1,
      description: 'Kitchen gloves',
      product_id: null,
      product_name: null,
      sku: null,
      qty: '2',
      uom: 'unit',
      currency_code: 'IQD',
      unit_price: '10',
      qty_from_stock: '0',
      store_price: null,
      market_price: null,
      verified_price: null,
      total: '20',
      owner_handles: false,
      purchases,
    },
  ]
  const open = async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    return wrap(<RequisitionDetail />)
  }

  it('says how many purchases are waiting', async () => {
    mockReq({ status: 'items_bought', lines: withPurchases([purchase('p-1'), purchase('p-2')]) })
    await open()
    expect(
      screen.getByText("Waiting for the organizer's approval on 2 purchase(s)."),
    ).toBeInTheDocument()
  })

  it('counts only the ones still waiting', async () => {
    mockReq({
      status: 'items_bought',
      lines: withPurchases([purchase('p-1', { organizer_approved_by: 'u-org' }), purchase('p-2')]),
    })
    await open()
    expect(
      screen.getByText("Waiting for the organizer's approval on 1 purchase(s)."),
    ).toBeInTheDocument()
  })

  it('says nothing when every purchase is approved, or none needed it', async () => {
    mockReq({
      status: 'items_bought',
      lines: withPurchases([
        purchase('p-1', { organizer_approved_by: 'u-org' }),
        purchase('p-2', { needs_organizer_approval: false }),
      ]),
    })
    await open()
    expect(screen.queryByText(/Waiting for the organizer's approval/)).not.toBeInTheDocument()
  })

  it.each(['approved', 'sourcing', 'completed'])(
    'says nothing at %s, whatever the purchase rows say',
    async (status) => {
      mockReq({ status, lines: withPurchases([purchase('p-1')]) })
      await open()
      expect(screen.queryByText(/Waiting for the organizer's approval/)).not.toBeInTheDocument()
    },
  )
})

// Step 1 of the requisition redesign: the five-phase progress bar and the shorter Summary.
describe('RequisitionDetail progress bar and Summary', () => {
  const open = async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    wrap(<RequisitionDetail />)
  }

  it.each([
    ['draft', 'Prepare · Draft', 'Step 1 of 5'],
    ['inventory_check', 'Prepare · Inventory check', 'Step 1 of 5'],
    ['market_pricing', 'Price · Market pricing', 'Step 2 of 5'],
    ['pending_approval', 'Approve · Pending approval', 'Step 3 of 5'],
    ['items_bought', 'Buy · Items bought', 'Step 4 of 5'],
    ['completed', 'Done · Completed', 'Step 5 of 5'],
  ])('at %s the progress bar reads "%s" and "%s"', async (status, text, step) => {
    mockReq({ status })
    await open()
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByText(step)).toBeInTheDocument()
  })

  it('shows a rejected requisition by its status with no step count', async () => {
    mockReq({ status: 'rejected' })
    await open()
    // The header badge and the bar both say it.
    expect(screen.getAllByText('Rejected').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(/^Step \d of 5$/)).not.toBeInTheDocument()
  })

  it('shows the total, priority, expected delivery, project and organizer without opening anything', async () => {
    mockReq({
      priority: 'high',
      project_id: 'proj-1',
      projectCode: 'PRJ-004',
      projectName: 'Tower A',
      expected_delivery_date: '2026-06-15T00:00:00.000Z',
    })
    await open()
    // "Total" is also a Lines-table column header, and the one line's own total reads the same.
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    expect(screen.getAllByText('500 IQD').length).toBeGreaterThan(0)
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Expected Delivery')).toBeInTheDocument()
    expect(screen.getByText('2026-06-15')).toBeInTheDocument()
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByText('PRJ-004 — Tower A')).toBeInTheDocument()
    expect(screen.getByText('Organizer')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('keeps branch, received by and created behind "All details" until it is opened', async () => {
    mockReq({ assigned_receiver_name: 'Sam Receiver' })
    await open()
    expect(screen.queryByText('Main Branch')).not.toBeInTheDocument()
    expect(screen.queryByText('Sam Receiver')).not.toBeInTheDocument()
    expect(screen.queryByText('2026-01-15')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /all details/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)

    expect(screen.getByText('Main Branch')).toBeInTheDocument()
    expect(screen.getByText('Sam Receiver')).toBeInTheDocument()
    expect(screen.getByText('2026-01-15')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide details/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: /hide details/i }))
    expect(screen.queryByText('Main Branch')).not.toBeInTheDocument()
  })

  it('shows the manufacturing order only when there is one, and only under "All details"', async () => {
    mockReq({ linkedMoNumber: 'MO-0077' })
    await open()
    expect(screen.queryByText('MO-0077')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /all details/i }))
    expect(screen.getByText('MO-0077')).toBeInTheDocument()
  })

  it('has no manufacturing order field when the requisition has none', async () => {
    mockReq()
    await open()
    fireEvent.click(screen.getByRole('button', { name: /all details/i }))
    expect(screen.queryByText('Manufacturing Order')).not.toBeInTheDocument()
  })

  it('draws the Summary labels in the secondary grey and the values in the main text colour, not the pale muted grey', async () => {
    mockReq({ priority: 'high' })
    await open()
    expect(screen.getByText('Priority')).toHaveStyle({ color: themes['light-flat'].textSecondary })
    expect(screen.getByText('High')).toHaveStyle({ color: themes['light-flat'].textPrimary })
    expect(screen.getByText('Priority')).not.toHaveStyle({ color: themes['light-flat'].textMuted })
  })

  it('shows the priority name in Arabic, as the other screens do', async () => {
    mockReq({ priority: 'high' })
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    try {
      await open()
      expect(screen.getByText('عالية')).toBeInTheDocument()
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })
})

// The three pricing steps are filled in on the Lines table itself (a price box in the cell of the line
// it belongs to), and the step's button sits in a bar at the bottom of the page. The side panel with its
// own copy of every line is gone. Who may type, and what each button sends, are the old panels' rules.
describe('RequisitionDetail: prices typed on the lines, the action in a bar', () => {
  const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  }
  afterEach(async () => {
    setWidth(1024)
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  const mk = (id: string, description: string, over: Record<string, unknown> = {}) => ({
    id,
    line_number: Number(id.replace('line-', '')),
    description,
    product_id: null,
    product_name: null,
    sku: null,
    qty: '2',
    uom: 'unit',
    currency_code: 'IQD',
    unit_price: '0',
    qty_from_stock: '0',
    store_price: null,
    market_price: null,
    verified_price: null,
    total: '0',
    purchases: [],
    owner_handles: false,
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
  const cellOf = (lineName: string, columnName: string) => {
    const headers = within(linesTable()).getAllByRole('columnheader')
    const at = headers.findIndex((h) => h.textContent === columnName)
    if (at < 0) throw new Error(`no column ${columnName}`)
    const row = within(linesTable()).getByText(lineName).closest('tr')
    if (!row) throw new Error('row not found')
    return within(row).getAllByRole('cell')[at]
  }
  const boxIn = (lineName: string, columnName: string) =>
    within(cellOf(lineName, columnName)).getByRole<HTMLInputElement>('spinbutton')
  const bar = (name: RegExp) => screen.getByRole('region', { name })
  const stranger = () => {
    mockAuthUser = { id: 'user-nobody', role: 'user' }
  }

  describe('store pricing', () => {
    const fixture = () => {
      mockReq({
        status: 'store_pricing',
        callerHasStorePricingPosition: true,
        lines: [
          mk('line-1', 'Cement bags', {
            qty: '5',
            qty_from_stock: '3',
            source_location_name: 'Main Warehouse',
            source_average_cost: 12,
          }),
          mk('line-2', 'Rebar'),
        ],
      })
    }

    it('puts the price box in the Store price cell of a line with stock, ready with the last cost', async () => {
      fixture()
      await open()
      expect(boxIn('Cement bags', 'Store price').value).toBe('12')
      expect(
        within(cellOf('Cement bags', 'Store price')).getByText(/Main Warehouse/),
      ).toBeInTheDocument()
    })

    it('gives a line with no stock in it no box: there is nothing to price', async () => {
      fixture()
      await open()
      expect(
        within(cellOf('Rebar', 'Store price')).queryByRole('spinbutton'),
      ).not.toBeInTheDocument()
    })

    it('submits from the bar, with the price typed in the table', async () => {
      const submitMock = vi.fn().mockResolvedValue({})
      mockUseMutation.mockReturnValue([submitMock, { loading: false }])
      fixture()
      await open()
      fireEvent.change(boxIn('Cement bags', 'Store price'), { target: { value: '15' } })
      fireEvent.click(
        within(bar(/next step: store pricing/i)).getByRole('button', {
          name: /submit to market pricing/i,
        }),
      )
      expect(submitMock).toHaveBeenCalledWith({
        variables: {
          id: 'req-1',
          linePrices: [{ lineId: 'line-1', storePrice: 15, currencyCode: 'IQD' }],
        },
      })
    })

    it('shows someone without the position no box and no button, only why', async () => {
      stranger()
      mockReq({
        status: 'store_pricing',
        organizer_id: 'someone-else',
        lines: [mk('line-1', 'Cement bags', { qty: '5', qty_from_stock: '3' })],
      })
      await open()
      expect(within(linesTable()).queryByRole('spinbutton')).not.toBeInTheDocument()
      const b = bar(/next step: store pricing/i)
      expect(within(b).queryByRole('button')).not.toBeInTheDocument()
      expect(within(b).getByText(/only someone holding the store pricing/i)).toBeInTheDocument()
    })
  })

  describe('market pricing', () => {
    const fixture = (over: Record<string, unknown> = {}) => {
      mockReq({
        status: 'market_pricing',
        callerHasMarketPricingPosition: true,
        lines: [mk('line-1', 'Cement bags', { qty: '5' }), mk('line-2', 'Rebar 12mm')],
        ...over,
      })
    }

    it('keeps every price box inside the Lines table: nothing is left in a side panel', async () => {
      fixture()
      await open()
      const boxes = screen.getAllByPlaceholderText('0.00')
      expect(boxes).toHaveLength(2)
      for (const box of boxes) expect(linesTable().contains(box)).toBe(true)
      expect(boxIn('Cement bags', 'Market price')).toBe(boxes[0])
    })

    it('has one place that says what the step is: the bar, not a second card', async () => {
      fixture()
      await open()
      expect(screen.getAllByText('Next step: market pricing')).toHaveLength(1)
      expect(bar(/next step: market pricing/i)).toBeInTheDocument()
    })

    it('holds the submit button in the bar, not in the table', async () => {
      fixture()
      await open()
      const submit = screen.getByRole('button', { name: /^submit to price verification$/i })
      expect(bar(/next step: market pricing/i).contains(submit)).toBe(true)
      expect(linesTable().contains(submit)).toBe(false)
    })

    it('marks a blank price box invalid and the bar says what is missing, until every line has a price', async () => {
      fixture()
      await open()
      const first = boxIn('Cement bags', 'Market price')
      expect(first).toHaveAttribute('aria-invalid', 'true')
      expect(
        within(bar(/next step: market pricing/i)).getByText(/enter a price for every line/i),
      ).toBeInTheDocument()
      fireEvent.change(first, { target: { value: '150' } })
      expect(first).not.toHaveAttribute('aria-invalid')
      expect(boxIn('Rebar 12mm', 'Market price')).toHaveAttribute('aria-invalid', 'true')
    })

    it('says what the quote is for under the box: the quantity to buy, and how stock splits it', async () => {
      fixture({ lines: [mk('line-1', 'Cement bags', { qty: '8', qty_from_stock: '3' })] })
      await open()
      const cell = cellOf('Cement bags', 'Market price')
      expect(within(cell).getByText('Qty to buy: 5 unit')).toBeInTheDocument()
      expect(within(cell).getByText('8 requested, 3 from stock')).toBeInTheDocument()
    })

    it('does not let the entry columns be switched off, or the step would have nowhere to type', async () => {
      fixture()
      await open()
      fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
      for (const name of ['Market price', 'Handled by']) {
        const box = screen.getByRole('checkbox', { name })
        expect(box).toBeChecked()
        expect(box).toBeDisabled()
      }
    })

    it('leaves that column switch-off-able once the step is over', async () => {
      mockReq({
        status: 'items_bought',
        lines: [mk('line-1', 'Cement bags', { market_price: '5', market_price_currency: 'IQD' })],
      })
      await open()
      fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
      expect(screen.getByRole('checkbox', { name: 'Market price' })).not.toBeDisabled()
    })

    it('shows someone who may not price no box, and only the reason in the bar', async () => {
      stranger()
      fixture({ organizer_id: 'someone-else', callerHasMarketPricingPosition: false })
      await open()
      expect(within(linesTable()).queryByRole('spinbutton')).not.toBeInTheDocument()
      const b = bar(/next step: market pricing/i)
      expect(within(b).queryByRole('button')).not.toBeInTheDocument()
      expect(within(b).getByText(/only a procurement officer/i)).toBeInTheDocument()
    })

    // Taking a line or handing it back is a Market pricing decision; the cell carries those buttons only
    // while that step is open, even though the rule behind them (no price yet) can still hold later.
    it.each(['price_verification', 'items_bought'])(
      'offers no take or hand-back button at %s',
      async (status) => {
        mockReq({
          status,
          callerHasMarketPricingPosition: true,
          callerHasPriceVerificationPosition: true,
          lines: [
            mk('line-1', 'Cement bags', { qty: '5' }),
            mk('line-2', 'Kitchen gloves', { owner_handles: true }),
          ],
        })
        await open()
        expect(
          screen.queryByRole('button', {
            name: /i'll handle this item|hand back to procurement|take over/i,
          }),
        ).not.toBeInTheDocument()
      },
    )

    it('puts "I\'ll handle this item" in the Handled by cell of the line, for the organizer', async () => {
      mockAuthUser = { id: 'user-organizer', role: 'user' }
      fixture({ callerHasMarketPricingPosition: false })
      await open()
      const take = within(cellOf('Cement bags', 'Handled by')).getByRole('button', {
        name: /i'll handle this item/i,
      })
      expect(take).toBeInTheDocument()
      expect(bar(/next step: market pricing/i).contains(take)).toBe(false)
    })
  })

  describe('price verification', () => {
    const fixture = (over: Record<string, unknown> = {}) => {
      mockReq({
        status: 'price_verification',
        callerHasPriceVerificationPosition: true,
        lines: [
          mk('line-1', 'Cement bags', {
            qty: '5',
            market_price: 100,
            market_price_currency: 'IQD',
          }),
        ],
        ...over,
      })
    }

    it('puts the box in the Verified price cell, ready with the market price', async () => {
      fixture()
      await open()
      expect(boxIn('Cement bags', 'Verified price').value).toBe('100')
    })

    it('sends the adjusted price from the bar', async () => {
      const verifyMock = vi.fn().mockResolvedValue({})
      mockUseMutation.mockReturnValue([verifyMock, { loading: false }])
      fixture()
      await open()
      fireEvent.change(boxIn('Cement bags', 'Verified price'), { target: { value: '90' } })
      fireEvent.click(
        within(bar(/next step: verify prices/i)).getByRole('button', {
          name: /^submit for approval$/i,
        }),
      )
      expect(verifyMock).toHaveBeenCalledWith({
        variables: { id: 'req-1', lineAdjustments: [{ lineId: 'line-1', verifiedPrice: 90 }] },
      })
    })

    it('asks for no box and no Send back from someone who may not verify', async () => {
      stranger()
      fixture({ organizer_id: 'someone-else', callerHasPriceVerificationPosition: false })
      await open()
      expect(within(linesTable()).queryByRole('spinbutton')).not.toBeInTheDocument()
      expect(within(bar(/next step: verify prices/i)).queryByRole('button')).not.toBeInTheDocument()
      expect(
        within(bar(/next step: verify prices/i)).getByText(/only a procurement 2nd/i),
      ).toBeInTheDocument()
    })
  })

  describe('draft', () => {
    it('holds Submit for inventory check in the bar for the organizer', async () => {
      mockReq({ status: 'draft' })
      await open()
      expect(
        within(bar(/next step: submit for inventory check/i)).getByRole('button', {
          name: /submit for inventory check/i,
        }),
      ).toBeInTheDocument()
    })

    it('says who can submit, and offers no button, to anyone else', async () => {
      stranger()
      mockReq({ status: 'draft', organizer_id: 'someone-else' })
      await open()
      const b = bar(/next step: submit for inventory check/i)
      expect(within(b).queryByRole('button')).not.toBeInTheDocument()
      expect(within(b).getByText(/only the organizer or an admin/i)).toBeInTheDocument()
    })
  })

  it('on a phone, each line is a card with the label above every value and the price box full width', async () => {
    setWidth(390)
    mockReq({
      status: 'market_pricing',
      callerHasMarketPricingPosition: true,
      lines: [mk('line-1', 'Cement bags', { qty: '5' })],
    })
    await open()
    expect(screen.getAllByText('Market price').some((el) => el.tagName === 'DT')).toBe(true)
    expect(screen.getByLabelText(/^Market price: Cement bags$/)).toHaveStyle({ width: '100%' })
    expect(screen.getByText('Cement bags')).toBeInTheDocument()
    // the table's own "More" button (the header's "More actions" menu is a different thing)
    expect(
      screen
        .queryAllByRole('button', { name: /more/i })
        .filter((b) => b.getAttribute('aria-label') !== 'More actions'),
    ).toHaveLength(0)
  })

  it('on a phone, the step button is fixed above the bottom navigation', async () => {
    setWidth(390)
    mockReq({
      status: 'market_pricing',
      callerHasMarketPricingPosition: true,
      lines: [mk('line-1', 'Cement bags', { qty: '5' })],
    })
    await open()
    const b = bar(/next step: market pricing/i)
    expect(b).toHaveStyle({ position: 'fixed' })
    expect(
      within(b).getByRole('button', { name: /submit to price verification/i }),
    ).toBeInTheDocument()
  })

  // With the prices on the lines there is no side panel, and an empty column would still take its share
  // of the width and squeeze the table.
  const sideColumn = () =>
    Array.from(document.querySelectorAll('div')).find((el) => el.style.flex === '1 1 100%')

  it('leaves no empty side column beside the table while the step is done on the lines', async () => {
    mockReq({
      status: 'market_pricing',
      callerHasMarketPricingPosition: true,
      lines: [mk('line-1', 'Cement bags', { qty: '5' })],
    })
    await open()
    expect(sideColumn()).toHaveStyle({ display: 'none' })
  })

  it('keeps the side column, now a full-width row under the lines, when there is something in it', async () => {
    mockReq(
      { status: 'sourcing' },
      [],
      [],
      [
        {
          id: 'mi-1',
          issueNumber: 'SO-1',
          status: 'issued',
          poNumber: null,
          requisitionId: 'req-1',
          lines: [],
        },
      ],
    )
    await open()
    expect(sideColumn()).toBeDefined()
    expect(sideColumn()).not.toHaveStyle({ display: 'none' })
  })

  it('reads in Arabic without raw keys', async () => {
    await i18n.changeLanguage('ar')
    mockReq({
      status: 'market_pricing',
      callerHasMarketPricingPosition: true,
      lines: [mk('line-1', 'Cement bags', { qty: '5', qty_from_stock: '2' })],
    })
    await open()
    expect(document.body.textContent).not.toMatch(/req\.(detail|bought|phase)\./)
    expect(screen.getAllByRole('region').length).toBeGreaterThan(0)
  })
})

// The Log tab reads as a timeline, and on a phone Print and Cancel sit behind one "⋯" menu in the header.
describe('RequisitionDetail: activity timeline and the phone header menu', () => {
  const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  }
  afterEach(async () => {
    setWidth(1024)
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })
  const open = async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    return wrap(<RequisitionDetail />)
  }
  const logEntry = (over: Record<string, unknown> = {}) => ({
    id: 'log-1',
    from_status: 'draft',
    to_status: 'inventory_check',
    action: 'submit_to_inventory_check',
    actor_id: 'user-organizer',
    actor_name: 'Sara Hassan',
    actor_position: 'store_keeper',
    notes: null,
    created_at: '2026-01-16T09:30:00.000Z',
    ...over,
  })
  const openLog = (name: string | RegExp = /^log$/i) => {
    fireEvent.click(screen.getByRole('button', { name }))
  }
  // The phase bar at the top of the page is a list too, so the timeline is found by its name.
  const timeline = () => screen.getByRole('list', { name: 'Approval Log' })

  describe('Log tab', () => {
    it('lists each entry as a step with a sentence, who did it, and when', async () => {
      mockReq({
        approval_log: [
          logEntry(),
          logEntry({
            id: 'log-2',
            action: 'confirm_inventory_check',
            created_at: '2026-01-16T10:00:00.000Z',
          }),
        ],
      })
      await open()
      openLog()
      const items = within(timeline()).getAllByRole('listitem')
      expect(items).toHaveLength(2)
      expect(within(items[0]).getByText('Submitted for inventory check')).toBeInTheDocument()
      expect(within(items[0]).getByText(/Sara Hassan \(store_keeper\)/)).toBeInTheDocument()
      expect(within(items[0]).getByText('2026-01-16 09:30')).toBeInTheDocument()
      expect(within(items[1]).getByText('Confirmed the inventory check')).toBeInTheDocument()
    })

    it('shows a rejection with its reason under the step', async () => {
      mockReq({
        approval_log: [
          logEntry({ action: 'reject_to_market_pricing', notes: 'Prices look too high' }),
        ],
      })
      await open()
      openLog()
      const item = within(timeline()).getByRole('listitem')
      expect(within(item).getByText('Sent back to market pricing')).toBeInTheDocument()
      expect(within(item).getByText('Prices look too high')).toBeInTheDocument()
    })

    it('still says there is no activity when the log is empty, with no list', async () => {
      mockReq({ approval_log: [] })
      await open()
      openLog()
      expect(screen.getByText('No activity yet.')).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Approval Log' })).not.toBeInTheDocument()
    })

    it('keeps the requisition notes above the timeline, in the readable grey', async () => {
      mockReq({ notes: 'Urgent: client site is waiting', approval_log: [logEntry()] })
      await open()
      openLog()
      expect(screen.getByText('Urgent: client site is waiting')).toBeInTheDocument()
      expect(screen.getByText(/requisition notes/i)).toHaveStyle({
        color: themes['light-flat'].textSecondary,
      })
    })

    it('reads in Arabic with no raw key', async () => {
      await i18n.changeLanguage('ar')
      mockReq({ approval_log: [logEntry({ action: 'approve' })] })
      await open()
      openLog(i18n.t('req.detail.log'))
      expect(document.body.textContent).not.toMatch(/req\.(logAction|detail)\./)
      expect(screen.getByText(i18n.t('req.logAction.approve'))).toBeInTheDocument()
    })
  })

  describe('header actions', () => {
    it('on a desktop shows Print and Cancel as buttons and no menu', async () => {
      mockReq({ status: 'draft' })
      await open()
      expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
    })

    it('on a phone folds them into one "More actions" menu', async () => {
      setWidth(390)
      mockReq({ status: 'draft' })
      await open()
      expect(screen.queryByRole('button', { name: 'Print' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
        'Print',
        'Cancel requisition',
      ])
    })

    it('Print in the menu opens the print dialog', async () => {
      setWidth(390)
      mockReq({ status: 'draft' })
      await open()
      expect(screen.queryByText('Print Requisition — REQ-2026-001')).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Print' }))
      expect(screen.getByText('Print Requisition — REQ-2026-001')).toBeInTheDocument()
    })

    it('Cancel requisition in the menu opens the cancel box, and a second press closes it', async () => {
      setWidth(390)
      mockReq({ status: 'draft' })
      await open()
      const reason = /why is this requisition being cancelled/i
      expect(screen.queryByPlaceholderText(reason)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel requisition' }))
      expect(screen.getByPlaceholderText(reason)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel requisition' }))
      expect(screen.queryByPlaceholderText(reason)).not.toBeInTheDocument()
    })

    it('offers no Cancel to someone who may not cancel', async () => {
      setWidth(390)
      mockAuthUser = { id: 'user-nobody', role: 'user' }
      mockReq({ status: 'draft', organizer_id: 'someone-else' })
      await open()
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Print'])
    })

    it('offers no Cancel for a completed requisition, even to an admin', async () => {
      setWidth(390)
      mockReq({ status: 'completed' })
      await open()
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Print'])
    })
  })
})

// Send back: the Send back button in the bar of price verification and pending approval opens a dialog
// where the person chooses who gets the requisition next. It replaces the always-open "Not ready to
// approve?" card; the flags and reasons are still typed on the lines.
describe('RequisitionDetail: send back', () => {
  afterEach(async () => {
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  type Mutate = ReturnType<typeof vi.fn>
  type Opts = { onCompleted?: () => void } | undefined
  // One mock per GraphQL operation name, so each destination can be told apart.
  function mutationsByName() {
    const calls: Record<string, Mutate> = {}
    const options: Record<string, Opts> = {}
    mockUseMutation.mockImplementation((doc: unknown, opts?: Opts) => {
      const op =
        (doc as { definitions?: { kind?: string; name?: { value?: string } }[] }).definitions?.find(
          (d) => d.kind === 'OperationDefinition',
        )?.name?.value ?? ''
      calls[op] ??= vi.fn().mockResolvedValue({})
      options[op] = opts
      return [calls[op], { loading: false }]
    })
    return { calls, options }
  }
  const line = (id: string, description: string, over: Record<string, unknown> = {}) => ({
    id,
    line_number: Number(id.replace('line-', '')),
    description,
    product_id: null,
    product_name: null,
    sku: null,
    qty: '2',
    uom: 'unit',
    currency_code: 'IQD',
    unit_price: '10',
    qty_from_stock: '0',
    store_price: null,
    market_price: 10,
    market_price_currency: 'IQD',
    verified_price: null,
    total: '20',
    purchases: [],
    owner_handles: false,
    ...over,
  })
  const verification = (over: Record<string, unknown> = {}) => ({
    status: 'price_verification',
    callerHasPriceVerificationPosition: true,
    lines: [line('line-1', 'Cement bags'), line('line-2', 'Rebar 12mm')],
    ...over,
  })
  const approval = (over: Record<string, unknown> = {}) => ({
    status: 'pending_approval',
    callerCanApprove: true,
    lines: [line('line-1', 'Cement bags'), line('line-2', 'Rebar 12mm')],
    ...over,
  })
  const open = async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    return wrap(<RequisitionDetail />)
  }
  const bar = (name: RegExp) => screen.getByRole('region', { name })
  const sendBackButton = (name: RegExp) =>
    within(bar(name)).getByRole('button', { name: /^send back$/i })
  const VERIFY_BAR = /next step: verify prices/i
  const APPROVE_BAR = /next step: approve or reject/i
  // Tick the first line and say what is wrong with it.
  const flagFirstLine = (reason = 'Price is wrong') => {
    fireEvent.click(screen.getAllByRole('checkbox', { name: /flag this line/i })[0])
    fireEvent.change(screen.getByPlaceholderText(/what's wrong with this line/i), {
      target: { value: reason },
    })
  }
  const destination = (name: RegExp) => screen.getByRole('radio', { name })
  // The dialog is drawn after the page, so its buttons are the last ones with a name the page also has.
  const lastButton = (name: RegExp) => {
    const button = screen.getAllByRole('button', { name }).at(-1)
    if (!button) throw new Error('no such button')
    return button
  }
  const dialogTitle = () => screen.queryByText('Send REQ-2026-001 back')

  describe('the button', () => {
    it('is in the bar, disabled until a line is ticked and has a reason, and the bar says what is missing', async () => {
      mockReq(verification())
      await open()
      const button = sendBackButton(VERIFY_BAR)
      expect(button).toBeDisabled()
      expect(
        within(bar(VERIFY_BAR)).getByText('Tick a line and say what is wrong to send it back.'),
      ).toBeInTheDocument()

      fireEvent.click(screen.getAllByRole('checkbox', { name: /flag this line/i })[0])
      expect(button).toBeDisabled() // ticked, but no reason yet
      expect(
        within(bar(VERIFY_BAR)).getByText('Say what is wrong on each flagged line.'),
      ).toBeInTheDocument()

      fireEvent.change(screen.getByPlaceholderText(/what's wrong with this line/i), {
        target: { value: 'Price is wrong' },
      })
      expect(button).not.toBeDisabled()
      expect(within(bar(VERIFY_BAR)).getByText('1 line flagged')).toBeInTheDocument()
    })

    it('stays disabled when only the overall reason is typed: a line must be flagged', async () => {
      mockReq(approval())
      await open()
      expect(sendBackButton(APPROVE_BAR)).toBeDisabled()
    })

    it('is not offered to someone who may not act at that step', async () => {
      mockAuthUser = { id: 'user-nobody', role: 'user' }
      mockReq(approval({ organizer_id: 'someone-else', callerCanApprove: false }))
      await open()
      const b = bar(APPROVE_BAR)
      expect(within(b).queryByRole('button')).not.toBeInTheDocument()
      expect(within(b).getByText(/only the department head/i)).toBeInTheDocument()
    })

    it('is not offered at price verification to someone without the position', async () => {
      mockAuthUser = { id: 'user-nobody', role: 'user' }
      mockReq(
        verification({ organizer_id: 'someone-else', callerHasPriceVerificationPosition: false }),
      )
      await open()
      expect(within(bar(VERIFY_BAR)).queryByRole('button')).not.toBeInTheDocument()
      expect(screen.queryByText('Not ready to approve?')).not.toBeInTheDocument()
    })

    it('replaces the always-open reject card: nothing of it is left on the page', async () => {
      mockReq(verification())
      await open()
      expect(screen.queryByText('Not ready to approve?')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^reset to draft$/i })).not.toBeInTheDocument()
    })
  })

  describe('the dialog', () => {
    it('opens on the button, with nothing pre-selected and its confirm button disabled', async () => {
      mockReq(verification())
      await open()
      expect(dialogTitle()).not.toBeInTheDocument()
      flagFirstLine()
      fireEvent.click(sendBackButton(VERIFY_BAR))
      expect(dialogTitle()).toBeInTheDocument()
      for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
      expect(lastButton(/^send back$/i)).toBeDisabled()
    })

    it('lists the flagged line with its reason', async () => {
      mockReq(verification())
      await open()
      flagFirstLine('Price is wrong')
      fireEvent.click(sendBackButton(VERIFY_BAR))
      expect(screen.getByText('Flagged lines')).toBeInTheDocument()
      // The reason is also in the line's own note box, so look for the dialog's list item: the line's
      // name and its reason together (the phase bar is a list too, hence the text match).
      const item = screen
        .getAllByRole('listitem')
        .find(
          (li) =>
            li.textContent.includes('Cement bags') && li.textContent.includes('Price is wrong'),
        )
      expect(item).toBeDefined()
      // once in the bar and once under the dialog's title
      expect(screen.getAllByText('1 line flagged')).toHaveLength(2)
    })

    it('at price verification offers the four places it can go', async () => {
      mockReq(verification())
      await open()
      flagFirstLine()
      fireEvent.click(sendBackButton(VERIFY_BAR))
      expect(screen.getAllByRole('radio')).toHaveLength(4)
      for (const name of [/^Market pricing/, /^Store pricing/, /^Inventory check/, /^Draft/]) {
        expect(destination(name)).toBeInTheDocument()
      }
    })

    it('at pending approval offers three: there is no store pricing to go back to', async () => {
      mockReq(approval())
      await open()
      flagFirstLine()
      fireEvent.click(sendBackButton(APPROVE_BAR))
      expect(screen.getAllByRole('radio')).toHaveLength(3)
      expect(screen.queryByRole('radio', { name: /^Store pricing/ })).not.toBeInTheDocument()
    })

    it('names the chosen place on the confirm button', async () => {
      mockReq(verification())
      await open()
      flagFirstLine()
      fireEvent.click(sendBackButton(VERIFY_BAR))
      fireEvent.click(destination(/^Market pricing/))
      const confirm = screen.getByRole('button', { name: 'Send back to Market pricing' })
      expect(confirm).not.toBeDisabled()
    })

    it('Cancel closes it and keeps the flag and its reason', async () => {
      mockReq(verification())
      await open()
      flagFirstLine('Price is wrong')
      fireEvent.click(sendBackButton(VERIFY_BAR))
      fireEvent.click(lastButton(/^cancel$/i))
      expect(dialogTitle()).not.toBeInTheDocument()
      expect(screen.getByPlaceholderText(/what's wrong with this line/i)).toHaveValue(
        'Price is wrong',
      )
    })

    it('starts with nothing chosen every time it is opened', async () => {
      mockReq(verification())
      await open()
      flagFirstLine()
      fireEvent.click(sendBackButton(VERIFY_BAR))
      fireEvent.click(destination(/^Store pricing/))
      fireEvent.click(lastButton(/^cancel$/i))
      fireEvent.click(sendBackButton(VERIFY_BAR))
      for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
    })
  })

  describe('sending', () => {
    const payload = {
      id: 'req-1',
      reason: '• Cement bags: Price is wrong',
      lineFlags: [{ lineId: 'line-1', reason: 'Price is wrong' }],
    }

    it.each([
      [/^Market pricing/, 'RejectRequisitionVerificationToMarketPricing'],
      [/^Store pricing/, 'RejectRequisitionVerificationToStorePricing'],
      [/^Inventory check/, 'RejectRequisitionVerificationToInventoryCheck'],
      [/^Draft/, 'ResetRequisitionToDraft'],
    ])(
      'price verification: %s sends its own mutation, with the reasons of the flagged lines',
      async (place, op) => {
        const { calls } = mutationsByName()
        mockReq(verification())
        await open()
        flagFirstLine('Price is wrong')
        fireEvent.click(sendBackButton(VERIFY_BAR))
        fireEvent.click(destination(place))
        fireEvent.click(screen.getByRole('button', { name: /^send back to /i }))
        expect(calls[op]).toHaveBeenCalledTimes(1)
        expect(calls[op]).toHaveBeenCalledWith({ variables: payload })
        for (const [other, fn] of Object.entries(calls)) {
          if (other !== op && /Reject|Reset/.test(other)) expect(fn).not.toHaveBeenCalled()
        }
      },
    )

    it.each([
      [/^Market pricing/, 'RejectRequisitionToMarketPricing'],
      [/^Inventory check/, 'RejectRequisitionToInventoryCheck'],
      [/^Draft/, 'RejectRequisitionApproval'],
    ])('pending approval: %s sends its own mutation', async (place, op) => {
      const { calls } = mutationsByName()
      mockReq(approval())
      await open()
      flagFirstLine('Price is wrong')
      fireEvent.click(sendBackButton(APPROVE_BAR))
      fireEvent.click(destination(place))
      fireEvent.click(screen.getByRole('button', { name: /^send back to /i }))
      expect(calls[op]).toHaveBeenCalledTimes(1)
      expect(calls[op]).toHaveBeenCalledWith({ variables: payload })
    })

    it('an overall reason typed in the dialog is sent instead of the one built from the lines', async () => {
      const { calls } = mutationsByName()
      mockReq(verification())
      await open()
      flagFirstLine('Price is wrong')
      fireEvent.click(sendBackButton(VERIFY_BAR))
      fireEvent.change(screen.getByPlaceholderText('• Cement bags: Price is wrong'), {
        target: { value: 'Please re-quote everything' },
      })
      fireEvent.click(destination(/^Market pricing/))
      fireEvent.click(screen.getByRole('button', { name: /^send back to /i }))
      expect(calls.RejectRequisitionVerificationToMarketPricing).toHaveBeenCalledWith({
        variables: { ...payload, reason: 'Please re-quote everything' },
      })
    })

    it('hides the empty side column at pending approval: the step is done in the bar', async () => {
      mockReq(approval())
      await open()
      const side = Array.from(document.querySelectorAll('div')).find(
        (el) => el.style.flex === '1 1 100%',
      )
      expect(side).toHaveStyle({ display: 'none' })
    })

    it('Approve is in the bar and approves, with no reason asked', async () => {
      const { calls } = mutationsByName()
      mockReq(approval())
      await open()
      fireEvent.click(within(bar(APPROVE_BAR)).getByRole('button', { name: /^approve$/i }))
      expect(calls.ApproveRequisition).toHaveBeenCalledWith({ variables: { id: 'req-1' } })
      expect(dialogTitle()).not.toBeInTheDocument()
    })

    it('closes the dialog and clears the flags once the send back went through', async () => {
      const { options } = mutationsByName()
      mockReq(verification())
      await open()
      flagFirstLine('Price is wrong')
      fireEvent.click(sendBackButton(VERIFY_BAR))
      expect(dialogTitle()).toBeInTheDocument()
      act(() => {
        options.RejectRequisitionVerificationToMarketPricing?.onCompleted?.()
      })
      expect(dialogTitle()).not.toBeInTheDocument()
      expect(sendBackButton(VERIFY_BAR)).toBeDisabled()
    })
  })

  it('reads in Arabic with no raw key', async () => {
    await i18n.changeLanguage('ar')
    mockReq(verification())
    await open()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.change(screen.getByPlaceholderText(i18n.t('req.detail.whatSWrongWithThisLine')), {
      target: { value: 'Price is wrong' },
    })
    const arabicBar = screen.getByRole('region', {
      name: i18n.t('req.detail.nextStepVerifyPrices'),
    })
    fireEvent.click(
      within(arabicBar).getByRole('button', { name: i18n.t('req.detail.sendBackButton') }),
    )
    expect(document.body.textContent).not.toMatch(/req\.(detail|status)\./)
    expect(screen.getAllByRole('radio')).toHaveLength(4)
  })
})

// Inventory check on the lines: stock levels, the location to take from and the quantity are in the Lines
// table, and Confirm is in the bar. The rules (the most that can be taken, the draft kept in localStorage,
// what is sent) are the old panel's.
describe('RequisitionDetail: inventory check on the lines', () => {
  afterEach(async () => {
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  const availability = (over: Record<string, unknown> = {}) => ({
    lineId: 'line-1',
    qtyRequired: 5,
    qtyOnHand: 8,
    qtyAvailable: 3,
    isAvailable: false,
    byLocation: [
      {
        companyId: 'co-1',
        companyName: 'Main Co',
        locationId: 'loc-1',
        locationName: 'Main Warehouse',
        qtyOnHand: 8,
        qtyAvailable: 3,
      },
      {
        companyId: 'co-1',
        companyName: 'Main Co',
        locationId: 'loc-2',
        locationName: 'Site Store',
        qtyOnHand: 20,
        qtyAvailable: 20,
      },
    ],
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
  const storeKeeper = (lines?: Record<string, unknown>[], avail = [availability()]) => {
    mockReq(
      {
        status: 'inventory_check',
        callerHasStoreKeeperPosition: true,
        ...(lines ? { lines } : {}),
      },
      avail,
    )
  }
  const qtyBox = () => screen.getByLabelText<HTMLInputElement>(/^Qty from stock: Cement bags$/)
  const locationSelect = () =>
    screen.getByLabelText<HTMLSelectElement>(/^Source location: Cement bags$/)
  const INV_BAR = /next step: confirm stock availability/i

  it('puts the stock levels, the location and the quantity in the table, and nothing in a side panel', async () => {
    storeKeeper()
    await open()
    for (const name of ['In stock', 'Source location', 'From stock']) {
      expect(header(name)).toBeInTheDocument()
    }
    for (const box of [qtyBox(), locationSelect()]) expect(linesTable().contains(box)).toBe(true)
    expect(screen.getAllByText('Next step: confirm stock availability')).toHaveLength(1)
  })

  it('shows on hand, reserved and available for the line, reserved being on hand less available', async () => {
    storeKeeper()
    await open()
    const levels = within(linesTable()).getByText(/on hand/i).parentElement?.parentElement
    expect(levels).toHaveTextContent('On hand: 8')
    expect(levels).toHaveTextContent('Reserved: 5')
    expect(levels).toHaveTextContent('Available: 3')
  })

  it('offers every location that has the item, with what is available there, and none chosen to start', async () => {
    storeKeeper()
    await open()
    expect(locationSelect().value).toBe('')
    const options = within(locationSelect())
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual([
      'Source location',
      'Main Warehouse · Main Co — 3 avail.',
      'Site Store · Main Co — 20 avail.',
    ])
  })

  it('says so when no location has any of it, and offers no list', async () => {
    storeKeeper(undefined, [availability({ byLocation: [], qtyOnHand: 0, qtyAvailable: 0 })])
    await open()
    expect(screen.getByText(/no stock available at any location/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Source location: Cement bags$/)).not.toBeInTheDocument()
  })

  it('says it is loading while the stock levels have not arrived', async () => {
    storeKeeper(undefined, [])
    await open()
    expect(screen.getByText(/loading stock levels/i)).toBeInTheDocument()
  })

  it('stops the quantity at what the chosen location has', async () => {
    storeKeeper()
    await open()
    fireEvent.change(locationSelect(), { target: { value: 'loc-1' } })
    fireEvent.change(qtyBox(), { target: { value: '10' } })
    expect(qtyBox().value).toBe('3')
  })

  it('stops the quantity at what the line needs when no location is chosen', async () => {
    storeKeeper()
    await open()
    fireEvent.change(qtyBox(), { target: { value: '9' } })
    expect(qtyBox().value).toBe('5')
  })

  it('brings a quantity already typed down to a smaller location when it is chosen', async () => {
    storeKeeper()
    await open()
    fireEvent.change(qtyBox(), { target: { value: '5' } })
    fireEvent.change(locationSelect(), { target: { value: 'loc-1' } })
    expect(qtyBox().value).toBe('3')
  })

  it('does not let the quantity go below nothing, and an empty box stays empty', async () => {
    storeKeeper()
    await open()
    fireEvent.change(qtyBox(), { target: { value: '-4' } })
    expect(qtyBox().value).toBe('0')
    fireEvent.change(qtyBox(), { target: { value: '' } })
    expect(qtyBox().value).toBe('')
  })

  it('says how much is left to buy under the box', async () => {
    storeKeeper()
    await open()
    expect(within(linesTable()).getByText('Qty to buy: 5 bag')).toBeInTheDocument()
    fireEvent.change(qtyBox(), { target: { value: '2' } })
    expect(within(linesTable()).getByText('Qty to buy: 3 bag')).toBeInTheDocument()
  })

  it('counts, in the bar, the lines stock covers in full', async () => {
    storeKeeper()
    await open()
    const bar = screen.getByRole('region', { name: INV_BAR })
    expect(within(bar).getByText('0 of 1 lines covered from stock')).toBeInTheDocument()
    fireEvent.change(qtyBox(), { target: { value: '2' } })
    expect(within(bar).getByText('0 of 1 lines covered from stock')).toBeInTheDocument()
    fireEvent.change(qtyBox(), { target: { value: '5' } })
    expect(within(bar).getByText('1 of 1 lines covered from stock')).toBeInTheDocument()
  })

  it('confirms from the bar with the quantity and the location typed in the table', async () => {
    const confirmMock = vi.fn().mockResolvedValue({})
    mockUseMutation.mockReturnValue([confirmMock, { loading: false }])
    storeKeeper()
    await open()
    fireEvent.change(locationSelect(), { target: { value: 'loc-2' } })
    fireEvent.change(qtyBox(), { target: { value: '4' } })
    const bar = screen.getByRole('region', { name: INV_BAR })
    fireEvent.click(within(bar).getByRole('button', { name: /^confirm inventory check$/i }))
    expect(confirmMock).toHaveBeenCalledWith({
      variables: {
        id: 'req-1',
        lineStockQtys: [
          { lineId: 'line-1', qtyFromStock: 4, sourceLocationId: 'loc-2', productId: undefined },
        ],
      },
    })
  })

  it('sends no location when none was chosen, and a cleared choice is none again', async () => {
    const confirmMock = vi.fn().mockResolvedValue({})
    mockUseMutation.mockReturnValue([confirmMock, { loading: false }])
    storeKeeper()
    await open()
    fireEvent.change(locationSelect(), { target: { value: 'loc-1' } })
    fireEvent.change(locationSelect(), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^confirm inventory check$/i }))
    expect(confirmMock).toHaveBeenCalledTimes(1)
    expect(confirmMock).toHaveBeenCalledWith({
      variables: {
        id: 'req-1',
        lineStockQtys: [
          { lineId: 'line-1', qtyFromStock: 0, sourceLocationId: undefined, productId: undefined },
        ],
      },
    })
  })

  it('keeps the draft in localStorage with the location too', async () => {
    storeKeeper()
    await open()
    fireEvent.change(locationSelect(), { target: { value: 'loc-2' } })
    fireEvent.change(qtyBox(), { target: { value: '2' } })
    const raw = localStorage.getItem('fnc_inv_check_draft_req-1')
    expect(JSON.parse(raw ?? '{}')).toMatchObject({
      invQty: { 'line-1': '2' },
      invLoc: { 'line-1': 'loc-2' },
    })
  })

  it('offers "Wrong item? Reselect" in the item cell, and opens the item picker from it', async () => {
    storeKeeper()
    await open()
    const cell = within(linesTable()).getByText('Cement bags').closest('td') as HTMLElement
    expect(screen.queryByText('Correct item')).not.toBeInTheDocument()
    fireEvent.click(within(cell).getByRole('button', { name: /wrong item\? reselect/i }))
    expect(screen.getByText('Correct item')).toBeInTheDocument()
    fireEvent.click(within(cell).getByRole('button', { name: /wrong item\? reselect/i }))
    expect(screen.queryByText('Correct item')).not.toBeInTheDocument()
  })

  it('cannot hide the From stock column at this step, or there would be nowhere to type', async () => {
    storeKeeper()
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^Columns/ }))
    const box = screen.getByRole('checkbox', { name: 'From stock' })
    expect(box).toBeChecked()
    expect(box).toBeDisabled()
  })

  it('gives someone who may not confirm no box and no button, only the reason in the bar', async () => {
    mockAuthUser = { id: 'user-nobody', role: 'user' }
    mockReq(
      {
        status: 'inventory_check',
        organizer_id: 'someone-else',
        callerHasStoreKeeperPosition: false,
      },
      [availability()],
    )
    await open()
    expect(within(linesTable()).queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(header('In stock')).not.toBeInTheDocument()
    const bar = screen.getByRole('region', { name: INV_BAR })
    expect(within(bar).queryByRole('button')).not.toBeInTheDocument()
    expect(within(bar).getByText(/only the organizer, a store keeper/i)).toBeInTheDocument()
  })

  it('leaves the side column empty and hidden: the step is done on the lines', async () => {
    storeKeeper()
    await open()
    const side = Array.from(document.querySelectorAll('div')).find(
      (el) => el.style.flex === '1 1 100%',
    )
    expect(side).toHaveStyle({ display: 'none' })
  })

  it('reads in Arabic with no raw key', async () => {
    await i18n.changeLanguage('ar')
    storeKeeper()
    await open()
    expect(document.body.textContent).not.toMatch(/req\.(detail|status)\./)
    // the table is found by its English "Item" header elsewhere, so look the new header up directly
    expect(
      screen.getByRole('columnheader', { name: i18n.t('req.detail.inStock') }),
    ).toBeInTheDocument()
  })
})

// Approved, Items bought and Sourcing use the bar like every other step; Completed and the stopped states are a
// slim banner above the lines; the lines take the full width, and the cards about what the requisition made
// (purchase orders, Store Outs) sit under them, also full width.
describe('RequisitionDetail: the later steps', () => {
  const open = async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    return wrap(<RequisitionDetail />)
  }
  const sideColumn = () =>
    Array.from(document.querySelectorAll('div')).find((el) => el.style.flex === '1 1 100%')
  const linesTable = () => {
    const found = screen
      .getAllByRole('table')
      .find((el) => within(el).queryByRole('columnheader', { name: 'Item' }))
    if (!found) throw new Error('lines table not found')
    return found
  }
  const storeOut = {
    id: 'mi-1',
    issueNumber: 'NF-SO-2026-00227',
    status: 'issued',
    poNumber: null,
    requisitionId: 'req-1',
    lines: [],
  }
  const boughtLine = (over: Record<string, unknown> = {}) => ({
    ...baseReq().lines[0],
    purchases: [],
    ...over,
  })

  describe('Approved and Items bought', () => {
    it('approved: says buying starts next, in the bar, with nothing to press', async () => {
      mockReq({ status: 'approved' })
      await open()
      const bar = screen.getByRole('region', { name: /approved/i })
      expect(
        within(bar).getByText(/recording purchases per vendor happens on the items bought screen/i),
      ).toBeInTheDocument()
      expect(within(bar).queryByRole('button')).not.toBeInTheDocument()
    })

    it('items bought: Go to Items Bought is in the bar and opens that screen', async () => {
      mockReq({ status: 'items_bought' })
      await open()
      const bar = screen.getByRole('region', { name: /items bought in progress/i })
      fireEvent.click(within(bar).getByRole('button', { name: /go to items bought/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions/req-1/items-bought')
    })

    it('items bought: tells the organizer, in the bar, how many purchases wait for their approval', async () => {
      mockReq({
        status: 'items_bought',
        lines: [
          boughtLine({
            purchases: [
              { id: 'p-1', needs_organizer_approval: true, organizer_approved_by: null },
              { id: 'p-2', needs_organizer_approval: true, organizer_approved_by: 'someone' },
            ],
          }),
        ],
      })
      await open()
      const bar = screen.getByRole('region', { name: /items bought in progress/i })
      expect(
        within(bar).getByText("Waiting for the organizer's approval on 1 purchase(s)."),
      ).toBeInTheDocument()
    })

    it('says nothing about approvals when none wait', async () => {
      mockReq({ status: 'items_bought' })
      await open()
      expect(screen.queryByText(/waiting for the organizer's approval/i)).not.toBeInTheDocument()
    })

    it('has no panel beside the lines: the side column is hidden when there are no purchase orders or Store Outs', async () => {
      mockReq({ status: 'items_bought' })
      await open()
      expect(sideColumn()).toHaveStyle({ display: 'none' })
    })
  })

  describe('Sourcing', () => {
    it('says it is waiting on every line, in the bar', async () => {
      mockReq({ status: 'sourcing' })
      await open()
      const bar = screen.getByRole('region', { name: /sourcing/i })
      expect(within(bar).getByText(/waiting on every line to resolve/i)).toBeInTheDocument()
      expect(within(bar).queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('under the lines, full width', () => {
    it('shows the Store Outs in a row of its own after the lines table', async () => {
      mockReq({ status: 'sourcing' }, [], [], [storeOut])
      await open()
      const side = sideColumn()
      expect(side).toBeDefined()
      expect(side).not.toHaveStyle({ display: 'none' })
      expect(side).toHaveStyle({ order: '3' })
      expect(
        linesTable().compareDocumentPosition(side as HTMLElement) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      expect(within(side as HTMLElement).getByText('NF-SO-2026-00227')).toBeInTheDocument()
    })

    it('gives the lines the whole row: nothing is beside them', async () => {
      mockReq({ status: 'sourcing' }, [], [], [storeOut])
      await open()
      // the lines' column is the nearest ancestor drawn in the second slot of the row
      let column = linesTable().parentElement
      while (column && column.style.order !== '2') column = column.parentElement
      expect(column).not.toBeNull()
      expect(column?.style.flex).toContain('3 1')
      expect(sideColumn()?.style.flex).toBe('1 1 100%')
    })
  })

  describe('finished and stopped', () => {
    it('completed: a banner above the lines, no bar', async () => {
      mockReq({ status: 'completed' })
      await open()
      expect(screen.getByText(/every line on this requisition has/i)).toBeInTheDocument()
      expect(screen.queryAllByRole('region')).toHaveLength(0)
      expect(sideColumn()).toHaveStyle({ display: 'none' })
    })

    it.each(['rejected', 'cancelled'])(
      '%s: a banner that says it is no longer active, no bar',
      async (status) => {
        mockReq({ status })
        await open()
        expect(screen.getByText(/this requisition is no longer active/i)).toBeInTheDocument()
        expect(screen.queryAllByRole('region')).toHaveLength(0)
      },
    )

    it('draws the banner before the lines table', async () => {
      mockReq({ status: 'completed' })
      await open()
      const banner = screen.getByText(/every line on this requisition has/i)
      expect(
        banner.compareDocumentPosition(linesTable()) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it('an active requisition shows no such banner', async () => {
      mockReq({ status: 'items_bought' })
      await open()
      expect(screen.queryByText(/no longer active/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/every line on this requisition has/i)).not.toBeInTheDocument()
    })
  })

  it('reads in Arabic with no raw key', async () => {
    await i18n.changeLanguage('ar')
    mockReq({ status: 'items_bought' })
    await open()
    expect(document.body.textContent).not.toMatch(/req\.(detail|status)\./)
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })
})

// Phone: every requisition screen was a long scroll of chrome around the one thing a person came to do. The header is one
// row, the summary a compact block, a line a two-up card, and the bottom bar keeps only what blocks the step.
describe('RequisitionDetail on a phone: compact header, summary, lines and bar', () => {
  const setWidth = (w: number) => {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
  }
  afterEach(async () => {
    setWidth(1024)
    if (i18n.language !== 'en') {
      await act(async () => {
        await i18n.changeLanguage('en')
      })
    }
  })

  const mk = (id: string, description: string, over: Record<string, unknown> = {}) => ({
    id,
    line_number: Number(id.replace('line-', '')),
    description,
    product_id: null,
    product_name: null,
    sku: null,
    qty: '2',
    uom: 'unit',
    currency_code: 'IQD',
    unit_price: '0',
    qty_from_stock: '0',
    store_price: null,
    market_price: null,
    verified_price: null,
    total: '0',
    purchases: [],
    owner_handles: false,
    ...over,
  })
  const open = async () => {
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    return wrap(<RequisitionDetail />)
  }
  const marketing = (over: Record<string, unknown> = {}) => {
    mockReq({
      status: 'market_pricing',
      callerHasMarketPricingPosition: true,
      lines: [mk('line-1', 'Cement bags', { qty: '5' })],
      ...over,
    })
  }
  const bar = (name: RegExp) => screen.getByRole('region', { name })

  describe('the header', () => {
    it('is one row: a back arrow, the number, the status and the menu', async () => {
      setWidth(390)
      marketing()
      await open()
      const title = screen.getByRole('heading', { level: 1 })
      const row = title.parentElement?.parentElement?.parentElement
      expect(row).toBeTruthy()
      // the back control is an arrow named "Requisitions", with no text of its own on screen
      const back = screen.getByRole('button', { name: 'Requisitions' })
      expect(back.textContent).toBe('')
      expect(row).toContainElement(back)
      expect(row).toContainElement(screen.getByRole('button', { name: 'More actions' }))
      expect(row).toContainElement(screen.getByText('Market pricing', { selector: 'span' }))
    })

    it('the back arrow goes to the list', async () => {
      setWidth(390)
      marketing()
      await open()
      fireEvent.click(screen.getByRole('button', { name: 'Requisitions' }))
      expect(mockNavigate).toHaveBeenCalledWith('/procurement/requisitions')
    })

    it('on a desktop the back control is the long-standing text link', async () => {
      marketing()
      await open()
      expect(screen.getByRole('button', { name: /^requisitions$/i }).textContent).toMatch(
        /requisitions/i,
      )
    })
  })

  describe('the summary', () => {
    const placement = (label: string) => {
      const field = screen.getByText(label, { selector: 'dt' }).parentElement
      if (!field) throw new Error(`no field ${label}`)
      return field
    }

    it('puts Priority beside the total, the project across the card, then organizer and delivery side by side', async () => {
      setWidth(390)
      marketing()
      await open()
      expect(placement('Priority').style.order).toBe('2')
      expect(placement('Project').style.order).toBe('3')
      expect(placement('Project').style.gridColumn).toBe('1 / -1')
      expect(placement('Organizer').style.order).toBe('4')
      expect(placement('Expected Delivery').style.order).toBe('5')
    })

    it('on a desktop the fields are not reordered or stretched', async () => {
      marketing()
      await open()
      for (const label of ['Priority', 'Project', 'Organizer', 'Expected Delivery']) {
        expect(placement(label).style.order).toBe('')
        expect(placement(label).style.gridColumn).toBe('')
      }
    })

    it('"All details" is a quiet text link on a phone, and what it opens keeps its two columns', async () => {
      setWidth(390)
      marketing()
      await open()
      const toggle = screen.getByRole('button', { name: /all details/i })
      expect(toggle.style.border).not.toMatch(/1px/)
      expect(toggle.style.minHeight).toBe('44px')
      fireEvent.click(toggle)
      const dl = screen.getByText('Branch', { selector: 'dt' }).closest('dl')
      expect(dl).toHaveAttribute('data-phone-grid')
      expect(dl?.style.gridTemplateColumns).toContain('repeat(2')
    })

    it('on a desktop "All details" keeps its bordered button', async () => {
      marketing()
      await open()
      expect(screen.getByRole('button', { name: /all details/i }).style.border).toMatch(/1px/)
    })
  })

  describe('the lines', () => {
    const linesCard = () => {
      const card = screen
        .getByRole('button', { name: /^Columns/ })
        .closest<HTMLElement>('div[style*="border-radius: 14px"]')
      if (!card) throw new Error('lines card not found')
      return card
    }

    it('are not boxed a second time on a phone: each line is already a card', async () => {
      setWidth(390)
      marketing()
      await open()
      expect(linesCard()).toHaveStyle({ background: 'transparent', padding: '0px' })
      expect(linesCard().style.border).not.toMatch(/1px/)
    })

    it('on a desktop the lines keep their card', async () => {
      marketing()
      await open()
      expect(linesCard().style.background).not.toBe('transparent')
      expect(linesCard().style.border).toMatch(/1px/)
    })

    it('each phone card keeps two columns: the global one-column rule is switched off for it', async () => {
      setWidth(390)
      marketing()
      await open()
      const dl = screen.getByText('Qty', { selector: 'dt' }).closest('dl')
      expect(dl).toHaveAttribute('data-phone-grid')
      expect(dl?.style.gridTemplateColumns).toContain('repeat(2')
    })

    it('the Arabic name starts under the English one, in the readable grey, right-to-left only in its text', async () => {
      setWidth(390)
      marketing({ lines: [mk('line-1', 'Cement bags', { product_name_ar: 'أسمنت' })] })
      await open()
      const name = screen.getByText('أسمنت')
      expect(name.tagName).toBe('SPAN')
      expect(name).toHaveAttribute('dir', 'rtl')
      expect(name.parentElement).toHaveStyle({ textAlign: 'start' })
      expect(name.parentElement).not.toHaveAttribute('dir')
      expect(name).toHaveStyle({ color: themes['light-flat'].textSecondary })
    })

    it('the market price and its currency share one row on a phone', async () => {
      setWidth(390)
      marketing()
      await open()
      const price = screen.getByLabelText(/^Market price: Cement bags$/)
      const priceBox = price.parentElement
      if (!priceBox) throw new Error('the price box was not found')
      expect(priceBox.style.flex).toContain('120px')
      // the currency picker is the next sibling in the same row, not a row of its own
      expect(priceBox.parentElement?.children).toHaveLength(2)
    })

    it('on a desktop the price box is not wrapped in a flexing cell', async () => {
      marketing()
      await open()
      const priceBox = screen.getByLabelText(/^Market price: Cement bags$/).parentElement
      if (!priceBox) throw new Error('the price box was not found')
      expect(priceBox.style.flex).toBe('')
    })
  })

  describe('the bar at market pricing', () => {
    it('keeps what blocks the step in view and puts the long explanation behind the info button', async () => {
      setWidth(390)
      marketing()
      await open()
      const b = bar(/next step: market pricing/i)
      expect(within(b).getByText(/enter a price for every line/i)).toBeInTheDocument()
      expect(within(b).queryByText(/you can take the items you will buy yourself/i)).toBeNull()
      fireEvent.click(within(b).getByRole('button', { name: 'About this step' }))
      expect(
        within(b).getByText(/you can take the items you will buy yourself/i),
      ).toBeInTheDocument()
    })

    it('on a desktop the explanation is just there, with no info button', async () => {
      marketing()
      await open()
      const b = bar(/next step: market pricing/i)
      expect(
        within(b).getByText(/you can take the items you will buy yourself/i),
      ).toBeInTheDocument()
      expect(within(b).queryByRole('button', { name: 'About this step' })).toBeNull()
    })

    it('says nothing about the split when the viewer is not the organizer and the lines are not split', async () => {
      mockAuthUser = { id: 'user-nobody', role: 'user' }
      marketing({ organizer_id: 'someone-else', callerHasMarketPricingPosition: true })
      await open()
      expect(screen.queryByText(/you can take the items you will buy yourself/i)).toBeNull()
    })
  })

  it('reads in Arabic on a phone without raw keys, including the info button', async () => {
    setWidth(390)
    await i18n.changeLanguage('ar')
    marketing()
    await open()
    expect(document.body.textContent).not.toMatch(/req\.(detail|bought|phase)\./)
    expect(screen.getByRole('button', { name: 'حول هذه الخطوة' })).toBeInTheDocument()
  })
})
