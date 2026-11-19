// The Purchase Orders list on a desktop: every applied filter is a named chip that can be taken off, the empty state has a way out,
// and ticking rows opens the selection bar and puts the select-all box in its "some" state.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'

// the element a test is about, or a clear failure (a cast would hide a null, and the lint rules forbid `!`)
const must = <T,>(x: T | null | undefined): T => {
  if (x == null) throw new Error('expected the element to exist')
  return x
}

const mockUseQuery = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: () => [vi.fn().mockResolvedValue({}), { loading: false }],
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})
vi.mock('../../../store/toastStore', () => ({ useToastStore: () => vi.fn() }))

const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

function po(over: Record<string, unknown>) {
  return {
    id: 'po-x',
    po_number: 'PO-2026-0001',
    vendor_name: 'Cash Purchase',
    vendor_id: 'v1',
    status: 'payment_pending',
    priority: 'low',
    total_amount: null,
    viewerCanSeeTotals: true,
    currency_code: 'IQD',
    currencyTotals: [{ currency_code: 'IQD', subtotal: '10000', line_count: 1 }],
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    expected_delivery_date: null,
    invoice_count: 0,
    project_id: null,
    projectCode: null,
    projectName: null,
    requisitionNumber: 'REQ-2026-0045',
    organizerName: 'Fernando Kakony',
    itemSearchText: null,
    ...over,
  }
}

const ROWS = [
  po({ id: 'po-54', po_number: 'PO-2026-0054', status: 'payment_pending' }),
  po({
    id: 'po-55',
    po_number: 'PO-2026-0055',
    status: 'closed',
    vendor_id: 'v2',
    vendor_name: 'Delta Steel',
  }),
  po({ id: 'po-53', po_number: 'PO-2026-0053', status: 'bought', priority: 'emergency' }),
]

let Page: ComponentType
beforeAll(async () => {
  Page = (await import('../purchase-orders/PurchaseOrdersPage')).default
}, 120_000)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setWidth(1024)
  // one result object for the list's own query, handed back every time (a fresh object per render would loop a page whose effects read it)
  const listResult = { data: { purchaseOrders: ROWS }, loading: false, refetch: vi.fn() }
  const otherResult = { data: undefined, loading: false, refetch: vi.fn() }
  mockUseQuery.mockImplementation(
    (doc: { definitions?: { kind?: string; name?: { value?: string } }[] }) => {
      const op = doc.definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      return op === 'PurchaseOrders' ? listResult : otherResult
    },
  )
})
afterEach(async () => {
  setWidth(1024)
  await i18n.changeLanguage('en')
})

function mount() {
  return render(
    <MemoryRouter initialEntries={['/procurement/purchase-orders']}>
      <ThemeProvider>
        <Page />
      </ThemeProvider>
    </MemoryRouter>,
  )
}
const shown = () => ROWS.map((r) => r.po_number).filter((n) => screen.queryByText(n))
const chipList = () => screen.queryByRole('list', { name: 'Applied filters' })
const pickStatus = (value: string) =>
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value } })
const openMore = () => fireEvent.click(screen.getByRole('button', { name: /more filters/i }))

