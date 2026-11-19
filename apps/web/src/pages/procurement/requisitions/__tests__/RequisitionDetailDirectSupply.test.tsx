// Direct supply on the requisition page. Always tied to a project and with no inventory check or pricing step, its
// stages are Draft > Pending approval > Items bought > Sourcing > Completed. So: the draft goes straight to the approver
// with its own button, the progress bar has no Price phase, the approver sees the Est. Unit Price typed at creation
// (and none of the empty store / market / verified columns), and a rejection can only go back to Draft.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

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

let mockAuthUser: { id: string; role: string } = { id: 'user-organizer', role: 'user' }
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: mockAuthUser }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'req-1' }) }
})

const t = (key: string) => i18n.t(key)

function line(over: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    line_number: 1,
    description: 'Pipe 2in',
    product_id: null,
    product_name: null,
    sku: null,
    qty: '10',
    uom: 'pc',
    currency_code: 'USD',
    unit_price: '12.5',
    qty_from_stock: '0',
    store_price: null,
    market_price: null,
    verified_price: null,
    total: '125',
    purchases: [],
    owner_handles: false,
    ...over,
  }
}

function req(over: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    requisition_number: 'REQ-2026-001',
    status: 'draft',
    priority: 'low',
    purpose: 'direct_supply',
    delivery_destination: 'jobsite',
    project_id: 'proj-1',
    projectCode: 'PRJ-004',
    projectName: 'Tower A',
    branch_id: null,
    branch_name: null,
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
    currencyTotals: [{ currency_code: 'USD', subtotal: '125', line_count: 1 }],
    lines: [line()],
    approval_log: [],
    ...over,
  }
}

function mockReq(over: Record<string, unknown> = {}) {
  mockUseQuery.mockImplementation(
    (doc: unknown, opts?: { variables?: Record<string, unknown> }) => {
      const op = (
        doc as { definitions?: { kind?: string; name?: { value?: string } }[] }
      ).definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      if (op === 'POLineComments')
        return { data: { poLineComments: [] }, loading: false, refetch: vi.fn() }
      if (op === 'RequisitionChildPurchaseOrders')
        return { data: { requisitionChildPurchaseOrders: [] }, loading: false, refetch: vi.fn() }
      if (op === 'MaterialIssues')
        return { data: { materialIssues: [] }, loading: false, refetch: vi.fn() }
      if (op === 'RequisitionStockAvailability')
        return { data: { requisitionStockAvailability: [] }, loading: false, refetch: vi.fn() }
      if (opts?.variables && 'isActive' in opts.variables)
        return { data: { stockLocations: [] }, loading: false, refetch: vi.fn() }
      return { data: { requisition: req(over) }, loading: false, refetch: vi.fn() }
    },
  )
}

// One mock per GraphQL operation name, so which mutation ran can be told apart.
function mutationsByName() {
  const calls: Record<string, ReturnType<typeof vi.fn>> = {}
  mockUseMutation.mockImplementation((doc: unknown) => {
    const op =
      (doc as { definitions?: { kind?: string; name?: { value?: string } }[] }).definitions?.find(
        (d) => d.kind === 'OperationDefinition',
      )?.name?.value ?? ''
    calls[op] ??= vi.fn().mockResolvedValue({})
    return [calls[op], { loading: false }]
  })
  return calls
}

async function open() {
  const RequisitionDetail = (await import('../RequisitionDetail')).default
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions/req-1']}>
      <ThemeProvider>
        <RequisitionDetail />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

const bar = (name: RegExp) => screen.getByRole('region', { name })
const SUBMIT_BAR = /next step: submit for approval/i
const APPROVE_BAR = /next step: approve or reject/i
const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent.trim())
const PRICING_HEADERS = () => [
  t('req.detail.fromStock'),
  t('req.detail.storePrice'),
  t('req.detail.marketPrice'),
  t('req.detail.verifiedPrice'),
]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockAuthUser = { id: 'user-organizer', role: 'user' }
  mutationsByName()
  mockReq()
})

