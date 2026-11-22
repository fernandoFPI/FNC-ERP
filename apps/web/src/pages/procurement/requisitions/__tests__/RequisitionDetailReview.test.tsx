// The requisition page during the organizer review (migration 329, playbook #115): the review panel is drawn in the two review
// statuses and only then, its action bar is the LAST thing on the page (a sticky bar pins only at the end), the status reads in
// words, and the Lines table still shows what was bought. The panel's own behaviour is in components/procurement/__tests__.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'

const mockUseQuery = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    useMutation: () => [vi.fn().mockResolvedValue({}), { loading: false }],
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})
vi.mock('../../../../store/toastStore', () => ({
  useToastStore: (selector?: (s: { addToast: () => void }) => unknown) =>
    selector ? selector({ addToast: vi.fn() }) : vi.fn(),
}))
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: { id: 'user-organizer', role: 'user' } }),
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: 'req-1' }) }
})
vi.mock('../../../../components/inventory/EntityAttachments', () => ({
  EntityAttachments: () => <div data-testid="attachments" />,
}))

const REVIEW = {
  needs_approval: false,
  approval_reason: null,
  edited_count: 0,
  organizer_bought_count: 0,
  unsigned_tolerance_count: 0,
  caller_can_edit: true,
  caller_can_approve: false,
  last_rejection: null,
  totals: [{ currency_code: 'USD', was: '125', now: '125', purchases: 1 }],
}

function line() {
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
    market_price: '12.5',
    market_price_currency: 'USD',
    verified_price: '12.5',
    verified_price_currency: 'USD',
    total: '125',
    owner_handles: false,
    purchases: [
      {
        id: 'p1',
        vendor_id: 'v1',
        vendor_name: 'Al Noor Hardware',
        currency_code: 'USD',
        qty: '10',
        actual_unit_price: '12.5',
        bought_at: '2026-11-20T10:00:00.000Z',
        bought_by: 'user-buyer',
        bought_by_name: 'Bassam Buyer',
        over_tolerance: false,
        tolerance_approved_by: null,
        receipt_file_id: 'f1',
        review_original_qty: null,
        review_original_price: null,
      },
    ],
  }
}

function mockReq(status: string, review: unknown) {
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
      return {
        data: {
          requisition: {
            id: 'req-1',
            requisition_number: 'REQ-2026-001',
            status,
            priority: 'low',
            purpose: 'stock',
            delivery_destination: 'inventory',
            project_id: null,
            projectCode: null,
            projectName: null,
            branch_id: null,
            branch_name: null,
            organizer_id: 'user-organizer',
            organizerName: 'Olivia Organizer',
            notes: null,
            created_at: '2026-01-15T10:00:00.000Z',
            updated_at: '2026-01-15T10:00:00.000Z',
            callerHasStoreKeeperPosition: false,
            callerHasStorePricingPosition: false,
            callerHasMarketPricingPosition: false,
            callerHasPriceVerificationPosition: false,
            callerHasBuyerPosition: false,
            callerCanApprove: false,
            currencyTotals: [{ currency_code: 'USD', subtotal: '125', line_count: 1 }],
            lines: [line()],
            approval_log: [],
            edit_requests: [],
            review,
          },
        },
        loading: false,
        refetch: vi.fn(),
      }
    },
  )
}

async function open(status: string, review: unknown = REVIEW) {
  mockReq(status, review)
  const RequisitionDetail = (await import('../RequisitionDetail')).default
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions/req-1']}>
      <ThemeProvider>
        <RequisitionDetail />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(async () => {
  if (i18n.language !== 'en')
    await act(async () => {
      await i18n.changeLanguage('en')
    })
})

describe('the requisition page in the organizer review', () => {
  it('draws the review in organizer_review, with the purchases and the Confirm button', async () => {
    await open('organizer_review')
    expect(screen.getByText('Review what was bought')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Confirm and create purchase orders' }),
    ).toBeInTheDocument()
    // the status reads in words
    expect(screen.getAllByText('Organizer review').length).toBeGreaterThan(0)
  })

  it("draws the PO Admin's approval in review_approval", async () => {
    await open('review_approval', {
      ...REVIEW,
      caller_can_edit: false,
      caller_can_approve: true,
      needs_approval: true,
    })
    expect(screen.getByText('Next step: approve the changes')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Approve and create purchase orders' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('PO Admin approval').length).toBeGreaterThan(0)
  })

  it.each(['draft', 'pending_approval', 'approved', 'items_bought', 'sourcing', 'completed'])(
    'does not draw the review in %s, even if the server sent one',
    async (status) => {
      await open(status)
      expect(screen.queryByText('Review what was bought')).toBeNull()
      expect(
        screen.queryByRole('button', { name: 'Confirm and create purchase orders' }),
      ).toBeNull()
    },
  )

  it('puts the action bar AFTER the tabs and the lines, as the last thing on the page, so it can stick to the bottom', async () => {
    await open('organizer_review')
    const confirm = screen.getByRole('button', { name: 'Confirm and create purchase orders' })
    const logTab = screen.getByRole('button', { name: /^Log/ })
    expect(logTab.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // and the review's own table comes before the tabs, so the organizer sees what he is checking first
    const heading = screen.getByText('Review what was bought')
    expect(heading.compareDocumentPosition(logTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps showing what was bought in the Lines table while the requisition is being reviewed', async () => {
    await open('organizer_review')
    // the review table names the vendor on its own, and the Lines table's Bought column still reads "10 @ 12.5 USD — vendor"
    // (that column is only drawn for the statuses its list names, so a missing status would empty it)
    expect(screen.getByText('Al Noor Hardware')).toBeInTheDocument()
    expect(screen.getByText(/^10 @ 12\.5 USD — Al Noor Hardware/)).toBeInTheDocument()
  })

  it.each(['organizer_review', 'review_approval'])(
    'keeps every column of the earlier steps in the Lines table in %s (handled by, from stock, the three prices, bought)',
    async (status) => {
      await open(
        status,
        status === 'review_approval'
          ? { ...REVIEW, caller_can_edit: false, caller_can_approve: true }
          : REVIEW,
      )
      const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
      for (const h of [
        'Handled by',
        'From stock',
        'Store price',
        'Market price',
        'Verified price',
        'Bought',
      ])
        expect(headers, h).toContain(h)
    },
  )

  it('offers no "Go to Items Bought" any more once the buying is finished', async () => {
    await open('organizer_review')
    expect(screen.queryByRole('button', { name: /go to items bought/i })).toBeNull()
  })

  it('reads in Arabic with no raw key on the page', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    await open('organizer_review')
    expect(screen.getByText('راجع ما تم شراؤه')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/req\.(review|status|detail)\./)
  })
})
