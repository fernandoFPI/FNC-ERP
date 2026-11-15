// The GL Account picker on a PO line (PO page, Payment pending, "classify the lines"), playbook #91.
//
// The picker listed every active account, header accounts included, and `1000 — Assets` is the first entry. Choosing it was
// accepted and only refused weeks later, when the advance was settled and the database refused to post to a header account.
// The picker now lists only accounts a journal can post to. Renders the real page.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ComponentType } from 'react'
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
vi.mock('../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => vi.fn() }
})
vi.mock('../../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: (k: string) => k === 'finance.ap.approve' || k === 'finance.ap.view',
    canAny: () => false,
    isSystemLevel: false,
  }),
}))
vi.mock('../../../lib/axios', () => ({
  api: {
    get: vi.fn((url: string) =>
      Promise.resolve({ data: url === '/finance/vendor-invoices' ? { items: [] } : [] }),
    ),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

const account = (id: string, code: string, name: string, postable: boolean) => ({
  id,
  code,
  name,
  account_type: postable ? 'expense' : 'asset',
  is_active: true,
  currency_code: null,
  parent_id: null,
  parent_name: null,
  is_reconcilable: false,
  is_header: !postable,
  is_postable: postable,
  account_category: null,
})

function mockPage(accounts: ReturnType<typeof account>[]) {
  const po = {
    id: 'po-1',
    po_number: 'NY-PO-2026-0063',
    vendor_name: 'Cash Purchase',
    currency_code: 'IQD',
    status: 'payment_pending',
    subtotal: '5000',
    tax_amount: '0',
    total_amount: '5000',
    currencyTotals: [{ currency_code: 'IQD', subtotal: '5000', line_count: 1 }],
    notes: '',
    expected_delivery_date: '',
    created_at: '2026-11-09T10:00:00.000Z',
    callerIsFinanceTeam: true,
    funding_source: 'employee_advance',
    funding_decided: true,
    funding_advance_id: 'adv-1',
    receipts: [],
    approval_log: [],
    edit_requests: [],
    lines: [
      {
        id: 'l1',
        description: 'Plastering, labour and materials',
        qty: 1,
        unit_price: 5000,
        initial_unit_price: 5000,
        total: 5000,
        actual_unit_price: 5000,
        currency_code: 'IQD',
        product_id: null,
        product_name: null,
        uom: 'lot',
        qty_received: 1,
        qty_from_stock: 0,
        account_id: null,
        cost_center_id: null,
      },
    ],
  }
  // Built once and handed back by reference: a fresh object on every call loops a component whose effect reads query data.
  const refetch = vi.fn()
  const poResult = {
    data: { purchaseOrder: po, poFxRates: { base_currency: 'IQD', rates: [] } },
    loading: false,
    refetch,
  }
  const accountsResult = { data: { accounts }, loading: false, refetch }
  const costCentersResult = {
    data: { costCenters: [{ id: 'cc-1', code: 'CC1', name: 'Site overhead' }] },
    loading: false,
    refetch,
  }
  mockUseQuery.mockImplementation((doc: { definitions?: { name?: { value?: string } }[] }) => {
    const name = doc.definitions?.[0]?.name?.value
    if (name === 'Accounts') return accountsResult
    if (name === 'CostCenters') return costCentersResult
    return poResult
  })
}

let PurchaseOrderDetail: ComponentType
beforeAll(async () => {
  PurchaseOrderDetail = (await import('../purchase-orders/PurchaseOrderDetail')).default
}, 120_000)

async function openPO() {
  render(
    <MemoryRouter initialEntries={['/procurement/purchase-orders/po-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/procurement/purchase-orders/:id" element={<PurchaseOrderDetail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mockUseMutation.mockImplementation(() => [vi.fn().mockResolvedValue({}), { loading: false }])
})

const optionTexts = () => screen.queryAllByText(/^\d{4} — /).map((e) => e.textContent)
const openAccountPicker = () =>
  fireEvent.click(screen.getByText(i18n.t('po.detail.searchGlAccounts')))

describe('the GL Account picker on a PO line', () => {
  it('lists the postable accounts and not the header account (1000 Assets used to be the first entry)', async () => {
    mockPage([
      account('acc-header', '1000', 'Assets', false),
      account('acc-1', '3211', 'Construction Materials', true),
      account('acc-2', '3212', 'Electrical Materials', true),
    ])
    await openPO()
    openAccountPicker()
    expect(optionTexts()).toEqual(['3211 — Construction Materials', '3212 — Electrical Materials'])
    expect(screen.queryByText(/1000 — Assets/)).toBeNull()
  })

  it('keeps every postable account, in the order the server sent them', async () => {
    mockPage([
      account('acc-1', '3211', 'Construction Materials', true),
      account('acc-h1', '3200', 'Project costs', false),
      account('acc-2', '3212', 'Electrical Materials', true),
      account('acc-h2', '3000', 'Costs and Expenses', false),
      account('acc-3', '3251', 'Small Tools', true),
    ])
    await openPO()
    openAccountPicker()
    expect(optionTexts()).toEqual([
      '3211 — Construction Materials',
      '3212 — Electrical Materials',
      '3251 — Small Tools',
    ])
  })

  it('an account whose flag was not loaded is still offered (the server is the authority and refuses a bad one)', async () => {
    const unknown = {
      ...account('acc-u', '3299', 'Unflagged', true),
      is_postable: null as unknown as boolean,
    }
    mockPage([account('acc-header', '1000', 'Assets', false), unknown])
    await openPO()
    openAccountPicker()
    expect(optionTexts()).toEqual(['3299 — Unflagged'])
  })
})
