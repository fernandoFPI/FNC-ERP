// After approval only an administrator may change a requisition or even ask (playbook #112), so the page offers "Start editing" to an
// administrator only and tells everyone else why. Before approval nothing changes: the organizer (or an admin) still edits at once.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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
    useMutation: () => [vi.fn().mockResolvedValue({}), { loading: false }],
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})
vi.mock('../../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))

let mockAuthUser: { id: string; role: string } = { id: 'user-organizer', role: 'user' }
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: mockAuthUser }),
}))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: 'req-1' }) }
})

const REFUSAL =
  'Only an administrator can change an approved requisition. Ask an administrator to make the change.'
const OLD_MESSAGE = 'Only the organizer or an admin can request an edit here.'

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
    market_price: null,
    verified_price: null,
    total: '125',
    purchases: [],
    owner_handles: false,
  }
}

function mockReq(status: string) {
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
            edit_requests: [],
          },
        },
        loading: false,
        refetch: vi.fn(),
      }
    },
  )
}

async function openAs(user: { id: string; role: string }, status: string) {
  mockAuthUser = user
  mockReq(status)
  const RequisitionDetail = (await import('../RequisitionDetail')).default
  render(
    <MemoryRouter initialEntries={['/procurement/requisitions/req-1']}>
      <ThemeProvider>
        <RequisitionDetail />
      </ThemeProvider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: /^Edit requests/ }))
}
const startEditing = () => screen.queryByRole('button', { name: 'Start editing' })
const ORGANIZER = { id: 'user-organizer', role: 'user' }
const STRANGER = { id: 'user-stranger', role: 'user' }

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

describe('after approval', () => {
  it.each(['approved', 'items_bought', 'sourcing', 'completed'])(
    'does not offer the organizer, a plain user, "Start editing" once it is %s, and says why',
    async (status) => {
      await openAs(ORGANIZER, status)
      expect(startEditing()).toBeNull()
      expect(screen.getByText(REFUSAL)).toBeInTheDocument()
      expect(screen.queryByText(OLD_MESSAGE)).toBeNull()
    },
  )

  it.each(['system_admin', 'company_admin', 'module_admin'])(
    'offers a %s "Start editing"',
    async (role) => {
      await openAs({ id: 'user-admin', role }, 'approved')
      expect(startEditing()).toBeInTheDocument()
      expect(screen.queryByText(REFUSAL)).toBeNull()
    },
  )

  it('gives the same answer to a plain user who is not the organizer', async () => {
    await openAs(STRANGER, 'approved')
    expect(startEditing()).toBeNull()
    expect(screen.getByText(REFUSAL)).toBeInTheDocument()
  })

  it('says it in Arabic, with no raw key on the page', async () => {
    await act(async () => {
      await i18n.changeLanguage('ar')
    })
    mockAuthUser = ORGANIZER
    mockReq('approved')
    const RequisitionDetail = (await import('../RequisitionDetail')).default
    render(
      <MemoryRouter initialEntries={['/procurement/requisitions/req-1']}>
        <ThemeProvider>
          <RequisitionDetail />
        </ThemeProvider>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /طلبات التعديل/ }))
    expect(document.body.textContent).not.toMatch(/req\.detail\.onlyAnAdminAfterApproval/)
    expect(
      screen.getByText(/يمكن للمسؤول فقط تعديل طلب الشراء بعد الموافقة عليه/),
    ).toBeInTheDocument()
  })
})

describe('before approval', () => {
  it.each(['draft', 'inventory_check', 'pending_approval'])(
    'still offers the organizer "Start editing" while it is %s',
    async (status) => {
      await openAs(ORGANIZER, status)
      expect(startEditing()).toBeInTheDocument()
      expect(screen.queryByText(REFUSAL)).toBeNull()
    },
  )

  it('still tells a plain user who is not the organizer the old reason, not the administrator one', async () => {
    await openAs(STRANGER, 'pending_approval')
    expect(startEditing()).toBeNull()
    expect(screen.getByText(OLD_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText(REFUSAL)).toBeNull()
  })
})
