// The attachment an invoice prints after its last page, on the invoice page's PDF tab: the panel is there, the preview
// carries the attachment's sheets, and Print is held back while the attachment is loading or could not be made (an
// invoice that silently prints WITHOUT the attachment someone attached would look finished and be wrong).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import type * as ApolloClientModule from '@apollo/client'
import {
  PROJECT_INVOICE_QUERY,
  UPDATE_PROJECT_INVOICE,
  REMOVE_INVOICE_PRINT_ATTACHMENT,
} from '../../../../graphql/projects'
import type { AttachmentPagesState } from '../../../../hooks/usePrintAttachmentPages'

vi.mock('../../../../lib/axios', () => ({
  api: {
    post: vi.fn().mockResolvedValue({ data: {} }),
    get: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

let perms: Record<string, boolean> = {}
vi.mock('../../../../hooks/usePermission', () => ({
  usePermission: () => ({
    can: (k: string) => !!perms[k],
    canAny: () => false,
    isSystemLevel: false,
  }),
}))

let currentInvoice: Record<string, unknown> = {}
const refetch = vi.fn()
const removeAttachment = vi.fn()
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (doc: unknown) =>
      doc === PROJECT_INVOICE_QUERY
        ? { data: { projectInvoice: currentInvoice }, loading: false, refetch }
        : { data: { bankAccounts: [] }, loading: false, refetch: vi.fn() },
    useMutation: (doc: unknown) => [
      doc === REMOVE_INVOICE_PRINT_ATTACHMENT ? removeAttachment : vi.fn(),
      { loading: false },
    ],
  }
})

// What the hook says is set per test; the calls tell which file it was asked about and whether the tab was open.
let pagesState: AttachmentPagesState = { status: 'none' }
const hookCalls: { att: unknown; enabled: boolean }[] = []
const retry = vi.fn()
vi.mock('../../../../hooks/usePrintAttachmentPages', () => ({
  usePrintAttachmentPages: (att: unknown, enabled: boolean) => {
    hookCalls.push({ att, enabled })
    return { state: pagesState, retry }
  },
}))

const ATT = {
  id: 'da-1',
  fileId: 'file-1',
  filename: 'client-po-approval.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 340 * 1024,
  uploadedAt: null,
}
const P1 = 'data:image/jpeg;base64,AAAA'
const P2 = 'data:image/jpeg;base64,BBBB'

function invoice(over: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'NY-INV-2026-0005',
    billingMethod: 'milestone',
    displayMode: 'summarised',
    grossTotal: 600,
    retentionAmount: 0,
    netPayable: 600,
    whtApplies: false,
    whtScenario: null,
    whtRate: 0,
    whtAmount: 0,
    status: 'issued',
    invoiceDate: '2026-03-01',
    dueDate: '2026-04-01',
    currencyCode: 'USD',
    bankAccountId: null,
    paymentType: 'cash',
    projectCode: 'P-1',
    projectName: 'Tower',
    contractNumber: 'C-1',
    clientName: 'Acme',
    retentionPct: 0,
    companyName: 'Co',
    paymentTermsDays: 30,
    verificationToken: null,
    clientContractNo: 'RFQ-1',
    billToAddress: 'x',
    deliverToAddress: 'y',
    deliveryDate: null,
    periodOfPerformance: null,
    rejectionReason: null,
    rejectedAt: null,
    rejectedByName: null,
    headerFlags: [],
    printAttachment: null,
    lines: [
      {
        id: 'l1',
        lineNumber: 1,
        description: 'Cement',
        sourceType: 'manual',
        qty: 1,
        uom: 'Ea',
        unitCost: 100,
        subtotal: 100,
        marginPct: 0,
        marginAmount: 0,
        taxPct: 0,
        taxAmount: 0,
        lineTotal: 100,
        moComponents: null,
        flagReason: null,
        flaggedAt: null,
        flaggedByName: null,
        flagAddressedAt: null,
        flagResolvedAt: null,
      },
    ],
    payments: [],
    ...over,
  }
}

const t = (k: string, o?: Record<string, unknown>) => i18n.t(`proj.invDetail.${k}`, o)

