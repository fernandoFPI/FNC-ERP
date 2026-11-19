// The Record Goods Receipt page in the new layout: numbered sections (details, what arrived, proof of delivery), one
// action in the bar at the bottom (it used to be in the header AND in the bar), a live summary and checklist, a table
// whose quantity box a person can actually reach, and a card per line on a phone. The checklist, the bar and the refusal
// on submit read ONE list (lib/receiptLines.ts), so what the page says is missing is exactly what the form refuses.
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import { themes } from '../../../../theme/tokens'
import {
  PURCHASE_ORDER_QUERY,
  RECORD_DIRECT_DELIVERY,
  RECORD_RECEIPT,
} from '../../../../graphql/procurement'
import { ENTITY_ATTACHMENTS_QUERY, EMPLOYEES_QUERY } from '../../../../graphql/hr'
import { STOCK_LOCATIONS_QUERY } from '../../../../graphql/inventory'

const auth = vi.hoisted(() => ({ role: 'user' }))
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
const addToast = vi.fn<[{ type: string; message: string }], undefined>()
type RecordReceiptArgs = [{ variables: { input: Record<string, unknown> } }]
const recordReceipt = vi.fn<RecordReceiptArgs, Promise<unknown>>()
const recordDirectDelivery = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
  }
})
vi.mock('../../../../store/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}))
vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (
    selector: (s: { user: { id: string; companyId: string; role: string } }) => unknown,
  ) => selector({ user: { id: 'user-1', companyId: 'company-1', role: auth.role } }),
}))

const originalWidth = window.innerWidth
const setWidth = (w: number) => {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true, writable: true })
}

// AC cover: 5 to receive. Air curtain: arrived in full already. Remote: 4 ordered, 1 arrived, 1 covered from stock (2 left).
const poLines = [
  {
    id: 'l1',
    description: 'AC cover',
    sku: 'AC-001',
    qty: '5',
    qty_received: '0',
    qty_from_stock: '0',
    unit_price: '100',
  },
  {
    id: 'l2',
    description: 'Air curtain',
    sku: 'AC-002',
    qty: '3',
    qty_received: '3',
    qty_from_stock: '0',
    unit_price: '200',
  },
  {
    id: 'l3',
    description: 'Remote',
    sku: null,
    qty: '4',
    qty_received: '1',
    qty_from_stock: '1',
    unit_price: '0',
  },
]
const storeInPO = {
  id: 'po-1',
  po_number: 'PO-2026-0053',
  vendor_name: 'Cash Purchase',
  status: 'bought',
  purpose: 'project',
  delivery_destination: 'inventory',
  created_at: '2026-10-13T07:04:14Z',
  assigned_receiver_name: null,
  lines: poLines,
}
const jobsitePO = { ...storeInPO, po_number: 'PO-2026-0056', delivery_destination: 'jobsite' }

const sara = {
  id: 'e1',
  first_name: 'Sara',
  last_name: 'Ali',
  employee_number: 'E-1',
  user_id: 'user-1',
}
const omar = {
  id: 'e2',
  first_name: 'Omar',
  last_name: 'Noor',
  employee_number: 'E-2',
  user_id: null,
}
const buyersReceipt = {
  id: 'att-1',
  sourceEntityType: 'po_line_purchase',
  file: { id: 'f-1', category: 'attachment' },
}

// One result object per query, built once: a fresh object on each call would re-run the page's effects forever.
const results = {
  po: { data: undefined as unknown, loading: false },
  attachments: { data: { entityAttachments: [] as unknown[] }, loading: false },
  locations: {
    data: { stockLocations: [{ id: 'loc-1', name: 'Main store', code: 'MS' }] },
    loading: false,
  },
  employees: { data: { employees: [sara, omar] as unknown[] }, loading: false },
}
function mockData(
  po: typeof storeInPO,
  opts: { attachments?: unknown[]; employees?: unknown[] } = {},
) {
  results.po = { data: { purchaseOrder: po }, loading: false }
  results.attachments = { data: { entityAttachments: opts.attachments ?? [] }, loading: false }
  results.employees = { data: { employees: opts.employees ?? [sara, omar] }, loading: false }
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === PURCHASE_ORDER_QUERY) return results.po
    if (doc === ENTITY_ATTACHMENTS_QUERY) return results.attachments
    if (doc === STOCK_LOCATIONS_QUERY) return results.locations
    if (doc === EMPLOYEES_QUERY) return results.employees
    return { data: undefined, loading: false }
  })
}

