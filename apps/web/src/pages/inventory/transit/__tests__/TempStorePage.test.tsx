// Temp Store & Transit (playbook #108, phase 2): goods waiting in temporary stores, transfers on the road, receiving them.
// Renders the real page against mocked Apollo hooks. The server decides what is late and what is allowed; the page shows it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import {
  CANCEL_STORE_TRANSFER,
  CREATE_STORE_TRANSFER,
  PRODUCTS_QUERY,
  RECEIVE_STORE_TRANSFER,
  STOCK_LOCATIONS_QUERY,
  STORE_TRANSFERS_QUERY,
  TEMP_STORE_ITEMS_QUERY,
  TEMP_STORE_SUMMARY_QUERY,
} from '../../../../graphql/inventory'
import TempStorePage from '../TempStorePage'

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
const toasts: { type: string; message: string }[] = []
vi.mock('../../../../store/toastStore', () => ({
  useToastStore: () => (t: { type: string; message: string }) => {
    toasts.push(t)
  },
}))

const waitingRow = (over: Record<string, unknown> = {}) => ({
  productId: 'p-1',
  productName: 'PVC Pipe 4 in',
  productNameAr: null,
  sku: 'PVC-004',
  uom: 'PCS',
  locationId: 'loc-temp',
  locationName: 'Erbil Temporary Store',
  qty: 40,
  since: '2026-11-01',
  daysWaiting: 18,
  late: true,
  poNumbers: 'PO-2026-0755',
  suppliers: 'Zagros Pipes Co.',
  destinationLocationId: 'loc-site',
  destinationName: 'Baghdad Site Store',
  ...over,
})
const WAITING = [
  waitingRow(),
  waitingRow({
    productId: 'p-2',
    productName: 'Safety Gloves',
    sku: 'CON-003',
    uom: 'PAIR',
    qty: 100,
    daysWaiting: 2,
    late: false,
    destinationLocationId: 'loc-site',
    destinationName: 'Baghdad Site Store',
    poNumbers: 'PO-2026-0790',
    suppliers: 'Erbil Safety Supplies',
  }),
  waitingRow({
    productId: 'p-3',
    productName: 'Cutting Disc',
    sku: 'CON-002',
    locationId: 'loc-temp2',
    locationName: 'Basrah Temporary Store',
    qty: 200,
    daysWaiting: 1,
    late: false,
    destinationLocationId: 'loc-main',
    destinationName: 'Main Warehouse',
  }),
]
const transfer = (over: Record<string, unknown> = {}) => ({
  id: 't-1',
  transferNumber: 'TRF-00001',
  transferDate: '2026-11-17',
  status: 'in_transit',
  fromLocationId: 'loc-temp',
  fromLocationName: 'Erbil Temporary Store',
  toLocationId: 'loc-main',
  toLocationName: 'Main Warehouse',
  driverName: 'Saman Aziz',
  vehicleNo: 'ERB 45213',
  waybillNo: 'WB-1022',
  reference: null,
  notes: null,
  daysInTransit: 2,
  receivedDate: null,
  receivedByName: null,
  lines: [
    {
      id: 'l-1',
      productId: 'p-1',
      productName: 'PVC Pipe 4 in',
      sku: 'PVC-004',
      uom: 'PCS',
      qtySent: 30,
      qtyReceived: null,
      remarks: null,
      receiveRemarks: null,
    },
    {
      id: 'l-2',
      productId: 'p-2',
      productName: 'Safety Gloves',
      sku: 'CON-003',
      uom: 'PAIR',
      qtySent: 10,
      qtyReceived: null,
      remarks: null,
      receiveRemarks: null,
    },
  ],
  ...over,
})
const TRANSFERS = [
  transfer(),
  transfer({
    id: 't-2',
    transferNumber: 'TRF-00002',
    status: 'received',
    daysInTransit: null,
    receivedDate: '2026-11-15',
  }),
  transfer({
    id: 't-3',
    transferNumber: 'TRF-00003',
    status: 'received_short',
    daysInTransit: null,
    receivedDate: '2026-11-14',
  }),
  transfer({ id: 't-4', transferNumber: 'TRF-00004', status: 'cancelled', daysInTransit: null }),
]
const SUMMARY = { itemsWaiting: 3, waitingTooLong: 1, inTransit: 1, oldestDays: 18 }
const LOCATIONS = [
  { id: 'loc-main', name: 'Main Warehouse', code: 'WH', type: 'warehouse', is_active: true },
  { id: 'loc-site', name: 'Baghdad Site Store', code: null, type: 'site', is_active: true },
  { id: 'loc-temp', name: 'Erbil Temporary Store', code: null, type: 'temporary', is_active: true },
  {
    id: 'loc-temp2',
    name: 'Basrah Temporary Store',
    code: null,
    type: 'temporary',
    is_active: true,
  },
  { id: 'loc-transit', name: 'Transit', code: null, type: 'transit', is_active: true },
  {
    id: 'loc-virtual',
    name: 'Virtual Consumption',
    code: null,
    type: 'virtual_out',
    is_active: true,
  },
]
const PRODUCTS = [
  { id: 'p-1', sku: 'PVC-004', name: 'PVC Pipe 4 in', name_ar: null },
  { id: 'p-2', sku: 'CON-003', name: 'Safety Gloves', name_ar: null },
]