describe('RequisitionDetail: direct supply, draft', () => {
  it('holds Submit for approval in the bar for the organizer, and no inventory check anywhere', async () => {
    await open()
    expect(
      within(bar(SUBMIT_BAR)).getByRole('button', { name: /^submit for approval$/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(t('req.detail.directSupplyApprovalHint'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /submit for inventory check/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: /next step: submit for inventory check/i }),
    ).not.toBeInTheDocument()
  })

  it('sends it to the approver, never to inventory check', async () => {
    const calls = mutationsByName()
    await open()
    fireEvent.click(within(bar(SUBMIT_BAR)).getByRole('button', { name: /^submit for approval$/i }))
    expect(calls.SubmitRequisitionDirectSupply).toHaveBeenCalledWith({ variables: { id: 'req-1' } })
    // the page registers every mutation, so "never to inventory check" means it was not called
    expect(calls.SubmitRequisitionToInventoryCheck).toBeDefined()
    expect(calls.SubmitRequisitionToInventoryCheck).not.toHaveBeenCalled()
  })

  it('lets an administrator who is not the organizer submit it', async () => {
    mockAuthUser = { id: 'user-admin', role: 'system_admin' }
    await open()
    expect(
      within(bar(SUBMIT_BAR)).getByRole('button', { name: /^submit for approval$/i }),
    ).toBeInTheDocument()
  })

  it('says who can submit, and offers no button, to anyone else', async () => {
    mockAuthUser = { id: 'user-stranger', role: 'user' }
    mockReq({ organizer_id: 'someone-else' })
    await open()
    const b = bar(SUBMIT_BAR)
    expect(within(b).queryByRole('button')).not.toBeInTheDocument()
    expect(within(b).getByText(/only the organizer or an admin/i)).toBeInTheDocument()
  })

  it('leaves every other purpose with its own button', async () => {
    mockReq({ purpose: 'stock', delivery_destination: 'inventory', project_id: null })
    await open()
    expect(screen.getByRole('button', { name: /submit for inventory check/i })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: SUBMIT_BAR })).not.toBeInTheDocument()
  })
})

describe('RequisitionDetail: direct supply, what the page shows', () => {
  const phaseLabels = () =>
    within(screen.getByRole('group', { name: t('req.detail.progress') }))
      .getAllByRole('listitem')
      .map((li) => li.textContent)

  it('has no Price phase on the progress bar, and every other requisition does', async () => {
    const view = await open()
    expect(phaseLabels().some((l) => l.includes('Price'))).toBe(false)
    expect(
      phaseLabels().map((l) => ['Prepare', 'Approve', 'Buy', 'Done'].some((p) => l.includes(p))),
    ).toEqual([true, true, true, true])
    view.unmount()

    mockReq({ purpose: 'stock', delivery_destination: 'inventory', project_id: null })
    await open()
    expect(phaseLabels().some((l) => l.includes('Price'))).toBe(true)
    expect(phaseLabels()).toHaveLength(5)
  })

  it('shows the purpose by name', async () => {
    await open()
    expect(screen.getByText('Purpose: Direct supply')).toBeInTheDocument()
  })

  it('shows the approver the typed price in its own currency, and none of the pricing columns that stay empty', async () => {
    mockAuthUser = { id: 'approver', role: 'user' }
    mockReq({
      status: 'pending_approval',
      callerCanApprove: true,
      lines: [
        line(),
        line({
          id: 'line-2',
          line_number: 2,
          description: 'Valve',
          qty: '2',
          unit_price: '3000',
          currency_code: 'IQD',
          total: '6000',
        }),
      ],
    })
    await open()
    const shown = headers()
    expect(shown).toContain(t('req.detail.estUnitPrice'))
    for (const h of PRICING_HEADERS()) expect(shown).not.toContain(h)
    const pipe = screen.getByText('Pipe 2in').closest('tr')
    const valve = screen.getByText('Valve').closest('tr')
    expect(pipe).toHaveTextContent('12.5 USD')
    expect(valve).toHaveTextContent('3,000 IQD')
  })

  it('keeps the pricing columns, and has no Est. Unit Price column, on every other requisition', async () => {
    mockReq({
      purpose: 'project',
      status: 'pending_approval',
      callerCanApprove: true,
      lines: [
        line({
          market_price: '12',
          market_price_currency: 'USD',
          verified_price: '12',
          verified_price_currency: 'USD',
        }),
      ],
    })
    await open()
    const shown = headers()
    expect(shown).not.toContain(t('req.detail.estUnitPrice'))
    for (const h of PRICING_HEADERS()) expect(shown).toContain(h)
  })

  it('keeps the Columns menu free of the columns it never has', async () => {
    mockReq({ status: 'pending_approval', callerCanApprove: true })
    await open()
    fireEvent.click(screen.getByRole('button', { name: /columns/i }))
    for (const h of PRICING_HEADERS())
      expect(screen.queryByRole('menuitemcheckbox', { name: h })).not.toBeInTheDocument()
    expect(screen.queryByText(t('req.detail.marketPrice'))).not.toBeInTheDocument()
  })

  it('names the log entry "Submitted for approval"', async () => {
    mockReq({
      status: 'pending_approval',
      approval_log: [
        {
          id: 'log-1',
          from_status: 'draft',
          to_status: 'pending_approval',
          action: 'submit_direct_supply',
          actor_id: 'user-organizer',
          actor_name: 'Jane Doe',
          actor_position: null,
          notes: null,
          created_at: '2026-01-16T09:00:00.000Z',
        },
      ],
    })
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^log$/i }))
    expect(screen.getByText('Submitted for approval')).toBeInTheDocument()
    expect(screen.queryByText('submit direct supply')).not.toBeInTheDocument()
  })
})