async function openPdfTab(inv: Record<string, unknown>) {
  currentInvoice = inv
  const { default: InvoiceDetail } = await import('../InvoiceDetail')
  const view = render(
    <MemoryRouter initialEntries={['/projects/invoices/inv-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/projects/invoices/:id" element={<InvoiceDetail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  await screen.findAllByText('Cement')
  fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
  await screen.findByTestId('invoice-attachment-panel')
  return view
}

const printButton = () => {
  const el = screen.getByText(t('printSaveAsPdf')).closest('button')
  if (!el) throw new Error('no print button')
  return el
}
const srcDoc = (container: HTMLElement) =>
  container.querySelector('iframe')?.getAttribute('srcdoc') ?? ''
const sheetCount = (html: string) => (html.match(/class="inv-att"/g) ?? []).length

beforeEach(() => {
  refetch.mockReset()
  removeAttachment.mockReset().mockResolvedValue({ data: { removeInvoicePrintAttachment: true } })
  retry.mockReset()
  hookCalls.length = 0
  pagesState = { status: 'none' }
  perms = { 'projects.invoices.view': true, 'projects.invoices.edit': true }
})

describe('InvoiceDetail: the print attachment on the PDF tab', () => {
  it('the invoice query and the update mutation ask for the attachment', () => {
    for (const doc of [PROJECT_INVOICE_QUERY, UPDATE_PROJECT_INVOICE]) {
      const body = doc.loc?.source.body ?? ''
      expect(body).toMatch(
        /printAttachment\s*\{[^}]*fileId[^}]*filename[^}]*mimeType[^}]*sizeBytes/,
      )
    }
  })

  it('no attachment: the panel offers Add, Print works, and the preview has no extra sheet', async () => {
    const { container } = await openPdfTab(invoice())
    expect(screen.getByText(t('printAttachmentNone'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t('printAttachmentAdd') })).toBeInTheDocument()
    expect(printButton()).not.toBeDisabled()
    expect(sheetCount(srcDoc(container))).toBe(0)
  })

  it('the pages are only built while the PDF tab is open', async () => {
    currentInvoice = invoice({ printAttachment: ATT })
    pagesState = { status: 'ready', pages: [P1] }
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
    expect(hookCalls.length).toBeGreaterThan(0)
    expect(hookCalls.every((c) => !c.enabled)).toBe(true) // lines tab
    expect(hookCalls[0].att).toMatchObject({ fileId: 'file-1' })
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
    await screen.findByTestId('invoice-attachment-panel')
    expect(hookCalls[hookCalls.length - 1].enabled).toBe(true)
  })

  it('with the pages ready: one sheet per page in the preview, in order, and Print is available', async () => {
    pagesState = { status: 'ready', pages: [P1, P2] }
    const { container } = await openPdfTab(invoice({ printAttachment: ATT }))
    const html = srcDoc(container)
    expect(sheetCount(html)).toBe(2)
    expect(html.indexOf(P1)).toBeGreaterThan(-1)
    expect(html.indexOf(P2)).toBeGreaterThan(html.indexOf(P1))
    expect(printButton()).not.toBeDisabled()
    expect(screen.getByText('client-po-approval.pdf')).toBeInTheDocument()
  })

  it('while the pages are loading: Print is held back and says why, and the preview has no sheet yet', async () => {
    pagesState = { status: 'loading' }
    const { container } = await openPdfTab(invoice({ printAttachment: ATT }))
    expect(printButton()).toBeDisabled()
    expect(printButton().parentElement).toHaveAttribute('title', t('printAttachmentWaiting'))
    expect(sheetCount(srcDoc(container))).toBe(0)
  })

  it.each([
    ['download', { status: 'failed', reason: 'download' }],
    ['unreadable', { status: 'failed', reason: 'unreadable' }],
    ['tooLong', { status: 'failed', reason: 'tooLong', detail: { pageCount: 12, maxPages: 10 } }],
  ] as const)(
    'when the attachment could not be made (%s): Print is held back, never printing without it',
    async (_n, st) => {
      pagesState = st as AttachmentPagesState
      const { container } = await openPdfTab(invoice({ printAttachment: ATT }))
      expect(printButton()).toBeDisabled()
      expect(sheetCount(srcDoc(container))).toBe(0)
      // and the person is told, and can replace or remove the attachment
      expect(screen.getByTestId('invoice-attachment-status')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: t('printAttachmentReplace') })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: t('printAttachmentRemove') })).toBeInTheDocument()
    },
  )

  it('Try again on a failed download goes to the hook', async () => {
    pagesState = { status: 'failed', reason: 'download' }
    await openPdfTab(invoice({ printAttachment: ATT }))
    fireEvent.click(screen.getByRole('button', { name: t('printAttachmentRetry') }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('a view-only user sees the attachment but cannot change it', async () => {
    perms = { 'projects.invoices.view': true }
    pagesState = { status: 'ready', pages: [P1] }
    await openPdfTab(invoice({ printAttachment: ATT }))
    expect(screen.getByText('client-po-approval.pdf')).toBeInTheDocument()
    const panel = screen.getByTestId('invoice-attachment-panel')
    expect(within(panel).queryByRole('button')).toBeNull()
    expect(printButton()).not.toBeDisabled()
  })

  it('removing from the panel reads the invoice again', async () => {
    pagesState = { status: 'ready', pages: [P1] }
    await openPdfTab(invoice({ printAttachment: ATT }))
    const panel = screen.getByTestId('invoice-attachment-panel')
    fireEvent.click(within(panel).getByRole('button', { name: t('printAttachmentRemove') }))
    const removes = screen.getAllByRole('button', { name: t('printAttachmentRemove') })
    fireEvent.click(removes[removes.length - 1])
    await waitFor(() => {
      expect(refetch).toHaveBeenCalled()
    })
    expect(removeAttachment).toHaveBeenCalledWith({ variables: { invoiceId: 'inv-1' } })
  })

  it('every invoice status gets the panel (the rule is "any time")', async () => {
    for (const status of ['draft', 'review', 'issued', 'paid']) {
      const view = await openPdfTab(invoice({ status }))
      expect(screen.getByRole('button', { name: t('printAttachmentAdd') })).toBeInTheDocument()
      view.unmount()
    }
  })
})
