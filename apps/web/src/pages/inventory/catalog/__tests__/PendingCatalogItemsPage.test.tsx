import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
const refetchProductsSpy = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>()
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
    gql: actual.gql,
  }
})

vi.mock('../../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

vi.mock('../../../../hooks/usePermission', () => ({
  usePermission: () => ({ isSystemLevel: true }),
}))

vi.mock('../../../../store/companyStore', () => ({
  useCompanyStore: (selector: (s: { activeCompany: { id: string } }) => unknown) =>
    selector({ activeCompany: { id: 'company-1' } }),
}))

vi.mock('../../../../hooks/useProductStoreCategories', () => ({
  useProductStoreCategories: () => ({ categories: [] }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

const pendingItem = {
  id: 'pending-1',
  po_id: 'po-1',
  po_number: 'PO-1',
  po_line_id: 'line-1',
  description: 'onion',
  qty: '10',
  uom: 'kg',
  unit_price: null,
  currency_code: null,
  source: 'store_in',
  created_at: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({ data: {} }), { loading: false }])

  mockUseQuery.mockImplementation((doc: unknown) => {
    const opName = (doc as { definitions?: { name?: { value?: string } }[] })?.definitions?.[0]?.name?.value
    if (opName === 'GetUserPOPositions') {
      return { data: { userPOPositions: [] }, loading: false }
    }
    if (opName === 'PendingProductCatalogItems') {
      return { data: { pendingProductCatalogItems: [pendingItem] }, loading: false, refetch: vi.fn() }
    }
    if (opName === 'MyCompanies') {
      return { data: { myCompanies: [] } }
    }
    if (opName === 'Products') {
      return { data: { products: [] }, refetch: refetchProductsSpy }
    }
    return { data: undefined, loading: false }
  })
})

describe('PendingCatalogItemsPage — Link Existing product search', () => {
  it('fetches products with cache-and-network, not the default cache-first', async () => {
    const PendingCatalogItemsPage = (await import('../PendingCatalogItemsPage')).default
    wrap(<PendingCatalogItemsPage />)

    fireEvent.click(screen.getByText('Link Existing'))

    await waitFor(() => {
      const productsCall = mockUseQuery.mock.calls.find((c) => {
        const doc = c[0] as { definitions?: { name?: { value?: string } }[] }
        return doc?.definitions?.[0]?.name?.value === 'Products'
      })
      expect(productsCall?.[1]).toMatchObject({ fetchPolicy: 'cache-and-network' })
    })
  })

  it('refetches the products list after cataloguing a new product, so it shows up for the next Link Existing search', async () => {
    const PendingCatalogItemsPage = (await import('../PendingCatalogItemsPage')).default
    wrap(<PendingCatalogItemsPage />)

    fireEvent.click(screen.getByText('Catalog as New'))
    fireEvent.click(screen.getByRole('button', { name: /add to inventory/i }))

    await waitFor(() => {
      expect(refetchProductsSpy).toHaveBeenCalled()
    })
  })
})
