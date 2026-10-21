// Confirming a draft Store In receipt needs the vendor receipt and a materials
// photo. A system administrator can confirm without them by ticking an override and
// giving a reason; nobody else can (the server enforces it too). The photo rule
// itself is unchanged for everyone, and the override is only offered while a photo
// is actually missing.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import { PO_RECEIPT_QUERY, CONFIRM_RECEIPT } from '../../../../graphql/procurement'
import { ENTITY_ATTACHMENTS_QUERY } from '../../../../graphql/hr'
import type * as ApolloClientModule from '@apollo/client'

const auth = vi.hoisted(() => ({ role: 'system_admin' }))
const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
const confirmReceipt = vi.fn()

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    useMutation: (...args: unknown[]): unknown => mockUseMutation(...args),
    useLazyQuery: () => [vi.fn(), { loading: false }],
  }
})

vi.mock('../../../../store/toastStore', () => ({
  useToastStore: (selector: (s: { addToast: () => void }) => unknown) =>
    selector({ addToast: vi.fn() }),
}))

vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: unknown }) => unknown) =>
    selector({ user: { id: 'user-1', companyId: 'company-1', role: auth.role, permissions: {} } }),
}))

// Its own attachment queries are not what is under test here.
vi.mock('../../../../components/inventory/EntityAttachments', () => ({
  EntityAttachments: () => null,
}))

function draftReceipt(photos: { id: string; category: string }[] = []) {
  return {
    id: 'rcpt-1',
    po_id: 'po-1',
    po_number: 'NY-PO-2026-0026',
    vendor_name: 'PHILIPS',
    received_from_name: null,
    base_currency_code: 'IQD',
    receipt_number: 'RCPT-1',
    receipt_date: '2026-01-15',
    location_name: 'Main warehouse',
    notes: null,
    received_by_email: null,
    received_by_name: 'Store keeper',
    location_notes: null,
    created_at: '2026-01-15T08:00:00Z',
    status: 'draft',
    confirmed_at: null,
    reversed_at: null,
    reversal_reason: null,
    reversed_by_email: null,
    lines: [],
    photos: photos.map((p) => ({
      ...p,
      fileId: `f-${p.id}`,
      label: null,
      originalFilename: 'photo.jpg',
      downloadUrl: null,
      createdAt: '2026-01-15T08:05:00Z',
    })),
  }
}

function mockData(photos: { id: string; category: string }[] = []) {
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === PO_RECEIPT_QUERY)
      return { data: { poReceipt: draftReceipt(photos) }, loading: false, refetch: vi.fn() }
    if (doc === ENTITY_ATTACHMENTS_QUERY) return { data: { entityAttachments: [] }, loading: false }
    return { data: undefined, loading: false }
  })
}

async function renderPage() {
  const StoreInDetail = (await import('../StoreInDetail')).default
  render(
    <MemoryRouter initialEntries={['/inventory/store-in/rcpt-1']}>
      <ThemeProvider>
        <Routes>
          <Route path="/inventory/store-in/:id" element={<StoreInDetail />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

const confirmButton = () => screen.getByRole('button', { name: /confirm receipt/i })
const tick = () => fireEvent.click(screen.getByLabelText(/admin override/i))
const typeReason = (v: string) =>
  fireEvent.change(screen.getByPlaceholderText(/why are the photos/i), { target: { value: v } })

beforeEach(() => {
  vi.clearAllMocks()
  auth.role = 'system_admin'
  confirmReceipt.mockResolvedValue({ data: {} })
  mockUseMutation.mockImplementation((doc: unknown) => [
    doc === CONFIRM_RECEIPT ? confirmReceipt : vi.fn(),
    { loading: false },
  ])
})

describe('StoreInDetail: confirming without photos', () => {
  it('blocks Confirm for a system admin until the override is ticked and a reason is given', async () => {
    mockData()
    await renderPage()
    expect(confirmButton()).toBeDisabled()
    tick()
    expect(confirmButton()).toBeDisabled() // ticked, but no reason yet
    typeReason('   ')
    expect(confirmButton()).toBeDisabled() // blank reason does not count
    typeReason('Photos lost with the old phone')
    expect(confirmButton()).toBeEnabled()
  })

  it('sends the override and the trimmed reason to the server when confirmed', async () => {
    mockData()
    await renderPage()
    tick()
    typeReason('  Photos lost with the old phone  ')
    fireEvent.click(confirmButton())
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(confirmReceipt).toHaveBeenCalledWith({
      variables: {
        id: 'rcpt-1',
        bypassPhotos: true,
        bypassReason: 'Photos lost with the old phone',
      },
    })
  })

  it.each(['company_admin', 'module_admin', 'user'])(
    'offers %s no override: Confirm stays blocked',
    async (role) => {
      auth.role = role
      mockData()
      await renderPage()
      expect(screen.queryByLabelText(/admin override/i)).not.toBeInTheDocument()
      expect(confirmButton()).toBeDisabled()
    },
  )

  it('does not offer the override once both photos are attached, and confirms normally', async () => {
    mockData([
      { id: 'p1', category: 'po_receipt_photo' },
      { id: 'p2', category: 'po_receipt_document' },
    ])
    await renderPage()
    expect(screen.queryByLabelText(/admin override/i)).not.toBeInTheDocument()
    expect(confirmButton()).toBeEnabled()
    fireEvent.click(confirmButton())
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(confirmReceipt).toHaveBeenCalledWith({ variables: { id: 'rcpt-1' } })
  })

  it('offers the override while only one photo is missing', async () => {
    mockData([{ id: 'p1', category: 'po_receipt_photo' }]) // vendor receipt still missing
    await renderPage()
    expect(confirmButton()).toBeDisabled()
    expect(screen.getByLabelText(/admin override/i)).toBeInTheDocument()
  })
})