// Results are built once and handed back unchanged on every render (a fresh object per call would re-run effects for ever).
const results = new Map<unknown, unknown>()
const refetch = vi.fn()
const createFn = vi.fn()
const receiveFn = vi.fn()
const cancelFn = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  toasts.length = 0
  results.clear()
  results.set(TEMP_STORE_ITEMS_QUERY, {
    data: { tempStoreItems: WAITING },
    loading: false,
    refetch,
  })
  results.set(TEMP_STORE_SUMMARY_QUERY, {
    data: { tempStoreSummary: SUMMARY },
    loading: false,
    refetch,
  })
  results.set(STORE_TRANSFERS_QUERY, {
    data: { storeTransfers: TRANSFERS },
    loading: false,
    refetch,
  })
  results.set(STOCK_LOCATIONS_QUERY, { data: { stockLocations: LOCATIONS }, loading: false })
  results.set(PRODUCTS_QUERY, { data: { products: PRODUCTS }, loading: false })
  mockUseQuery.mockImplementation(
    (doc: unknown) => results.get(doc) ?? { data: undefined, loading: false, refetch },
  )
  const c = [createFn, { loading: false }]
  const r = [receiveFn, { loading: false }]
  const x = [cancelFn, { loading: false }]
  mockUseMutation.mockImplementation((doc: unknown) =>
    doc === CREATE_STORE_TRANSFER
      ? c
      : doc === RECEIVE_STORE_TRANSFER
        ? r
        : doc === CANCEL_STORE_TRANSFER
          ? x
          : [vi.fn(), { loading: false }],
  )
})

const renderPage = (url = '/inventory/temp-store') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ThemeProvider>
        <TempStorePage />
      </ThemeProvider>
    </MemoryRouter>,
  )
const boxOf = (root: HTMLElement, label: string): HTMLInputElement => {
  const box = within(root)
    .getByText(label)
    .closest('div')
    ?.querySelector<HTMLInputElement>('input, textarea')
  if (!box) throw new Error(`no box for ${label}`)
  return box
}
const rowOf = (text: string): HTMLElement => {
  const el = screen.getByText(text).closest('tr')
  if (!el) throw new Error(`no row around ${text}`)
  return el
}
const sentInput = (fn: { mock: { calls: unknown[][] } }): Record<string, unknown> => {
  const call = must(fn.mock.calls[0]) as [{ variables: { input: Record<string, unknown> } }]
  return call[0].variables.input
}

