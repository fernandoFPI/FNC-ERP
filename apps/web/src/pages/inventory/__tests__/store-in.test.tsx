import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { PO_RECEIPT_QUERY } from '../../../graphql/procurement'
import { ENTITY_ATTACHMENTS_QUERY } from '../../../graphql/hr'

// ── Apollo mock ──────────────────────────────────────────────────────────────
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>()
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})

vi.mock('../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: 'rcpt-1' }) }
})

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/inventory/store-in/rcpt-1']}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

const baseReceipt = {
  id: 'rcpt-1',
  po_id: 'po-1',
  po_number: 'PO-2026-0028',
  vendor_name: 'Cash Purchase',
  received_from_name: 'Fernando Kakony',
  base_currency_code: 'IQD',
  receipt_number: 'RCPT-1',
  receipt_date: '2026-09-12',
  location_name: null,
  notes: null,
  received_by_email: 'admin@fnc.com',
  received_by_name: 'Fernando Kakony',
  location_notes: null,
  created_at: '2026-09-12T00:00:00.000Z',
  status: 'draft',
  confirmed_at: null,
  lines: [],
  // Materials Received photo already attached — matches the screenshot
  // (only the Vendor Receipt fallback is still outstanding).
  photos: [
    {
      id: 'photo-1',
      fileId: 'file-1',
      label: null,
      category: 'po_receipt_photo',
      originalFilename: 'materials.jpg',
      downloadUrl: null,
      createdAt: '2026-09-12T00:00:00.000Z',
    },
  ],
}

// A G1 child PO's Buyer's Receipt entry — surfaced by entityAttachments via
// the po_line_purchases union, category 'attachment' (not the legacy
// 'po_receipt_document').
const buyerReceiptAttachment = {
  id: 'att-1',
  file: {
    id: 'file-2',
    originalFilename: 'xerox.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
    category: 'attachment',
    uploadedAt: '2026-09-12T00:00:00.000Z',
  },
  label: null,
  isPrimary: false,
  createdAt: '2026-09-12T00:00:00.000Z',
  uploadedByEmail: 'admin@fnc.com',
}

function mockQueries(entityAttachments: unknown[]) {
  mockUseQuery.mockImplementation((query: unknown) => {
    if (query === PO_RECEIPT_QUERY) {
      return { data: { poReceipt: baseReceipt }, loading: false, error: undefined, refetch: vi.fn() }
    }
    if (query === ENTITY_ATTACHMENTS_QUERY) {
      return { data: { entityAttachments }, loading: false, refetch: vi.fn() }
    }
    return { data: undefined, loading: false, refetch: vi.fn() }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMutation.mockReturnValue([vi.fn().mockResolvedValue({}), { loading: false }])
})

describe('StoreInDetail — hasBuyerReceipt detection', () => {
  // Regression: a G1 child PO's receipt is surfaced by entityAttachments
  // with category 'attachment' (it was recorded during the requisition's
  // Items Bought stage), not the legacy 'po_receipt_document' category
  // hasBuyerReceipt used to filter on exclusively. Before this fix, the
  // "Buyer's Receipt" panel visibly showed the file while Confirm Receipt
  // stayed disabled demanding a redundant Vendor Receipt upload — found via
  // manual click-through on PO-2026-0028's draft receipt.
  it('enables Confirm Receipt once a buyer receipt attachment exists, regardless of its category', async () => {
    mockQueries([buyerReceiptAttachment])
    const StoreInDetail = (await import('../store-in/StoreInDetail')).default
    wrap(<StoreInDetail />)
    expect(screen.getByRole('button', { name: /confirm receipt/i })).not.toBeDisabled()
    expect(screen.queryByText(/attach a vendor receipt before confirming/i)).not.toBeInTheDocument()
  })

  it('still requires a vendor receipt when none has been attached', async () => {
    mockQueries([])
    const StoreInDetail = (await import('../store-in/StoreInDetail')).default
    wrap(<StoreInDetail />)
    expect(screen.getByRole('button', { name: /confirm receipt/i })).toBeDisabled()
    expect(screen.getByText(/attach a vendor receipt before confirming/i)).toBeInTheDocument()
  })
})
