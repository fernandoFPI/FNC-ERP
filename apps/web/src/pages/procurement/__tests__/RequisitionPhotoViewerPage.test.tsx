// The receipts-and-photos window of a requisition in its organizer review (no purchase order exists yet): the receipts the buyers
// attached to each purchase, read one purchase at a time, shown under "Buyer Receipts" in the same viewer the purchase order uses.
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, within, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../theme/ThemeContext'
import i18n from '../../../i18n'
import { ENTITY_ATTACHMENTS_QUERY } from '../../../graphql/hr'
import { PO_PHOTOS_QUERY } from '../../../graphql/procurement'
import { REQUISITION_PHOTOS_QUERY } from '../../../graphql/requisitions'

const mockUseQuery = vi.fn()
const mockClientQuery = vi.fn()
const stableClient = { query: (...args: unknown[]): unknown => mockClientQuery(...args) }
vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApolloClientModule>()
  return {
    ...actual,
    useQuery: (...args: unknown[]): unknown => mockUseQuery(...args),
    // one client object for every render, like the real one (a new object each time re-runs the page's effect for ever)
    useApolloClient: () => stableClient,
    gql: actual.gql,
  }
})

const refetchRequisition = vi.fn()
const requisitionLines = [
  {
    id: 'l1',
    line_number: 1,
    description: 'Gate valve 2 inch',
    product_name: null,
    purchases: [
      { id: 'pur-1', vendor_name: 'Al Noor Trading', qty: 2 },
      { id: 'pur-2', vendor_name: 'Cash Purchase', qty: 1 },
    ],
  },
  {
    id: 'l2',
    line_number: 2,
    description: null,
    product_name: 'PVC elbow',
    purchases: [{ id: 'pur-3', vendor_name: null, qty: 5 }],
  },
]
const state = {
  requisition: {
    data: {
      requisition: {
        id: 'req-1',
        requisition_number: 'REQ-2026-0059',
        status: 'review_approval',
        lines: requisitionLines,
      },
    } as unknown,
    loading: false,
    error: undefined as unknown,
    refetch: refetchRequisition,
  },
}

const attachment = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  file: { id: `file-${id}`, originalFilename: `${id}.jpg`, mimeType: 'image/jpeg' },
  label: null,
  createdAt: '2026-11-16T09:00:00Z',
  sourceEntityType: 'po_line_purchase',
  ...over,
})
/** What each purchase's attachments query answers, by purchase id. */
let perPurchase: Record<string, unknown[] | Error> = {}

let RequisitionPhotoViewerPage: ComponentType
beforeAll(async () => {
  RequisitionPhotoViewerPage = (await import('../requisitions/RequisitionPhotoViewerPage')).default
}, 120_000)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  document.title = ''
  perPurchase = {
    'pur-1': [attachment('a1')],
    'pur-2': [attachment('a2'), attachment('a3')],
    'pur-3': [],
  }
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === REQUISITION_PHOTOS_QUERY) return state.requisition
    return { data: undefined, loading: false }
  })
  mockClientQuery.mockImplementation(
    (opts: { query: unknown; variables: { fileId?: string; entityId?: string } }) => {
      if (opts.query === ENTITY_ATTACHMENTS_QUERY) {
        const answer = perPurchase[opts.variables.entityId ?? ''] ?? []
        if (answer instanceof Error) return Promise.reject(answer)
        return Promise.resolve({ data: { entityAttachments: answer } })
      }
      return Promise.resolve({
        data: { fileDownloadUrl: { downloadUrl: `https://files.test/${opts.variables.fileId}` } },
      })
    },
  )
  Element.prototype.setPointerCapture = vi.fn()
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