describe('RequisitionDetail: direct supply, a rejection', () => {
  const approving = (over: Record<string, unknown> = {}) => {
    mockReq({ status: 'pending_approval', callerCanApprove: true, ...over })
  }
  const flagFirstLine = (reason = 'Price is too high') => {
    fireEvent.click(screen.getAllByRole('checkbox', { name: /flag this line/i })[0])
    fireEvent.change(screen.getByPlaceholderText(/what's wrong with this line/i), {
      target: { value: reason },
    })
  }

  it('can only be sent back to Draft: it never visited inventory check or market pricing', async () => {
    approving()
    await open()
    flagFirstLine()
    fireEvent.click(within(bar(APPROVE_BAR)).getByRole('button', { name: /^send back$/i }))
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(1)
    expect(screen.getByRole('radio', { name: /^Draft/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Market pricing/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /^Inventory check/ })).not.toBeInTheDocument()
  })

  it('sends the flagged line and its reason back to Draft through the ordinary rejection', async () => {
    const calls = mutationsByName()
    approving()
    await open()
    flagFirstLine('Price is too high')
    fireEvent.click(within(bar(APPROVE_BAR)).getByRole('button', { name: /^send back$/i }))
    fireEvent.click(screen.getByRole('radio', { name: /^Draft/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Send back to Draft' }))
    expect(calls.RejectRequisitionApproval).toHaveBeenCalledTimes(1)
    expect(calls.RejectRequisitionApproval).toHaveBeenCalledWith({
      variables: {
        id: 'req-1',
        reason: expect.stringContaining('Price is too high') as string,
        lineFlags: [{ lineId: 'line-1', reason: 'Price is too high' }],
      },
    })
    expect(calls.RejectRequisitionToMarketPricing).toBeDefined()
    expect(calls.RejectRequisitionToMarketPricing).not.toHaveBeenCalled()
    expect(calls.RejectRequisitionToInventoryCheck).toBeDefined()
    expect(calls.RejectRequisitionToInventoryCheck).not.toHaveBeenCalled()
  })

  it('still offers every other requisition its three places', async () => {
    mockReq({ purpose: 'project', status: 'pending_approval', callerCanApprove: true })
    await open()
    flagFirstLine()
    fireEvent.click(within(bar(APPROVE_BAR)).getByRole('button', { name: /^send back$/i }))
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })
})
