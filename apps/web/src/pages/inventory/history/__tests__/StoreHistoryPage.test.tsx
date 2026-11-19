// Store History (playbook #109, phase 3): one list of Store In, Store Out, transfers and equipment returns.
// Renders the real page against mocked Apollo hooks. The server filters and orders; the page asks for what the person chose and shows it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import type * as ReactRouterDomModule from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { STOCK_LOCATIONS_QUERY, STORE_DOCUMENTS_QUERY } from '../../../../graphql/inventory'
import StoreHistoryPage from '../StoreHistoryPage'

// A value the test needs to exist: throws a readable error instead of a non-null assertion.
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error('expected a value')
  return v
}

const mockUseQuery = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return { ...actual, useQuery: (...args: unknown[]): unknown => mockUseQuery(...args) }
})
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDomModule>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const doc = (over: Record<string, unknown>) => ({
  id: 'd-1',
  docType: 'store_in',
  number: 'RCPT-00001',
  date: '2026-11-18',
  storeId: 'loc-main',
  storeName: 'Main Warehouse',
  party: 'Zagros Pipes Co.',
  reference: 'PO-2026-0755',
  lineCount: 3,
  status: 'confirmed',
  ...over,
})
const DOCS = [
  doc({}),
  doc({
    id: 'd-2',
    docType: 'store_out',
    number: 'SO-00201',
    party: 'Ahmed Ali',
    reference: null,
    lineCount: 2,
    status: 'issued',
  }),
  doc({
    id: 'd-3',
    docType: 'transfer',
    number: 'TRF-00003',
    party: 'Baghdad Site Store',
    reference: 'MR-7',
    lineCount: 1,
    status: 'received_short',
  }),
  doc({
    id: 'd-4',
    docType: 'return',
    number: 'ERET-00004',
    party: 'Store keeper',
    reference: null,
    lineCount: 1,
    status: 'done',
  }),
  doc({ id: 'd-5', docType: 'transfer', number: 'TRF-00005', status: 'cancelled' }),
  doc({ id: 'd-6', docType: 'store_in', number: 'RCPT-00006', status: 'draft' }),
]
const LOCATIONS = [
  { id: 'loc-main', name: 'Main Warehouse', type: 'warehouse', code: null, is_active: true },
  { id: 'loc-site', name: 'Baghdad Site Store', type: 'site', code: null, is_active: true },
  {
    id: 'loc-virtual',
    name: 'Virtual Consumption',
    type: 'virtual_out',
    code: null,
    is_active: true,
  },
]

// Built once and handed back unchanged on every render (a fresh object per call would re-run effects for ever).
let listResult: { data?: unknown; loading: boolean; error?: Error }
const locationsResult = { data: { stockLocations: LOCATIONS }, loading: false }

