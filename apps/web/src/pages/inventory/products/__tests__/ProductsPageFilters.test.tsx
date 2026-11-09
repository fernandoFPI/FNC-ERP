// Products list filters survive opening a product and coming back. The page unmounts when a product is opened and its
// filters (plain component state) went with it, so Back showed the whole list again. They are now kept for the browser
// tab in sessionStorage, the way the Projects and Requisitions lists keep theirs. Both ways back are covered: the product
// page's own Back button (a fresh visit to /inventory/products, so a URL-only fix would not have helped) and the browser's.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { BOMS_QUERY } from '../../../../graphql/manufacturing'
import { PRODUCTS_QUERY } from '../../../../graphql/inventory'
import ProductsPage from '../ProductsPage'

const mockUseQuery = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return { ...actual, useQuery: (...args: unknown[]): unknown => mockUseQuery(...args) }
})

vi.mock('../../../../hooks/useEntityChanged', () => ({ useEntityChanged: () => undefined }))

vi.mock('../../../../hooks/useProductStoreCategories', () => ({
  useProductStoreCategories: () => ({
    categories: [
      { id: 's1', name: 'Steel Store', sku_prefix: 'STEEL', slug: 'steel', is_active: true },
      { id: 's2', name: 'Paint Store', sku_prefix: 'PAINT', slug: 'paint', is_active: true },
    ],
  }),
}))

const KEY = 'products-page-filters'

function product(sku: string, over: Record<string, unknown> = {}) {
  return {
    id: `id-${sku}`,
    sku,
    name: `Item ${sku}`,
    name_ar: null,
    category: 'raw_material',
    sub_category: null,
    uom: 'EA',
    valuation_method: 'last_cost',
    average_cost: '0',
    standard_cost: '10',
    cost_currency: 'USD',
    is_active: true,
    reorder_point: null,
    qty_on_hand: '100',
    ...over,
  }
}

// SKU-NORMAL sits in the Steel Store, SKU-LOW is below its reorder point and SKU-BOM is a manufactured product.
const PRODUCTS = [
  product('SKU-NORMAL', { sub_category: 'Steel Store' }),
  product('SKU-LOW', { reorder_point: '50', qty_on_hand: '5' }),
  product('SKU-BOM'),
]

function Detail() {
  const navigate = useNavigate()
  return (
    <div>
      <p>A product page</p>
      <button
        onClick={() => {
          navigate('/inventory/products')
        }}
      >
        Back button
      </button>
      <button
        onClick={() => {
          navigate(-1)
        }}
      >
        Browser back
      </button>
    </div>
  )
}

