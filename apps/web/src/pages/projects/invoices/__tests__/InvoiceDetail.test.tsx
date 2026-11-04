import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import type * as ApolloClientModule from '@apollo/client'
import { PROJECT_INVOICE_QUERY } from '../../../../graphql/projects'

const apiPost = vi.fn()
vi.mock('../../../../lib/axios', () => ({
  api: {
    post: (...a: unknown[]): unknown => apiPost(...a),
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

let perms: Record<string, boolean> = {}
vi.mock('../../../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: (key: string) => !!perms[key],
    canAny: () => false,
    isSystemLevel: false,
  }),
}))

let currentInvoice: Record<string, unknown> = {}
const refetch = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (doc: unknown) =>
      doc === PROJECT_INVOICE_QUERY
        ? { data: { projectInvoice: currentInvoice }, loading: false, refetch }
        : { data: { bankAccounts: [] }, loading: false, refetch: vi.fn() },
    useMutation: () => [vi.fn(), { loading: false }],
  }
})

function line(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `l${n}`,
    lineNumber: n,
    description: ['Cement', 'Steel bars', 'Labour'][n - 1] ?? `Item ${n}`,
    sourceType: 'manual',
    qty: 1,
    unitCost: 100 * n,
    subtotal: 100 * n,
    marginPct: 0,
    marginAmount: 0,
    taxPct: 0,
    taxAmount: 0,
    lineTotal: 100 * n,
    moComponents: null,
    flagReason: null,
    flaggedAt: null,
    flaggedByName: null,
    flagAddressedAt: null,
    flagResolvedAt: null,
    ...over,
  }
}

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'NY-INV-2026-0005',
    billingMethod: 'milestone',
    displayMode: 'summarised',
    grossTotal: 600,
    discountPct: 0,
    discountAmount: 0,
    retentionAmount: 0,
    netPayable: 600,
    whtApplies: false,
    whtScenario: null,
    whtRate: 0,
    whtAmount: 0,
    status: 'review',
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
    clientContractNo: 'RFQ-2026-0002',
    billToAddress: 'farage\nAttention: n/a',
    deliverToAddress: 'farage\nErbil',
    deliveryDate: null,
    periodOfPerformance: '15/07/2026 – 15/08/2026',
    rejectionReason: null,
    rejectedAt: null,
    rejectedByName: null,
    headerFlags: [],
    lines: [line(1), line(2), line(3)],
    payments: [],
    ...over,
  }
}

// The rows of the lines table, and the tick box of line n (0-based), apart from the header card's.
const lineRows = () => screen.getAllByTestId('invoice-line-row')
const lineTable = () => lineRows()[0].closest('table') as HTMLElement
const lineBox = (n: number) => within(lineRows()[n]).getByRole('checkbox')

async function openInvoice(inv: Record<string, unknown>) {
  currentInvoice = inv
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

beforeEach(() => {
  apiPost.mockReset().mockResolvedValue({ data: {} })
  refetch.mockReset()
  perms = { 'projects.invoices.view': true, 'projects.invoices.edit': true }
})

describe('InvoiceDetail: rejecting from review', () => {
  it('offers Reject next to Approve to someone who may approve, and not to a view-only user', async () => {
    await openInvoice(invoice())
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('hides Reject from a view-only user (Approve is unchanged)', async () => {
    perms = { 'projects.invoices.view': true }
    await openInvoice(invoice())
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
  })

  it('offers no Reject on a draft or an approved invoice', async () => {
    await openInvoice(invoice({ status: 'approved' }))
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('has no tick boxes until Reject is pressed, then one per line', async () => {
    await openInvoice(invoice())
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    // One per line, and (migration 314) one per field of the printed header.
    expect(within(lineTable()).getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getAllByTestId('invoice-header-row')).toHaveLength(10)
  })

  it('needs a reason for every ticked line before it can reject', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const reject = screen.getByRole('button', { name: 'Reject Invoice' })
    // Nothing ticked and no reason.
    expect(reject).toBeDisabled()
    fireEvent.click(lineBox(1))
    expect(reject).toBeDisabled()
    expect(screen.getByText('A reason is needed for each flagged line.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('What is wrong with this line?'), {
      target: { value: 'Price per bar is wrong' },
    })
    expect(reject).toBeEnabled()
  })

  it('sends the ticked lines with their own reasons and no invoice-level reason', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(lineBox(0))
    fireEvent.click(lineBox(2))
    const boxes = screen.getAllByLabelText('What is wrong with this line?')
    fireEvent.change(boxes[0], { target: { value: 'Wrong qty' } })
    fireEvent.change(boxes[1], { target: { value: 'Labour too high' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject Invoice' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(1)
    })
    expect(apiPost).toHaveBeenCalledWith('/projects/invoices/inv-1/reject', {
      reason: undefined,
      lineFlags: [
        { lineId: 'l1', reason: 'Wrong qty' },
        { lineId: 'l3', reason: 'Labour too high' },
      ],
      headerFlags: [],
    })
  })

  it('shows one reason field at a time: the invoice-level one until a line is ticked, then the lines', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getByPlaceholderText('Reason for rejection...')).toBeInTheDocument()
    fireEvent.click(lineBox(1))
    expect(screen.queryByPlaceholderText('Reason for rejection...')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('What is wrong with this line?')).toHaveLength(1)
    fireEvent.click(lineBox(1))
    expect(screen.getByPlaceholderText('Reason for rejection...')).toBeInTheDocument()
  })

  it('does not send an invoice-level reason that was typed before a line was ticked', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByPlaceholderText('Reason for rejection...'), {
      target: { value: 'typed first' },
    })
    fireEvent.click(lineBox(0))
    fireEvent.change(screen.getByLabelText('What is wrong with this line?'), {
      target: { value: 'Wrong qty' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject Invoice' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith('/projects/invoices/inv-1/reject', {
      reason: undefined,
      lineFlags: [{ lineId: 'l1', reason: 'Wrong qty' }],
      headerFlags: [],
    })
  })

  it('still rejects the whole invoice with only an overall reason', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByPlaceholderText('Reason for rejection...'), {
      target: { value: 'Wrong client' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject Invoice' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith('/projects/invoices/inv-1/reject', {
      reason: 'Wrong client',
      lineFlags: [],
      headerFlags: [],
    })
  })

  it('Cancel closes the panel and forgets the ticks', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(lineBox(0))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect((lineBox(0) as HTMLInputElement).checked).toBe(false)
  })
})

