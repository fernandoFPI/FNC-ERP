// The Equipment flag on a product (playbook #107): a product flagged "Equipment (must come back)" is lent out when it is issued, not used
// up. The form carries the flag and how long it may be out; clearing the flag sends null days so the server never keeps a stale period.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { CREATE_PRODUCT, PRODUCT_QUERY, UPDATE_PRODUCT } from '../../../../graphql/inventory'
import ProductForm from '../ProductForm'

// A value the test needs to exist: throws a readable error instead of a non-null assertion.
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('expected a value')
  return v
}

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
  }
})
vi.mock('../../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))
vi.mock('../../../../hooks/useProductStoreCategories', () => ({
  useProductStoreCategories: () => ({ categories: [] }),
}))

const createProduct = vi.fn()
const updateProduct = vi.fn()

function product(over: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    sku: 'EQP-001',
    name: 'Welding Machine 400A',
    name_ar: null,
    description: null,
    category: 'raw_material',
    sub_category: null,
    uom: 'EA',
    valuation_method: 'last_cost',
    standard_cost: '450',
    cost_currency: 'USD',
    average_cost: '0',
    is_active: true,
    reorder_point: null,
    reorder_qty: null,
    is_returnable: true,
    default_return_days: 5,
    qty_out: '0',
    ...over,
  }
}

// Built once and handed back unchanged: a fresh object per call would re-run the form's effect for ever.
let productResult: { data?: { product: ReturnType<typeof product> }; loading: boolean }

beforeEach(() => {
  vi.clearAllMocks()
  createProduct.mockResolvedValue({ data: {} })
  updateProduct.mockResolvedValue({ data: {} })
  productResult = { data: { product: product() }, loading: false }
  // A skipped query (the new-product form never asks for a product) returns nothing, as Apollo does.
  const none = { data: undefined, loading: false }
  mockUseQuery.mockImplementation((doc: unknown, opts?: { skip?: boolean }) =>
    doc === PRODUCT_QUERY && !opts?.skip ? productResult : none,
  )
  const createResult = [createProduct, { loading: false }]
  const updateResult = [updateProduct, { loading: false }]
  mockUseMutation.mockImplementation((doc: unknown) =>
    doc === CREATE_PRODUCT
      ? createResult
      : doc === UPDATE_PRODUCT
        ? updateResult
        : [vi.fn(), { loading: false }],
  )
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <Routes>
          <Route path="/inventory/products/new" element={<ProductForm />} />
          <Route path="/inventory/products/:id/edit" element={<ProductForm />} />
          <Route path="/inventory/products" element={<p>list</p>} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}
// The input a mocked product mutation was first called with.
const sentInput = (fn: { mock: { calls: unknown[][] } }): Record<string, unknown> => {
  const call = must(fn.mock.calls[0]) as [{ variables: { input: Record<string, unknown> } }]
  return call[0].variables.input
}
// The page's Input does not tie its label to the box: take the box in the label's own wrapper.
const boxOf = (label: string): HTMLInputElement => {
  const box = screen
    .getByText(label)
    .closest('div')
    ?.querySelector<HTMLInputElement>('input, textarea')
  if (!box) throw new Error(`no box for ${label}`)
  return box
}
const equipmentTick = () =>
  must(within(screen.getByTestId('equipment-block')).getAllByRole<HTMLInputElement>('checkbox')[0])

describe('ProductForm: the Equipment flag', () => {
  it('starts unticked on a new product, with no days box, and sends it as a plain consumable', async () => {
    renderAt('/inventory/products/new')
    expect(equipmentTick().checked).toBe(false)
    expect(screen.queryByText('May be out for (days)')).toBeNull()
    fireEvent.change(boxOf('Product Name'), { target: { value: 'Bolt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Product' }))
    await waitFor(() => {
      expect(createProduct).toHaveBeenCalledTimes(1)
    })
    expect(sentInput(createProduct)).toMatchObject({
      name: 'Bolt',
      is_returnable: false,
      default_return_days: null,
    })
  })

  it('shows the days box once ticked and sends the flag with the whole number of days', async () => {
    renderAt('/inventory/products/new')
    fireEvent.click(equipmentTick())
    expect(equipmentTick().checked).toBe(true)
    fireEvent.change(boxOf('Product Name'), { target: { value: 'Ladder' } })
    fireEvent.change(boxOf('May be out for (days)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Product' }))
    await waitFor(() => {
      expect(createProduct).toHaveBeenCalledTimes(1)
    })
    expect(sentInput(createProduct)).toMatchObject({
      is_returnable: true,
      default_return_days: 10,
    })
  })

  it('sends a ticked product with no days as null, so the server falls back to a week', async () => {
    renderAt('/inventory/products/new')
    fireEvent.click(equipmentTick())
    fireEvent.change(boxOf('Product Name'), { target: { value: 'Radio' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Product' }))
    await waitFor(() => {
      expect(createProduct).toHaveBeenCalledTimes(1)
    })
    expect(sentInput(createProduct)).toMatchObject({
      is_returnable: true,
      default_return_days: null,
    })
  })

  it('loads the flag and the days of an existing product, and unticking it clears the days it sends', async () => {
    renderAt('/inventory/products/p-1/edit')
    await waitFor(() => {
      expect(equipmentTick().checked).toBe(true)
    })
    expect(boxOf('May be out for (days)').value).toBe('5')
    fireEvent.click(equipmentTick())
    expect(screen.queryByText('May be out for (days)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => {
      expect(updateProduct).toHaveBeenCalledTimes(1)
    })
    expect(sentInput(updateProduct)).toMatchObject({
      is_returnable: false,
      default_return_days: null,
    })
  })

  it('says how much of the product is out with people, only when some is', async () => {
    productResult = { data: { product: product({ qty_out: '3.0000' }) }, loading: false }
    const { unmount } = renderAt('/inventory/products/p-1/edit')
    await waitFor(() => {
      expect(screen.getByText('Out with people: 3')).toBeTruthy()
    })
    unmount()
    productResult = { data: { product: product({ qty_out: '0' }) }, loading: false }
    renderAt('/inventory/products/p-1/edit')
    await waitFor(() => {
      expect(equipmentTick().checked).toBe(true)
    })
    expect(screen.queryByText(/Out with people/)).toBeNull()
  })
})
