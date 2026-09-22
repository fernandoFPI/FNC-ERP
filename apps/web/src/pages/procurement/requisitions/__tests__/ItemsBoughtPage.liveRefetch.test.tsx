import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../../theme/ThemeContext'

// Unlike ItemsBoughtPage.test.tsx's static mocks, useQuery here keeps live,
// updatable data via a real useState — so calling refetch() actually causes
// ItemsBoughtPage to re-render with new data, the same way Apollo does after
// recordLinePurchase completes. That's the only way to catch a regression
// where the page's own local state (toggle checkboxes, shared vendor/
// receipt) doesn't survive a real refetch cycle.
const mockUseMutation = vi.fn()

let liveLines: Record<string, unknown>[] = []

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@apollo/client')>()
  return {
    ...actual,
    useQuery: (doc: unknown) => {
      const opName = (doc as { definitions?: { name?: { value?: string } }[] })?.definitions?.[0]?.name?.value
      const [, forceUpdate] = useState(0)
      if (opName === 'Vendors') {
        return {
          data: {
            vendors: [
              { id: 'vendor-1', name: 'Al-Rasheed Hardware', is_cash_purchase: false },
              { id: 'vendor-cash', name: 'Cash Purchase', is_cash_purchase: true },
            ],
          },
          loading: false,
        }
      }
      if (opName === 'RequisitionItemsBought') {
        return {
          data: {
            requisition: {
              id: 'req-1',
              requisition_number: 'REQ-2026-0008',
              status: 'items_bought',
              callerHasBuyerPosition: true,
              callerCanApprove: false,
              lines: liveLines,
            },
          },
          loading: false,
          refetch: () => {
            forceUpdate((n) => n + 1)
          },
        }
      }
      return { data: undefined, loading: false }
    },
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
    useLazyQuery: () => [vi.fn(), { data: undefined, loading: false }],
    useSubscription: vi.fn().mockReturnValue({ data: undefined, loading: false }),
    gql: actual.gql,
  }
})

vi.mock('../../../../store/toastStore', () => ({
  useToastStore: () => vi.fn(),
}))

vi.mock('../../../../store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string }; accessToken: string }) => unknown) =>
    selector({ user: { id: 'user-buyer' }, accessToken: 'test-token' }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: 'req-1' }) }
})

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/procurement/requisitions/req-1/items-bought']}>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

function baseLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'line-1',
    line_number: 1,
    description: 'Cement bags',
    product_id: 'prod-1',
    product_name: 'Cement',
    sku: 'CEM-1',
    qty: '10',
    uom: 'bag',
    currency_code: 'IQD',
    unit_price: '100',
    approved_unit_price: '100',
    qty_from_stock: '0',
    short_reason: null,
    short_marked_by: null,
    short_marked_at: null,
    account_id: null,
    account_code: null,
    account_name: null,
    cost_center_id: null,
    cost_center_name: null,
    purchases: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch

  mockUseMutation.mockImplementation((doc: unknown, opts?: { onCompleted?: (d?: unknown) => void }) => {
    const opName = (doc as { definitions?: { name?: { value?: string } }[] })?.definitions?.[0]?.name?.value
    if (opName === 'EnsureCashPurchaseVendor') {
      return [vi.fn().mockResolvedValue({ data: { ensureCashPurchaseVendor: { id: 'vendor-cash' } } }), { loading: false }]
    }
    if (opName === 'RequestUploadUrl') {
      return [vi.fn().mockResolvedValue({ data: { requestUploadUrl: { fileId: 'file-1', uploadUrl: '', fileKey: '' } } }), { loading: false }]
    }
    if (opName === 'RecordLinePurchase') {
      const mutate = vi.fn().mockImplementation(async (mutOpts: { variables: { input: { lineId: string } } }) => {
        const lineId = mutOpts.variables.input.lineId
        // Simulate the backend: this line is now fully bought.
        liveLines = liveLines.map((l) =>
          l.id === lineId
            ? {
                ...l,
                purchases: [
                  {
                    id: `p-${lineId}`,
                    vendor_id: 'vendor-1',
                    vendor_name: 'Al-Rasheed Hardware',
                    currency_code: 'IQD',
                    qty: l.qty,
                    actual_unit_price: '100',
                    bought_by: 'user-buyer',
                    bought_by_name: 'Buyer One',
                    bought_at: '2026-01-01T00:00:00.000Z',
                    over_tolerance: false,
                    tolerance_approved_by: null,
                    receipt_file_id: 'file-1',
                    receipt_filename: 'receipt.jpg',
                  },
                ],
              }
            : l,
        )
        opts?.onCompleted?.()
        return { data: { recordLinePurchase: { id: `p-${lineId}` } } }
      })
      return [mutate, { loading: false }]
    }
    // Any other mutation (createVendor, approveTolerance, markShort, finishBuying…)
    return [vi.fn().mockResolvedValue({ data: {} }), { loading: false }]
  })

  liveLines = [
    baseLine({ id: 'line-1', description: 'A4 Paper' }),
    baseLine({ id: 'line-2', description: 'Memory stick-8GB' }),
  ]
})

describe('ItemsBoughtPage — shared vendor/receipt survive a real refetch cycle', () => {
  it('keeps the "same vendor"/"same receipt" toggles and shared selections after recording one line\'s purchase', async () => {
    const ItemsBoughtPage = (await import('../ItemsBoughtPage')).default
    const { container } = wrap(<ItemsBoughtPage />)

    fireEvent.click(screen.getByLabelText(/all items are from the same vendor/i))
    fireEvent.click(screen.getByText('Search vendor…'))
    fireEvent.mouseDown(screen.getByText('Al-Rasheed Hardware'))

    fireEvent.click(screen.getByLabelText(/attach one receipt for all items/i))
    const file = new File(['x'], 'invoice.jpg', { type: 'image/jpeg' })
    const globalFileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(globalFileInput, { target: { files: [file] } })

    // Sanity: both toggles configured, both lines' vendor pickers are the
    // shared read-only kind (no per-line "Search vendor…" left).
    expect(screen.queryByText('Search vendor…')).not.toBeInTheDocument()
    expect(screen.getAllByText('Al-Rasheed Hardware').length).toBeGreaterThanOrEqual(3)

    // Record the purchase for line 1 only.
    const recordButtons = screen.getAllByRole('button', { name: /^record purchase$/i })
    expect(recordButtons).toHaveLength(2)
    fireEvent.click(recordButtons[0]!)

    // Let the async handler (upload + mutation + onCompleted->refetch) settle.
    await waitFor(() => {
      expect(screen.getByText('Fully bought')).toBeInTheDocument()
    })

    // The toggles must still be checked, and line 2 must still show the
    // shared vendor read-only, NOT revert to its own empty picker.
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    const checkboxStates = Array.from(checkboxes).map((cb) => (cb as HTMLInputElement).checked)
    expect(checkboxStates.every(Boolean)).toBe(true)
    expect(screen.queryByText('Search vendor…')).not.toBeInTheDocument()
    expect(screen.getAllByText('Al-Rasheed Hardware').length).toBeGreaterThanOrEqual(2)
  })
})