beforeEach(() => {
  vi.clearAllMocks()
  listResult = { data: { storeDocuments: DOCS }, loading: false }
  mockUseQuery.mockImplementation((doc_: unknown) =>
    doc_ === STORE_DOCUMENTS_QUERY
      ? listResult
      : doc_ === STOCK_LOCATIONS_QUERY
        ? locationsResult
        : { data: undefined, loading: false },
  )
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <StoreHistoryPage />
      </ThemeProvider>
    </MemoryRouter>,
  )
const rowOf = (text: string): HTMLElement => {
  const el = screen.getByText(text).closest('tr')
  if (!el) throw new Error(`no row around ${text}`)
  return el
}
const lastVariables = (): Record<string, unknown> => {
  const calls = (mockUseQuery.mock.calls as unknown[][]).filter(
    (c) => c[0] === STORE_DOCUMENTS_QUERY,
  ) as unknown as [unknown, { variables: Record<string, unknown> }][]
  return must(calls.at(-1))[1].variables
}
const selects = () => Array.from(document.querySelectorAll('select'))

describe('Store History', () => {
  it('shows each document with its type, store, who it concerns, its reference, its lines and its status', () => {
    renderPage()
    const storeIn = within(rowOf('RCPT-00001'))
    expect(storeIn.getByText('Store In')).toBeTruthy()
    expect(storeIn.getByText('Main Warehouse')).toBeTruthy()
    expect(storeIn.getByText('Zagros Pipes Co.')).toBeTruthy()
    expect(storeIn.getByText('PO-2026-0755')).toBeTruthy()
    expect(storeIn.getByText('Confirmed')).toBeTruthy()
    expect(within(rowOf('SO-00201')).getByText('Store Out')).toBeTruthy()
    expect(within(rowOf('SO-00201')).getByText('Issued')).toBeTruthy()
    expect(within(rowOf('TRF-00003')).getByText('Received short')).toBeTruthy()
    expect(within(rowOf('ERET-00004')).getByText('Equipment return')).toBeTruthy()
    expect(within(rowOf('ERET-00004')).getByText('Done')).toBeTruthy()
    expect(within(rowOf('TRF-00005')).getByText('Cancelled')).toBeTruthy()
    expect(within(rowOf('RCPT-00006')).getByText('Draft')).toBeTruthy()
  })

  it('asks for everything at first, then for the kind, the store and the search the person chose', () => {
    renderPage()
    expect(lastVariables()).toEqual({ type: undefined, locationId: undefined, search: undefined })
    const [typeSelect, storeSelect] = selects()
    fireEvent.change(must(typeSelect), { target: { value: 'transfer' } })
    expect(lastVariables().type).toBe('transfer')
    fireEvent.change(must(storeSelect), { target: { value: 'loc-site' } })
    expect(lastVariables().locationId).toBe('loc-site')
    fireEvent.change(screen.getByPlaceholderText('Search number, supplier, person or reference…'), {
      target: { value: '  zagros ' },
    })
    expect(lastVariables()).toEqual({ type: 'transfer', locationId: 'loc-site', search: 'zagros' })
  })

  it('offers real stores only in the store filter, never a virtual location', () => {
    renderPage()
    const storeSelect = must(selects()[1])
    const offered = Array.from(storeSelect.options).map((o) => o.textContent)
    expect(offered).toEqual(expect.arrayContaining(['Main Warehouse', 'Baghdad Site Store']))
    expect(offered).not.toContain('Virtual Consumption')
  })

  it('names every applied filter in a chip that takes it off, and clears them all', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull()
    fireEvent.change(must(selects()[0]), { target: { value: 'return' } })
    expect(screen.getByRole('button', { name: /clear all/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))
    expect(lastVariables().type).toBeUndefined()
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull()
  })

  it('opens the document on a click: its own page for a Store In and a Store Out, the details of that transfer for a transfer (cancelled ones too), the working page for a return', () => {
    renderPage()
    fireEvent.click(screen.getByText('RCPT-00001'))
    expect(mockNavigate).toHaveBeenLastCalledWith('/inventory/store-in/d-1')
    fireEvent.click(screen.getByText('SO-00201'))
    expect(mockNavigate).toHaveBeenLastCalledWith('/inventory/store-out/d-2')
    fireEvent.click(screen.getByText('TRF-00003'))
    expect(mockNavigate).toHaveBeenLastCalledWith('/inventory/temp-store?transfer=d-3')
    fireEvent.click(screen.getByText('TRF-00005'))
    expect(mockNavigate).toHaveBeenLastCalledWith('/inventory/temp-store?transfer=d-5')
    fireEvent.click(screen.getByText('ERET-00004'))
    expect(mockNavigate).toHaveBeenLastCalledWith('/inventory/returnables')
  })

  it('says so when there is nothing, with a way out when a filter is why, and shows the error when the list cannot load', () => {
    listResult = { data: { storeDocuments: [] }, loading: false }
    const { unmount } = renderPage()
    expect(screen.getByText('No documents yet')).toBeTruthy()
    fireEvent.change(must(selects()[0]), { target: { value: 'transfer' } })
    expect(screen.getByText('Nothing matches these filters')).toBeTruthy()
    unmount()
    listResult = { data: undefined, loading: false, error: new Error('boom') }
    renderPage()
    expect(screen.getByText('Could not load the history')).toBeTruthy()
    expect(screen.getByText('boom')).toBeTruthy()
  })

  it('tells the person when the list was cut at the most the server returns', () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      doc({ id: `m-${i}`, number: `RCPT-${String(i).padStart(5, '1')}` }),
    )
    listResult = { data: { storeDocuments: many }, loading: false }
    renderPage()
    expect(
      screen.getByText('Showing the newest 500. Narrow the filters to see older ones.'),
    ).toBeTruthy()
  })
})