describe('Purchase Orders list: applied filters', () => {
  it('has no chips while nothing is filtered, and shows every order', () => {
    mount()
    expect(chipList()).toBeNull()
    expect(shown()).toEqual(['PO-2026-0054', 'PO-2026-0055', 'PO-2026-0053'])
  })

  it('names a chosen status as a chip and narrows the list; taking the chip off brings the orders back', () => {
    mount()
    pickStatus('bought')
    const chips = within(must(chipList()))
    expect(chips.getAllByRole('listitem')[0]).toHaveTextContent('Status')
    expect(shown()).toEqual(['PO-2026-0053'])
    fireEvent.click(chips.getByRole('button', { name: /^Remove filter: Status/ }))
    expect(chipList()).toBeNull()
    expect(shown()).toHaveLength(3)
  })

  it('gives a filter chosen inside the More Filters panel a chip too, so it is never a hidden cause', () => {
    mount()
    openMore()
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'emergency' } })
    expect(within(must(chipList())).getAllByRole('listitem')[0]).toHaveTextContent('Priority')
    expect(shown()).toEqual(['PO-2026-0053'])
  })

  it('has one chip for each filter, and "Clear all" takes every one off at once', () => {
    mount()
    pickStatus('payment_pending')
    fireEvent.change(screen.getByRole('combobox', { name: 'Vendor' }), { target: { value: 'v1' } })
    const chips = within(must(chipList()))
    // two chips and the "Clear all" item
    expect(chips.getAllByRole('listitem')).toHaveLength(3)
    expect(shown()).toEqual(['PO-2026-0054'])
    fireEvent.click(chips.getByRole('button', { name: 'Clear all' }))
    expect(chipList()).toBeNull()
    expect(shown()).toHaveLength(3)
  })

  it('removing one chip leaves the other filter on', () => {
    mount()
    pickStatus('payment_pending')
    fireEvent.change(screen.getByRole('combobox', { name: 'Vendor' }), { target: { value: 'v1' } })
    fireEvent.click(
      within(must(chipList())).getByRole('button', { name: /^Remove filter: Status/ }),
    )
    expect(within(must(chipList())).getAllByRole('listitem')).toHaveLength(2)
    expect(shown()).toEqual(['PO-2026-0054', 'PO-2026-0053'])
  })

  it('shows an empty state with a way out when the filters match nothing, and the way out works', () => {
    mount()
    fireEvent.change(screen.getByPlaceholderText(i18n.t('po.list.searchPlaceholder')), {
      target: { value: 'no such order' },
    })
    expect(screen.getByText('No purchase orders match these filters.')).toBeInTheDocument()
    expect(shown()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }))
    expect(screen.queryByText('No purchase orders match these filters.')).toBeNull()
    expect(shown()).toHaveLength(3)
  })

  it('tags an emergency order beside its number', () => {
    mount()
    const cell = must(screen.getByText('PO-2026-0053').parentElement)
    expect(within(cell).getByText('Emergency')).toBeInTheDocument()
    const plain = must(screen.getByText('PO-2026-0054').parentElement)
    expect(within(plain).queryByText('Emergency')).toBeNull()
  })

  it('keeps the saved presets inside the More Filters panel instead of floating them over its edge, where the panel would cut them off', () => {
    mount()
    openMore()
    fireEvent.click(screen.getByRole('button', { name: /^Presets/ }))
    const panel = screen.getByRole('dialog', { name: 'More Filters' })
    const nameBox = within(panel).getByPlaceholderText(i18n.t('ui.presets.nameThisPreset'))
    const list = must(nameBox.parentElement?.parentElement?.parentElement)
    expect(list.style.position).not.toBe('absolute')
    expect(list).toHaveStyle({ width: '100%' })
  })
})

describe('Purchase Orders list: selecting rows', () => {
  const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name })

  it('has no selection bar until a row is ticked, then names the count', () => {
    mount()
    expect(screen.queryByRole('region', { name: /selected/ })).toBeNull()
    fireEvent.click(box('Select PO-2026-0054'))
    expect(screen.getByRole('region', { name: '1 order selected' })).toBeInTheDocument()
  })

  it('puts the select-all box in its "some" state while part of the list is ticked, and ticks it when all are', () => {
    mount()
    expect(box('Select all').indeterminate).toBe(false)
    fireEvent.click(box('Select PO-2026-0054'))
    expect(box('Select all').indeterminate).toBe(true)
    expect(box('Select all')).not.toBeChecked()
    fireEvent.click(box('Select all'))
    expect(box('Select all')).toBeChecked()
    expect(box('Select all').indeterminate).toBe(false)
    expect(screen.getByRole('region', { name: '3 orders selected' })).toBeInTheDocument()
  })

  it('clears the selection from the bar', () => {
    mount()
    fireEvent.click(box('Select PO-2026-0054'))
    fireEvent.click(
      within(screen.getByRole('region', { name: '1 order selected' })).getByRole('button', {
        name: 'Clear selection',
      }),
    )
    expect(screen.queryByRole('region', { name: /selected/ })).toBeNull()
    expect(box('Select PO-2026-0054')).not.toBeChecked()
  })
})
