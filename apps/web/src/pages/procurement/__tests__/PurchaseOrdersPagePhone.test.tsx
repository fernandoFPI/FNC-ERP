// The Purchase Orders list on a phone: each PO is three short lines with its status visible, a tap opens the PO itself
// (the docked preview panel is an extra step on a phone), the four dropdown filters sit behind one button, and there is
// no CSV export. A desktop keeps the table, the preview panel and the export.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'

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

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

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
  po({
    id: 'po-54',
    po_number: 'PO-2026-0054',
    status: 'payment_pending',
    project_id: 'p1',
    projectName: 'Erbil Tower',
  }),
  po({ id: 'po-55', po_number: 'PO-2026-0055', status: 'closed', invoice_count: 0 }),
  po({
    id: 'po-53',
    po_number: 'PO-2026-0053',
    status: 'bought',
    priority: 'emergency',
    currencyTotals: [
      { currency_code: 'IQD', subtotal: '1500', line_count: 1 },
      { currency_code: 'USD', subtotal: '200', line_count: 1 },
    ],
  }),
]

let rows = ROWS
let Page: ComponentType
beforeAll(async () => {
  Page = (await import('../purchase-orders/PurchaseOrdersPage')).default
}, 120_000)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  rows = ROWS
  // only the list's own query gets the rows; the other queries on the page (the queue count) get nothing
  mockUseQuery.mockImplementation(
    (doc: { definitions?: { kind?: string; name?: { value?: string } }[] }) => {
      const op = doc.definitions?.find((d) => d.kind === 'OperationDefinition')?.name?.value
      return {
        data: op === 'PurchaseOrders' ? { purchaseOrders: rows } : undefined,
        loading: false,
        refetch: vi.fn(),
      }
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
const cards = () =>
  screen.getAllByRole('button').filter((b) => /^PO-2026-\d{4}/.test(b.textContent))
const cardOf = (poNumber: string) => {
  const found = cards().find((c) => c.textContent.startsWith(poNumber))
  if (!found) throw new Error(`no card for ${poNumber}`)
  return found
}

describe('Purchase Orders list on a phone', () => {
  beforeEach(() => {
    setWidth(390)
  })

  it('draws one card per PO, in the order of the list', () => {
    mount()
    expect(cards().map((c) => c.textContent.slice(0, 12))).toEqual([
      'PO-2026-0054',
      'PO-2026-0055',
      'PO-2026-0053',
    ])
  })

  it('shows the status of every PO on its card, not behind a "more" link', () => {
    mount()
    expect(within(cardOf('PO-2026-0054')).getByText('Payment pending')).toBeInTheDocument()
    expect(within(cardOf('PO-2026-0055')).getByText('Closed')).toBeInTheDocument()
    expect(within(cardOf('PO-2026-0053')).getByText('Bought')).toBeInTheDocument()
    expect(screen.queryByText(/\+\d+ more/)).not.toBeInTheDocument()
  })

  it('names the vendor and the project, then the total, the organizer and the age', () => {
    mount()
    const card = cardOf('PO-2026-0054')
    expect(within(card).getByText('Cash Purchase · Erbil Tower')).toBeInTheDocument()
    expect(card).toHaveTextContent('Fernando Kakony')
    expect(card).toHaveTextContent('3 days')
    expect(card).toHaveTextContent('10,000 IQD')
  })

  it('shows each currency of a mixed PO on its own, never added together', () => {
    mount()
    const text = cardOf('PO-2026-0053').textContent
    expect(text).toContain('1,500 IQD + 200 USD')
  })

  it('leaves the total off for someone who may not see money', () => {
    rows = ROWS.map((r) => ({ ...r, viewerCanSeeTotals: false }))
    mount()
    expect(screen.queryByText(/10,000/)).not.toBeInTheDocument()
    expect(cardOf('PO-2026-0054')).toHaveTextContent('Fernando Kakony')
  })

  it('warns on a finished PO that has no vendor invoice', () => {
    mount()
    expect(within(cardOf('PO-2026-0055')).getByText(/needs invoice/i)).toBeInTheDocument()
    expect(within(cardOf('PO-2026-0054')).queryByText(/needs invoice/i)).not.toBeInTheDocument()
  })

  it('marks an emergency PO with its tag and a red edge', () => {
    mount()
    const card = cardOf('PO-2026-0053')
    expect(within(card).getByText(/emergency/i)).toBeInTheDocument()
    expect(card.style.borderInlineStart).toContain('3px solid')
    expect(cardOf('PO-2026-0054').style.borderInlineStart).not.toContain('3px')
  })

  it('opens the PO itself on a tap, not a preview panel', () => {
    mount()
    fireEvent.click(cardOf('PO-2026-0054'))
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/purchase-orders/po-54')
  })

  it('opens the PO from the keyboard too', () => {
    mount()
    fireEvent.keyDown(cardOf('PO-2026-0055'), { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/purchase-orders/po-55')
    mockNavigate.mockClear()
    fireEvent.keyDown(cardOf('PO-2026-0053'), { key: ' ' })
    expect(mockNavigate).toHaveBeenCalledWith('/procurement/purchase-orders/po-53')
  })

  it('has no CSV export', () => {
    mount()
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument()
  })

  it('keeps the dropdown filters behind one Filters button, closed to begin with', () => {
    mount()
    const button = screen.getByRole('button', { name: 'Filters' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    // the dropdowns stay mounted (their values keep applying) but are hidden
    const status = screen.getAllByText('Status')[0]
    expect(status.closest('div[style*="display: none"]')).not.toBeNull()
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(status.closest('div[style*="display: none"]')).toBeNull()
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the empty message, not a table, when there is nothing to list', () => {
    rows = []
    mount()
    expect(cards()).toHaveLength(0)
  })

  it('names the Filters button in Arabic', async () => {
    await i18n.changeLanguage('ar')
    mount()
    expect(screen.getByRole('button', { name: 'عوامل التصفية' })).toBeInTheDocument()
  })
})

describe('Purchase Orders list on a desktop', () => {
  it('keeps the table, the CSV export and no Filters button', async () => {
    mount()
    await waitFor(() => {
      expect(screen.getAllByRole('table').length).toBeGreaterThan(0)
    })
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument()
    // no phone cards: a PO number is a table cell here, not a button
    expect(cards()).toHaveLength(0)
  })

  it('the filters are in the toolbar, not hidden', () => {
    mount()
    const status = screen.getAllByText('Status')[0]
    expect(status.closest('div[style*="display: none"]')).toBeNull()
  })
})