// The page is one of the larger modules: import it once, up front.
let ReceiptForm: ComponentType
beforeAll(async () => {
  ReceiptForm = (await import('../ReceiptForm')).default
}, 120_000)

function renderForm() {
  return render(
    <MemoryRouter initialEntries={['/procurement/purchase-orders/po-1/receive']}>
      <ThemeProvider>
        <Routes>
          <Route path="/procurement/purchase-orders/:id/receive" element={<ReceiptForm />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  auth.role = 'user'
  setWidth(1400)
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  recordReceipt.mockResolvedValue({ data: { recordReceipt: { id: 'rc-1' } } })
  recordDirectDelivery.mockResolvedValue({ data: { recordDirectDelivery: { poId: 'po-1' } } })
  mockUseMutation.mockImplementation((doc: unknown) => [
    doc === RECORD_RECEIPT
      ? recordReceipt
      : doc === RECORD_DIRECT_DELIVERY
        ? recordDirectDelivery
        : vi.fn().mockResolvedValue({ data: {} }),
    { loading: false },
  ])
})
afterEach(async () => {
  setWidth(originalWidth)
  localStorage.clear()
  await i18n.changeLanguage('en')
})

const f = (key: string, opts?: Record<string, unknown>) => i18n.t(`receipt.form.${key}`, opts)
const checkbox = (item: string) => screen.getByRole('checkbox', { name: f('selectLine', { item }) })
const checklistItem = (label: string) => {
  const li = screen.getByText(label).closest('li')
  if (!li) throw new Error(`no checklist item "${label}"`)
  return li
}
const bar = () =>
  screen.getByLabelText(/Save the receipt as a draft|Mark this delivery as received/)
const submit = (container: HTMLElement) => {
  const form = container.querySelector('form')
  if (!form) throw new Error('no form')
  fireEvent.submit(form)
}
const qtyBox = (item: string) => screen.getByRole('spinbutton', { name: f('qtyFor', { item }) })

describe('Record Goods Receipt: the sections', () => {
  it('a Store In receipt has two numbered sections, details then what arrived', () => {
    mockData(storeInPO)
    renderForm()
    const heading = (text: string) => screen.getByText(text)
    expect(heading(f('stepDetails')).previousElementSibling).toHaveTextContent('1')
    expect(heading(f('stepItems')).previousElementSibling).toHaveTextContent('2')
    expect(screen.queryByText(f('stepProof'))).toBeNull()
  })

  it('a jobsite delivery adds a third section, the proof of delivery', () => {
    mockData(jobsitePO)
    renderForm()
    expect(screen.getByText(f('stepProof')).previousElementSibling).toHaveTextContent('3')
  })

  it('says where the goods go, and why the form asks what it asks', () => {
    mockData(storeInPO)
    const { container, unmount } = renderForm()
    const note = container.querySelector('[data-destination]')
    expect(note).toHaveAttribute('data-destination', 'inventory')
    expect(note).toHaveTextContent(f('destinationInventory'))
    expect(note).toHaveTextContent(f('destinationInventoryHint'))
    unmount()
    mockData(jobsitePO)
    const second = renderForm()
    const jobsite = second.container.querySelector('[data-destination]')
    expect(jobsite).toHaveAttribute('data-destination', 'jobsite')
    expect(jobsite).toHaveTextContent(f('destinationJobsite'))
  })

  it('shows the vendor and the PO date under the title', () => {
    mockData(storeInPO)
    renderForm()
    expect(screen.getByText('Cash Purchase')).toBeInTheDocument()
    expect(screen.getByText('2026-10-13')).toBeInTheDocument()
  })

  it('Store In asks who received it and where, with each field in one aligned grid; the jobsite path asks for neither', () => {
    mockData(storeInPO)
    const first = renderForm()
    expect(screen.getByText(f('receivedFrom'))).toBeInTheDocument()
    expect(screen.getByText(f('receivingLocationOptional'))).toBeInTheDocument()
    expect(screen.getByText(f('sameReceiver'))).toBeInTheDocument()
    first.unmount()
    mockData(jobsitePO)
    renderForm()
    expect(screen.queryByText(f('receivedFrom'))).toBeNull()
    expect(screen.queryByText(f('receivingLocationOptional'))).toBeNull()
    expect(screen.queryByText(f('sameReceiver'))).toBeNull()
    // the receipt date and the notes are on both paths
    expect(screen.getByText(f('receiptDate'))).toBeInTheDocument()
    expect(screen.getByText(f('generalNotes'))).toBeInTheDocument()
  })
})

describe('Record Goods Receipt: one action', () => {
  it('has ONE Save Draft button, in the bar (it used to be in the header too)', () => {
    mockData(storeInPO)
    renderForm()
    const buttons = screen.getAllByRole('button', { name: f('saveDraft') })
    expect(buttons).toHaveLength(1)
    expect(within(bar()).getByRole('button', { name: f('saveDraft') })).toBe(buttons[0])
    expect(buttons[0]).toHaveAttribute('type', 'submit')
  })

  it('has ONE Mark Delivered button on a jobsite delivery, and keeps the walkthrough anchor on it', () => {
    mockData(jobsitePO)
    renderForm()
    const buttons = screen.getAllByRole('button', { name: f('markDelivered') })
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAttribute('data-tour', 'po-mark-delivered-btn')
  })

  it('names the step in the bar, and what it does', () => {
    mockData(storeInPO)
    renderForm()
    expect(within(bar()).getByText(f('barTitleSave'))).toBeInTheDocument()
    mockData(jobsitePO)
    // (the other title and hint belong to the jobsite path)
    const second = renderForm()
    expect(
      within(second.getAllByLabelText(f('barTitleDeliver'))[0]).getByText(f('barHintDeliver')),
    ).toBeInTheDocument()
  })

  it('has a Cancel that goes back to the purchase order', () => {
    mockData(storeInPO)
    renderForm()
    // the real router has no such route in this test: the click must not throw, and the page stays mounted
    fireEvent.click(within(bar()).getByRole('button', { name: f('cancel') }))
    expect(screen.queryByText(f('stepDetails'))).toBeNull()
  })
})

describe('Record Goods Receipt: the checklist, the bar and the refusal are one list', () => {
  it('a Store In receipt lists the receiver, then the items, and shows what is done', () => {
    mockData(storeInPO)
    renderForm()
    // the signed-in user is Sara (user-1): picked as the receiver on load
    expect(checklistItem(f('reqReceiver'))).toHaveAttribute('data-done', 'true')
    expect(checklistItem(f('reqItems'))).toHaveAttribute('data-done', 'false')
    expect(screen.getByText(f('checkTitleSave'))).toBeInTheDocument()
    expect(
      screen.getByText(f('checkProgress', { done: 1, total: 2 }), { selector: 'span[data-ready]' }),
    ).toBeInTheDocument()
  })

  it('the bar says how far along it is and what comes next, then that it is ready', () => {
    mockData(storeInPO)
    renderForm()
    expect(
      within(bar()).getByText(new RegExp(f('barNext', { item: f('reqItems') }))),
    ).toBeInTheDocument()
    fireEvent.click(checkbox('AC cover'))
    expect(within(bar()).getByText(f('barReadySave'))).toBeInTheDocument()
    expect(screen.getByText(f('checkReady'))).toBeInTheDocument()
  })

  it('with no receiver chosen it asks for one first, and refuses a submit with that reason', () => {
    mockData(storeInPO, { employees: [omar] })
    const { container } = renderForm()
    expect(checklistItem(f('reqReceiver'))).toHaveAttribute('data-done', 'false')
    fireEvent.click(checkbox('AC cover'))
    submit(container)
    expect(addToast).toHaveBeenLastCalledWith({
      type: 'error',
      message: f('pleaseSelectWhoReceivedTheGoods'),
    })
    expect(recordReceipt).not.toHaveBeenCalled()
  })

  it('with a receiver but nothing ticked it refuses for the items', () => {
    mockData(storeInPO)
    const { container } = renderForm()
    submit(container)
    expect(addToast).toHaveBeenLastCalledWith({
      type: 'error',
      message: f('selectAtLeastOneItemYou'),
    })
    expect(recordReceipt).not.toHaveBeenCalled()
  })

  it('reports the receiver before the items when both are missing', () => {
    mockData(storeInPO, { employees: [omar] })
    const { container } = renderForm()
    submit(container)
    expect(addToast).toHaveBeenLastCalledWith({
      type: 'error',
      message: f('pleaseSelectWhoReceivedTheGoods'),
    })
  })

  it('a jobsite delivery lists the items and both photos, and refuses naming each missing photo', () => {
    mockData(jobsitePO)
    const { container } = renderForm()
    expect(checklistItem(f('reqItems'))).toHaveAttribute('data-done', 'false')
    expect(checklistItem(f('reqVendorReceipt'))).toHaveAttribute('data-done', 'false')
    expect(checklistItem(f('reqMaterials'))).toHaveAttribute('data-done', 'false')
    expect(screen.getByText(f('checkTitleDeliver'))).toBeInTheDocument()
    fireEvent.click(checkbox('AC cover'))
    submit(container)
    const last = addToast.mock.calls.at(-1)?.[0].message ?? ''
    expect(last).toBe(
      f('pleaseAttach', {
        missing: `${f('theVendorReceipt')}${f('andJoin')}${f('aPhotoOfMaterials')}`,
      }),
    )
    expect(recordDirectDelivery).not.toHaveBeenCalled()
  })

  it("the buyer's receipt on file counts as the vendor receipt, so only the materials photo is left", () => {
    mockData(jobsitePO, { attachments: [buyersReceipt] })
    const { container } = renderForm()
    expect(checklistItem(f('reqVendorReceipt'))).toHaveAttribute('data-done', 'true')
    fireEvent.click(checkbox('AC cover'))
    submit(container)
    expect(addToast.mock.calls.at(-1)?.[0].message).toBe(
      f('pleaseAttach', { missing: f('aPhotoOfMaterials') }),
    )
  })

  it('does not send a ticked line whose quantity was set to zero', async () => {
    mockData(storeInPO)
    const { container } = renderForm()
    fireEvent.click(checkbox('AC cover'))
    fireEvent.click(checkbox('Remote'))
    fireEvent.change(qtyBox('Remote'), { target: { value: '0' } })
    submit(container)
    await waitFor(() => {
      expect(recordReceipt).toHaveBeenCalledTimes(1)
    })
    const input = recordReceipt.mock.calls[0][0].variables.input
    expect(input.lines).toEqual([{ po_line_id: 'l1', qty_received: 5 }])
  })

  it('saves a Store In draft with the ticked lines and the receiver', async () => {
    mockData(storeInPO)
    const { container } = renderForm()
    fireEvent.click(checkbox('AC cover'))
    fireEvent.click(checkbox('Remote'))
    submit(container)
    await waitFor(() => {
      expect(recordReceipt).toHaveBeenCalledTimes(1)
    })
    const input = recordReceipt.mock.calls[0][0].variables.input
    expect(input.received_by_name).toBe('Sara Ali')
    expect(input.lines).toEqual([
      { po_line_id: 'l1', qty_received: 5 },
      { po_line_id: 'l3', qty_received: 2 },
    ])
  })
})

describe('Record Goods Receipt: what arrived', () => {
  it('draws a row per line with its figures: ordered, received, what is left', () => {
    mockData(storeInPO)
    renderForm()
    const rowOf = (name: string) => {
      const row = screen.getByText(name).closest('tr')
      if (!row) throw new Error(`no row for ${name}`)
      return row
    }
    // AC cover: 5 ordered, 0 received, 5 left
    expect(
      within(rowOf('AC cover'))
        .getAllByText(/^[0-9]+$/)
        .map((c) => c.textContent),
    ).toEqual(['5', '0', '5'])
    // Remote: 4 ordered, 1 arrived (stock covers 1 more), 2 left
    expect(
      within(rowOf('Remote'))
        .getAllByText(/^[0-9]+$/)
        .map((c) => c.textContent),
    ).toEqual(['4', '1', '2'])
  })

  it('shows the SKU and the PO price under the name, and what stock covers', () => {
    mockData(storeInPO)
    renderForm()
    const row = screen.getByText('AC cover').closest('tr')
    if (!row) throw new Error('no row')
    expect(within(row).getByText(f('skuLabel', { sku: 'AC-001' }))).toBeInTheDocument()
    expect(within(row).getByText(/100/)).toBeInTheDocument()
    expect(screen.getByText(f('fromStockLine', { qty: '1' }))).toBeInTheDocument()
  })

  it('marks a line with nothing left as fully received, and cannot be ticked', () => {
    mockData(storeInPO)
    renderForm()
    expect(screen.getByText(f('fullyReceived'))).toBeInTheDocument()
    expect(checkbox('Air curtain')).toBeDisabled()
    expect(checkbox('AC cover')).toBeEnabled()
  })

  it('starts every line unticked, with its quantity box off, as the store keeper picks what arrived', () => {
    mockData(storeInPO)
    renderForm()
    expect(checkbox('AC cover')).not.toBeChecked()
    expect(qtyBox('AC cover')).toBeDisabled()
  })

  it('ticking a line fills in everything that is left and opens its quantity box', () => {
    mockData(storeInPO)
    renderForm()
    fireEvent.click(checkbox('Remote'))
    expect(qtyBox('Remote')).toBeEnabled()
    expect(qtyBox('Remote')).toHaveValue(2)
  })

  it('cuts a typed quantity to what is left', () => {
    mockData(storeInPO)
    renderForm()
    fireEvent.click(checkbox('AC cover'))
    fireEvent.change(qtyBox('AC cover'), { target: { value: '99' } })
    expect(qtyBox('AC cover')).toHaveValue(5)
  })

  it('steps the quantity with the plus and minus, and stops at what is left and at zero', () => {
    mockData(storeInPO)
    renderForm()
    fireEvent.click(checkbox('AC cover'))
    const less = within(screen.getByText('AC cover').closest('tr') as HTMLElement).getByRole(
      'button',
      { name: f('less') },
    )
    const more = within(screen.getByText('AC cover').closest('tr') as HTMLElement).getByRole(
      'button',
      { name: f('more') },
    )
    expect(more).toBeDisabled()
    fireEvent.click(less)
    expect(qtyBox('AC cover')).toHaveValue(4)
    fireEvent.click(more)
    expect(qtyBox('AC cover')).toHaveValue(5)
  })

  it('Select all ticks the lines that have something left and skips the finished one', () => {
    mockData(storeInPO)
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: f('selectAll') }))
    expect(checkbox('AC cover')).toBeChecked()
    expect(checkbox('Remote')).toBeChecked()
    expect(checkbox('Air curtain')).not.toBeChecked()
    expect(screen.getByText(f('itemsSelectedOf', { selected: 2, total: 3 }))).toBeInTheDocument()
  })

  it('Clear unticks them all again', () => {
    mockData(storeInPO)
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: f('selectAll') }))
    fireEvent.click(screen.getByRole('button', { name: f('clearSelection') }))
    expect(checkbox('AC cover')).not.toBeChecked()
    expect(screen.getByText(f('itemsSelectedOf', { selected: 0, total: 3 }))).toBeInTheDocument()
  })

  it('tints a ticked row with the accent', () => {
    mockData(storeInPO)
    renderForm()
    const row = () => screen.getByText('AC cover').closest('tr') as HTMLElement
    expect(row()).not.toHaveStyle({ background: themes['light-flat'].accentBg })
    fireEvent.click(checkbox('AC cover'))
    expect(row()).toHaveStyle({ background: themes['light-flat'].accentBg })
  })

  it('names the quantity box and the tick box for each item, so a screen reader can tell them apart', () => {
    mockData(storeInPO)
    renderForm()
    expect(checkbox('AC cover')).toBeInTheDocument()
    expect(checkbox('Remote')).toBeInTheDocument()
    expect(screen.getAllByRole('spinbutton')).toHaveLength(3)
  })

  it('shows the summary live: the figures, the progress bar and the sentence', () => {
    mockData(storeInPO)
    renderForm()
    // ordered 5 + 3 + 4 = 12; already covered 0 + 3 + (1 arrived + 1 from stock) = 5; receiving nothing yet: 5 / 12 = 42%
    const progress = () => screen.getByRole('progressbar', { name: f('receiptProgress') })
    expect(progress()).toHaveAttribute('aria-valuenow', '42')
    expect(screen.getByText(/42%/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: f('selectAll') }))
    // receiving 5 + 2 = 7 more: (5 + 7) / 12 = 100%, and nothing is left open
    expect(progress()).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText(/100%/)).toBeInTheDocument()
  })

  it('shows the ones that are not there yet as a placeholder, not as "no lines"', () => {
    results.po = { data: undefined, loading: true }
    mockUseQuery.mockImplementation((doc: unknown) =>
      doc === PURCHASE_ORDER_QUERY
        ? results.po
        : doc === EMPLOYEES_QUERY
          ? results.employees
          : doc === STOCK_LOCATIONS_QUERY
            ? results.locations
            : results.attachments,
    )
    renderForm()
    expect(screen.queryByText(f('noLines'))).toBeNull()
  })
})