function mount() {
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === PRODUCTS_QUERY)
      return { data: { products: PRODUCTS }, loading: false, refetch: vi.fn() }
    if (doc === BOMS_QUERY)
      return {
        data: { boms: [{ finished_product_id: 'id-SKU-BOM' }] },
        loading: false,
        refetch: vi.fn(),
      }
    return { data: undefined, loading: false, refetch: vi.fn() }
  })
  return render(
    <MemoryRouter initialEntries={['/inventory/products']}>
      <ThemeProvider>
        <Routes>
          <Route path="/inventory/products" element={<ProductsPage />} />
          <Route path="/inventory/products/:id" element={<Detail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

// The filter dropdowns are searchable selects: click the one showing `from` to open it, then choose on mouse-down.
function pick(from: string, option: string) {
  fireEvent.click(screen.getByText(from))
  // The open list is drawn last (in a portal); a product row can show the same store name, so take the last match.
  const matches = screen.getAllByText(option)
  fireEvent.mouseDown(matches[matches.length - 1])
}
const shows = (text: string) => screen.queryByText(text) !== null
const searchBox = () => screen.getByPlaceholderText<HTMLInputElement>('Search…')
const has = (sku: string) => screen.queryByText(sku) !== null

// What the Products query was last asked for.
function lastCategoryAsked(): unknown {
  const all = mockUseQuery.mock.calls as [unknown, { variables?: { category?: string } }?][]
  const calls = all.filter((c) => c[0] === PRODUCTS_QUERY)
  return calls[calls.length - 1]?.[1]?.variables?.category
}

function openProductAndGoBack(how: 'Back button' | 'Browser back', sku = 'SKU-NORMAL') {
  fireEvent.click(screen.getByText(sku))
  expect(screen.getByText('A product page')).toBeInTheDocument()
  fireEvent.click(screen.getByText(how))
}

beforeEach(() => {
  sessionStorage.clear()
  mockUseQuery.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Products filters: open a product, come back', () => {
  it.each(['Back button', 'Browser back'] as const)('keeps the category filter (%s)', (how) => {
    mount()
    pick('All Category', 'Raw Material')
    expect(lastCategoryAsked()).toBe('raw_material')

    openProductAndGoBack(how)

    expect(shows('Raw Material')).toBe(true)
    expect(shows('All Category')).toBe(false)
    expect(lastCategoryAsked()).toBe('raw_material') // the list is fetched with it again, not unfiltered
  })

  it('keeps the store filter that goes with Raw Material', () => {
    mount()
    pick('All Category', 'Raw Material')
    pick('All Store', 'Steel Store')

    openProductAndGoBack('Back button')

    expect(shows('Raw Material')).toBe(true)
    expect(shows('All Store')).toBe(false) // a store is still selected
    // and the list is still narrowed to that store: only SKU-NORMAL sits in the Steel Store
    expect(has('SKU-NORMAL')).toBe(true)
    expect(has('SKU-LOW')).toBe(false)
    expect(has('SKU-BOM')).toBe(false)
  })

  it('keeps the search text', () => {
    mount()
    fireEvent.change(searchBox(), { target: { value: 'normal' } })
    expect(has('SKU-LOW')).toBe(false) // the search narrowed the list
    openProductAndGoBack('Back button', 'SKU-NORMAL')
    expect(searchBox().value).toBe('normal')
    expect(has('SKU-LOW')).toBe(false)
  })

  it('keeps Low Stock Only: only the low stock product is listed after coming back', () => {
    mount()
    fireEvent.click(screen.getByText('Low Stock Only'))
    expect(has('SKU-NORMAL')).toBe(false)
    openProductAndGoBack('Back button', 'SKU-LOW')
    expect(has('SKU-LOW')).toBe(true)
    expect(has('SKU-NORMAL')).toBe(false)
    expect(has('SKU-BOM')).toBe(false)
  })

  it('keeps Manufactured Only: only the product with a BOM is listed after coming back', () => {
    mount()
    fireEvent.click(screen.getByText('Manufactured Only'))
    openProductAndGoBack('Back button', 'SKU-BOM')
    expect(has('SKU-BOM')).toBe(true)
    expect(has('SKU-NORMAL')).toBe(false)
    expect(has('SKU-LOW')).toBe(false)
  })

  it('remembers a filter that was cleared, so you are never stuck with an old one', () => {
    mount()
    pick('All Category', 'Consumable')
    pick('Consumable', 'All Category')
    openProductAndGoBack('Back button')
    expect(shows('All Category')).toBe(true)
    expect(lastCategoryAsked()).toBeUndefined()
  })

  it('starts with no filters on a first visit', () => {
    mount()
    expect(shows('All Category')).toBe(true)
    expect(searchBox().value).toBe('')
    expect(has('SKU-NORMAL') && has('SKU-LOW') && has('SKU-BOM')).toBe(true)
    expect(lastCategoryAsked()).toBeUndefined()
  })

  it('saves the filters under one key, the way the Projects and Requisitions lists do', () => {
    mount()
    pick('All Category', 'Raw Material')
    pick('All Store', 'Paint Store')
    fireEvent.change(searchBox(), { target: { value: 'tin' } })
    expect(JSON.parse(sessionStorage.getItem(KEY) ?? '{}')).toEqual({
      search: 'tin',
      category: 'raw_material',
      subCategory: 'Paint Store',
      showLowStock: 'false',
      showHasBom: 'false',
    })
  })
})

describe('Products filters: what is saved but no longer makes sense', () => {
  it('drops a category that no longer exists instead of leaving a filter nobody can see', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ category: 'old_category' }))
    mount()
    expect(shows('All Category')).toBe(true)
    expect(lastCategoryAsked()).toBeUndefined()
  })

  it('drops a store saved under another category, since a store only means something under Raw Material', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ category: 'finished_goods', subCategory: 'Steel Store' }),
    )
    mount()
    expect(shows('Finished Goods')).toBe(true)
    expect(shows('All Store')).toBe(false) // no store filter under another category
    // ...and the old store does not come back when Raw Material is chosen later.
    pick('Finished Goods', 'Raw Material')
    expect(shows('All Store')).toBe(true)
    expect(has('SKU-LOW') && has('SKU-BOM') && has('SKU-NORMAL')).toBe(true) // no store narrowing the list
  })

  it('ignores corrupt storage', () => {
    sessionStorage.setItem(KEY, '{not json')
    mount()
    expect(shows('All Category')).toBe(true)
    expect(searchBox().value).toBe('')
  })

  it('ignores values of the wrong type inside valid storage', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ search: 5, category: ['raw_material'], showLowStock: true }),
    )
    mount()
    expect(searchBox().value).toBe('')
    expect(shows('All Category')).toBe(true)
    expect(has('SKU-NORMAL')).toBe(true) // a stray `true` does not switch Low Stock Only on
  })

  it('still works when the browser will not let the page use session storage', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })
    mount()
    pick('All Category', 'Service')
    expect(shows('Service')).toBe(true)
  })
})
