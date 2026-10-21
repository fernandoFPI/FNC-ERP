// Cost Change Approvals: what a reviewer sees for each parked cost change. The page used
// to show only "<source label> — requested by <name>", the product's Arabic name only
// when the whole UI was in Arabic, and said nothing about what rejecting does. It now
// shows both names, where the change came from (with a link to the original), who asked
// and when, and what approving or rejecting leaves behind.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type * as ApolloClientModule from '@apollo/client'
import { ThemeProvider } from '../../../../theme/ThemeContext'
import i18n from '../../../../i18n'
import { PRODUCT_COST_CHANGE_REQUESTS_QUERY } from '../../../../graphql/inventory'
import { COST_CHANGE_SOURCE_TYPES } from '../../../../lib/costChangeSource'

const mockUseQuery = vi.fn()
const mockUseMutation = vi.fn()
const addToast = vi.fn()

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
    selector: (s: {
      user: { id: string; role: string; permissions: Record<string, string> }
    }) => unknown,
  ) =>
    selector({
      user: {
        id: 'me',
        role: 'user',
        permissions: { 'inventory.products.approve_cost_change': 'edit' },
      },
    }),
}))

interface Row {
  id: string
  product_id: string
  product_name: string
  product_name_ar: string | null
  sku: string
  old_cost: string | null
  new_cost: string
  currency_code: string
  source_type: string
  source_id: string | null
  source_label: string | null
  requested_by: string
  requested_by_name: string
  status: string
  reviewed_by: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  can_review: boolean | null
}

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'r-1',
    product_id: 'p-1',
    product_name: 'Rope Parachute',
    product_name_ar: 'حبل المظلة',
    sku: 'GEN-458',
    old_cost: '5000',
    new_cost: '2358',
    currency_code: 'IQD',
    source_type: 'cost_correction',
    source_id: null,
    source_label: 'Stock Adjustment (cost correction)',
    requested_by: 'someone-else',
    requested_by_name: 'savio babaka',
    status: 'pending',
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    rejection_reason: null,
    created_at: '2026-10-21T12:00:00Z',
    can_review: true,
    ...over,
  }
}

function showRows(rows: Row[]) {
  mockUseQuery.mockImplementation((doc: unknown) => {
    if (doc === PRODUCT_COST_CHANGE_REQUESTS_QUERY)
      return { data: { productCostChangeRequests: rows }, loading: false, refetch: vi.fn() }
    return { data: undefined, loading: false, refetch: vi.fn() }
  })
}

