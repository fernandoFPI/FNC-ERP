import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
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
    gql: actual.gql,
  }
})

vi.mock('../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

vi.mock('../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'system_admin' } }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

function baseReceipt(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    po_number: 'PO-1',
    vendor_name: 'Acme',
    received_from_name: 'Acme Supplies',
    base_currency_code: 'IQD',
    receipt_number: 'RCPT-1',
    receipt_date: '2026-01-01',
    received_by_name: 'Buyer One',
    received_by_email: 'buyer@fnc.com',
    status: 'confirmed',
    lines: [
      {
        qty_received: '2',
        unit_price: '10',
        fx_rate_to_base: '1',
        product_name: 'Cement bags',
        product_name_ar: null,
        sku: 'CEM-1',
      },
    ],
    ...overrides,
  }
}

function mockReceipts(receipts: Record<string, unknown>[]) {
  mockUseQuery.mockImplementation((doc: unknown) => {
    // definitions[0] isn't reliably the operation — gql fragment composition
    // (queries built from `${SomeFieldsFragment}`) can put FragmentDefinition
    // nodes before the OperationDefinition in the array, so find it by kind
    // instead of assuming position 0.
    const opDoc = doc as { definitions?: { kind?: string; name?: { value?: string } }[] }
    const opName = opDoc.definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
    if (opName === 'POReceipts') {
      return {
        data: { poReceipts: receipts },
        loading: false,
        error: undefined,
        refetch: vi.fn(),
      }
    }
    return { data: undefined, loading: false }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMutation.mockReturnValue([vi.fn(), { loading: false }])
})

describe('StoreInPage item search', () => {
  it('filters receipts by an item name found on one of their lines', async () => {
    mockReceipts([
      baseReceipt({
        id: 'r1',
        receipt_number: 'RCPT-1',
        lines: [{ qty_received: '2', unit_price: '10', fx_rate_to_base: '1', product_name: 'Cement bags', sku: 'CEM-1' }],
      }),
      baseReceipt({
        id: 'r2',
        receipt_number: 'RCPT-2',
        lines: [{ qty_received: '1', unit_price: '5', fx_rate_to_base: '1', product_name: 'Rebar', sku: 'REB-1' }],
      }),
    ])
    const StoreInPage = (await import('../store-in/StoreInPage')).default
    wrap(<StoreInPage />)

    expect(screen.getByText('RCPT-1')).toBeInTheDocument()
    expect(screen.getByText('RCPT-2')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/search by receipt/i), { target: { value: 'cement' } })

    expect(screen.getByText('RCPT-1')).toBeInTheDocument()
    expect(screen.queryByText('RCPT-2')).not.toBeInTheDocument()
  })

  it('filters receipts by SKU', async () => {
    mockReceipts([
      baseReceipt({
        id: 'r1',
        receipt_number: 'RCPT-1',
        lines: [{ qty_received: '2', unit_price: '10', fx_rate_to_base: '1', product_name: 'Cement bags', sku: 'CEM-1' }],
      }),
      baseReceipt({
        id: 'r2',
        receipt_number: 'RCPT-2',
        lines: [{ qty_received: '1', unit_price: '5', fx_rate_to_base: '1', product_name: 'Rebar', sku: 'REB-1' }],
      }),
    ])
    const StoreInPage = (await import('../store-in/StoreInPage')).default
    wrap(<StoreInPage />)

    fireEvent.change(screen.getByPlaceholderText(/search by receipt/i), { target: { value: 'reb-1' } })

    expect(screen.queryByText('RCPT-1')).not.toBeInTheDocument()
    expect(screen.getByText('RCPT-2')).toBeInTheDocument()
  })

  it('still matches receipt #, PO #, received from, and received by as before', async () => {
    mockReceipts([
      baseReceipt({ id: 'r1', receipt_number: 'RCPT-1', po_number: 'PO-100' }),
      baseReceipt({ id: 'r2', receipt_number: 'RCPT-2', po_number: 'PO-200' }),
    ])
    const StoreInPage = (await import('../store-in/StoreInPage')).default
    wrap(<StoreInPage />)

    fireEvent.change(screen.getByPlaceholderText(/search by receipt/i), { target: { value: 'po-200' } })

    expect(screen.queryByText('RCPT-1')).not.toBeInTheDocument()
    expect(screen.getByText('RCPT-2')).toBeInTheDocument()
  })
})