async function openViewer() {
  const view = render(
    <MemoryRouter initialEntries={['/viewer/requisitions/req-1/photos']}>
      <ThemeProvider>
        <Routes>
          <Route path="/viewer/requisitions/:id/photos" element={<RequisitionPhotoViewerPage />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  return view
}
const thumbs = () => within(screen.getByRole('navigation')).getAllByRole('button')

describe('the receipts window of a requisition in review', () => {
  it('shows every purchase receipt under Buyer Receipts, with the line and vendor as its name', async () => {
    await openViewer()
    await waitFor(() => {
      expect(thumbs()).toHaveLength(3)
    })
    expect(screen.getByText('Buyer Receipts (3)')).toBeInTheDocument()
    // the viewer opens on the first picture: its header names the group, the line and the vendor
    expect(
      screen.getByText(/Buyer Receipts · #1 Gate valve 2 inch · Al Noor Trading · 2026-11-16/),
    ).toBeInTheDocument()
  })

  it('reads the attachments of each purchase, as purchase receipts (one call per purchase)', async () => {
    await openViewer()
    await waitFor(() => {
      expect(thumbs()).toHaveLength(3)
    })
    const calls = (
      mockClientQuery.mock.calls as [{ query: unknown; variables: Record<string, string> }][]
    )
      .map((c) => c[0])
      .filter((c) => c.query === ENTITY_ATTACHMENTS_QUERY)
    expect(calls.map((c) => c.variables)).toEqual([
      { entityType: 'po_line_purchase', entityId: 'pur-1' },
      { entityType: 'po_line_purchase', entityId: 'pur-2' },
      { entityType: 'po_line_purchase', entityId: 'pur-3' },
    ])
  })

  it('uses the line name from the product when the line has no description, and no vendor when there is none', async () => {
    perPurchase = { 'pur-1': [], 'pur-2': [], 'pur-3': [attachment('only')] }
    await openViewer()
    await waitFor(() => {
      expect(thumbs()).toHaveLength(1)
    })
    expect(screen.getByText(/Buyer Receipts · #2 PVC elbow · 2026-11-16/)).toBeInTheDocument()
  })

  it('keeps the receipt label a person gave, instead of the line and vendor', async () => {
    perPurchase = {
      'pur-1': [attachment('named', { label: 'Receipt 4471' })],
      'pur-2': [],
      'pur-3': [],
    }
    await openViewer()
    await waitFor(() => {
      expect(thumbs()).toHaveLength(1)
    })
    expect(screen.getByText(/Buyer Receipts · Receipt 4471/)).toBeInTheDocument()
  })

  it('names the window after the requisition', async () => {
    await openViewer()
    await waitFor(() => {
      expect(thumbs()).toHaveLength(3)
    })
    expect(screen.getByText('REQ-2026-0059 · Receipts & photos')).toBeInTheDocument()
    expect(document.title).toBe('REQ-2026-0059 · Receipts & photos')
  })

  it('asks for a signed link for each picture and shows the first one', async () => {
    await openViewer()
    await waitFor(() => {
      expect(screen.getByTestId('photo-canvas').querySelector('img')).toHaveAttribute(
        'src',
        'https://files.test/file-a1',
      )
    })
  })

  it('one purchase whose receipts cannot be read does not hide the others', async () => {
    perPurchase = { 'pur-1': new Error('boom'), 'pur-2': [attachment('a2')], 'pur-3': [] }
    await openViewer()
    await waitFor(() => {
      expect(thumbs()).toHaveLength(1)
    })
    expect(screen.getByText('Buyer Receipts (1)')).toBeInTheDocument()
  })

  it('says so when nothing has been attached', async () => {
    perPurchase = { 'pur-1': [], 'pur-2': [], 'pur-3': [] }
    await openViewer()
    expect(
      await screen.findByText('No receipts or photos have been added to this order yet.'),
    ).toBeInTheDocument()
  })

  it('does not ask for a purchase order (there is none yet)', async () => {
    await openViewer()
    type Call = [unknown, { skip?: boolean; variables: unknown }]
    const calls = mockUseQuery.mock.calls as Call[]
    const poCalls = calls.filter(
      (c) => c[0] === PO_PHOTOS_QUERY || c[0] === ENTITY_ATTACHMENTS_QUERY,
    )
    expect(poCalls.length).toBeGreaterThan(0)
    for (const c of poCalls) {
      expect(c[1].skip).toBe(true)
    }
    const reqCall = calls.find((c) => c[0] === REQUISITION_PHOTOS_QUERY)
    expect(reqCall?.[1].skip).toBe(false)
    expect(reqCall?.[1].variables).toEqual({ id: 'req-1' })
  })

  it('shows a spinner while the requisition loads and a retry when it fails', async () => {
    state.requisition = {
      data: undefined,
      loading: true,
      error: undefined,
      refetch: refetchRequisition,
    }
    const first = await openViewer()
    expect(screen.getByRole('status')).toBeInTheDocument()
    first.unmount()
    state.requisition = {
      data: undefined,
      loading: false,
      error: new Error('nope'),
      refetch: refetchRequisition,
    }
    await openViewer()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    state.requisition = {
      data: {
        requisition: {
          id: 'req-1',
          requisition_number: 'REQ-2026-0059',
          status: 'review_approval',
          lines: requisitionLines,
        },
      },
      loading: false,
      error: undefined,
      refetch: refetchRequisition,
    }
  })
})
