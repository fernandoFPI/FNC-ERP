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
import { PURCHASE_ORDER_QUERY, RECORD_DIRECT_DELIVERY } from '../../../../graphql/procurement'
import { ENTITY_ATTACHMENTS_QUERY } from '../../../../graphql/hr'
import type * as ApolloClientModule from '@apollo/client'

const auth = vi.hoisted(() => ({ role: 'user' }))
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
  useAuthStore: (
    selector: (s: { user: { id: string; companyId: string; role: string } }) => unknown,
  ) => selector({ user: { id: 'user-1', companyId: 'company-1', role: auth.role } }),
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

const recordDirectDelivery = vi.fn<
  [{ variables: { input: Record<string, unknown> } }],
  Promise<unknown>
>()

// The input the form sent on its first (only) recordDirectDelivery call.
function sentInput(): Record<string, unknown> {
  const call = recordDirectDelivery.mock.calls.at(0)
  if (!call) throw new Error('recordDirectDelivery was not called')
  return call[0].variables.input
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.role = 'user'
  recordDirectDelivery.mockResolvedValue({
    data: { recordDirectDelivery: { poId: 'po-1', status: 'goods_received' } },
  })
  mockUseMutation.mockImplementation((doc: unknown) => [
    doc === RECORD_DIRECT_DELIVERY ? recordDirectDelivery : vi.fn().mockResolvedValue({ data: {} }),
    { loading: false },
  ])
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

describe('ReceiptForm: system-admin override of the photo requirement (jobsite delivery)', () => {
  const overrideBox = () => screen.getByLabelText(/admin override/i)
  const typeReason = (v: string) =>
    fireEvent.change(screen.getByPlaceholderText(/why are the photos/i), { target: { value: v } })

  it('offers the override to a system admin only', async () => {
    mockData([])
    auth.role = 'system_admin'
    await renderForm()
    expect(overrideBox()).toBeInTheDocument()
  })

  it.each(['company_admin', 'module_admin', 'user'])('does not offer it to %s', async (role) => {
    mockData([])
    auth.role = role
    await renderForm()
    expect(screen.queryByLabelText(/admin override/i)).not.toBeInTheDocument()
  })

  it('still blocks a system admin who has ticked the override but gave no reason', async () => {
    mockData([])
    auth.role = 'system_admin'
    const { container } = await renderForm()
    fireEvent.click(overrideBox())
    const message = submitWithNoPhotos(container)
    expect(message).toMatch(/vendor receipt/i)
    expect(recordDirectDelivery).not.toHaveBeenCalled()
  })

  it('lets a system admin record the delivery with no photos, sending the reason to the server', async () => {
    mockData([])
    auth.role = 'system_admin'
    const { container } = await renderForm()
    fireEvent.click(overrideBox())
    typeReason('  Delivery note only, photos lost  ')
    submitWithNoPhotos(container)
    await vi.waitFor(() => {
      expect(recordDirectDelivery).toHaveBeenCalledTimes(1)
    })
    const input = sentInput()
    expect(input.bypassPhotos).toBe(true)
    expect(input.bypassReason).toBe('Delivery note only, photos lost')
  })

  it('declares the override when only the materials photo is missing (buyer receipt already on file)', async () => {
    // buyer's receipt covers the vendor receipt, but the materials photo is missing -> a real skip
    mockData([buyersPurchaseReceipt])
    auth.role = 'system_admin'
    const { container } = await renderForm()
    fireEvent.click(overrideBox())
    typeReason('no camera on site')
    submitWithNoPhotos(container)
    await vi.waitFor(() => {
      expect(recordDirectDelivery).toHaveBeenCalledTimes(1)
    })
    const input = sentInput()
    expect(input.bypassPhotos).toBe(true)
  })
})