describe('Temp Store & Transit: what waits and what is on the road', () => {
  it('shows the four numbers the server counted', () => {
    renderPage()
    expect(screen.getByText('Waiting in temp stores')).toBeTruthy()
    expect(screen.getByText('Waiting too long')).toBeTruthy()
    expect(screen.getByText('Oldest waiting')).toBeTruthy()
    expect(screen.getAllByText('In transit').length).toBeGreaterThan(0)
    for (const n of ['3', '1', '18']) expect(screen.getAllByText(n).length).toBeGreaterThan(0)
  })

  it('lists each waiting item with its store, supplier and PO, destination, and flags the late one', () => {
    renderPage()
    const first = within(rowOf('PVC Pipe 4 in'))
    expect(first.getByText('Waiting 18 days')).toBeTruthy()
    expect(first.getByText('Erbil Temporary Store')).toBeTruthy()
    expect(first.getByText('PO-2026-0755')).toBeTruthy()
    expect(first.getByText('Zagros Pipes Co.')).toBeTruthy()
    expect(first.getByText('Baghdad Site Store')).toBeTruthy()
    expect(within(rowOf('Safety Gloves')).getByText('Awaiting dispatch')).toBeTruthy()
  })

  it('shows what is in transit with its truck and a Receive and a Cancel button, and what was received recently', () => {
    renderPage()
    const row = within(rowOf('TRF-00001'))
    expect(row.getByText('Saman Aziz')).toBeTruthy()
    expect(row.getByText(/ERB 45213 · WB-1022/)).toBeTruthy()
    expect(row.getByRole('button', { name: 'Receive' })).toBeTruthy()
    expect(row.getByRole('button', { name: 'Cancel transfer' })).toBeTruthy()
    // received ones are listed below, a cancelled one is on neither list
    expect(within(rowOf('TRF-00002')).getByText('Received')).toBeTruthy()
    expect(within(rowOf('TRF-00003')).getByText('Received short')).toBeTruthy()
    expect(screen.queryByText('TRF-00004')).toBeNull()
  })

  it('says so when nothing waits and nothing is on the road', () => {
    results.set(TEMP_STORE_ITEMS_QUERY, { data: { tempStoreItems: [] }, loading: false, refetch })
    results.set(STORE_TRANSFERS_QUERY, { data: { storeTransfers: [] }, loading: false, refetch })
    renderPage()
    expect(screen.getByText('Nothing waiting in temporary stores')).toBeTruthy()
    expect(screen.getByText('No transfers in transit')).toBeTruthy()
    expect(screen.getByText('None yet')).toBeTruthy()
  })
})

describe('Temp Store & Transit: sending items on', () => {
  it('opens the transfer prefilled from the ticked items: their store, their shared destination, their quantities', () => {
    renderPage()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /Send selected/ }).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PVC Pipe 4 in' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Safety Gloves' }))
    fireEvent.click(screen.getByRole('button', { name: /Send selected \(2\)/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Erbil Temporary Store · Temporary')).toBeTruthy()
    expect(within(dialog).getByText('Baghdad Site Store')).toBeTruthy()
    const lines = within(dialog).getAllByTestId('transfer-line')
    expect(lines).toHaveLength(2)
    expect(boxOf(must(lines[0]), 'Qty').value).toBe('40')
    expect(boxOf(must(lines[1]), 'Qty').value).toBe('100')
    fireEvent.change(boxOf(dialog, 'Driver'), { target: { value: ' Saman ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send transfer' }))
    expect(createFn).toHaveBeenCalledTimes(1)
    expect(sentInput(createFn)).toMatchObject({
      fromLocationId: 'loc-temp',
      toLocationId: 'loc-site',
      driverName: 'Saman',
      lines: [
        { productId: 'p-1', qty: 40 },
        { productId: 'p-2', qty: 100 },
      ],
    })
  })

  it('refuses items from two temporary stores at once, and says why, without opening anything', () => {
    renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PVC Pipe 4 in' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Cutting Disc' }))
    fireEvent.click(screen.getByRole('button', { name: /Send selected/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toasts.at(-1)).toEqual({
      type: 'error',
      message: 'Choose items from one temporary store at a time',
    })
  })

  it('leaves the destination empty when the ticked items are going to different places', () => {
    // two items of one store, bound for two different places
    results.set(TEMP_STORE_ITEMS_QUERY, {
      data: {
        tempStoreItems: [
          WAITING[0],
          {
            ...must(WAITING[1]),
            destinationLocationId: 'loc-main',
            destinationName: 'Main Warehouse',
          },
        ],
      },
      loading: false,
      refetch,
    })
    renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select PVC Pipe 4 in' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Safety Gloves' }))
    fireEvent.click(screen.getByRole('button', { name: /Send selected/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Erbil Temporary Store · Temporary')).toBeTruthy()
    // only the To store is still to choose
    expect(within(dialog).getAllByText('Select a store')).toHaveLength(1)
  })

  it('a new transfer starts empty, will not send until both stores and an item with a quantity are chosen, and offers real places only', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'New transfer' }))
    const dialog = screen.getByRole('dialog')
    const send = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Send transfer' })
    expect(send.disabled).toBe(true)
    // the From list: warehouses, sites and temporary stores only (never the transit or a virtual location)
    fireEvent.click(must(within(dialog).getAllByText('Select a store')[0]))
    expect(screen.queryByText('Transit')).toBeNull()
    expect(screen.queryByText('Virtual Consumption')).toBeNull()
    fireEvent.mouseDown(must(screen.getAllByText('Main Warehouse (WH)').at(-1)))
    fireEvent.click(must(within(dialog).getAllByText('Select a store')[0]))
    // the To list does not offer the store already chosen as From
    expect(screen.getAllByText('Main Warehouse (WH)')).toHaveLength(1)
    fireEvent.mouseDown(must(screen.getAllByText('Baghdad Site Store').at(-1)))
    expect(send.disabled).toBe(true) // no item yet
    fireEvent.click(within(dialog).getByText('Search name or SKU…'))
    fireEvent.mouseDown(must(screen.getAllByText('Safety Gloves').at(-1)))
    expect(send.disabled).toBe(true) // no quantity yet
    fireEvent.change(boxOf(dialog, 'Qty'), { target: { value: '5' } })
    expect(send.disabled).toBe(false)
  })
})

