// Regression: a project PO delivered straight to the jobsite asked for a vendor
// receipt photo even though the buyer had already uploaded the vendor's receipt
// while sourcing on the requisition (REQ-2026-0001 / NY-PO-2026-0026). The Store
// In page already counted the buyer's receipt; this form never looked. The
// buyer's receipt now fully satisfies the requirement, and without one the
// vendor receipt is still required.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { PURCHASE_ORDER_QUERY } from '../../../../graphql/procurement'
import { ENTITY_ATTACHMENTS_QUERY } from '../../../../graphql/hr'
import type * as ApolloClientModule from '@apollo/client'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
const addToast = vi.fn<[{ type: string; message: string }], undefined>()

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
  useAuthStore: (selector: (s: { user: { id: string; companyId: string } }) => unknown) =>
    selector({ user: { id: 'user-1', companyId: 'company-1' } }),
}))

const jobsitePO = {
  id: 'po-1',
  po_number: 'NY-PO-2026-0026',
  vendor_name: 'PHILIPS',
  status: 'bought',
  purpose: 'project',
  delivery_destination: 'jobsite',
  created_at: '2026-09-23T07:04:14Z',
  assigned_receiver_name: null,
  lines: [
    {
      id: 'line-1',
      description: 'Indoor Wi-Fi camera',
      sku: null,
      qty: '2',
      qty_received: '0',
      qty_from_stock: '0',
      unit_price: '70000',
    },
  ],
}

// What the buyer leaves behind when they buy on the requisition's Items Bought page.
const buyersPurchaseReceipt = {
  id: 'att-1',
  sourceEntityType: 'po_line_purchase',
  file: { id: 'f-1', category: 'attachment' },
}
// The PO page's unrelated "Delivery Photos" uploader: must never count as a vendor receipt.
const deliveryPhoto = {
  id: 'att-2',
  sourceEntityType: 'purchase_order',
  file: { id: 'f-2', category: 'attachment' },
}

function mockData(attachments: unknown[]) {
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === PURCHASE_ORDER_QUERY) return { data: { purchaseOrder: jobsitePO }, loading: false }
    if (doc === ENTITY_ATTACHMENTS_QUERY)
      return { data: { entityAttachments: attachments }, loading: false }
    return { data: undefined, loading: false }
  })
}

async function renderForm() {
  const ReceiptForm = (await import('../ReceiptForm')).default
  const view = render(
    <MemoryRouter initialEntries={['/procurement/purchase-orders/po-1/receive']}>
      <ThemeProvider>
        <Routes>
          <Route path="/procurement/purchase-orders/:id/receive" element={<ReceiptForm />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  return view
}

// Tick the PO line (the only unchecked box: "receive all" starts ticked) and submit
// with no photos attached, then return the message the form shows.
function submitWithNoPhotos(container: HTMLElement): string {
  const line = screen.getAllByRole('checkbox').find((c) => !(c as HTMLInputElement).checked)
  if (!line) throw new Error('could not find the unticked line checkbox')
  fireEvent.click(line)
  const form = container.querySelector('form')
  if (!form) throw new Error('could not find the form')
  fireEvent.submit(form)
  return addToast.mock.calls.at(-1)?.[0].message ?? ''
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({ data: {} }), { loading: false }])
})

describe('ReceiptForm: jobsite delivery and the vendor receipt', () => {
  it('still requires a vendor receipt when nothing has been uploaded', async () => {
    mockData([])
    const { container } = await renderForm()
    expect(screen.getByText('Vendor Receipt (required)')).toBeInTheDocument()
    const message = submitWithNoPhotos(container)
    expect(message).toMatch(/vendor receipt/i)
    expect(message).toMatch(/materials/i)
  })

  it('does not ask again when the buyer already uploaded the vendor receipt while sourcing', async () => {
    mockData([buyersPurchaseReceipt])
    const { container } = await renderForm()
    expect(screen.getByText('Vendor Receipt (on file from the buyer)')).toBeInTheDocument()
    expect(screen.queryByText('Vendor Receipt (required)')).not.toBeInTheDocument()
    const message = submitWithNoPhotos(container)
    // only the materials photo is still missing
    expect(message).toMatch(/materials/i)
    expect(message).not.toMatch(/vendor receipt/i)
  })

  it('does not treat a Delivery Photo on the PO as a vendor receipt', async () => {
    mockData([deliveryPhoto])
    const { container } = await renderForm()
    expect(screen.getByText('Vendor Receipt (required)')).toBeInTheDocument()
    expect(submitWithNoPhotos(container)).toMatch(/vendor receipt/i)
  })
})