describe('Record Goods Receipt: a different receiver for a line', () => {
  it('starts with one receiver for everything, and no receiver column', () => {
    mockData(storeInPO)
    renderForm()
    expect(screen.getByRole('checkbox', { name: f('sameReceiver') })).toBeChecked()
    expect(screen.queryByRole('columnheader', { name: f('receiver') })).toBeNull()
    expect(screen.getByText(f('sameReceiverHint'))).toBeInTheDocument()
  })

  it('unticking it adds a receiver column and says each line can have its own', () => {
    mockData(storeInPO)
    renderForm()
    fireEvent.click(screen.getByRole('checkbox', { name: f('sameReceiver') }))
    expect(screen.getByRole('columnheader', { name: f('receiver') })).toBeInTheDocument()
    expect(screen.getByText(f('eachLineBelowCanBeAssigned'))).toBeInTheDocument()
    expect(screen.getByText(f('defaultReceiver'))).toBeInTheDocument()
  })

  it('files one draft per receiver when lines are given to different people', async () => {
    mockData(storeInPO)
    const { container } = renderForm()
    fireEvent.click(screen.getByRole('checkbox', { name: f('sameReceiver') }))
    fireEvent.click(checkbox('AC cover'))
    fireEvent.click(checkbox('Remote'))
    const selects = within(screen.getByText('Remote').closest('tr') as HTMLElement).getByRole(
      'combobox',
    )
    fireEvent.change(selects, { target: { value: 'e2' } })
    submit(container)
    await waitFor(() => {
      expect(recordReceipt).toHaveBeenCalledTimes(2)
    })
    const names = recordReceipt.mock.calls.map((c) => c[0].variables.input.received_by_name)
    expect(names.sort()).toEqual(['Omar Noor', 'Sara Ali'])
  })
})