describe('Temp Store & Transit: the same store at both ends', () => {
  it('will not send once the From store is changed to the To store that was already chosen', () => {
    results.set(TEMP_STORE_ITEMS_QUERY, { data: { tempStoreItems: [] }, loading: false, refetch })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'New transfer' }))
    const dialog = screen.getByRole('dialog')
    const send = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Send transfer' })
    fireEvent.click(must(within(dialog).getAllByText('Select a store')[0]))
    fireEvent.mouseDown(must(screen.getAllByText('Main Warehouse (WH)').at(-1)))
    fireEvent.click(must(within(dialog).getAllByText('Select a store')[0]))
    fireEvent.mouseDown(must(screen.getAllByText('Baghdad Site Store').at(-1)))
    fireEvent.click(within(dialog).getByText('Search name or SKU…'))
    fireEvent.mouseDown(must(screen.getAllByText('Safety Gloves').at(-1)))
    fireEvent.change(boxOf(dialog, 'Qty'), { target: { value: '5' } })
    expect(send.disabled).toBe(false)
    // now the From store becomes the To store
    fireEvent.click(within(dialog).getByText('Main Warehouse (WH)'))
    fireEvent.mouseDown(must(screen.getAllByText('Baghdad Site Store').at(-1)))
    expect(send.disabled).toBe(true)
  })
})

