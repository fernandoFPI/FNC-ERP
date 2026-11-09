// Products list, "Last Cost" column. It used to read products.average_cost, a legacy column that
// only the inventory import ever set and nothing keeps up to date: every product of Nishtimani Yakam
// and Al Watanyia showed 0, and Nishtimani Factory showed stale import numbers (AC-008: 4.25 against
// a real cost of 4,500 IQD). The product's
// own Cost is products.standard_cost with products.cost_currency (what the product page's Cost box
// and Cost Change Approvals use), so that is what the column must show.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { PRODUCTS_QUERY } from '../../../../graphql/inventory'
import ProductsPage from '../ProductsPage'

const mockUseQuery = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
  }
})

vi.mock('../../../../hooks/useEntityChanged', () => ({ useEntityChanged: () => undefined }))

vi.mock('../../../../hooks/useProductStoreCategories', () => ({
  useProductStoreCategories: () => ({ categories: [] }),
}))

interface ProductRow {
  id: string
  sku: string
  name: string
  average_cost: string
  standard_cost: string | null
  cost_currency: string | null
}

function product(over: Partial<ProductRow> & Pick<ProductRow, 'id' | 'sku'>): ProductRow & {
  name_ar: null
  category: string
  sub_category: null
  uom: string
  valuation_method: string
  is_active: boolean
  reorder_point: null
  qty_on_hand: string
} {
  return {
    name: `Item ${over.sku}`,
    average_cost: '0.0000',
    standard_cost: null,
    cost_currency: null,
    name_ar: null,
    category: 'raw_material',
    sub_category: null,
    uom: 'EA',
    valuation_method: 'last_cost',
    is_active: true,
    reorder_point: null,
    qty_on_hand: '1',
    ...over,
  }
}

function renderWith(products: ReturnType<typeof product>[]) {
  const result = { data: { products }, loading: false, refetch: vi.fn() }
  mockUseQuery.mockImplementation((doc: unknown) =>
    doc === PRODUCTS_QUERY ? result : { data: undefined, loading: false, refetch: vi.fn() },
  )
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ProductsPage />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

// The cell of the "Last Cost" column for one product's row.
function costCell(sku: string): HTMLElement {
  const row = screen.getByText(sku).closest<HTMLElement>('tr')
  if (!row) throw new Error(`no table row for ${sku}`)
  const headers = within(screen.getByRole('table')).getAllByRole('columnheader')
  const index = headers.findIndex((h) => h.textContent === 'Last Cost')
  if (index < 0) throw new Error('no Last Cost column')
  return within(row).getAllByRole('cell')[index]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProductsPage Last Cost column', () => {
  it('asks the API for the product cost, not only the legacy column', () => {
    renderWith([product({ id: 'p1', sku: 'STEEL-018' })])
    const requested = (PRODUCTS_QUERY.loc?.source.body ?? '').replace(/\s+/g, ' ')
    expect(requested).toContain('standard_cost')
    expect(requested).toContain('cost_currency')
  })

  it("shows the product's own cost when the legacy column is 0 (the Yakam / Al Watanyia case)", () => {
    renderWith([
      product({
        id: 'p1',
        sku: 'STEEL-018',
        average_cost: '0.0000',
        standard_cost: '35.0000',
        cost_currency: 'USD',
      }),
    ])
    const cell = costCell('STEEL-018')
    expect(cell).toHaveTextContent('35')
    expect(cell).toHaveTextContent('USD')
  })

  it('ignores a stale legacy number (the Factory case: 4.25 shown, real cost 4,500 IQD)', () => {
    renderWith([
      product({
        id: 'p1',
        sku: 'AC-008',
        average_cost: '4.2500',
        standard_cost: '4500.0000',
        cost_currency: 'IQD',
      }),
    ])
    const cell = costCell('AC-008')
    expect(cell).toHaveTextContent('4,500')
    expect(cell).toHaveTextContent('IQD')
    expect(cell).not.toHaveTextContent('4.25')
  })

  it('shows a dash, not "0", for a product whose cost was never recorded', () => {
    renderWith([
      product({
        id: 'p1',
        sku: 'NEW-001',
        average_cost: '0.0000',
        standard_cost: '0.0000',
        cost_currency: null,
      }),
    ])
    const cell = costCell('NEW-001')
    expect(cell).toHaveTextContent('—')
    expect(cell).not.toHaveTextContent('0')
    expect(cell).not.toHaveTextContent('Currency not set')
  })

  it('shows the amount with a "Currency not set" tag when the cost has no currency, and never guesses one', () => {
    renderWith([
      product({
        id: 'p1',
        sku: 'OLD-001',
        average_cost: '0.0000',
        standard_cost: '1200.0000',
        cost_currency: null,
      }),
    ])
    const cell = costCell('OLD-001')
    expect(cell).toHaveTextContent('1,200')
    expect(cell).toHaveTextContent('Currency not set')
    expect(cell).not.toHaveTextContent('IQD')
    expect(cell).not.toHaveTextContent('USD')
  })

  it('shows each product its own cost and currency, never converted', () => {
    renderWith([
      product({ id: 'p1', sku: 'A-1', standard_cost: '35.0000', cost_currency: 'USD' }),
      product({ id: 'p2', sku: 'B-2', standard_cost: '11.0000', cost_currency: 'IQD' }),
    ])
    expect(costCell('A-1')).toHaveTextContent(/35\s*USD/)
    expect(costCell('B-2')).toHaveTextContent(/11\s*IQD/)
  })
})