describe('Record Goods Receipt: the proof of delivery', () => {
  const tile = (title: string) => {
    const section = screen.getByText(title).closest('section')
    if (!section) throw new Error(`no tile "${title}"`)
    return section
  }
  const addFile = (kind: 'camera' | 'file', file: File) => {
    const input = document.querySelector<HTMLInputElement>(
      kind === 'camera' ? 'input[capture]' : 'input[type="file"]:not([capture])',
    )
    if (!input) throw new Error('no file input')
    fireEvent.change(input, { target: { files: [file] } })
  }

  it('shows two tiles, each missing to begin with', () => {
    mockData(jobsitePO)
    renderForm()
    expect(tile(f('vendorReceiptRequired'))).toHaveAttribute('data-proof', 'missing')
    expect(tile(f('materialsDeliveredRequired'))).toHaveAttribute('data-proof', 'missing')
    expect(
      within(tile(f('materialsDeliveredRequired'))).getByText(f('proofMissing')),
    ).toBeInTheDocument()
  })

  it('the buyer\'s receipt on file makes the vendor tile "on file"', () => {
    mockData(jobsitePO, { attachments: [buyersReceipt] })
    renderForm()
    const vendor = tile(f('vendorReceiptOnFile'))
    expect(vendor).toHaveAttribute('data-proof', 'onFile')
    expect(within(vendor).getByText(f('proofOnFile'))).toBeInTheDocument()
  })

  it('takes a photo for the tile that opened the picker, shows it, and ticks the checklist', () => {
    mockData(jobsitePO)
    renderForm()
    fireEvent.click(
      within(tile(f('materialsDeliveredRequired'))).getByRole('button', { name: f('takePhoto') }),
    )
    addFile('camera', new File(['x'], 'site.jpg', { type: 'image/jpeg' }))
    const materials = tile(f('materialsDeliveredRequired'))
    expect(materials).toHaveAttribute('data-proof', 'added')
    expect(within(materials).getByText(f('proofAdded', { count: 1 }))).toBeInTheDocument()
    expect(within(materials).getByRole('img', { name: 'site.jpg' })).toBeInTheDocument()
    expect(checklistItem(f('reqMaterials'))).toHaveAttribute('data-done', 'true')
    // the other tile is untouched
    expect(tile(f('vendorReceiptRequired'))).toHaveAttribute('data-proof', 'missing')
  })

  it('shows a PDF as a named file, and a photo can be removed again', () => {
    mockData(jobsitePO)
    renderForm()
    fireEvent.click(
      within(tile(f('vendorReceiptRequired'))).getByRole('button', { name: f('addPhotoPdf') }),
    )
    addFile('file', new File(['x'], 'invoice.pdf', { type: 'application/pdf' }))
    const vendor = tile(f('vendorReceiptRequired'))
    expect(within(vendor).getByText('invoice.pdf')).toBeInTheDocument()
    fireEvent.click(
      within(vendor).getByRole('button', { name: f('removePhoto', { name: 'invoice.pdf' }) }),
    )
    expect(within(tile(f('vendorReceiptRequired'))).queryByText('invoice.pdf')).toBeNull()
    expect(tile(f('vendorReceiptRequired'))).toHaveAttribute('data-proof', 'missing')
  })

  it('records the delivery once both photos are there', async () => {
    mockData(jobsitePO)
    const { container } = renderForm()
    fireEvent.click(checkbox('AC cover'))
    fireEvent.click(
      within(tile(f('vendorReceiptRequired'))).getByRole('button', { name: f('addPhotoPdf') }),
    )
    addFile('file', new File(['x'], 'invoice.pdf', { type: 'application/pdf' }))
    fireEvent.click(
      within(tile(f('materialsDeliveredRequired'))).getByRole('button', { name: f('takePhoto') }),
    )
    addFile('camera', new File(['x'], 'site.jpg', { type: 'image/jpeg' }))
    expect(within(bar()).getByText(f('barReadyDeliver'))).toBeInTheDocument()
    submit(container)
    await waitFor(() => {
      expect(recordDirectDelivery).toHaveBeenCalledTimes(1)
    })
  })

  describe('the administrator override', () => {
    it('is offered to a system administrator only', () => {
      mockData(jobsitePO)
      auth.role = 'system_admin'
      renderForm()
      expect(screen.getByLabelText(/admin override/i)).toBeInTheDocument()
    })

    it('marks both tiles as skipped and ticks both photo items once the reason is given', () => {
      mockData(jobsitePO)
      auth.role = 'system_admin'
      renderForm()
      fireEvent.click(screen.getByLabelText(/admin override/i))
      // ticked but no reason yet: still missing
      expect(tile(f('materialsDeliveredRequired'))).toHaveAttribute('data-proof', 'missing')
      fireEvent.change(screen.getByPlaceholderText(/why are the photos/i), {
        target: { value: 'No camera' },
      })
      expect(tile(f('materialsDeliveredRequired'))).toHaveAttribute('data-proof', 'skipped')
      expect(
        within(tile(f('vendorReceiptRequired'))).getByText(f('proofSkipped')),
      ).toBeInTheDocument()
      expect(checklistItem(f('reqVendorReceipt'))).toHaveAttribute('data-done', 'true')
      expect(checklistItem(f('reqMaterials'))).toHaveAttribute('data-done', 'true')
    })
  })
})

