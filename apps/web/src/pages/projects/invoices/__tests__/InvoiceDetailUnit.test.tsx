// Unit of measure on the invoice page (migration 318): shown in the lines table (a dash for a line made before the
// column existed), a picker per line in Edit mode, and sent with every line when the invoice is saved. A line that never
// had a unit and is not touched goes out as an empty unit, which the server stores as "none" (it stays blank).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import type * as ApolloClientModule from '@apollo/client'
import { PROJECT_INVOICE_QUERY, UPDATE_PROJECT_INVOICE } from '../../../../graphql/projects'

vi.mock('../../../../lib/axios', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

vi.mock('../../../../hooks/usePermission', () => ({
  usePermission: () => ({ can: () => true, canAny: () => false, isSystemLevel: false }),
}))

let currentInvoice: Record<string, unknown> = {}
const updateInvoice = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (doc: unknown) =>
      doc === PROJECT_INVOICE_QUERY
        ? { data: { projectInvoice: currentInvoice }, loading: false, refetch: vi.fn() }
        : { data: { bankAccounts: [] }, loading: false, refetch: vi.fn() },
    useMutation: (doc: unknown) => [
      doc === UPDATE_PROJECT_INVOICE ? updateInvoice : vi.fn(),
      { loading: false },
    ],
  }
})

function line(n: number, uom: string | null) {
  return {
    id: `l${n}`,
    lineNumber: n,
    description: ['Cement', 'Steel bars', 'Labour'][n - 1],
    sourceType: 'manual',
    qty: n,
    uom,
    unitCost: 100 * n,
    subtotal: 100 * n * n,
    marginPct: 0,
    marginAmount: 0,
    taxPct: 0,
    taxAmount: 0,
    lineTotal: 100 * n * n,
    moComponents: null,
    flagReason: null,
    flaggedAt: null,
    flaggedByName: null,
    flagAddressedAt: null,
    flagResolvedAt: null,
  }
}

const invoice = () => ({
  id: 'inv-1',
  invoiceNumber: 'NY-INV-2026-0005',
  billingMethod: 'fixed',
  displayMode: 'detailed',
  grossTotal: 1400,
  discountPct: 0,
  discountAmount: 0,
  retentionAmount: 0,
  netPayable: 1400,
  whtApplies: false,
  whtScenario: null,
  whtRate: 0,
  whtAmount: 0,
  status: 'draft',
  invoiceDate: '2026-03-01',
  dueDate: '2026-04-01',
  currencyCode: 'USD',
  bankAccountId: null,
  paymentType: 'wire_transfer',
  projectCode: 'P-1',
  projectName: 'Tower',
  contractNumber: 'C-1',
  clientName: 'Acme',
  retentionPct: 0,
  companyName: 'Co',
  paymentTermsDays: 30,
  verificationToken: null,
  clientContractNo: 'RFQ-1',
  billToAddress: 'Acme',
  deliverToAddress: 'Acme',
  deliveryDate: null,
  periodOfPerformance: null,
  rejectionReason: null,
  rejectedAt: null,
  rejectedByName: null,
  headerFlags: [],
  // Ea, Box, and a line made before the Unit column existed.
  lines: [line(1, 'Ea'), line(2, 'Box'), line(3, null)],
  payments: [],
})

async function openInvoice() {
  currentInvoice = invoice()
  const { default: InvoiceDetail } = await import('../InvoiceDetail')
  render(
    <MemoryRouter initialEntries={['/projects/invoices/inv-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/projects/invoices/:id" element={<InvoiceDetail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  await screen.findAllByText('Cement')
}

async function startEdit() {
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  await screen.findByText('Save Changes')
}

const unitBoxes = () =>
  screen.getAllByLabelText<HTMLSelectElement | HTMLInputElement>('Unit of measure')

async function save() {
  fireEvent.click(screen.getByText('Save Changes'))
  await waitFor(() => {
    expect(updateInvoice).toHaveBeenCalledTimes(1)
  })
  const call = updateInvoice.mock.calls[0] as [{ variables: { lines: Record<string, unknown>[] } }]
  return call[0].variables.lines
}

function tableOf(el: HTMLElement): HTMLElement {
  const table = el.closest<HTMLElement>('table')
  if (!table) throw new Error('no table around the element')
  return table
}

beforeEach(() => {
  updateInvoice.mockReset().mockResolvedValue({ data: {} })
})

describe('InvoiceDetail: the lines table', () => {
  it("has a Unit column right after Qty, with each line's unit and a dash for a line with none", async () => {
    await openInvoice()
    const rows = screen.getAllByTestId('invoice-line-row')
    const table = tableOf(rows[0])
    const headers = [...table.querySelectorAll('th')].map((th) => th.textContent)
    const i = headers.indexOf('Unit')
    expect(i).toBeGreaterThan(-1)
    expect(headers[i - 1]).toBe('Qty')
    expect(headers[i + 1]).toBe('Unit Cost')
    expect(rows.map((r) => r.querySelectorAll('td')[i].textContent)).toEqual(['Ea', 'Box', '—'])
  })
})

describe('InvoiceDetail: editing the unit', () => {
  it("shows a picker per line holding that line's unit, and none for a line that has none", async () => {
    await openInvoice()
    await startEdit()
    expect(unitBoxes().map((b) => b.value)).toEqual(['Ea', 'Box', ''])
  })

  it('saves the unit that was changed, and every other line keeps its own', async () => {
    await openInvoice()
    await startEdit()
    fireEvent.change(unitBoxes()[0], { target: { value: 'Roll' } })
    const lines = await save()
    expect(lines.map((l) => [l.id, l.uom])).toEqual([
      ['l1', 'Roll'],
      ['l2', 'Box'],
      ['l3', ''], // never had one, not touched: sent empty, which the server keeps as "none"
    ])
  })

  it('saves a unit that was typed under Other', async () => {
    await openInvoice()
    await startEdit()
    fireEvent.change(unitBoxes()[1], { target: { value: '__other__' } })
    fireEvent.change(unitBoxes()[1], { target: { value: '  Man   Day ' } })
    const lines = await save()
    expect(lines[1].uom).toBe('Man Day') // tidied before it is sent
  })

  it('lets a line that had none get one', async () => {
    await openInvoice()
    await startEdit()
    fireEvent.change(unitBoxes()[2], { target: { value: 'Pack' } })
    expect((await save())[2].uom).toBe('Pack')
  })

  it('lets a unit be cleared', async () => {
    await openInvoice()
    await startEdit()
    fireEvent.change(unitBoxes()[0], { target: { value: '' } })
    expect((await save())[0].uom).toBe('')
  })

  it('starts a line added during the edit as Ea', async () => {
    await openInvoice()
    await startEdit()
    fireEvent.click(screen.getByText('+ Add Line'))
    expect(unitBoxes()).toHaveLength(4)
    expect(unitBoxes()[3].value).toBe('Ea')
    const lines = await save()
    expect(lines).toHaveLength(4)
    expect(lines[3]).toMatchObject({ id: undefined, uom: 'Ea' })
  })

  it('shows the Unit column header in the editor, level with the other fields', async () => {
    await openInvoice()
    await startEdit()
    const table = tableOf(unitBoxes()[0])
    const headers = [...table.querySelectorAll('th')].map((th) => th.textContent)
    expect(headers).toContain('Unit')
    expect(within(table).getAllByLabelText('Unit of measure')).toHaveLength(3)
  })
})