async function renderPage() {
  const Page = (await import('../CostChangeApprovalsPage')).default
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <Page />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMutation.mockImplementation(() => [
    vi.fn().mockResolvedValue({ data: {} }),
    { loading: false },
  ])
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('Cost Change Approvals: product name', () => {
  it('shows the Arabic name next to the English one while the UI is in English', async () => {
    showRows([row()])
    await renderPage()
    expect(screen.getByText('Rope Parachute')).toBeInTheDocument()
    const arabic = screen.getByText('حبل المظلة')
    expect(arabic).toHaveAttribute('dir', 'rtl')
    expect(arabic).toHaveAttribute('lang', 'ar')
  })

  it('shows only the English name when the product has no Arabic name', async () => {
    showRows([row({ product_name_ar: null })])
    await renderPage()
    expect(screen.getByText('Rope Parachute')).toBeInTheDocument()
    expect(document.querySelector('bdi[lang="ar"]')).toBeNull()
  })
})

describe('Cost Change Approvals: where a change came from', () => {
  it('names the source, who asked and when, and what approving and rejecting do', async () => {
    showRows([row()])
    await renderPage()
    expect(screen.getByText('Cost Correction')).toBeInTheDocument()
    expect(screen.getByText(/cost-only correction made in Stock Adjustments/i)).toBeInTheDocument()
    expect(screen.getByText(/savio babaka · Oct 21, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/becomes 2,358 IQD/)).toBeInTheDocument()
    expect(screen.getByText(/stays at 5,000 IQD/)).toBeInTheDocument()
    // a stock adjustment's correction stays posted: only the product's own cost is held back
    expect(screen.getByText(/correction stays posted on that stock location/)).toBeInTheDocument()
  })

  it.each([
    ['po_receipt', 'po-9', 'NY-PO-2026-0026', '/procurement/purchase-orders/po-9'],
    ['catalog_link', 'po-9', 'NY-PO-2026-0026', '/procurement/purchase-orders/po-9'],
    ['po_market_pricing', 'po-9', 'NY-PO-2026-0026', '/procurement/purchase-orders/po-9'],
    ['requisition_market_pricing', 'rq-3', 'REQ-2026-0003', '/procurement/requisitions/rq-3'],
  ])('%s links to the original document', async (sourceType, sourceId, label, href) => {
    showRows([row({ source_type: sourceType, source_id: sourceId, source_label: label })])
    await renderPage()
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', href)
  })

  it.each(['stock_adjustment', 'cost_correction', 'manual_edit'])(
    '%s has no document to link to',
    async (sourceType) => {
      showRows([row({ source_type: sourceType, source_id: null })])
      await renderPage()
      expect(screen.queryByRole('link')).toBeNull()
    },
  )

  it('falls back to a generic link text when the source has no reference number', async () => {
    showRows([row({ source_type: 'po_receipt', source_id: 'po-9', source_label: null })])
    await renderPage()
    expect(screen.getByRole('link', { name: 'View source' })).toHaveAttribute(
      'href',
      '/procurement/purchase-orders/po-9',
    )
  })

  it('says the product has no cost yet when there was none before', async () => {
    showRows([row({ old_cost: null })])
    await renderPage()
    expect(screen.getByText(/cost stays unset/)).toBeInTheDocument()
  })

  it('still renders a source type it has never heard of, without raw translation keys', async () => {
    showRows([row({ source_type: 'something_new', source_label: null })])
    await renderPage()
    expect(screen.getByText(/stays at 5,000 IQD/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/inv\.costApprovals\./)
  })

  it('has an English and an Arabic explanation for every source type', () => {
    for (const lng of ['en', 'ar']) {
      for (const type of COST_CHANGE_SOURCE_TYPES) {
        for (const part of ['what', 'ifRejected']) {
          const key = `inv.costApprovals.source.${type}.${part}`
          expect(i18n.exists(key, { lng, fallbackLng: false }), `${lng} ${key}`).toBe(true)
        }
        const label = `inv.productDetail.costSourceOpts.${type}`
        expect(i18n.exists(label, { lng, fallbackLng: false }), `${lng} ${label}`).toBe(true)
      }
    }
  })
})

describe('Cost Change Approvals: rejecting', () => {
  it('tells the reviewer what rejecting leaves in place before they confirm', async () => {
    showRows([row({ source_type: 'manual_edit', source_label: 'Manual edit' })])
    await renderPage()
    const outcome = /stays at 5,000 IQD\. Other changes saved with that edit stay/
    // once on the card...
    expect(screen.getAllByText(outcome)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(await screen.findByText('Reject this cost change')).toBeInTheDocument()
    // ...and again in the dialog the reviewer confirms in
    expect(screen.getAllByText(outcome)).toHaveLength(2)
  })

  it('shows who rejected a change, when, why, and what it left in place', async () => {
    showRows([
      row({
        status: 'rejected',
        reviewed_by_name: 'Nadia Saleh',
        reviewed_at: '2026-10-22T12:00:00Z',
        rejection_reason: 'Typed in the wrong unit',
      }),
    ])
    await renderPage()
    expect(screen.getByText(/Rejected by Nadia Saleh · Oct 22, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/Typed in the wrong unit/)).toBeInTheDocument()
    expect(screen.getByText('Left as is')).toBeInTheDocument()
    expect(screen.getByText(/stays at 5,000 IQD/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('shows who approved a change and when', async () => {
    showRows([
      row({
        status: 'approved',
        reviewed_by_name: 'Nadia Saleh',
        reviewed_at: '2026-10-22T12:00:00Z',
      }),
    ])
    await renderPage()
    expect(screen.getByText(/Approved by Nadia Saleh · Oct 22, 2026/)).toBeInTheDocument()
    expect(screen.queryByText('If rejected')).toBeNull()
  })
})

describe('Cost Change Approvals: who may review', () => {
  // The signed-in user is 'me'. The server decides (can_review) whether they may clear a
  // request they raised: admins and the company-wide Store Keeper may, anyone else may not.
  it('disables Approve and Reject, and says why, when the server says a different reviewer is needed', async () => {
    showRows([row({ requested_by: 'me', can_review: false })])
    await renderPage()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
    expect(screen.getByText('Needs a different approver')).toBeInTheDocument()
  })

  it("leaves a request the caller raised reviewable when the server allows it (the Store Keeper's case)", async () => {
    showRows([row({ requested_by: 'me', can_review: true })])
    await renderPage()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
    expect(screen.queryByText('Needs a different approver')).toBeNull()
  })

  it("does not second-guess the server: another person's request stays reviewable", async () => {
    showRows([row({ requested_by: 'someone-else', can_review: true })])
    await renderPage()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('says when a change was reviewed by the person who raised it', async () => {
    showRows([
      row({
        id: 'r-approved',
        status: 'approved',
        requested_by: 'u-1',
        reviewed_by: 'u-1',
        reviewed_by_name: 'savio babaka',
        reviewed_at: '2026-10-22T12:00:00Z',
      }),
      row({
        id: 'r-rejected',
        status: 'rejected',
        requested_by: 'u-1',
        reviewed_by: 'u-1',
        reviewed_by_name: 'savio babaka',
        reviewed_at: '2026-10-22T12:00:00Z',
        rejection_reason: 'wrong product',
      }),
    ])
    await renderPage()
    expect(screen.getAllByText('Reviewed by the person who raised it')).toHaveLength(2)
  })

  it('stays quiet when someone else reviewed it', async () => {
    showRows([
      row({
        status: 'approved',
        requested_by: 'u-1',
        reviewed_by: 'u-2',
        reviewed_by_name: 'Nadia Saleh',
        reviewed_at: '2026-10-22T12:00:00Z',
      }),
    ])
    await renderPage()
    expect(screen.queryByText('Reviewed by the person who raised it')).toBeNull()
  })

  it('states the exceptions to the rule in the page subtitle', async () => {
    showRows([])
    await renderPage()
    expect(screen.getByText(/except admins and the company's Store Keeper/)).toBeInTheDocument()
  })
})

describe('Cost Change Approvals: Arabic UI', () => {
  it('shows the details in Arabic and keeps both product names', async () => {
    await i18n.changeLanguage('ar')
    showRows([row()])
    await renderPage()
    expect(screen.getByText('عند الرفض')).toBeInTheDocument()
    expect(screen.getByText('المصدر')).toBeInTheDocument()
    expect(screen.getByText('حبل المظلة')).toBeInTheDocument()
    expect(screen.getByText('Rope Parachute')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/inv\.costApprovals\./)
  })
})