describe('InvoiceDetail: a sent-back invoice', () => {
  const sentBack = (over: Record<string, unknown> = {}) =>
    invoice({
      status: 'draft',
      rejectionReason: '• Line 2 (Steel bars): Price per bar is wrong',
      rejectedAt: '2026-03-05T10:00:00Z',
      rejectedByName: 'Sara Approver',
      lines: [
        line(1),
        line(2, {
          flagReason: 'Price per bar is wrong',
          flaggedByName: 'Sara Approver',
          flaggedAt: '2026-03-05T10:00:00Z',
        }),
        line(3),
      ],
      ...over,
    })

  it('shows who sent it back and why, the flagged line, and what to do next', async () => {
    await openInvoice(sentBack())
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Sent back by Sara Approver:')
    expect(alert).toHaveTextContent('Line 2 (Steel bars): Price per bar is wrong')
    expect(alert).toHaveTextContent('Fix the flagged lines, then submit it for review again.')
    expect(screen.getByText('Flagged by Sara Approver')).toBeInTheDocument()
    // A draft has its own Submit for review; nothing to reject.
    expect(screen.getByRole('button', { name: 'Submit for Review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument()
  })

  it('puts the reason beside the line in Edit mode, on the flagged line only', async () => {
    await openInvoice(sentBack())
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findAllByText('Fix this: Price per bar is wrong')).toHaveLength(1)
  })

  it('does not tell the editor to fix a line the approver already confirmed', async () => {
    await openInvoice(
      sentBack({
        lines: [
          line(1),
          line(2, {
            flagReason: 'Price per bar is wrong',
            flagAddressedAt: '2026-03-06T10:00:00Z',
            flagResolvedAt: '2026-03-07T10:00:00Z',
          }),
          line(3),
        ],
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await screen.findByText('Save Changes')
    expect(screen.queryByText(/Fix this:/)).not.toBeInTheDocument()
  })

  it('after a resubmit the old rejection is history, and the fixed line waits for the approver', async () => {
    await openInvoice(
      sentBack({
        status: 'review',
        lines: [
          line(1),
          line(2, {
            flagReason: 'Price per bar is wrong',
            flaggedByName: 'Sara Approver',
            flagAddressedAt: '2026-03-06T10:00:00Z',
          }),
          line(3),
        ],
      }),
    )
    expect(screen.getByText('Previously rejected:')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Fixed, awaiting confirmation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm fixed' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith('/projects/invoices/inv-1/lines/l2/resolve-flag', {})
    })
  })

  it('does not offer to confirm a flag that has not been fixed yet', async () => {
    await openInvoice(
      sentBack({
        status: 'review',
        lines: [line(1), line(2, { flagReason: 'Price per bar is wrong' }), line(3)],
      }),
    )
    expect(screen.getByText('Flagged')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm fixed' })).not.toBeInTheDocument()
  })

  it('does not offer the confirm button to someone without the edit permission', async () => {
    perms = { 'projects.invoices.view': true }
    await openInvoice(
      sentBack({
        status: 'review',
        lines: [
          line(1),
          line(2, { flagReason: 'x', flagAddressedAt: '2026-03-06T10:00:00Z' }),
          line(3),
        ],
      }),
    )
    expect(screen.getByText('Fixed, awaiting confirmation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm fixed' })).not.toBeInTheDocument()
  })
})

describe('InvoiceDetail: an invoice with no review history', () => {
  it('shows no banner and no flags', async () => {
    await openInvoice(invoice({ status: 'draft' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Previously rejected:')).not.toBeInTheDocument()
    expect(screen.queryByTestId('expense-line-flag')).not.toBeInTheDocument()
    const rows = screen.getAllByTestId('invoice-line-row')
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['1', '2', '3'])
  })

  it('shows each line with its stored number, not its position in the list', async () => {
    await openInvoice(invoice({ status: 'draft', lines: [line(1), line(2), line(4)] }))
    const rows = screen.getAllByTestId('invoice-line-row')
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['1', '2', '4'])
  })
})

// ── The printed header (migration 314) ────────────────────────────────────────────────────────────
const headerBox = (field: string) => within(headerRow(field)).getByRole('checkbox')
function headerRow(field: string): HTMLElement {
  const row = screen
    .getAllByTestId('invoice-header-row')
    .find((r) => r.getAttribute('data-field') === field)
  if (!row) throw new Error(`no header row for ${field}`)
  return row
}

function headerFlag(field: string, reason: string, over: Record<string, unknown> = {}) {
  return {
    field,
    reason,
    flaggedAt: '2026-03-05T10:00:00Z',
    flaggedByName: 'Sara Approver',
    addressedAt: null,
    resolvedAt: null,
    ...over,
  }
}

describe('InvoiceDetail: flagging the printed header', () => {
  it('lists every field of the header with what the invoice says, once Reject is pressed', async () => {
    await openInvoice(invoice())
    expect(screen.queryByTestId('invoice-header-review')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const rows = screen.getAllByTestId('invoice-header-row')
    expect(rows.map((r) => r.getAttribute('data-field'))).toEqual([
      'invoice_date',
      'due_date',
      'invoice_number',
      'deliver_to_address',
      'bill_to_address',
      'client_contract_no',
      'job',
      'period_of_performance',
      'delivery_date',
      'reference',
    ])
    expect(headerRow('invoice_number')).toHaveTextContent('NY-INV-2026-0005')
    expect(headerRow('client_contract_no')).toHaveTextContent('RFQ-2026-0002')
    expect(headerRow('bill_to_address')).toHaveTextContent('Attention: n/a')
    expect(headerRow('invoice_date')).toHaveTextContent('2026-03-01')
    // Empty on the invoice (no delivery date yet): shown as a dash, not blank.
    expect(headerRow('delivery_date')).toHaveTextContent('—')
    // Generated or taken from the project: said so.
    expect(headerRow('job')).toHaveTextContent('Not editable on the invoice')
    expect(headerRow('bill_to_address')).not.toHaveTextContent('Not editable on the invoice')
  })

  it('needs a reason for a ticked header field, and sends it with no invoice-level reason', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(headerBox('bill_to_address'))
    const reject = screen.getByRole('button', { name: 'Reject Invoice' })
    expect(reject).toBeDisabled()
    expect(screen.getByText('A reason is needed for each flagged line.')).toBeInTheDocument()
    // The whole-invoice box is gone: one reason field at a time.
    expect(screen.queryByPlaceholderText('Reason for rejection...')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('What is wrong with this field? Bill To'), {
      target: { value: 'Wrong company name' },
    })
    expect(reject).toBeEnabled()
    fireEvent.click(reject)
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledTimes(1)
    })
    expect(apiPost).toHaveBeenCalledWith('/projects/invoices/inv-1/reject', {
      reason: undefined,
      lineFlags: [],
      headerFlags: [{ field: 'bill_to_address', reason: 'Wrong company name' }],
    })
  })

  it('reports a wrong line and a wrong header field in the same rejection', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(headerBox('due_date'))
    fireEvent.click(lineBox(1))
    fireEvent.change(screen.getByLabelText('What is wrong with this field? Due Date'), {
      target: { value: 'Should be 60 days' },
    })
    fireEvent.change(screen.getByLabelText('What is wrong with this line?'), {
      target: { value: 'Price per bar is wrong' },
    })
    expect(screen.getByText('Flagged items: 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reject Invoice' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith('/projects/invoices/inv-1/reject', {
      reason: undefined,
      lineFlags: [{ lineId: 'l2', reason: 'Price per bar is wrong' }],
      headerFlags: [{ field: 'due_date', reason: 'Should be 60 days' }],
    })
  })

  it('waits for the reason of every ticked item, header or line', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(lineBox(0))
    fireEvent.change(screen.getByLabelText('What is wrong with this line?'), {
      target: { value: 'Wrong qty' },
    })
    const reject = screen.getByRole('button', { name: 'Reject Invoice' })
    expect(reject).toBeEnabled()
    fireEvent.click(headerBox('job'))
    // The line is fine, but the header field has no reason yet.
    expect(reject).toBeDisabled()
  })

  it('does not send an invoice-level reason typed before a header field was ticked', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.change(screen.getByPlaceholderText('Reason for rejection...'), {
      target: { value: 'typed first' },
    })
    fireEvent.click(headerBox('reference'))
    fireEvent.change(screen.getByLabelText('What is wrong with this field? Reference'), {
      target: { value: 'Wrong project' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reject Invoice' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalled()
    })
    expect(apiPost).toHaveBeenCalledWith('/projects/invoices/inv-1/reject', {
      reason: undefined,
      lineFlags: [],
      headerFlags: [{ field: 'reference', reason: 'Wrong project' }],
    })
  })

  it('Cancel forgets ticked header fields too', async () => {
    await openInvoice(invoice())
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(headerBox('job'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('invoice-header-review')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect((headerBox('job') as HTMLInputElement).checked).toBe(false)
  })
})

describe('InvoiceDetail: a sent-back header', () => {
  const sentBackHeader = (flags: unknown[], over: Record<string, unknown> = {}) =>
    invoice({
      status: 'draft',
      rejectionReason: '• Bill To: Wrong company name',
      rejectedAt: '2026-03-05T10:00:00Z',
      rejectedByName: 'Sara Approver',
      headerFlags: flags,
      ...over,
    })

  it('shows only the flagged fields, with what is wrong and who flagged it', async () => {
    await openInvoice(sentBackHeader([headerFlag('bill_to_address', 'Wrong company name')]))
    expect(screen.getByText('Header changes needed')).toBeInTheDocument()
    const rows = screen.getAllByTestId('invoice-header-row')
    expect(rows.map((r) => r.getAttribute('data-field'))).toEqual(['bill_to_address'])
    expect(rows[0]).toHaveTextContent('Attention: n/a')
    expect(screen.getByText('Wrong company name')).toBeInTheDocument()
    expect(screen.getByText('Flagged by Sara Approver')).toBeInTheDocument()
    // Nothing to tick outside reject mode.
    expect(
      within(screen.getByTestId('invoice-header-review')).queryAllByRole('checkbox'),
    ).toHaveLength(0)
  })

  it('stays in front of the person fixing it in Edit mode', async () => {
    await openInvoice(sentBackHeader([headerFlag('due_date', 'Should be 60 days')]))
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await screen.findByText('Save Changes')
    expect(screen.getByText('Should be 60 days')).toBeInTheDocument()
  })

  it('shows nothing for a field the approver already confirmed', async () => {
    await openInvoice(
      sentBackHeader([
        headerFlag('due_date', 'Should be 60 days', {
          addressedAt: '2026-03-06T10:00:00Z',
          resolvedAt: '2026-03-07T10:00:00Z',
        }),
      ]),
    )
    expect(screen.queryByTestId('invoice-header-review')).not.toBeInTheDocument()
  })

  it('after a resubmit the approver confirms each fixed field, and only the approver', async () => {
    const flags = [
      headerFlag('bill_to_address', 'Wrong company name', { addressedAt: '2026-03-06T10:00:00Z' }),
    ]
    await openInvoice(sentBackHeader(flags, { status: 'review' }))
    expect(screen.getByText('Fixed, awaiting confirmation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm fixed' }))
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/projects/invoices/inv-1/header-flags/bill_to_address/resolve-flag',
        {},
      )
    })
  })

  it('does not offer the confirm button for an open flag, or to someone without the edit permission', async () => {
    await openInvoice(sentBackHeader([headerFlag('job', 'Wrong project')], { status: 'review' }))
    expect(screen.getByText('Flagged')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm fixed' })).not.toBeInTheDocument()
  })

  it('a view-only user sees the fixed field but cannot confirm it', async () => {
    perms = { 'projects.invoices.view': true }
    await openInvoice(
      sentBackHeader(
        [headerFlag('job', 'Wrong project', { addressedAt: '2026-03-06T10:00:00Z' })],
        { status: 'review' },
      ),
    )
    expect(screen.getByText('Fixed, awaiting confirmation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm fixed' })).not.toBeInTheDocument()
  })

  it('an invoice with no header flags draws no header card outside reject mode', async () => {
    await openInvoice(invoice({ status: 'draft' }))
    expect(screen.queryByTestId('invoice-header-review')).not.toBeInTheDocument()
  })
})