describe('Temp Store & Transit: receiving and cancelling', () => {
  const openReceive = () => {
    renderPage()
    fireEvent.click(within(rowOf('TRF-00001')).getByRole('button', { name: 'Receive' }))
    return screen.getByRole('dialog')
  }

  it('starts with everything received and sends exactly that', () => {
    const dialog = openReceive()
    const lines = within(dialog).getAllByTestId('receive-line')
    expect(boxOf(must(lines[0]), 'Received').value).toBe('30')
    expect(boxOf(must(lines[1]), 'Received').value).toBe('10')
    fireEvent.change(boxOf(dialog, 'Received by'), { target: { value: 'Store 2' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm receipt' }))
    expect(receiveFn).toHaveBeenCalledTimes(1)
    const call = must(receiveFn.mock.calls[0]) as [
      {
        variables: {
          id: string
          input: { receivedByName: string; lines: { lineId: string; qtyReceived: number }[] }
        }
      },
    ]
    expect(call[0].variables.id).toBe('t-1')
    expect(call[0].variables.input.receivedByName).toBe('Store 2')
    expect(call[0].variables.input.lines).toEqual([
      { lineId: 'l-1', qtyReceived: 30, remarks: undefined },
      { lineId: 'l-2', qtyReceived: 10, remarks: undefined },
    ])
  })

  it('treats a smaller number as a shortage: it asks what happened, warns that the rest is written off, and keeps Confirm off until it is said', () => {
    const dialog = openReceive()
    const lines = within(dialog).getAllByTestId('receive-line')
    const confirm = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Confirm receipt' })
    fireEvent.change(boxOf(must(lines[0]), 'Received'), { target: { value: '25' } })
    expect(
      within(dialog).getByText('Say what happened to the items that did not arrive'),
    ).toBeTruthy()
    expect(within(dialog).getByText(/1 item\(s\) arrived short/)).toBeTruthy()
    expect(confirm.disabled).toBe(true)
    fireEvent.change(boxOf(must(lines[0]), 'Remarks (shortage / damage)'), {
      target: { value: '5 crushed' },
    })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    const call = must(receiveFn.mock.calls[0]) as [
      {
        variables: { input: { lines: { lineId: string; qtyReceived: number; remarks?: string }[] } }
      },
    ]
    expect(call[0].variables.input.lines[0]).toEqual({
      lineId: 'l-1',
      qtyReceived: 25,
      remarks: '5 crushed',
    })
  })

  it('refuses a quantity above what was sent', () => {
    const dialog = openReceive()
    const lines = within(dialog).getAllByTestId('receive-line')
    fireEvent.change(boxOf(must(lines[1]), 'Received'), { target: { value: '11' } })
    expect(
      within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Confirm receipt' }).disabled,
    ).toBe(true)
    expect(within(dialog).getByText('0 – 10')).toBeTruthy()
  })

  it('asks before cancelling, says where the stock goes back to, and cancels only when confirmed', () => {
    renderPage()
    fireEvent.click(within(rowOf('TRF-00001')).getByRole('button', { name: 'Cancel transfer' }))
    expect(screen.getByText('Cancel TRF-00001?')).toBeTruthy()
    expect(screen.getByText('Everything goes back to Erbil Temporary Store.')).toBeTruthy()
    expect(cancelFn).not.toHaveBeenCalled()
    const confirmButtons = screen.getAllByRole('button', { name: 'Cancel transfer' })
    fireEvent.click(must(confirmButtons.at(-1)))
    expect(cancelFn).toHaveBeenCalledWith({ variables: { id: 't-1' } })
  })
})

describe('a received transfer opens its full details', () => {
  const detailed = transfer({
    id: 't-9',
    transferNumber: 'TRF-00009',
    status: 'received_short',
    daysInTransit: 3,
    receivedDate: '2026-11-19',
    receivedByName: 'Hana Karim',
    reference: 'MR-77',
    notes: 'Handle with care',
    lines: [
      {
        id: 'l-1',
        productId: 'p-1',
        productName: 'PVC Pipe 4 in',
        sku: 'PVC-004',
        uom: 'PCS',
        qtySent: 30,
        qtyReceived: 25,
        remarks: 'Top shelf',
        receiveRemarks: '5 broken in the truck',
      },
      {
        id: 'l-2',
        productId: 'p-2',
        productName: 'Safety Gloves',
        sku: 'CON-003',
        uom: 'PAIR',
        qtySent: 10,
        qtyReceived: 10,
        remarks: null,
        receiveRemarks: null,
      },
    ],
  })
  const openIt = () => {
    results.set(STORE_TRANSFERS_QUERY, {
      data: { storeTransfers: [transfer(), detailed] },
      loading: false,
      refetch,
    })
    renderPage()
    fireEvent.click(screen.getByText('TRF-00009'))
    return screen.getByRole('dialog', { name: 'Transfer TRF-00009' })
  }

  it('shows who sent it, how it travelled, when it arrived, who received it, the reference and the notes', () => {
    const dialog = within(openIt())
    expect(dialog.getByText('Received short')).toBeTruthy()
    for (const text of [
      'Erbil Temporary Store',
      'Main Warehouse',
      '2026-11-17',
      '2026-11-19',
      'Hana Karim',
      'Saman Aziz',
      'ERB 45213',
      'WB-1022',
      'MR-77',
      'Handle with care',
    ]) {
      expect(dialog.getByText(text)).toBeTruthy()
    }
  })

  it('lists every item with what was sent, what arrived, what is short and both remarks', () => {
    const dialog = within(openIt())
    const pipe = within(must(dialog.getByText('PVC Pipe 4 in').closest('tr')))
    expect(pipe.getByText('30 PCS')).toBeTruthy()
    expect(pipe.getByText('25 PCS')).toBeTruthy()
    expect(pipe.getByText('5')).toBeTruthy()
    expect(pipe.getByText('Top shelf')).toBeTruthy()
    expect(pipe.getByText('On receipt: 5 broken in the truck')).toBeTruthy()
    const gloves = within(must(dialog.getByText('Safety Gloves').closest('tr')))
    expect(gloves.getAllByText('10 PAIR')).toHaveLength(2)
    expect(gloves.queryByText(/On receipt/)).toBeNull()
  })

  it('closes with its Close button (the corner cross is the first Close, the footer button the last)', () => {
    openIt()
    fireEvent.click(must(screen.getAllByRole('button', { name: 'Close' }).at(-1)))
    expect(screen.queryByRole('dialog', { name: 'Transfer TRF-00009' })).toBeNull()
  })

  it('opens straight away from a link (?transfer=<id>), as Store History sends it, including a cancelled transfer', () => {
    results.set(STORE_TRANSFERS_QUERY, {
      data: { storeTransfers: [transfer(), transfer({ id: 't-4', transferNumber: 'TRF-00004', status: 'cancelled', daysInTransit: null })] },
      loading: false,
      refetch,
    })
    renderPage('/inventory/temp-store?transfer=t-4')
    const dialog = within(screen.getByRole('dialog', { name: 'Transfer TRF-00004' }))
    expect(dialog.getByText('Cancelled')).toBeTruthy()
    expect(dialog.getByText('PVC Pipe 4 in')).toBeTruthy()
  })

  it('fetches a transfer older than the loaded list by its id, and only asks for it when the list does not hold it', () => {
    const old = transfer({ id: 't-old', transferNumber: 'TRF-00001-OLD', status: 'received', daysInTransit: null, receivedDate: '2026-01-05' })
    mockUseQuery.mockImplementation((doc: unknown, options?: { variables?: { id?: string }; skip?: boolean }) => {
      if (doc === STORE_TRANSFERS_QUERY && options?.variables?.id !== undefined) {
        return options.skip === true
          ? { data: undefined, loading: false, refetch }
          : { data: { storeTransfers: [old] }, loading: false, refetch }
      }
      return results.get(doc) ?? { data: undefined, loading: false, refetch }
    })
    renderPage('/inventory/temp-store?transfer=t-old')
    expect(screen.getByRole('dialog', { name: 'Transfer TRF-00001-OLD' })).toBeTruthy()
    const byId = (mockUseQuery.mock.calls as unknown[][]).filter(
      (c) => c[0] === STORE_TRANSFERS_QUERY && (c[1] as { variables?: { id?: string } }).variables?.id === 't-old',
    )
    expect(byId.length).toBeGreaterThan(0)
    expect(byId.every((c) => (c[1] as { skip?: boolean }).skip !== true)).toBe(true)
  })

  it('does not fetch by id when the list already holds the transfer', () => {
    renderPage('/inventory/temp-store?transfer=t-2')
    expect(screen.getByRole('dialog', { name: 'Transfer TRF-00002' })).toBeTruthy()
    const byId = (mockUseQuery.mock.calls as unknown[][]).filter(
      (c) => c[0] === STORE_TRANSFERS_QUERY && (c[1] as { variables?: { id?: string } }).variables?.id === 't-2',
    )
    expect(byId.every((c) => (c[1] as { skip?: boolean }).skip === true)).toBe(true)
  })

  it('says so, and opens nothing, for a link to a transfer that does not exist', () => {
    mockUseQuery.mockImplementation((doc: unknown, options?: { variables?: { id?: string } }) =>
      doc === STORE_TRANSFERS_QUERY && options?.variables?.id !== undefined
        ? { data: { storeTransfers: [] }, loading: false, refetch }
        : (results.get(doc) ?? { data: undefined, loading: false, refetch }),
    )
    renderPage('/inventory/temp-store?transfer=nope')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toasts).toContainEqual({ type: 'error', message: 'That transfer was not found' })
  })

  it('does not open for a transfer that is still in transit (its row has Receive and Cancel instead)', () => {
    renderPage()
    fireEvent.click(screen.getByText('Saman Aziz'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