describe('Record Goods Receipt: on a phone', () => {
  it('draws every line as a card with labelled figures and a full-width quantity box', () => {
    setWidth(390)
    mockData(storeInPO)
    renderForm()
    expect(screen.queryByRole('table')).toBeNull()
    // the labels are the full words here ("Previously Received"), the short ones are for the table's header
    expect(screen.getAllByText(f('previouslyReceived')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(f('receiveNow')).length).toBe(3)
    expect(checkbox('AC cover')).toBeInTheDocument()
  })

  it('keeps the one action in the bar above the navigation, with the same Save Draft', () => {
    setWidth(390)
    mockData(storeInPO)
    renderForm()
    expect(screen.getAllByRole('button', { name: f('saveDraft') })).toHaveLength(1)
  })
})

describe('Record Goods Receipt: Arabic', () => {
  it('reads in Arabic with no raw key on the page', async () => {
    await i18n.changeLanguage('ar')
    mockData(jobsitePO, { attachments: [buyersReceipt] })
    const { container } = renderForm()
    expect(container.textContent).not.toMatch(/receipt\.form\./)
    expect(screen.getByText(f('stepDetails'))).toBeInTheDocument()
    expect(screen.getByText(f('stepProof'))).toBeInTheDocument()
    expect(f('stepDetails')).not.toBe('receipt.form.stepDetails')
  })

  it('has every new string in Arabic, not just English', () => {
    const keys = [
      'stepDetails',
      'stepItems',
      'stepProof',
      'itemsHint',
      'destinationInventory',
      'destinationInventoryHint',
      'destinationJobsite',
      'destinationJobsiteHint',
      'itemsSelectedOf',
      'clearSelection',
      'fromStock',
      'fullyReceived',
      'selectLine',
      'qtyFor',
      'less',
      'more',
      'noLines',
      'removePhoto',
      'proofMissing',
      'proofOnFile',
      'proofAdded',
      'proofSkipped',
      'sameReceiver',
      'sameReceiverHint',
      'checkTitleSave',
      'checkTitleDeliver',
      'checkProgress',
      'checkReady',
      'checkDone',
      'checkTodo',
      'reqReceiver',
      'reqItems',
      'reqVendorReceipt',
      'reqMaterials',
      'barTitleSave',
      'barTitleDeliver',
      'barHintSave',
      'barHintDeliver',
      'barNext',
      'barReadySave',
      'barReadyDeliver',
      'colReceived',
      'fromStockLine',
    ]
    for (const key of keys) {
      const ar = i18n.getFixedT('ar')(`receipt.form.${key}`)
      const en = i18n.getFixedT('en')(`receipt.form.${key}`)
      expect(ar, key).not.toBe(`receipt.form.${key}`)
      expect(ar, key).not.toBe(en)
    }
  })
})

describe('Record Goods Receipt: the dark theme', () => {
  it('takes the button, the tiles and the section numbers from the dark theme, and keeps no fixed light colour', () => {
    localStorage.setItem('fnc-theme', 'black')
    mockData(jobsitePO)
    const { container } = renderForm()
    expect(screen.getByRole('button', { name: f('markDelivered') })).toHaveStyle({
      background: themes.black.accentSolid,
    })
    expect(container.querySelector('section[data-proof]')).toHaveStyle({
      background: themes.black.bgSurface,
    })
    expect(screen.getByText(f('stepDetails')).previousElementSibling).toHaveStyle({
      background: themes.black.accentSolid,
    })
    // the old page used fixed light tints (#EFF6FF, #F0FDF4) and a bright blue (#2563EB)
    expect(container.innerHTML).not.toMatch(/239,\s*246,\s*255|240,\s*253,\s*244|37,\s*99,\s*235/i)
  })

  it('takes the light theme colours in the light theme', () => {
    mockData(jobsitePO)
    renderForm()
    expect(screen.getByRole('button', { name: f('markDelivered') })).toHaveStyle({
      background: themes['light-flat'].accentSolid,
    })
  })
})
